import { id, normalize, optedOut, required, text, z } from '@reac/core'
import type { Prospect, Source } from '@reac/core'
import type { FastifyInstance } from 'fastify'
import { must, parse, problem } from './http.ts'
import type { Store } from './store.ts'

const campaignStatuses = ['ACTIVA', 'PAUSADA', 'CERRADA'] as const
const campaignInput = z.strictObject({
  name: required(160).refine((value) => Boolean(normalize(value))),
  objective: text(800).default(''),
  region: text(120).default(''),
  industry: text(120).default(''),
  targetCount: z.number().int().min(1).max(10000).nullable().default(null),
  status: z.enum(campaignStatuses).default('ACTIVA'),
})
const campaignChanges = z.strictObject({
  name: campaignInput.shape.name.optional(),
  objective: text(800).optional(),
  region: text(120).optional(),
  industry: text(120).optional(),
  targetCount: z.number().int().min(1).max(10000).nullable().optional(),
  status: z.enum(campaignStatuses).optional(),
}).refine((values) => Object.keys(values).length > 0)
const memberInput = z.strictObject({ organizationIds: z.array(id).min(1).max(100) })
type Campaign = z.output<typeof campaignInput>
type Membership = { campaignId: string; origin: 'MANUAL' | 'INVESTIGACION'; jobId?: string }
type ResearchJob = { state: string; campaignId?: string }
type Candidate = { record: Pick<Prospect, 'name' | 'city' | 'industry'> }
type Timeline = { stage: string }
type CampaignMember = Pick<Prospect, 'name' | 'city' | 'region' | 'industry' | 'status'> & {
  id: string; campaignId: string; organizationId: string; joinedAt: string; origin: Membership['origin']; jobId?: string
  excluded: boolean; verified: boolean; contacted: boolean; responded: boolean; meeting: boolean; proposed: boolean; client: boolean; converted: boolean; pendingDrafts: number
}

const getCampaign = (store: Store, value: unknown) => must(store.find<Campaign>('campaigns', parse(id, value)))
const unavailable = (org: Prospect, stage?: string) => optedOut(org) || org.status === 'Perdido' || ['Descartado', 'Excluido'].includes(stage ?? '')

export function requireOpenCampaign(store: Store, campaignId: string) {
  const campaign = getCampaign(store, campaignId)
  if (campaign.status !== 'ACTIVA') throw problem(409, 'La campaña debe estar activa para recibir empresas o búsquedas.')
  return campaign
}

// The API and research worker call this inside their own store transaction.
export function addCampaignMember(store: Store, campaignId: string, organizationId: string, origin: Membership['origin'], jobId?: string) {
  requireOpenCampaign(store, campaignId)
  const org = must(store.find<Prospect>('organizations', parse(id, organizationId)))
  const key = campaignId + ':' + org.id
  const engagement = store.list('engagements', org.id)[0]
  const stage = engagement && store.list<Timeline>('pipeline_events', engagement.id)[0]?.stage
  if (unavailable(org, stage)) return 'excluded'
  if (store.find('campaign_memberships', key, 'unique_key')) return 'existing'
  store.insert<Membership>('campaign_memberships', { campaignId, origin, jobId }, org.id, key)
  store.log('Empresa incorporada a campaña', org.id)
  return 'added'
}

function metricsFor(members: CampaignMember[], researched: number) {
  const contacted = members.filter((row) => row.contacted).length
  const responses = members.filter((row) => row.responded).length
  return {
    members: members.length, researched, verified: members.filter((row) => row.verified).length, contacted, responses,
    meetings: members.filter((row) => row.meeting).length, proposals: members.filter((row) => row.proposed).length,
    clients: members.filter((row) => row.client).length, excluded: members.filter((row) => row.excluded).length,
    pendingDrafts: members.reduce((count, row) => count + row.pendingDrafts, 0),
    responseRate: contacted ? responses / contacted : null,
    conversionRate: contacted ? members.filter((row) => row.converted).length / contacted : null,
  }
}

function performanceBy(field: 'city' | 'industry', members: CampaignMember[], researched: Candidate['record'][]) {
  const groups = new Map<string, { name: string; members: CampaignMember[]; researched: number }>()
  const groupFor = (name: string) => {
    const key = normalize(name)
    const group = groups.get(key) ?? { name, members: [], researched: 0 }
    groups.set(key, group)
    return group
  }
  for (const member of members) groupFor(member[field]).members.push(member)
  for (const candidate of researched) groupFor(candidate[field]).researched++
  return [...groups.values()].map((group) => ({ name: group.name, ...metricsFor(group.members, group.researched) }))
    .sort((a, b) => b.members - a.members || b.researched - a.researched || a.name.localeCompare(b.name, 'es'))
}

