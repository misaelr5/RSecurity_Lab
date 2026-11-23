import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { applicationTypes, discoveryRecord, id, normalize, optedOut, organizationKey, required, source, url, versionedReview, z } from '@reac/core'
import type { Observation, Prospect, Source } from '@reac/core'
import type { FastifyInstance } from 'fastify'
import { must, parse, problem } from './http.ts'
import { identityKeys, rememberIdentity } from './prospect-identity.ts'
import type { IdentityHistory } from './prospect-identity.ts'
import type { Store } from './store.ts'

const enrichmentFields = ['legalName', 'province', 'address', 'applicationType', 'contact', 'email', 'phone', 'website', 'industry', 'city', 'region'] as const
const contactFields = new Set<string>(['contact', 'email', 'phone'])
const geographyFields = new Set<string>(['city', 'region'])
const field = z.enum(enrichmentFields)
const changes = z.strictObject({
  legalName: required(200).optional(),
  province: required(120).optional(),
  address: required(250).optional(),
  applicationType: z.enum(applicationTypes).exclude(['Sin clasificar']).optional(),
  contact: required(160).optional(),
  email: z.email().max(254).optional(),
  phone: required(60).refine((value) => /^[+\d ().-]+$/u.test(value) && value.replace(/\D/g, '').length >= 8).optional(),
  website: url.refine((value) => value.startsWith('https://'), 'Ingresá una URL HTTPS.').optional(),
  industry: required(120).refine((value) => Boolean(normalize(value))).optional(),
  city: required(120).refine((value) => Boolean(normalize(value))).optional(),
  region: required(120).refine((value) => Boolean(normalize(value))).optional(),
}).refine((value) => Object.keys(value).length > 0)
const capture = z.strictObject({
  provider: z.enum(['ORCA', 'MANUAL']), source, fields: changes,
  confidence: z.enum(['ALTA', 'MEDIA', 'BAJA']).default('MEDIA'),
})
const decisionInput = versionedReview.extend({
  decision: z.enum(['APROBAR', 'RECHAZAR']),
  fields: z.array(field).min(1).max(enrichmentFields.length).optional(),
})
type Field = (typeof enrichmentFields)[number]
type Capture = z.output<typeof capture>
type ResearchReference = { jobId: string; candidateId: string }
type Disposition = 'NUEVO' | 'ACTUALIZABLE' | 'SIN_CAMBIO' | 'CONSERVAR_EXISTENTE' | 'BLOQUEADO'
type Comparison = { field: Field; current: string; proposed: string; disposition: Disposition; confidence: Capture['confidence']; reason: string }
type Proposal = Capture & {
  research?: ResearchReference
  state: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'
  reviewer?: string
  reviewedAt?: string
  appliedFields?: Field[]
  sourceId?: string
  reviewComparison?: Comparison[]
}
type StoredProspect = Prospect & IdentityHistory & { origin?: string; campaignId?: string; responsible?: string; archivedAt?: string }
type StoredNote = Observation & { reviewer: string; reviewedAt: string }
const today = () => new Date().toISOString().slice(0, 10)
const cutoff = () => new Date(Date.parse(today()) - 180 * 86400000).toISOString().slice(0, 10)
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const getOrganization = (store: Store, raw: unknown) => must(store.find<StoredProspect>('organizations', parse(id, raw)))
const unavailable = (org: StoredProspect) => optedOut(org) || org.status === 'Perdido' || Boolean(org.archivedAt)

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
  if (key === 'website') return left !== '' && new URL(left).href === new URL(right).href
  return normalize(left) === normalize(right)
}

function locationConflict(store: Store, org: ReturnType<typeof getOrganization>, city: string) {
  const key = organizationKey({ ...org, city })
  const location = 'location:' + key
  const indexed = store.find('organizations', key, 'unique_key')
  if (indexed && indexed.id !== org.id) return true
  return store.list<StoredProspect>('organizations').some((other) =>
    other.knownIdentities?.includes(location) || (other.id !== org.id && identityKeys(other).includes(location)))
}

