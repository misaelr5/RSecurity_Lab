import { date, id, instant, normalize, optedOut, organizationKey, pipelineStages, prospect, redact, required, statuses, text, url, z } from '@reac/core'
import type { Prospect, Source } from '@reac/core'
import { csv } from '@reac/reporting'
import type { FastifyInstance } from 'fastify'
import { attach, parse, problem } from './http.ts'
import type { registerPortfolio } from './portfolio.ts'
import type { Store } from './store.ts'
import { exportCommercialGeometry, verifiedLocation } from './commercial-map.ts'
import { identityKeys } from './prospect-identity.ts'

const filters = z.strictObject({
  format: z.enum(['json', 'csv', 'crm', 'geojson']).default('json'), city: text(120).optional(), region: text(120).optional(),
  industry: text(120).optional(), q: text(120).optional(), status: z.enum(statuses).optional(),
  campaign: z.union([id, z.literal('none')]).optional(), lot: z.union([id, z.literal('none')]).optional(),
  from: date.optional(), to: date.optional(), archived: z.enum(['all', 'included', 'excluded']).default('all'),
}).refine(({ from, to }) => !from || !to || from <= to, 'La fecha desde debe ser anterior o igual a hasta.')
const stamp = z.strictObject({ id, createdAt: instant, updatedAt: instant })
const publicUrl = url.transform((value) => {
  const destination = new URL(value)
  return destination.origin + destination.pathname
})
const publicReference = z.union([publicUrl, z.literal('')])
const confidence = z.enum(['BAJA', 'MEDIA', 'ALTA'])
const review = stamp.extend({ confidence, reviewedAt: instant.optional() })
const reference = stamp.extend({ url: publicUrl, consultedAt: date, observations: z.array(review).max(100) })
const milestone = stamp.extend({ stage: z.enum(pipelineStages) })
type Milestone = z.output<typeof milestone>
const documentaryStages: ReadonlySet<string> = new Set(['Autorizado', 'Auditando', 'Informe entregado', 'Remediación', 'Cerrado'])
const identityAlias = z.string().max(300).regex(/^(?:domain:[a-z0-9.-]+\.[a-z][a-z0-9-]+|location:\["[\p{L}\p{N} ]+","[\p{L}\p{N} ]+"\])$/u)
const identity = prospect.pick({ name: true, city: true, region: true, industry: true, province: true, applicationType: true })
const membership = stamp.extend({ campaignId: id, origin: z.enum(['MANUAL', 'INVESTIGACION']), jobId: id.optional() })
const campaign = stamp.extend({ name: required(160), status: z.enum(['ACTIVA', 'PAUSADA', 'CERRADA']),
  region: text(120), industry: text(120), targetCount: z.number().int().min(1).max(10000).nullable() })
const company = stamp.extend(identity.shape).extend({
  ...prospect.pick({ status: true, consent: true, verifiedAt: true, nextFollowUp: true }).shape,
  website: publicReference, sourceUrl: publicReference, archivedAt: instant.optional(),
  mapLocation: verifiedLocation.optional(),
  campaignId: id.optional(), commercialCampaignId: id.optional(), confidence: confidence.optional(),
  engagement: stamp, contact: stamp, sources: z.array(reference).max(100), milestones: z.array(milestone).max(200),
  memberships: z.array(membership).max(100), knownIdentities: z.array(identityAlias).max(100), priority: z.number().int().min(0).max(100).nullable(),
})
const candidate = stamp.extend(identity.shape).extend({
  jobId: id, organizationId: id.optional(), website: publicUrl, sourceUrl: publicUrl, consultedAt: date, confidence,
  outcome: z.enum(['IMPORTADO', 'DUPLICADO', 'EXCLUIDO', 'EN_REVISION', 'FUERA_DE_CUPO', 'RECHAZADO', 'VINCULADO', 'ACTUALIZAR', 'ENRIQUECIMIENTO']),
  reviewedAt: instant.optional(), reviewer: required(120).transform((value) => redact(value)).optional(),
})
const lot = stamp.extend({ state: z.enum(['COMPLETADO', 'PARCIAL', 'FALLIDO', 'CANCELADO']), goal: z.number().int().min(1).max(100), campaignId: id.optional() })
const archive = z.strictObject({
  type: z.literal('reac.commercial-history'), version: z.literal(1), exportedAt: instant,
  companies: z.array(company).max(1000), lots: z.array(lot).max(1000), candidates: z.array(candidate).max(1500), campaigns: z.array(campaign).max(1000),
})
const importBody = z.strictObject({ archive, acknowledge: z.literal(true) })
const exportedNote = 'Referencia pública incluida en el archivo comercial.'

