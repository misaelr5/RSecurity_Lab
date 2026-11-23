import { id, optedOut, pipelineEvent, pipelineStages, statuses } from '@reac/core'
import type { AuthorizationRecord, PipelineEvent, Prospect } from '@reac/core'
import type { FastifyInstance } from 'fastify'
import type { Store } from './store.ts'
import { authorizationState } from './audits.ts'
import { parse, must, problem } from './http.ts'

const commercialStates: Partial<Record<PipelineEvent['stage'], Prospect['status']>> = {
  'Contacto preparado': 'Listo para contactar', Contactado: 'Contactado', 'Respondió': 'Respondió', 'Reunión': 'Reunión',
  'Propuesta comercial enviada': 'Presupuesto', Cliente: 'Ganado', Descartado: 'Perdido', Excluido: 'No contactar',
}

export function registerPipeline(app: FastifyInstance, store: Store) {
  function context(raw: string) {
    const org = must(store.find<Prospect & { archivedAt?: string }>('organizations', parse(id, raw)))
    const engagement = must(store.list('engagements', org.id)[0])
    const events = store.list<PipelineEvent>('pipeline_events', engagement.id)
    return { org, engagement, events, stage: events[0]?.stage ?? pipelineStages[0] }
  }
  app.get<{ Params: { id: string } }>('/api/prospects/:id/pipeline', (request) => {
    const { events, stage } = context(request.params.id)
    return { stage, events }
  })
  app.post<{ Params: { id: string } }>('/api/prospects/:id/pipeline', (request, reply) => store.transaction(() => {
    const { org, engagement, stage } = context(request.params.id)
    const value = parse(pipelineEvent, request.body)
    const target = pipelineStages.indexOf(value.stage)
    const current = pipelineStages.indexOf(stage)
    const disposition = value.stage === 'Descartado' || value.stage === 'Excluido'
    if (target <= current) throw problem(409, 'Elegí una etapa posterior a la actual.')
    if ((optedOut(org) || org.archivedAt || org.status === 'Perdido') && target >= pipelineStages.indexOf('Contacto preparado') && value.stage !== 'Excluido') {
      throw problem(409, 'La ficha está excluida o archivada.')
    }
    if (!disposition && ((target >= pipelineStages.indexOf('Autorizado') && current < pipelineStages.indexOf('Autorizado')) || value.stage === 'Auditando')) {
      const valid = store.list<AuthorizationRecord>('authorizations', engagement.id).some((item) =>
        authorizationState(item) === 'APPROVED' && Date.parse(item.startsAt) <= Date.now())
      if (!valid) throw problem(409, 'Registrá una autorización revisada y vigente para avanzar a esta etapa.')
    }
    const event = store.insert<PipelineEvent>('pipeline_events', value, engagement.id)
    const state = commercialStates[value.stage]
    if (state && (disposition || statuses.indexOf(state) > statuses.indexOf(org.status))) {
      const consent = value.stage === 'Excluido' ? 'Excluido' : org.consent
      store.update('organizations', org.id, { ...org, status: state, consent })
      store.update('engagements', engagement.id, { ...engagement, status: state })
      const contact = store.list('contacts', org.id)[0]
      if (contact && value.stage === 'Excluido') store.update('contacts', contact.id, { ...contact, consent, optOut: true })
      if (disposition) {
        for (const draft of store.list<{ subject: string; body: string; channel?: string }>('outreach_drafts', org.id)) {
          store.update('outreach_drafts', draft.id, { subject: draft.subject, body: draft.body, channel: draft.channel })
        }
      }
    }
    store.log('Etapa comercial registrada', event.id)
    return reply.code(201).send(event)
  }))
  app.get('/api/pipeline/metrics', () => {
    const events = store.list<PipelineEvent>('pipeline_events')
    const latest = new Map<string, PipelineEvent['stage']>()
    for (const item of events) {
      if (item.parent && !latest.has(item.parent)) latest.set(item.parent, item.stage)
    }
    const counts = Object.fromEntries(pipelineStages.map((stage) => [stage, 0])) as Record<PipelineEvent['stage'], number>
    counts.Descubierto = store.count('engagements') - latest.size
    for (const stage of latest.values()) counts[stage]++
    const recorded = new Map<PipelineEvent['stage'], Set<string>>()
    for (const item of events) {
      if (!item.parent) continue
      const organizations = recorded.get(item.stage) ?? new Set<string>()
      organizations.add(item.parent)
      recorded.set(item.stage, organizations)
    }
    return {
      stages: pipelineStages.map((stage) => ({ stage, count: counts[stage] })),
      contactados: recorded.get('Contactado')?.size ?? 0,
      respondieron: [...(recorded.get('Respondió') ?? [])].filter((item) => recorded.get('Contactado')?.has(item)).length,
    }
  })
}