function compare(store: Store, org: ReturnType<typeof getOrganization>, proposal: Proposal): Comparison[] {
  const latest = store.list<Proposal>('enrichment_proposals', org.id).filter((row) => row.state === 'APROBADA')
  const declaredConfidence = proposal.confidence ?? 'MEDIA'
  return enrichmentFields.flatMap((key) => {
    const proposed = proposal.fields[key]
    if (proposed === undefined) return []
    const current = org[key] ?? ''
    const row = (disposition: Disposition, reason: string, confidence = declaredConfidence) => [{ field: key, current, proposed, disposition, confidence, reason }]
    if (unavailable(org)) return row('BLOQUEADO', 'La ficha conserva una exclusión, un descarte o un archivo.')
    if (!firstParty(org, proposal.source)) return row('BLOQUEADO', 'La fuente no coincide con el dominio oficial actual.', 'BAJA')
    const date = proposal.source.consultedAt
    if (date < cutoff() || date > today()) return row('BLOQUEADO', 'La fecha de consulta queda fuera de la ventana de revisión.', 'BAJA')
    if (sameValue(key, current, proposed)) return row('SIN_CAMBIO', 'El dato coincide con la ficha.')
    if (key === 'website' && (!proposed.startsWith('https://') || publicHost(proposed) !== publicHost(org.website))) {
      return row('BLOQUEADO', 'La URL debe conservar el dominio oficial y usar HTTPS.', 'BAJA')
    }
    if (geographyFields.has(key)) {
      const mentionsLocation = (' ' + normalize(proposal.source.statement) + ' ').includes(' ' + normalize(proposed) + ' ')
      if (declaredConfidence !== 'ALTA' || !mentionsLocation) return row('BLOQUEADO', 'El cambio geográfico requiere confianza alta y una mención expresa en la evidencia.', 'BAJA')
      if (key === 'city' && locationConflict(store, org, proposed)) return row('BLOQUEADO', 'La localidad coincide con una identidad actual o histórica y requiere revisión por separado.', 'BAJA')
    }
    if (!current || (['applicationType', 'region'].includes(key) && current === 'Sin clasificar')) return row('NUEVO', 'La ficha todavía no tiene este dato.')
    if (contactFields.has(key)) return row('CONSERVAR_EXISTENTE', 'El contacto ya registrado se conserva.')
    const latestDate = latest.reduce((currentDate, item) => item.appliedFields?.includes(key) && item.source.consultedAt > currentDate ?
      item.source.consultedAt : currentDate, org.verifiedAt ?? '')
    if (date <= latestDate) return row('CONSERVAR_EXISTENTE', 'La evidencia existente tiene la misma fecha o es más reciente.')
    if (declaredConfidence === 'BAJA') return row('CONSERVAR_EXISTENTE', 'Una propuesta con confianza baja conserva el valor existente.')
    return row('ACTUALIZABLE', 'La fuente corporativa es más reciente que la evidencia registrada.')
  })
}
function proposalView(store: Store, org: ReturnType<typeof getOrganization>, proposal: ReturnType<Store['insert']> & Proposal) {
  const comparison = proposal.reviewComparison ?? compare(store, org, proposal)
  return { ...proposal, comparison, contentVersion: digest([proposal.id, proposal.state, proposal.source, org.updatedAt, comparison]) }
}

function saveProposal(store: Store, org: ReturnType<typeof getOrganization>, value: Capture, research?: ResearchReference) {
  if (unavailable(org)) throw problem(409, 'La ficha excluida, descartada o archivada conserva sus datos.')
  if (!firstParty(org, value.source)) throw problem(400, 'Usá una fuente HTTPS del dominio oficial de esta empresa.')
  if (value.source.consultedAt < cutoff() || value.source.consultedAt > today()) throw problem(400, 'Registrá una fuente consultada dentro de los últimos 180 días.')
  const key = digest([org.id, value, research])
  const previous = store.find<Proposal>('enrichment_proposals', key, 'unique_key')
  if (previous) return { created: false, proposal: proposalView(store, org, previous) }
  const row = store.insert<Proposal>('enrichment_proposals', { ...value, research, state: 'PENDIENTE' }, org.id, key)
  store.log('Propuesta de enriquecimiento registrada', row.id)
  return { created: true, proposal: proposalView(store, org, row) }
}