type Stamp = z.output<typeof stamp>
type Archive = z.output<typeof archive>
type Candidate = z.output<typeof candidate>
type Membership = z.output<typeof membership>
type Campaign = z.output<typeof campaign>
type StoredLot = Pick<z.output<typeof lot>, 'state' | 'goal' | 'campaignId'> & { provider: string }
type ResearchRow = { record: z.output<typeof identity> & { website: string; confidence: Candidate['confidence']; evidence: Source };
  outcome: Candidate['outcome']; organizationId?: string; reviewedAt?: string; reviewer?: string }
type StoredCompany = Prospect & {
  campaignId?: string; commercialCampaignId?: string; archivedAt?: string; confidence?: z.output<typeof confidence>; documentaryMilestones?: Milestone[];
  knownIdentities?: string[]; documentaryPriority?: number | null; mapLocation?: z.output<typeof verifiedLocation>;
}

const metadata = ({ id, createdAt, updatedAt }: Stamp) => ({ id, createdAt, updatedAt })
const commercialIdentity = ({ name, city, region, industry, province, applicationType }: z.output<typeof identity>) =>
  ({ name, city, region, industry, province, applicationType })
const same = (filter: string | undefined, value: string) => !filter || normalize(filter) === normalize(value)
const selectedId = (filter: string | undefined, value: string | null | undefined) =>
  !filter || (filter === 'none' ? !value : filter === value)

function lotTotals(results: readonly Pick<ResearchRow, 'outcome'>[]) {
  const count = (outcome: Candidate['outcome']) => results.filter((item) => item.outcome === outcome).length
  return { found: results.length, verified: count('IMPORTADO'), imported: count('IMPORTADO'), duplicates: count('DUPLICADO'),
    excluded: count('EXCLUIDO'), pending: count('EN_REVISION') + count('ACTUALIZAR'), skipped: count('FUERA_DE_CUPO') }
}

function validateRelationships(data: Archive) {
  const lots = new Set(data.lots.map((item) => item.id))
  const campaigns = new Set(data.campaigns.map((item) => item.id))
  const companies = new Set(data.companies.map((item) => item.id))
  const ids = [
    ...data.lots, ...data.candidates, ...data.campaigns, ...data.companies.flatMap((item) => [item, item.engagement, item.contact, ...item.memberships,
      ...item.milestones, ...item.sources.flatMap((entry) => [entry, ...entry.observations])]),
  ].map((entry) => entry.id)
  if (new Set(ids).size !== ids.length || data.lots.some((item) => item.campaignId && !campaigns.has(item.campaignId)) ||
      data.companies.some((item) => (item.campaignId && !lots.has(item.campaignId)) ||
        (item.commercialCampaignId && !campaigns.has(item.commercialCampaignId)) ||
        item.memberships.some((member) => !campaigns.has(member.campaignId) || (member.jobId && !lots.has(member.jobId))) ||
        new Set(item.memberships.map((member) => member.campaignId)).size !== item.memberships.length) ||
      data.candidates.some((item) => !lots.has(item.jobId) || (item.organizationId && !companies.has(item.organizationId)))) {
    throw problem(400, 'El archivo tiene identificadores repetidos o relaciones incompletas.')
  }
}

