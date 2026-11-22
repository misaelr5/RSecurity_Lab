import { prospect, source, observation, manualSource, csvSource, review, message, id, z, readCrm, optedOut, normalize, organizationKey, redact } from '@reac/core'
import type { Prospect, Source, Observation, Message, CrmRow } from '@reac/core'
import { crmCsv } from '@reac/reporting'
import type { FastifyInstance } from 'fastify'
import type { Store } from './store.ts'
import { problem, parse, must, attach } from './http.ts'

type StoredProspect = Prospect & { original?: CrmRow; origin: string }
type Draft = Message & { reviewer?: string; reviewedAt?: string }
type Note = Observation & { reviewer?: string; reviewedAt?: string }

export function registerPortfolio(app: FastifyInstance, store: Store) {
  const get = (raw: unknown) => must(store.find<StoredProspect>('organizations', parse(id, raw)))
  const sourcesFor = (org: string) => store.list<Source>('public_sources', org)
  const notesFor = (org: string) => sourcesFor(org).flatMap((value) => store.list<Note>('observations', value.id))
  const contactState = (value: StoredProspect) => ({ contact: value.contact, email: value.email, phone: value.phone, consent: value.consent, sourceUrl: value.sourceUrl, optOut: optedOut(value) })
  function create(value: Prospect, original?: CrmRow) {
    const key = organizationKey(value)
    if (store.find('organizations', key, 'unique_key')) throw problem(409, 'Ya existe un prospecto con ese nombre y localidad.')
    const org = store.insert<StoredProspect>('organizations', { ...value, original, origin: original ? csvSource.name : manualSource.name }, null, key)
    const engagement = store.insert('engagements', { status: value.status, nextFollowUp: value.nextFollowUp }, org.id)
    store.insert('contacts', contactState(value), org.id)
    if (value.sourceUrl && value.verifiedAt) {
      const provider = original ? csvSource : manualSource
      store.insert('public_sources', provider.capture({
        url: value.sourceUrl, consultedAt: value.verifiedAt, provider: provider.name,
        statement: 'Referencia registrada en la ficha del prospecto. Pendiente de revisión del contenido.',
        terms: '',
      }), org.id)
    }
    store.log('Prospecto registrado', org.id)
    return { org, engagement }
  }

  app.get('/api/dashboard', () => {
    const orgs = store.list<StoredProspect>('organizations')
    return {
      total: orgs.length,
      regions: orgs.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.region]: (counts[item.region] ?? 0) + 1 }), {}),
      verified: store.list<Note>('observations').filter((item) => item.reviewedAt && item.level === 'OBSERVACION_PUBLICA').length,
      pending: store.list<Draft>('outreach_drafts').filter((item) => !item.reviewedAt).length,
      authorized: store.list<{ state: string; startsAt: string; endsAt: string }>('authorizations').filter((item) => item.state === 'APPROVED' && Date.parse(item.startsAt) <= Date.now() && Date.parse(item.endsAt) > Date.now()).length,
      lab: store.list<{ mode: string; status: string }>('audit_runs').filter((item) => item.mode === 'LAB_LOCAL' && item.status === 'COMPLETED').length,
      activity: store.list('activity_log').slice(0, 8),
    }
  })
  app.get('/api/prospects', (request) => {
    const filters = parse(z.strictObject({
      q: z.string().max(120).optional(), region: prospect.shape.region.optional(),
      industry: z.string().max(120).optional(), status: prospect.shape.status.optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    }), request.query)
    const filtered = store.list<StoredProspect>('organizations').filter((item) =>
      (!filters.region || item.region === filters.region) &&
      (!filters.status || item.status === filters.status) &&
      (!filters.industry || normalize(item.industry).includes(normalize(filters.industry))) &&
      (!filters.q || normalize([item.name, item.city, item.website, item.contact].join(' ')).includes(normalize(filters.q))))
    const start = (filters.page - 1) * 25
    return { items: filtered.slice(start, start + 25), total: filtered.length, page: filters.page }
  })
  app.post('/api/prospects', (request, reply) => reply.code(201).send(store.transaction(() => create(parse(prospect, request.body)).org)))
  app.get<{ Params: { id: string } }>('/api/prospects/:id', (request) => {
    const org = get(request.params.id)
    return { org, sources: sourcesFor(org.id), observations: notesFor(org.id), drafts: store.list<Draft>('outreach_drafts', org.id) }
  })
  app.put<{ Params: { id: string } }>('/api/prospects/:id', (request) => store.transaction(() => {
    const org = get(request.params.id)
    const dto = parse(z.strictObject({ prospect, confirmUnblock: z.boolean().optional() }), request.body)
    const key = organizationKey(dto.prospect)
    if (optedOut(org) && !optedOut(dto.prospect) && !dto.confirmUnblock) throw problem(409, 'Confirmá explícitamente la reapertura del contacto.')
    const other = store.find('organizations', key, 'unique_key')
    if (other && other.id !== org.id) throw problem(409, 'Ya existe un prospecto con ese nombre y localidad.')
    const contact = store.list('contacts', org.id)[0]
    const engagement = store.list('engagements', org.id)[0]
    store.update('contacts', contact.id, contactState(dto.prospect))
    store.update('engagements', engagement.id, { status: dto.prospect.status, nextFollowUp: dto.prospect.nextFollowUp })
    if (optedOut(dto.prospect)) {
      for (const draft of store.list<Draft>('outreach_drafts', org.id)) {
        store.update('outreach_drafts', draft.id, { subject: draft.subject, body: draft.body })
      }
    }
    store.log('Prospecto actualizado', org.id)
    return store.update<StoredProspect>('organizations', org.id, { ...dto.prospect, original: org.original, origin: org.origin }, key)
  }))
  app.delete<{ Params: { id: string } }>('/api/prospects/:id', (request, reply) => store.transaction(() => {
    const org = get(request.params.id)
    if (optedOut(org)) throw problem(409, 'Conservá la ficha para mantener la exclusión de contacto.')
    if (store.list('engagements', org.id).some((engagement) => store.list('authorizations', engagement.id).length)) {
      throw problem(409, 'La ficha tiene historial de autorizaciones y debe conservarse.')
    }
    store.remove('organizations', org.id)
    store.log('Prospecto eliminado', org.id)
    return reply.code(204).send()
  }))
  app.post('/api/prospects/import', (request) => {
    const input = parse(z.strictObject({ csv: z.string().min(1).max(900000), version: z.literal(1) }), request.body)
    let rows: ReturnType<typeof readCrm>
    try { rows = readCrm(input.csv) }
    catch { throw problem(400, 'Revisá el formato CSV, los encabezados, las comillas y el límite de 1500 filas.') }
    return store.transaction(() => {
      let imported = 0
      let duplicates = 0
      let exclusionsApplied = 0
      const invalid: { row: number; fields: string[] }[] = []
      for (const row of rows) {
        if (!row.result.success) {
          invalid.push({ row: row.row, fields: row.result.error.issues.map((issue) => issue.path.join('.')) })
          continue
        }
        const data = row.result.data
        const existing = store.find<StoredProspect>('organizations', organizationKey(data), 'unique_key')
        if (existing) {
          duplicates++
          if (optedOut(data) && !optedOut(existing)) {
            const change: StoredProspect = { ...existing, status: 'No contactar', consent: 'Excluido' }
            store.update('organizations', existing.id, change)
            const contact = store.list('contacts', existing.id)[0]
            const engagement = store.list('engagements', existing.id)[0]
            store.update('contacts', contact.id, contactState(change))
            store.update('engagements', engagement.id, { status: change.status, nextFollowUp: change.nextFollowUp })
            for (const draft of store.list<Draft>('outreach_drafts', existing.id)) {
              store.update('outreach_drafts', draft.id, { subject: draft.subject, body: draft.body })
            }
            store.log('Exclusión importada', existing.id)
            exclusionsApplied++
          }
          continue
        }
        create(data, row.original)
        imported++
      }
      store.log('Importación CSV procesada')
      return { imported, duplicates, invalid, exclusionsApplied, version: 1 }
    })
  })
  app.get('/api/prospects/export', (_, reply) => {
    const rows = store.list<StoredProspect>('organizations').map((item) => ({
      presencia_web: 'Sin verificar', prioridad: 'Media', servicio: 'A definir', ...item.original,
      empresa: item.name, rubro: item.industry, ciudad: item.city, web: item.website,
      email: item.email, telefono: item.phone, fuente_url: item.sourceUrl, fecha_verificacion: item.verifiedAt,
      estado: item.status, notas: item.notes, consentimiento: item.consent, proximo_seguimiento: item.nextFollowUp,
      mensaje: optedOut(item) ? '' : item.original?.mensaje,
    }))
    return attach(reply, 'reac-leads-v1.csv', 'text/csv; charset=utf-8', crmCsv(rows))
  })
  app.post<{ Params: { id: string } }>('/api/prospects/:id/sources', (request, reply) => store.transaction(() => {
    const org = get(request.params.id)
    const value = manualSource.capture(parse(source, request.body))
    const saved = store.insert('public_sources', value, org.id)
    store.log('Fuente pública registrada', saved.id)
    return reply.code(201).send(saved)
  }))
  app.post<{ Params: { id: string } }>('/api/prospects/:id/observations', (request, reply) => store.transaction(() => {
    const org = get(request.params.id)
    const value = parse(observation, request.body)
    if (!sourcesFor(org.id).some((item) => item.id === value.sourceId)) throw problem(400, 'Elegí una fuente de este prospecto.')
    const saved = store.insert('observations', value, value.sourceId)
    store.log('Observación registrada', saved.id)
    return reply.code(201).send(saved)
  }))
  app.post<{ Params: { id: string } }>('/api/observations/:id/review', (request) => store.transaction(() => {
    const value = must(store.find<Note>('observations', parse(id, request.params.id)))
    const { reviewer } = parse(review, request.body)
    store.log('Observación revisada', value.id)
    return store.update('observations', value.id, { ...value, reviewer, reviewedAt: new Date().toISOString() })
  }))
  app.post<{ Params: { id: string } }>('/api/prospects/:id/drafts', (request) => store.transaction(() => {
    const org = get(request.params.id)
    if (optedOut(org)) throw problem(409, 'Este prospecto está excluido de contacto.')
    const saved = store.insert<Draft>('outreach_drafts', {
      subject: 'Consulta sobre su plataforma web | Reac Studio',
      body: 'Hola, equipo de ' + org.name + ':\n\nSoy Misael, programador web en Reac Studio. Podemos revisar la configuración de su plataforma con un alcance acordado y autorización previa. Esta invitación se basa en un relevamiento comercial y no presenta hallazgos técnicos.\n\n¿Les sirve una charla breve para definir qué valdría la pena revisar?\n\nSaludos,\nMisael · Reac Studio',
    }, org.id)
    store.log('Borrador creado', saved.id)
    return saved
  }))
  app.put<{ Params: { id: string } }>('/api/drafts/:id', (request) => store.transaction(() => {
    const draft = must(store.find<Draft>('outreach_drafts', parse(id, request.params.id)))
    if (optedOut(get(draft.parent))) throw problem(409, 'Este prospecto está excluido de contacto.')
    const value = parse(message, request.body)
    store.log('Borrador editado', draft.id)
    return store.update('outreach_drafts', draft.id, value)
  }))
  app.post<{ Params: { id: string } }>('/api/drafts/:id/review', (request) => store.transaction(() => {
    const draft = must(store.find<Draft>('outreach_drafts', parse(id, request.params.id)))
    if (optedOut(get(draft.parent))) throw problem(409, 'Este prospecto está excluido de contacto.')
    const { reviewer } = parse(review, request.body)
    store.log('Mensaje aprobado para uso manual', draft.id)
    return store.update('outreach_drafts', draft.id, { subject: draft.subject, body: draft.body, reviewer, reviewedAt: new Date().toISOString() })
  }))

  return { get, sourcesFor, notesFor, redact }
}

