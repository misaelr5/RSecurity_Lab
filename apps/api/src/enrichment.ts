import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { applicationTypes, discoveryRecord, id, normalize, optedOut, required, source, versionedReview, z } from '@reac/core'
import type { Observation, Prospect, Source } from '@reac/core'
import type { FastifyInstance } from 'fastify'
import { must, parse, problem } from './http.ts'
import type { Store } from './store.ts'

const enrichmentFields = ['legalName', 'province', 'address', 'applicationType', 'contact', 'email', 'phone'] as const
const contactFields = new Set<string>(['contact', 'email', 'phone'])
const field = z.enum(enrichmentFields)
const changes = z.strictObject({
  legalName: required(200).optional(),
  province: required(120).optional(),
  address: required(250).optional(),
  applicationType: z.enum(applicationTypes).exclude(['Sin clasificar']).optional(),
  contact: required(160).optional(),
  email: z.email().max(254).optional(),
  phone: required(60).refine((value) => /^[+\d ().-]+$/u.test(value) && value.replace(/\D/g, '').length >= 8).optional(),
}).refine((value) => Object.keys(value).length > 0)
const capture = z.strictObject({ provider: z.enum(['ORCA', 'MANUAL']), source, fields: changes })
const decisionInput = versionedReview.extend({
  decision: z.enum(['APROBAR', 'RECHAZAR']),
  fields: z.array(field).min(1).max(enrichmentFields.length).optional(),
})
type Field = (typeof enrichmentFields)[number]
type Capture = z.output<typeof capture>
type ResearchReference = { jobId: string; candidateId: string }
type Disposition = 'NUEVO' | 'ACTUALIZABLE' | 'SIN_CAMBIO' | 'CONSERVAR_EXISTENTE' | 'BLOQUEADO'
type Comparison = { field: Field; current: string; proposed: string; disposition: Disposition }
type Proposal = Capture & {
  research?: ResearchReference
  state: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'
  reviewer?: string
  reviewedAt?: string
  appliedFields?: Field[]
  sourceId?: string
  reviewComparison?: Comparison[]
}
type StoredProspect = Prospect & { origin?: string; campaignId?: string; responsible?: string }
type StoredNote = Observation & { reviewer: string; reviewedAt: string }
const today = () => new Date().toISOString().slice(0, 10)
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const getOrganization = (store: Store, raw: unknown) => must(store.find<StoredProspect>('organizations', parse(id, raw)))

function publicHost(value: string) {
  const url = new URL(value)
  const host = url.hostname.replace(/^www\./, '').replace(/\.$/, '')
  if (url.port || !host.includes('.') || isIP(host) || /\.(?:local|localhost|internal|invalid)$/u.test(host)) return ''
  return host
}
function firstParty(org: Prospect, evidence: Source) {
  if (!org.website || !evidence.url.startsWith('https://')) return false
  const official = publicHost(org.website)
  const observed = publicHost(evidence.url)
  return Boolean(official && (observed === official || observed.endsWith('.' + official)))
}
const sameValue = (key: Field, left: string, right: string) => {
  if (key === 'phone') return left.replace(/\D/g, '') === right.replace(/\D/g, '')
  if (key === 'email') return left.toLowerCase() === right.toLowerCase()
  return normalize(left) === normalize(right)
}

function compare(org: Prospect, proposal: Proposal): Comparison[] {
  const cutoff = new Date(Date.parse(today()) - 180 * 86400000).toISOString().slice(0, 10)
  return enrichmentFields.flatMap((key) => {
    const proposed = proposal.fields[key]
    if (proposed === undefined) return []
    const current = org[key] ?? ''
    let disposition: Disposition = 'BLOQUEADO'
    if (!optedOut(org) && firstParty(org, proposal.source) && proposal.source.consultedAt >= cutoff && proposal.source.consultedAt <= today()) {
      if (sameValue(key, current, proposed)) disposition = 'SIN_CAMBIO'
      else if (!current || (key === 'applicationType' && current === 'Sin clasificar')) disposition = 'NUEVO'
      else if (contactFields.has(key) || proposal.source.consultedAt <= (org.verifiedAt ?? '')) disposition = 'CONSERVAR_EXISTENTE'
      else disposition = 'ACTUALIZABLE'
    }
    return [{ field: key, current, proposed, disposition }]
  })
}
function proposalView(org: ReturnType<typeof getOrganization>, proposal: ReturnType<Store['insert']> & Proposal) {
  const comparison = proposal.reviewComparison ?? compare(org, proposal)
  return { ...proposal, comparison, contentVersion: digest([proposal.id, proposal.state, proposal.source, org.updatedAt, comparison]) }
}