export function registerHistory(app: FastifyInstance, store: Store, portfolio: ReturnType<typeof registerPortfolio>) {
  function exportHistory(query: z.output<typeof filters>): Archive {
    const matches = (item: z.output<typeof identity>, createdAt: string) => {
      const day = createdAt.slice(0, 10)
      return same(query.city, item.city) && same(query.region, item.region) && same(query.industry, item.industry) &&
        (!query.q || normalize([item.name, item.city, item.region, item.industry].join(' ')).includes(normalize(query.q))) &&
        (!query.from || day >= query.from) && (!query.to || day <= query.to)
    }
    const jobs = new Map(store.list<{ state: z.output<typeof lot>['state']; goal: number; campaignId?: string }>('research_jobs').map((job) => [job.id, job]))
    const campaigns = new Map(store.list<Campaign>('campaigns').map((item) => [item.id, item]))
    const memberships = new Map<string, Membership[]>()
    for (const item of store.list<Membership>('campaign_memberships')) {
      if (!item.parent || !campaigns.has(item.campaignId)) continue
      const list = memberships.get(item.parent) ?? []
      list.push(item)
      memberships.set(item.parent, list)
    }
    const companyCampaigns = (item: StoredCompany & { id: string }) => (memberships.get(item.id) ?? []).map((entry) => entry.campaignId)
      .concat(item.commercialCampaignId && campaigns.has(item.commercialCampaignId) ? [item.commercialCampaignId] : [])
    const selected = store.list<StoredCompany>('organizations').filter((item) => matches(item, item.createdAt) &&
      (!query.status || query.status === (optedOut(item) ? 'No contactar' : item.status)) &&
      (!query.campaign || (query.campaign === 'none' ? !companyCampaigns(item).length : companyCampaigns(item).includes(query.campaign))) &&
      selectedId(query.lot, item.campaignId) &&
      (query.archived === 'all' || Boolean(item.archivedAt) === (query.archived === 'included')))
    const selectedById = new Map(selected.map((item) => [item.id, item]))
    const selectedLots = new Set(selected.flatMap((item) => item.campaignId && jobs.has(item.campaignId) ? [item.campaignId] : []))
    const results = store.list<ResearchRow>('research_candidates').filter((item) => {
      if (!item.parent || !jobs.has(item.parent) || !selectedId(query.lot, item.parent) || !matches(item.record, item.createdAt)) return false
      if (item.organizationId) return selectedById.has(item.organizationId)
      return !query.status && selectedId(query.campaign, jobs.get(item.parent)?.campaignId) && query.archived !== 'included'
    })
    for (const item of results) selectedLots.add(item.parent!)
    const selectedCampaigns = new Set<string>()
    if (query.campaign && campaigns.has(query.campaign)) selectedCampaigns.add(query.campaign)
    for (const item of selected) {
      for (const entry of memberships.get(item.id) ?? []) if (!query.campaign || query.campaign === entry.campaignId) {
        selectedCampaigns.add(entry.campaignId)
        if (entry.jobId && jobs.has(entry.jobId)) selectedLots.add(entry.jobId)
      }
      if (item.commercialCampaignId && campaigns.has(item.commercialCampaignId) && (!query.campaign || query.campaign === item.commercialCampaignId)) {
        selectedCampaigns.add(item.commercialCampaignId)
      }
    }
    for (const jobId of selectedLots) {
      const campaignId = jobs.get(jobId)?.campaignId
      if (campaignId && campaigns.has(campaignId) && (!query.campaign || query.campaign === campaignId)) selectedCampaigns.add(campaignId)
    }
    const values = {
      type: 'reac.commercial-history', version: 1, exportedAt: new Date().toISOString(),
      companies: selected.map((item) => {
        const contact = store.list('contacts', item.id)[0]
        const engagement = store.list('engagements', item.id)[0]
        if (!contact || !engagement) throw problem(409, 'La ficha tiene relaciones incompletas. Revisá la base antes de exportarla.')
        const sources = store.list<Source>('public_sources', item.id).map((entry) => ({
          ...metadata(entry), url: entry.url, consultedAt: entry.consultedAt,
          observations: store.list<{ level: string; confidence: Candidate['confidence']; reviewedAt?: string }>('observations', entry.id)
            .filter((note) => note.level === 'OBSERVACION_PUBLICA')
            .map((note) => ({ ...metadata(note), confidence: note.confidence, reviewedAt: note.reviewedAt })),
        }))
        const events = store.list<{ stage: Milestone['stage'] }>('pipeline_events', engagement.id)
          .map((event) => ({ ...metadata(event), stage: event.stage }))
        const milestones = [...events, ...item.documentaryMilestones ?? []].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        return { ...metadata(item), ...commercialIdentity(item), contact: metadata(contact), engagement: metadata(engagement),
          status: optedOut(item) ? 'No contactar' : item.status, consent: optedOut(item) ? 'Excluido' : item.consent,
          archivedAt: item.archivedAt, campaignId: item.campaignId && selectedLots.has(item.campaignId) ? item.campaignId : undefined,
          commercialCampaignId: item.commercialCampaignId && selectedCampaigns.has(item.commercialCampaignId) ? item.commercialCampaignId : undefined,
          confidence: item.confidence, website: item.website, sourceUrl: item.sourceUrl, mapLocation: item.mapLocation,
          verifiedAt: item.verifiedAt, nextFollowUp: item.nextFollowUp, sources, milestones,
          priority: item.documentaryPriority === undefined ? portfolio.priorityScore(item.id) : item.documentaryPriority,
          knownIdentities: (item.knownIdentities ?? []).filter((entry) => identityAlias.safeParse(entry).success),
          memberships: (memberships.get(item.id) ?? []).filter((entry) => selectedCampaigns.has(entry.campaignId)).map((entry) =>
            ({ ...metadata(entry), campaignId: entry.campaignId, origin: entry.origin, jobId: entry.jobId && selectedLots.has(entry.jobId) ? entry.jobId : undefined })),
        }
      }),
      lots: [...selectedLots].flatMap((jobId) => {
        const job = jobs.get(jobId)
        return job ? [{ ...metadata(job), state: lot.shape.state.safeParse(job.state).success ? job.state : 'PARCIAL', goal: job.goal,
          campaignId: job.campaignId && selectedCampaigns.has(job.campaignId) ? job.campaignId : undefined }] : []
      }),
      campaigns: [...selectedCampaigns].flatMap((campaignId) => {
        const item = campaigns.get(campaignId)
        return item ? [{ ...metadata(item), name: item.name, status: item.status, region: item.region, industry: item.industry, targetCount: item.targetCount }] : []
      }),
      candidates: results.map(({ record, parent, outcome, organizationId, reviewedAt, reviewer, ...row }) => ({
        ...metadata(row), ...commercialIdentity(record), jobId: parent, outcome,
        organizationId: organizationId && selectedById.has(organizationId) ? organizationId : undefined,
        website: record.website, sourceUrl: record.evidence.url, consultedAt: record.evidence.consultedAt, confidence: record.confidence, reviewedAt, reviewer,
      })),
    }
    const normalized = archive.safeParse(values)
    if (!normalized.success) throw problem(409, 'La selección excede el formato de historial o contiene datos antiguos. Reducí los filtros o usá una copia SQLite.')
    return normalized.data
  }

  app.get('/api/history/export', (request, reply) => {
    const query = parse(filters, request.query)
    const history = exportHistory(query)
    if (query.format === 'crm') return attach(reply, 'reac-leads-v1.csv', 'text/csv; charset=utf-8',
      portfolio.crmExport(true, new Set(history.companies.map(({ id }) => id)), true))
    if (query.format === 'geojson') {
      const features = [...history.companies.map((item) => ({ item, kind: 'empresa' as const })),
        ...history.candidates.filter((item) => !item.organizationId).map((item) => ({ item, kind: 'candidata' as const }))]
        .map(({ item, kind }) => {
          const record = store.find<Prospect>('organizations', item.id) ?? prospect.parse(commercialIdentity(item))
          const { geometry, ...attribution } = exportCommercialGeometry(record)
          return { type: 'Feature', id: item.id, geometry, properties: { kind, name: item.name, city: item.city, region: item.region,
            industry: item.industry, ...attribution } }
        })
      return attach(reply, 'historial-comercial.geojson', 'application/geo+json', JSON.stringify({ type: 'FeatureCollection', features }))
    }
    if (query.format === 'csv') {
      const columns = ['tipo', 'id', 'empresa', 'localidad', 'region', 'rubro', 'aplicacion', 'alta', 'fuente', 'estado', 'archivada', 'campaña', 'lote', 'ultimo_hito', 'fecha_ultimo_hito', 'prioridad']
      return attach(reply, 'historial-comercial.csv', 'text/csv; charset=utf-8', csv([columns,
        ...history.companies.map((item) => ['Empresa', item.id, item.name, item.city, item.region, item.industry, item.applicationType,
          item.createdAt, item.sourceUrl || item.sources.at(-1)?.url, item.status, item.archivedAt,
          [...new Set([...item.memberships.map((entry) => entry.campaignId), item.commercialCampaignId].filter(Boolean))].join(' · '), item.campaignId,
          item.milestones[0]?.stage, item.milestones[0]?.createdAt, item.priority]),
        ...history.candidates.map((item) => ['Candidata', item.id, item.name, item.city, item.region, item.industry, item.applicationType,
          item.createdAt, item.sourceUrl, item.outcome, '', '', item.jobId, '', '', '']),
      ]))
    }
    const body = JSON.stringify(history)
    if (Buffer.byteLength(body) > 900_000) throw problem(409, 'La selección supera 900 KB. Aplicá filtros para exportar un archivo reimportable.')
    return attach(reply, 'historial-comercial-v1.json', 'application/json; charset=utf-8', body)
  })

  app.post('/api/history/import', (request) => {
    const { archive: data } = parse(importBody, request.body)
    validateRelationships(data)
    return store.transaction(() => {
      const result = { restored: 0, unchanged: 0, conflicts: 0, candidates: 0, campaigns: 0, lots: 0, exclusions: 0 }
      const excludedIdentities = new Set([
        ...store.list<StoredCompany>('organizations').filter(optedOut).flatMap((item) => [...identityKeys(item), ...item.knownIdentities ?? []]),
        ...store.list<ResearchRow>('research_candidates').filter((item) => item.outcome === 'EXCLUIDO' && item.reviewedAt)
          .flatMap(({ record }) => identityKeys({ ...prospect.parse(commercialIdentity(record)), ...record })),
      ])
      const campaignIds = new Set<string>()
      for (const item of [...data.campaigns].reverse()) {
        const key = normalize(item.name)
        const existing = store.find<{ name: string }>('campaigns', item.id)
        if (existing) {
          if (normalize(existing.name) === key) campaignIds.add(item.id)
          else result.conflicts++
          continue
        }
        if (store.find('campaigns', key, 'unique_key')) { result.conflicts++; continue }
        store.restoreRow('campaigns', { ...metadata(item), parent: null }, {
          name: item.name, status: item.status, region: item.region, industry: item.industry, targetCount: item.targetCount, objective: '',
        }, key)
        campaignIds.add(item.id)
        result.campaigns++
      }
      const companyIds = new Set<string>()
      for (const item of data.companies) {
        const { engagement, contact, sources, memberships, milestones, archivedAt, campaignId, commercialCampaignId, confidence, knownIdentities, priority, mapLocation, ...fields } = item
        const record = prospect.parse({ ...commercialIdentity(fields), website: fields.website, sourceUrl: fields.sourceUrl,
          verifiedAt: fields.verifiedAt, status: fields.status, consent: fields.consent, nextFollowUp: fields.nextFollowUp })
        const key = organizationKey(record)
        const existing = store.find<Prospect>('organizations', item.id)
        if (existing) {
          if (organizationKey(existing) === key && (!optedOut(record) || optedOut(existing))) {
            result.unchanged++
            companyIds.add(item.id)
          } else result.conflicts++
          continue
        }
        if (store.find('organizations', key, 'unique_key')) { result.conflicts++; continue }
        if ([...identityKeys(record), ...knownIdentities].some((value) => excludedIdentities.has(value))) { result.conflicts++; continue }
        if (store.find('engagements', engagement.id) || store.find('contacts', contact.id) ||
            milestones.some((event) => store.find('pipeline_events', event.id)) ||
            sources.some((entry) => store.find('public_sources', entry.id) || entry.observations.some((note) => store.find('observations', note.id)))) {
          throw problem(409, 'Un identificador de la historia ya está asociado con otra ficha. Revisá el archivo antes de continuar.')
        }
        store.restoreRow('organizations', { ...metadata(item), parent: null }, { ...record, archivedAt, campaignId, confidence, knownIdentities,
          commercialCampaignId: commercialCampaignId && campaignIds.has(commercialCampaignId) ? commercialCampaignId : undefined,
          origin: 'HISTORIAL_COMERCIAL_V1', mapLocation, documentaryPriority: priority, documentaryMilestones: milestones.filter((event) => documentaryStages.has(event.stage)) }, key)
        store.restoreRow('engagements', { ...engagement, parent: item.id }, { status: record.status, nextFollowUp: record.nextFollowUp })
        store.restoreRow('contacts', { ...contact, parent: item.id }, { contact: '', email: '', phone: '', consent: record.consent,
          sourceUrl: record.sourceUrl, optOut: optedOut(record) })
        for (const member of [...memberships].reverse()) {
          if (!campaignIds.has(member.campaignId)) continue
          if (store.find('campaign_memberships', member.id)) throw problem(409, 'Una membresía ya pertenece a otra ficha.')
          store.restoreRow('campaign_memberships', { ...metadata(member), parent: item.id },
            { campaignId: member.campaignId, origin: member.origin, jobId: member.jobId }, member.campaignId + ':' + item.id)
        }
        for (const event of [...milestones].reverse()) {
          if (!documentaryStages.has(event.stage)) store.restoreRow('pipeline_events', { ...metadata(event), parent: engagement.id },
            { stage: event.stage, note: 'Hito histórico importado.', service: '' })
        }
        for (const entry of [...sources].reverse()) {
          store.restoreRow('public_sources', { ...metadata(entry), parent: item.id },
            { url: entry.url, consultedAt: entry.consultedAt, provider: 'HISTORIAL_COMERCIAL_V1', statement: exportedNote, terms: '' })
          for (const note of [...entry.observations].reverse()) store.restoreRow('observations', { ...metadata(note), parent: entry.id }, {
            sourceId: entry.id, confidence: note.confidence, reviewedAt: note.reviewedAt,
            reviewer: note.reviewedAt ? 'Historial comercial' : undefined, title: 'Referencia pública importada', category: 'Evidencia pública',
            statement: exportedNote, level: 'OBSERVACION_PUBLICA', severity: 'INFORMATIVA', impact: 'Registro documental.',
            limitations: 'El archivo comercial conserva la referencia y la cronología de revisión.', recommendation: 'Cotejar la fuente antes de reutilizarla.',
          })
        }
        companyIds.add(item.id)
        result.restored++
      }
      const byJob = new Map<string, Candidate[]>()
      for (const item of data.candidates) {
        const list = byJob.get(item.jobId) ?? []
        list.push(item)
        byJob.set(item.jobId, list)
      }
      for (const job of data.lots) {
        const already = store.find<StoredLot>('research_jobs', job.id)
        if (already && (already.createdAt !== job.createdAt || already.goal !== job.goal || !lot.shape.state.safeParse(already.state).success ||
          (already.campaignId && job.campaignId && already.campaignId !== job.campaignId))) {
          throw problem(409, 'La procedencia de un lote difiere del historial local. Revisá el archivo antes de continuar.')
        }
        const results = byJob.get(job.id) ?? []
        if (!already) {
          store.restoreRow('research_jobs', { ...metadata(job), parent: null }, {
            provider: 'historial', state: job.state, goal: job.goal, ...lotTotals(results), errors: job.state === 'FALLIDO' ? 1 : 0,
            reason: 'Selección reimportada desde historial comercial.', requestHash: '',
            campaignId: job.campaignId && campaignIds.has(job.campaignId) ? job.campaignId : undefined,
          })
          result.lots++
        }
        const before = result.candidates
        for (const item of [...results].reverse()) {
          const existing = store.find<ResearchRow>('research_candidates', item.id)
          if (existing) {
            if (existing.parent !== job.id || existing.createdAt !== item.createdAt) {
              throw problem(409, 'Un resultado de investigación tiene una procedencia distinta en el historial local.')
            }
            if (item.outcome === 'EXCLUIDO' && item.reviewedAt && !(existing.outcome === 'EXCLUIDO' && existing.reviewedAt)) result.conflicts++
            continue
          }
          const confirmed = item.organizationId && companyIds.has(item.organizationId) ? item.organizationId : undefined
          store.restoreRow('research_candidates', { ...metadata(item), parent: job.id }, {
            outcome: item.outcome, organizationId: confirmed, reason: 'Resultado documental importado.',
            reviewedAt: item.reviewedAt, reviewer: item.reviewer,
            record: { ...commercialIdentity(item), website: item.website, confidence: item.confidence,
              applicationType: item.applicationType ?? 'Otro', opportunity: 'Cotejar la fuente para evaluar la oportunidad comercial.',
              email: '', phone: '', contact: '', technologies: [],
              evidence: { url: item.sourceUrl, consultedAt: item.consultedAt, provider: 'HISTORIAL_COMERCIAL_V1', statement: exportedNote, terms: '' } },
          })
          result.candidates++
          if (item.outcome === 'EXCLUIDO' && item.reviewedAt) result.exclusions++
        }
        if (already?.provider === 'historial' && result.candidates > before) {
          store.update('research_jobs', job.id, { ...already, ...lotTotals(store.list<ResearchRow>('research_candidates', job.id)) })
        }
      }
      if (result.restored || result.candidates || result.campaigns || result.lots || result.exclusions) store.log('Historial comercial reimportado')
      return result
    })
  })
}
