import { id, normalize, optedOut, organizationKey, pipelineStages, statuses, text, z } from '@reac/core'
import type { AuthorizationRecord, PipelineEvent, Prospect, Source } from '@reac/core'
import { csv } from '@reac/reporting'
import type { FastifyInstance } from 'fastify'
import type { Store } from './store.ts'
import { attach, must, parse } from './http.ts'
import { authorizationState } from './audits.ts'
import type { registerPortfolio } from './portfolio.ts'

type Organization = Prospect & { origin?: string; campaignId?: string; confidence?: string; responsible?: string; archivedAt?: string }
type Activity = { action: string; actor: string; entity?: string }
type ResearchCandidate = {
  record: Pick<Prospect, 'name' | 'region' | 'city' | 'industry' | 'website' | 'applicationType'> & { evidence: Pick<Source, 'url'> }; outcome: string; reason: string
}
const segments = ['todas', 'investigadas', 'pendientes', 'verificadas', 'contactadas', 'respondieron', 'clientes', 'descartadas', 'excluidas'] as const
const filters = z.strictObject({
  segment: z.enum(segments).default('todas'), city: text(120).optional(), region: text(120).optional(),
  status: z.enum(statuses).optional(), campaign: z.union([id, z.literal('none')]).optional(), q: text(120).optional(),
})
type Filters = z.output<typeof filters>
const identity = (name: string, city: string) => JSON.stringify([normalize(name), normalize(city)])
function matchesEntry(item: Pick<Prospect, 'city' | 'region' | 'name' | 'industry' | 'website'>, campaign: string | null | undefined, query: Filters) {
  return (!query.city || normalize(item.city) === normalize(query.city)) &&
    (!query.region || normalize(item.region) === normalize(query.region)) &&
    (!query.campaign || (query.campaign === 'none' ? !campaign : campaign === query.campaign)) &&
    (!query.q || normalize([item.name, item.city, item.industry, item.website].join(' ')).includes(normalize(query.q)))
}
function publicReference(value: string) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin + url.pathname : ''
  } catch { return '' }
}
function grouped(items: Organization[], field: 'industry' | 'region') {
  const totals = new Map<string, { name: string; count: number }>()
  for (const item of items) {
    const label = item[field]
    const key = normalize(label)
    const group = totals.get(key) ?? { name: label, count: 0 }
    group.count++
    totals.set(key, group)
  }
  return [...totals.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
}

export function registerCommercialRegister(app: FastifyInstance, store: Store, portfolio: ReturnType<typeof registerPortfolio>) {
  function registered() {
    const relationships = new Map(store.list('engagements').map((row) => [row.parent, row.id]))
    const events: Map<string, ReturnType<typeof store.list<PipelineEvent>>> = new Map()
    for (const entry of store.list<PipelineEvent>('pipeline_events')) {
      if (!entry.parent) continue
      const list = events.get(entry.parent) ?? []
      list.push(entry)
      events.set(entry.parent, list)
    }
    const sourceRows = store.list<Source>('public_sources')
    const sources = new Map(sourceRows.map((entry) => [entry.parent, entry.url]))
    const statusVerification = new Set(store.list<{ reviewedAt?: string; sourceId?: string; level?: string }>('observations')
      .filter((entry) => entry.reviewedAt && entry.level === 'OBSERVACION_PUBLICA').map((entry) => entry.parent))
    const today = new Date().toISOString().slice(0, 10)
    const verified = new Set(sourceRows
      .filter((entry) => entry.consultedAt <= today && statusVerification.has(entry.id))
      .map((entry) => entry.parent))
    return store.list<Organization>('organizations').map((org) => {
      const activity = events.get(relationships.get(org.id) ?? '') ?? []
      const contact = activity.find((entry) => entry.stage === 'Contactado')
      const excluded = optedOut(org)
      const discarded = org.status === 'Perdido' && !excluded
      const flags = {
        todas: true, investigadas: Boolean(org.sourceUrl || sources.has(org.id)), verificadas: verified.has(org.id),
        contactadas: Boolean(contact), respondieron: activity.some((entry) => entry.stage === 'Respondió'),
        clientes: org.status === 'Ganado', excluidas: excluded, descartadas: discarded,
        pendientes: !excluded && !discarded && !verified.has(org.id),
      }
      return { org, activity, flags, state: excluded ? 'No contactar' : org.status, source: org.sourceUrl || sources.get(org.id) || '',
        stage: activity[0]?.stage ?? 'Descubierto', lastContact: contact?.createdAt }
    })
  }
  function select(query: Filters) {
    return registered().filter(({ org, state, flags }) => flags[query.segment] && (!query.status || query.status === state) &&
      matchesEntry(org, org.campaignId, query))
  }

  function researchedCandidates(existing: Set<string>, campaign?: Filters['campaign']) {
    const rows = campaign === 'none' ? [] : store.list<ResearchCandidate>('research_candidates', campaign)
    const researched = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (!['EN_REVISION', 'EXCLUIDO', 'FUERA_DE_CUPO'].includes(row.outcome)) continue
      const key = identity(row.record.name, row.record.city)
      if (existing.has(key)) continue
      const latest = researched.get(key)
      if (!latest || (latest.outcome === 'FUERA_DE_CUPO' && row.outcome !== 'FUERA_DE_CUPO')) researched.set(key, row)
    }
    return [...researched.values()]
  }

  app.get('/api/commercial/campaigns', () => store.list('research_jobs').map(({ id, createdAt }) => ({ id, createdAt })))
  app.get('/api/commercial/companies', (request) => select(parse(filters, request.query)).map(({ org, state, flags, stage, lastContact, source }) => ({
    id: org.id, name: org.name, region: org.region, city: org.city, industry: org.industry, state, stage, flags,
    campaignId: org.campaignId, responsible: org.responsible, createdAt: org.createdAt, next: org.nextFollowUp, lastContact,
    source: publicReference(source),
  })))
  app.get('/api/commercial/researched', (request) => {
    const query = parse(filters, request.query)
    if (!['todas', 'investigadas', 'pendientes', 'excluidas'].includes(query.segment) || query.status) return []
    return researchedCandidates(new Set(store.list<Organization>('organizations').map(organizationKey)), query.campaign)
      .filter(({ record, parent, outcome }) => matchesEntry(record, parent, query) &&
        (query.segment !== 'pendientes' || outcome === 'EN_REVISION') && (query.segment !== 'excluidas' || outcome === 'EXCLUIDO'))
      .map(({ id, parent, record, outcome, reason, createdAt }) => ({
        id, jobId: parent, name: record.name, city: record.city, region: record.region, industry: record.industry,
        outcome, reason, researchedAt: createdAt, source: publicReference(record.evidence.url),
      }))
  })
  app.get<{ Params: { id: string } }>('/api/commercial/companies/:id/history', (request) => {
    const organizationId = parse(id, request.params.id)
    const org = portfolio.get(organizationId)
    const engagement = must(store.list('engagements', org.id)[0])
    const events = store.list<PipelineEvent>('pipeline_events', engagement.id)
    const sourceIds = portfolio.sourcesFor(org.id).map((entry) => entry.id)
    const noteIds = portfolio.notesFor(org.id).map((entry) => entry.id)
    const draftIds = store.list('outreach_drafts', org.id).map((entry) => entry.id)
    const tracked = new Set([org.id, ...sourceIds, ...noteIds, ...draftIds])
    const history = store.list<Activity>('activity_log').filter((entry) => entry.entity && tracked.has(entry.entity))
    return { stage: events[0]?.stage ?? 'Descubierto', lastContact: events.find((entry) => entry.stage === 'Contactado')?.createdAt,
      next: org.nextFollowUp, events, history }
  })
  app.get('/api/commercial/metrics', (request) => {
    const { days } = parse(z.strictObject({ days: z.enum(['7', '30', '90']).default('30') }), request.query)
    const entries = registered()
    const organizations = entries.map(({ org }) => org)
    const count = (name: (typeof segments)[number]) => entries.filter((entry) => entry.flags[name]).length
    const today = new Date()
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
    const weekly = Array.from({ length: 8 }, (_, index) => {
      const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (7 - index) * 7)
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
      const within = (value: string) => Date.parse(value) >= start.getTime() && Date.parse(value) < end.getTime()
      return { startsAt: start.toISOString(), newCompanies: organizations.filter((org) => within(org.createdAt)).length,
        contacts: entries.filter(({ activity }) => activity.some((event) => event.stage === 'Contactado' && within(event.createdAt))).length }
    })
    const terminal = new Set(['COMPLETADO', 'PARCIAL', 'FALLIDO', 'CANCELADO'])
    const jobs = store.list<{ state: string; duplicates?: number }>('research_jobs')
    const settled = new Set(jobs.filter((job) => terminal.has(job.state)).map((job) => job.id))
    const activeCompanies = new Set(entries.filter(({ org, flags }) => !org.archivedAt && !flags.excluidas && !flags.descartadas).map(({ org }) => org.id))
    const pendingByCompany = new Map<string, { id: string; name: string }>()
    for (const candidate of store.list<ResearchCandidate & { organizationId?: string }>('research_candidates')) {
      if (!candidate.parent || !settled.has(candidate.parent)) continue
      if (candidate.outcome !== 'EN_REVISION' && !(candidate.outcome === 'ACTUALIZAR' && candidate.organizationId && activeCompanies.has(candidate.organizationId))) continue
      const key = candidate.organizationId ?? identity(candidate.record.name, candidate.record.city)
      if (!pendingByCompany.has(key)) pendingByCompany.set(key, { id: candidate.id, name: candidate.record.name })
    }
    const pendingCandidates = pendingByCompany.size
    const campaigns = jobs.filter((job) => terminal.has(job.state)).length
    const contacts = count('contactadas')
    const responses = entries.filter((entry) => entry.flags.contactadas && entry.flags.respondieron).length
    const clients = count('clientes')
    const contactedClients = entries.filter((entry) => entry.flags.contactadas && entry.flags.clientes).length
    const day = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((part) => String(part).padStart(2, '0')).join('-')
    return {
      total: entries.length, newWeek: weekly.at(-1)!.newCompanies,
      newInPeriod: organizations.filter((org) => Date.parse(org.createdAt) >= today.getTime() - Number(days) * 86400_000).length,
      duplicatesAvoided: jobs.reduce((sum, item) => sum + (item.duplicates ?? 0), 0),
      activeCampaigns: store.list<{ status: string }>('campaigns').filter((campaign) => campaign.status === 'ACTIVA').length,
      verified: count('verificadas'), pending: count('pendientes') + pendingCandidates, pendingCandidates,
      firstPendingCandidate: pendingByCompany.values().next().value ?? null,
      contacts, responses, clients, campaigns,
      meetings: entries.filter((entry) => entry.flags.contactadas && entry.activity.some((event) => event.stage === 'Reunión')).length,
      proposals: entries.filter((entry) => entry.flags.contactadas && entry.activity.some((event) => event.stage === 'Auditoría propuesta')).length,
      sentProposals: entries.filter((entry) => entry.flags.contactadas && entry.activity.some((event) => event.stage === 'Propuesta comercial enviada')).length,
      authorized: store.list<AuthorizationRecord>('authorizations')
        .filter((record) => authorizationState(record) === 'APPROVED' && Date.parse(record.startsAt) <= today.getTime()).length,
      responseRate: contacts ? responses / contacts : null, conversionRate: contacts ? contactedClients / contacts : null,
      regions: grouped(organizations, 'region'), industries: grouped(organizations, 'industry'), weekly,
      stages: pipelineStages.map((stage) => ({ stage, count: entries.filter((entry) => entry.stage === stage).length })),
      followUps: entries.filter(({ flags, org }) => !flags.excluidas && !flags.descartadas && !org.archivedAt && org.nextFollowUp && org.nextFollowUp >= day)
        .sort((a, b) => a.org.nextFollowUp.localeCompare(b.org.nextFollowUp)).slice(0, 10)
        .map(({ org }) => ({ id: org.id, name: org.name, date: org.nextFollowUp })),
    }
  })
  app.get('/api/commercial/export', (request, reply) => {
    const { format, ...query } = parse(filters.extend({ format: z.enum(['csv', 'json', 'crm']) }), request.query)
    const selected = select(query)
    const filename = format === 'crm' ? 'reac-leads-v1.csv' : 'empresas-prospectadas.' + format
    if (format === 'crm') return attach(reply, filename, 'text/csv; charset=utf-8', portfolio.crmExport(true, new Set(selected.map(({ org }) => org.id))))
    const reference = selected.map(({ org, state, stage, lastContact, source }) => ({
      id: org.id, name: org.name, city: org.city, region: org.region, industry: org.industry, applicationType: org.applicationType, website: publicReference(org.website),
      sourceUrl: publicReference(source), verifiedAt: org.verifiedAt, createdAt: org.createdAt, status: state,
      optedOut: optedOut(org), campaignId: org.campaignId, stage, lastContact, next: org.nextFollowUp,
    }))
    if (format === 'json') return attach(reply, filename, 'application/json; charset=utf-8', JSON.stringify({ version: 1, companies: reference }))
    const columns = ['id', 'name', 'city', 'region', 'industry', 'applicationType', 'website', 'sourceUrl', 'verifiedAt', 'createdAt', 'status', 'optedOut', 'campaignId', 'stage', 'lastContact', 'next'] as const
    return attach(reply, filename, 'text/csv; charset=utf-8', csv([columns, ...reference.map((entry) => columns.map((key) => entry[key]))]))
  })
}