function campaignSnapshot(store: Store) {
  const prospects = new Map(store.list<Prospect>('organizations').map((row) => [row.id, row]))
  const engagements = new Map(store.list('engagements').map((row) => [row.parent, row.id]))
  const events = new Map<string, ReturnType<typeof store.list<Timeline>>>()
  for (const row of store.list<Timeline>('pipeline_events')) {
    if (!row.parent) continue
    const list = events.get(row.parent) ?? []
    list.push(row)
    events.set(row.parent, list)
  }
  const reviewed = new Set(store.list<{ reviewedAt?: string; level?: string }>('observations')
    .filter((row) => row.reviewedAt && row.level === 'OBSERVACION_PUBLICA').map((row) => row.parent))
  const verified = new Set(store.list<Source>('public_sources').filter((row) => reviewed.has(row.id)).map((row) => row.parent))
  const pendingDrafts = new Map<string, number>()
  for (const row of store.list<{ reviewedAt?: string }>('outreach_drafts')) {
    if (row.parent && !row.reviewedAt) pendingDrafts.set(row.parent, (pendingDrafts.get(row.parent) ?? 0) + 1)
  }
  const members = store.list<Membership>('campaign_memberships').flatMap<CampaignMember>((row) => {
    const org = prospects.get(row.parent ?? '')
    if (!org) return []
    const history = events.get(engagements.get(org.id) ?? '') ?? []
    const activity = history.filter((event) => event.createdAt >= row.createdAt)
    const contact = activity.findLast((event) => event.stage === 'Contactado')
    const hasEvent = (stage: string) => activity.some((event) => event.stage === stage)
    const afterContact = (stage: string) => Boolean(contact && activity.some((event) => event.stage === stage && event.createdAt >= contact.createdAt))
    return [{
      id: row.id, campaignId: row.campaignId, organizationId: org.id, name: org.name, city: org.city, region: org.region, industry: org.industry,
      status: org.status, excluded: optedOut(org), origin: row.origin, jobId: row.jobId, joinedAt: row.createdAt,
      verified: verified.has(org.id), contacted: Boolean(contact),
      responded: afterContact('Respondió'), meeting: hasEvent('Reunión'), proposed: hasEvent('Propuesta comercial enviada'),
      client: hasEvent('Cliente'), converted: afterContact('Cliente'),
      pendingDrafts: unavailable(org, history[0]?.stage) ? 0 : (pendingDrafts.get(org.id) ?? 0),
    }]
  })
  const research = store.list<ResearchJob>('research_jobs')
  const candidates = store.list<Candidate>('research_candidates')
  return (campaign: ReturnType<typeof getCampaign>) => {
    const group = members.filter((row) => row.campaignId === campaign.id)
    const jobs = research.filter((row) => row.campaignId === campaign.id).map(({ id, state, createdAt }) => ({ id, state, createdAt }))
    const jobIds = new Set(jobs.map((row) => row.id))
    const distinct = new Map<string, Candidate['record']>()
    for (const row of candidates) {
      if (!row.parent || !jobIds.has(row.parent)) continue
      const key = JSON.stringify([normalize(row.record.name), normalize(row.record.city)])
      if (!distinct.has(key)) distinct.set(key, row.record)
    }
    const researched = [...distinct.values()]
    return {
      campaign: { ...campaign, metrics: { ...metricsFor(group, researched.length), batches: jobs.length } },
      members: group,
      jobs,
      performance: { byCity: performanceBy('city', group, researched), byIndustry: performanceBy('industry', group, researched) },
    }
  }
}

export function registerCampaigns(app: FastifyInstance, store: Store) {
  const checkName = (name: string, campaignId?: string) => {
    const key = normalize(name)
    const other = store.find('campaigns', key, 'unique_key')
    if (other && other.id !== campaignId) throw problem(409, 'Ya existe una campaña con ese nombre.')
    return key
  }
  app.get('/api/campaigns', () => {
    const snapshot = campaignSnapshot(store)
    return store.list<Campaign>('campaigns').map((row) => snapshot(row).campaign)
  })
  app.post('/api/campaigns', (request, reply) => {
    const input = parse(campaignInput, request.body)
    const campaign = store.transaction(() => {
      const saved = store.insert<Campaign>('campaigns', input, null, checkName(input.name))
      store.log('Campaña registrada', saved.id)
      return campaignSnapshot(store)(saved).campaign
    })
    return reply.code(201).send(campaign)
  })
  app.get<{ Params: { id: string } }>('/api/campaigns/:id', (request) => {
    const campaign = getCampaign(store, request.params.id)
    return campaignSnapshot(store)(campaign)
  })
  app.patch<{ Params: { id: string } }>('/api/campaigns/:id', (request) => {
    const changes = parse(campaignChanges, request.body)
    return store.transaction(() => {
      const old = getCampaign(store, request.params.id)
      const values = campaignInput.parse({ ...Object.fromEntries(Object.keys(campaignInput.shape).map((key) => [key, old[key as keyof Campaign]])), ...changes })
      const saved = store.update<Campaign>('campaigns', old.id, values, checkName(values.name, old.id))
      store.log('Campaña actualizada', old.id)
      return campaignSnapshot(store)(saved).campaign
    })
  })
  app.post<{ Params: { id: string } }>('/api/campaigns/:id/members', (request) => {
    const { organizationIds } = parse(memberInput, request.body)
    return store.transaction(() => {
      const campaign = requireOpenCampaign(store, request.params.id)
      const counts = { added: 0, existing: 0, excluded: 0 }
      for (const organizationId of new Set(organizationIds)) counts[addCampaignMember(store, campaign.id, organizationId, 'MANUAL')]++
      return counts
    })
  })
}
