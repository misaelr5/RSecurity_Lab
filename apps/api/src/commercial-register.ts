import { id, normalize, optedOut, prospect, text, z } from '@reac/core'
import type { Prospect, Source } from '@reac/core'
import { csv, crmCsv } from '@reac/reporting'
import type { FastifyInstance } from 'fastify'
import type { Store } from './store.ts'
import { attach, must, parse } from './http.ts'

type Organization = Prospect & { origin?: string; campaignId?: string; confidence?: string; responsible?: string }
type Event = { stage: string; note?: string; service?: string }
type Activity = { action: string; actor: string; entity?: string }
const segments = ['todas', 'investigadas', 'verificadas', 'contactadas', 'respondieron', 'clientes', 'excluidas'] as const
const filters = z.strictObject({ segment: z.enum(segments).default('todas'), city: text(120).optional(), campaign: id.optional(), q: text(120).optional() })

export function registerCommercialRegister(app: FastifyInstance, store: Store) {
  function portfolio() {
    const relationships = new Map(store.list('engagements').map((row) => [row.parent, row.id]))
    const events: Map<string, ReturnType<typeof store.list<Event>>> = new Map()
    for (const entry of store.list<Event>('pipeline_events')) {
      if (!entry.parent) continue
      const list = events.get(entry.parent) ?? []
      list.push(entry)
      events.set(entry.parent, list)
    }
    const sources = new Set(store.list<Source>('public_sources').map((entry) => entry.parent))
    const statusVerification = new Set(store.list<{ reviewedAt?: string; sourceId?: string; level?: string }>('observations')
      .filter((entry) => entry.reviewedAt && entry.level === 'OBSERVACION_PUBLICA').map((entry) => entry.parent))
    const verified = new Set(store.list<Source>('public_sources').filter((entry) => statusVerification.has(entry.id)).map((entry) => entry.parent))
    return store.list<Organization>('organizations').map((org) => {
      const activity = events.get(relationships.get(org.id) ?? '') ?? []
      const contact = activity.find((entry) => entry.stage === 'Contactado')
      const flags = {
        todas: true, investigadas: Boolean(org.sourceUrl || sources.has(org.id)), verificadas: verified.has(org.id),
        contactadas: Boolean(contact), respondieron: activity.some((entry) => entry.stage === 'Respondió'),
        clientes: org.status === 'Ganado', excluidas: optedOut(org),
      }
      return { org, activity, flags, stage: activity[0]?.stage ?? 'Descubierto', lastContact: contact?.createdAt }
    })
  }
  function select(query: z.output<typeof filters>) {
    return portfolio().filter(({ org, flags }) => flags[query.segment] &&
      (!query.city || normalize(org.city) === normalize(query.city)) &&
      (!query.campaign || org.campaignId === query.campaign) &&
      (!query.q || normalize([org.name, org.city, org.industry, org.website].join(' ')).includes(normalize(query.q))))
  }

  app.get('/api/commercial/companies', (request) => select(parse(filters, request.query)).map(({ org, flags, stage, lastContact }) => ({
    id: org.id, name: org.name, region: org.region, city: org.city, industry: org.industry, state: org.status, stage, flags,
    campaignId: org.campaignId, responsible: org.responsible, createdAt: org.createdAt, next: org.nextFollowUp, lastContact, source: org.sourceUrl,
  })))
  app.get<{ Params: { id: string } }>('/api/commercial/companies/:id/history', (request) => {
    const organizationId = parse(id, request.params.id)
    const item = must(portfolio().find(({ org }) => org.id === organizationId))
    const history = store.list<Activity>('activity_log').filter((entry) => entry.entity === organizationId)
    return { stage: item.stage, lastContact: item.lastContact, next: item.org.nextFollowUp, events: item.activity, history }
  })
  app.get('/api/commercial/metrics', () => {
    const entries = portfolio()
    const count = (name: (typeof segments)[number]) => entries.filter((entry) => entry.flags[name]).length
    const week = Date.now() - 7 * 86400000
    const contacts = count('contactadas')
    const responses = entries.filter((entry) => entry.flags.contactadas && entry.flags.respondieron).length
    const clients = count('clientes')
    return {
      total: entries.length, newWeek: entries.filter((entry) => Date.parse(entry.org.createdAt) >= week).length,
      verified: count('verificadas'), pending: entries.length - count('verificadas'),
      contacts, responses, clients, campaigns: store.count('research_jobs'),
      meetings: entries.filter((entry) => entry.org.status === 'Reunión').length,
      proposals: entries.filter((entry) => entry.activity.some((event) => event.stage === 'Auditoría propuesta')).length,
      responseRate: contacts ? responses / contacts : null, conversionRate: entries.length ? clients / entries.length : null,
    }
  })
  app.get('/api/commercial/export', (request, reply) => {
    const { format, ...query } = parse(filters.extend({ format: z.enum(['csv', 'json', 'crm']) }), request.query)
    const selected = select(query)
    const filename = format === 'crm' ? 'reac-leads-v1.csv' : 'empresas-prospectadas.' + format
    const reference = selected.map(({ org, stage, lastContact }) => ({
      id: org.id, name: org.name, city: org.city, region: org.region, industry: org.industry, applicationType: org.applicationType, website: org.website,
      sourceUrl: org.sourceUrl, verifiedAt: org.verifiedAt, status: org.status, optedOut: optedOut(org), campaignId: org.campaignId, stage, lastContact, next: org.nextFollowUp,
    }))
    if (format === 'json') return attach(reply, filename, 'application/json; charset=utf-8', JSON.stringify({ version: 1, companies: reference }))
    if (format === 'crm') {
      const known = ['Arquitectura', 'Estudio jurídico', 'Contaduría', 'Odontología', 'Turismo', 'Consultora', 'Inmobiliaria', 'Marketing tercerizador', 'Otro']
      return attach(reply, filename, 'text/csv; charset=utf-8', crmCsv(selected.map(({ org }) => ({
        empresa: org.name, rubro: known.includes(org.industry) ? org.industry : 'Otro', ciudad: org.city, web: org.website,
        fuente_url: org.sourceUrl, fecha_verificacion: org.verifiedAt, estado: optedOut(org) ? 'No contactar' : org.status,
        consentimiento: optedOut(org) ? 'Excluido' : org.consent, presencia_web: org.website ? 'Con web' : 'Sin verificar', prioridad: 'Media', servicio: 'A definir',
      }))))
    }
    const columns = ['id', 'name', 'city', 'region', 'industry', 'applicationType', 'website', 'sourceUrl', 'verifiedAt', 'status', 'optedOut', 'campaignId', 'stage', 'lastContact', 'next'] as const
    return attach(reply, filename, 'text/csv; charset=utf-8', csv([columns, ...reference.map((entry) => columns.map((key) => entry[key]))]))
  })
}