// The research route has validated the candidate and chooses its associated organization.
// This records a draft and leaves the candidate and original prospect unchanged.
export function proposeResearchEnrichment(store: Store, organizationId: string, record: z.output<typeof discoveryRecord>, research: ResearchReference) {
  const org = getOrganization(store, organizationId)
  const value = parse(capture, {
    provider: 'ORCA', source: record.evidence, confidence: record.confidence,
    fields: Object.fromEntries(enrichmentFields.flatMap((key) => record[key] ? [[key, record[key]]] : [])),
  })
  const job = must(store.find<object>('research_jobs', parse(id, research.jobId)))
  const candidate = must(store.find<object>('research_candidates', parse(id, research.candidateId)))
  if (candidate.parent !== job.id) throw problem(409, 'La candidatura no pertenece al lote indicado.')
  const reference = { jobId: job.id, candidateId: candidate.id }
  return saveProposal(store, org, value, reference).proposal
}

export function registerEnrichment(app: FastifyInstance, store: Store) {
  app.get<{ Params: { id: string } }>('/api/prospects/:id/enrichment', (request) => {
    const org = getOrganization(store, request.params.id)
    return store.list<Proposal>('enrichment_proposals', org.id).map((row) => proposalView(store, org, row))
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
      const view = proposalView(store, org, row)
      if (view.state !== 'PENDIENTE' || view.contentVersion !== input.contentVersion) throw problem(409, 'Volvé a cargar la comparación antes de revisar la propuesta.')
      const reviewedAt = new Date().toISOString()
      const decision = { reviewer: input.reviewer, reviewedAt, reviewComparison: view.comparison }
      if (input.decision === 'RECHAZAR') {
        if (input.fields) throw problem(400, 'El rechazo no admite campos para aplicar.')
        const rejected = store.update<Proposal>('enrichment_proposals', row.id, { ...row, ...decision, state: 'RECHAZADA' })
        store.log('Propuesta de enriquecimiento rechazada', row.id)
        return proposalView(store, org, rejected)
      }
      const selected = new Set(input.fields)
      const applicable = view.comparison.filter((item) => selected.has(item.field) && ['NUEVO', 'ACTUALIZABLE'].includes(item.disposition))
      if (!selected.size || applicable.length !== selected.size) throw problem(409, 'Elegí campos habilitados en la comparación actual.')
      const patch = Object.fromEntries(applicable.map((item) => [item.field, item.proposed]))
      const proposed = { ...org, ...patch }
      const uniqueKey = selected.has('city') ? organizationKey(proposed) : undefined
      const saved = store.update<StoredProspect>('organizations', org.id, { ...proposed, knownIdentities: rememberIdentity(org, proposed) }, uniqueKey)
      if (applicable.some((item) => contactFields.has(item.field))) {
        const contact = must(store.list('contacts', org.id)[0])
        store.update('contacts', contact.id, { ...contact, contact: saved.contact, email: saved.email, phone: saved.phone })
      }
      const evidence = store.insert<Source>('public_sources', row.source, org.id)
      store.insert<StoredNote>('observations', {
        sourceId: evidence.id, title: 'Enriquecimiento comercial cotejado', category: 'Dato comercial publicado',
        statement: row.source.statement, level: 'OBSERVACION_PUBLICA', severity: 'INFORMATIVA', confidence: row.confidence ?? 'MEDIA',
        impact: 'La ficha incorpora datos seleccionados por el operador.',
        limitations: 'La revisión corresponde a campos comerciales publicados en la fuente.',
        recommendation: 'Volver a cotejar la fuente antes de usar estos datos en un seguimiento.',
        reviewer: input.reviewer, reviewedAt,
      }, evidence.id)
      const updated = store.update<Proposal>('enrichment_proposals', row.id, {
        ...row, ...decision, state: 'APROBADA', sourceId: evidence.id, appliedFields: applicable.map((item) => item.field),
      })
      store.log('Enriquecimiento comercial aprobado', row.id)
      return proposalView(store, saved, updated)
    })
  })
}