function saveProposal(store: Store, org: ReturnType<typeof getOrganization>, value: Capture, research?: ResearchReference) {
  if (optedOut(org)) throw problem(409, 'La ficha está excluida de contacto y enriquecimiento.')
  if (!firstParty(org, value.source)) throw problem(400, 'Usá una fuente HTTPS del dominio oficial de esta empresa.')
  if (value.source.consultedAt > today()) throw problem(400, 'La fecha de consulta no puede estar en el futuro.')
  const key = digest([org.id, value, research])
  const previous = store.find<Proposal>('enrichment_proposals', key, 'unique_key')
  if (previous) return { created: false, proposal: proposalView(org, previous) }
  const row = store.insert<Proposal>('enrichment_proposals', { ...value, research, state: 'PENDIENTE' }, org.id, key)
  store.log('Propuesta de enriquecimiento registrada', row.id)
  return { created: true, proposal: proposalView(org, row) }
}

// The research route has validated the candidate and chooses its associated organization.
// This records a draft and leaves the candidate and original prospect unchanged.
export function proposeResearchEnrichment(store: Store, organizationId: string, record: z.output<typeof discoveryRecord>, research: ResearchReference) {
  const org = getOrganization(store, organizationId)
  const value = parse(capture, {
    provider: 'ORCA', source: record.evidence,
    fields: Object.fromEntries(enrichmentFields.flatMap((key) => record[key] ? [[key, record[key]]] : [])),
  })
  const reference = { jobId: parse(id, research.jobId), candidateId: parse(id, research.candidateId) }
  return saveProposal(store, org, value, reference).proposal
}

export function registerEnrichment(app: FastifyInstance, store: Store) {
  app.get<{ Params: { id: string } }>('/api/prospects/:id/enrichment', (request) => {
    const org = getOrganization(store, request.params.id)
    return store.list<Proposal>('enrichment_proposals', org.id).map((row) => proposalView(org, row))
  })
  app.post<{ Params: { id: string } }>('/api/prospects/:id/enrichment', (request, reply) => {
    const value = parse(capture, request.body)
    const result = store.transaction(() => saveProposal(store, getOrganization(store, request.params.id), value))
    return reply.code(result.created ? 201 : 200).send(result.proposal)
  })
  app.post<{ Params: { id: string; proposalId: string } }>('/api/prospects/:id/enrichment/:proposalId/review', (request) => {
    const input = parse(decisionInput, request.body)
    return store.transaction(() => {
      const org = getOrganization(store, request.params.id)
      const row = must(store.find<Proposal>('enrichment_proposals', parse(id, request.params.proposalId)))
      if (row.parent !== org.id) throw problem(404, 'No se encontró la propuesta para esta empresa.')
      const view = proposalView(org, row)
      if (view.state !== 'PENDIENTE' || view.contentVersion !== input.contentVersion) throw problem(409, 'Volvé a cargar la comparación antes de revisar la propuesta.')
      const reviewedAt = new Date().toISOString()
      const decision = { reviewer: input.reviewer, reviewedAt, reviewComparison: view.comparison }
      if (input.decision === 'RECHAZAR') {
        if (input.fields) throw problem(400, 'El rechazo no admite campos para aplicar.')
        const rejected = store.update<Proposal>('enrichment_proposals', row.id, { ...row, ...decision, state: 'RECHAZADA' })
        store.log('Propuesta de enriquecimiento rechazada', row.id)
        return proposalView(org, rejected)
      }
      const selected = new Set(input.fields)
      const applicable = view.comparison.filter((item) => selected.has(item.field) && ['NUEVO', 'ACTUALIZABLE'].includes(item.disposition))
      if (!selected.size || applicable.length !== selected.size) throw problem(409, 'Elegí campos habilitados en la comparación actual.')
      const patch = Object.fromEntries(applicable.map((item) => [item.field, item.proposed]))
      const saved = store.update<StoredProspect>('organizations', org.id, { ...org, ...patch })
      if (applicable.some((item) => contactFields.has(item.field))) {
        const contact = must(store.list('contacts', org.id)[0])
        store.update('contacts', contact.id, { ...contact, contact: saved.contact, email: saved.email, phone: saved.phone })
      }
      const evidence = store.insert<Source>('public_sources', row.source, org.id)
      store.insert<StoredNote>('observations', {
        sourceId: evidence.id, title: 'Enriquecimiento comercial cotejado', category: 'Dato comercial publicado',
        statement: row.source.statement, level: 'OBSERVACION_PUBLICA', severity: 'INFORMATIVA', confidence: 'MEDIA',
        impact: 'La ficha incorpora datos seleccionados por el operador.',
        limitations: 'La revisión corresponde a campos comerciales publicados en la fuente.',
        recommendation: 'Volver a cotejar la fuente antes de usar estos datos en un seguimiento.',
        reviewer: input.reviewer, reviewedAt,
      }, evidence.id)
      const updated = store.update<Proposal>('enrichment_proposals', row.id, {
        ...row, ...decision, state: 'APROBADA', sourceId: evidence.id, appliedFields: applicable.map((item) => item.field),
      })
      store.log('Enriquecimiento comercial aprobado', row.id)
      return proposalView(saved, updated)
    })
  })
}
