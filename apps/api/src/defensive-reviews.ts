import { createHash } from 'node:crypto'
import { date, id, redact, required, sha256, text, z } from '@reac/core'
import type { FastifyInstance } from 'fastify'
import type { Run } from './audits.ts'
import type { Store } from './store.ts'
import { parse, must, problem } from './http.ts'

const severities = ['Informativa', 'Baja', 'Media', 'Alta', 'Crítica'] as const
const states = ['Pendiente de validación', 'Confirmado', 'Falso positivo', 'Corregido', 'Riesgo aceptado'] as const
const label = /^[\p{L}\p{N}][\p{L}\p{N}_. /@-]*$/u
const resultSchema = z.strictObject({
  checkId: required(130).regex(/^[\w@./:-]+$/),
  component: required(150).regex(label).refine((value) => !value.split('/').includes('..')),
  severity: z.enum(severities).optional(),
  reference: text(120).regex(/^$|^(?:CVE-\d{4}-\d{4,}|CWE-\d+|GHSA-[a-z0-9-]+)$/i).default(''),
})
const importSchema = z.strictObject({
  version: z.literal(1),
  project: required(120).regex(label),
  tool: z.enum(['npm audit', 'OSV-Scanner', 'Semgrep CE', 'Gitleaks', 'Trivy', 'Revisión manual']),
  toolVersion: required(50).regex(/^[\w. +()-]+$/),
  collectedAt: date,
  ownedOrAuthorized: z.literal(true),
  results: z.array(resultSchema).max(200),
})
const reviewSchema = z.strictObject({
  reviewer: required(100), state: z.enum(states), proofReference: required(160), contentVersion: sha256,
})
export type Finding = z.output<typeof resultSchema> & {
  state: (typeof states)[number]
  reviews: { reviewer: string; state: (typeof states)[number]; proofReference: string; reviewedAt: string }[]
}
export const findingVersion = (finding: Finding) => createHash('sha256').update(JSON.stringify([
  finding.checkId, finding.component, finding.severity, finding.reference, finding.state, finding.reviews,
])).digest('hex')

export function registerDefensiveReviews(app: FastifyInstance, store: Store) {
  app.post('/api/reviews/import', (request, reply) => store.transaction(() => {
    const input = parse(importSchema, request.body)
    const results = input.results.map((item) => ({ ...item, checkId: redact(item.checkId), component: redact(item.component) }))
    const identifiers = new Set(results.map((row) => JSON.stringify([row.checkId, row.component, row.reference])))
    if (identifiers.size !== results.length) throw problem(400, 'El archivo contiene resultados repetidos.')
    const metadata = {
      tool: redact(input.tool + ' ' + input.toolVersion),
      project: redact(input.project), collectedAt: input.collectedAt,
    }
    const key = createHash('sha256').update(JSON.stringify({ metadata, results })).digest('hex')
    const existing = store.find<Run>('audit_runs', key, 'unique_key')
    if (existing) return reply.code(200).send(existing)
    const run = store.insert<Run>('audit_runs', {
      ...metadata, mode: 'REVISION_DOCUMENTAL', status: 'COMPLETED', finishedAt: new Date().toISOString(),
      reason: 'Resultados defensivos importados de un archivo redactado.', policyVersion: 'documental-v1',
    }, null, key)
    for (const result of results) store.insert<Finding>('findings', { ...result, state: states[0], reviews: [] }, run.id)
    store.log('Resultados defensivos importados', run.id)
    return reply.code(201).send(run)
  }))
  app.post<{ Params: { id: string } }>('/api/reviews/findings/:id/review', (request) => store.transaction(() => {
    const item = must(store.find<Finding>('findings', parse(id, request.params.id)))
    if (!item.parent || store.find<Run>('audit_runs', item.parent)?.mode !== 'REVISION_DOCUMENTAL') {
      throw problem(409, 'Este resultado pertenece a la prueba de configuración del fixture.')
    }
    const { reviewer, proofReference, state, contentVersion } = parse(reviewSchema, request.body)
    if (findingVersion(item) !== contentVersion || state === item.state || item.reviews.length >= 100) {
      throw problem(409, 'Revisá el estado vigente del resultado antes de registrar un cambio.')
    }
    if (['Corregido', 'Riesgo aceptado'].includes(state) && item.state !== 'Confirmado') {
      throw problem(409, 'Confirmá el hallazgo antes de registrar una corrección o aceptación de riesgo.')
    }
    const saved = store.update<Finding>('findings', item.id, {
      ...item, state, reviews: [...item.reviews, {
        reviewer: redact(reviewer), state, proofReference: redact(proofReference), reviewedAt: new Date().toISOString(),
      }],
    })
    store.log('Resultado defensivo revisado', saved.id)
    return { ...saved, contentVersion: findingVersion(saved) }
  }))
}
