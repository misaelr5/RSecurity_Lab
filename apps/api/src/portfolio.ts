import { createHash } from 'node:crypto'
import { prospect, source, observation, manualSource, csvSource, review, versionedReview, message, id, z, readCrm, optedOut, normalize, organizationKey, statuses, regions, crmHeaders, unwrapCrmCell, discoveryFile, applicationTypes } from '@reac/core'
import type { Prospect, Source, Observation, Message, CrmRow, AuthorizationRecord } from '@reac/core'
import { crmCsv } from '@reac/reporting'
import type { FastifyInstance } from 'fastify'
import type { Store } from './store.ts'
import { problem, parse, must, attach } from './http.ts'
import { authorizationState } from './audits.ts'

type StoredProspect = Prospect & { original?: CrmRow; origin: string; campaignId?: string; responsible?: string; confidence?: string }
const portable = z.strictObject({
  version: z.literal(1),
  prospects: z.array(z.strictObject({
    prospect, original: z.partialRecord(z.enum(crmHeaders), z.string().max(16384)).optional(),
  })).max(1500),
})
function portableProspect(item: StoredProspect) {
  const fields = Object.keys(prospect.shape) as (keyof Prospect)[]
  return { prospect: prospect.parse(Object.fromEntries(fields.map((field) => [field, item[field]]))), original: item.original }
}
type Draft = Message & { channel?: 'Email' | 'WhatsApp'; reviewer?: string; reviewedAt?: string }
const draftContent = ({ subject, body, channel }: Draft) => ({ subject, body, channel })
function identity(item: Prospect) {
  const domain = item.website ? new URL(item.website).hostname.replace(/^www\./, '') : ''
  const email = item.email.toLowerCase()
  const digits = item.phone.replace(/\D/g, '')
  return [domain, email, digits.length >= 8 ? digits : '']
}

const crmIndustries = ['Arquitectura', 'Estudio jurídico', 'Contaduría', 'Odontología', 'Turismo', 'Consultora', 'Inmobiliaria', 'Marketing tercerizador', 'Otro']
const draftVersion = (draft: Draft) => createHash('sha256').update(JSON.stringify(draftContent(draft))).digest('hex')
type Note = Observation & { reviewer?: string; reviewedAt?: string }

export function registerPortfolio(app: FastifyInstance, store: Store) {
  const get = (raw: unknown) => must(store.find<StoredProspect>('organizations', parse(id, raw)))
  const sourcesFor = (org: string) => store.list<Source>('public_sources', org)
  const notesFor = (org: string) => sourcesFor(org).flatMap((value) => store.list<Note>('observations', value.id))
  const contactState = (value: Prospect) => ({ contact: value.contact, email: value.email, phone: value.phone, consent: value.consent, sourceUrl: value.sourceUrl, optOut: optedOut(value) })
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
      authorized: store.list<AuthorizationRecord>('authorizations').filter((item) => authorizationState(item) === 'APPROVED' && Date.parse(item.startsAt) <= Date.now()).length,
      lab: store.list<{ mode: string; status: string }>('audit_runs').filter((item) => item.mode === 'LAB_LOCAL' && item.status === 'COMPLETED').length,
      activity: store.list('activity_log').slice(0, 8),
    }
  })
  app.get('/api/prospect-regions', () => [...new Set([...regions, ...store.list<StoredProspect>('organizations').map((item) => item.region)])])
  app.get('/api/prospects', (request) => {
    const filters = parse(z.strictObject({
      q: z.string().max(120).optional(), region: prospect.shape.region.optional(),
      industry: z.string().max(120).optional(), applicationType: z.enum(applicationTypes).optional(), status: z.enum(statuses).optional(),
      campaign: id.optional(), page: z.coerce.number().int().min(1).max(10000).default(1),
    }), request.query)
    const filtered = store.list<StoredProspect>('organizations').filter((item) =>
      (!filters.region || normalize(item.region) === normalize(filters.region)) &&
      (!filters.status || item.status === filters.status) &&
      (!filters.campaign || item.campaignId === filters.campaign) &&
      (!filters.applicationType || (item.applicationType ?? 'Sin clasificar') === filters.applicationType) &&
      (!filters.industry || normalize(item.industry).includes(normalize(filters.industry))) &&
      (!filters.q || normalize([item.name, item.city, item.website, item.contact].join(' ')).includes(normalize(filters.q))))
    const start = (filters.page - 1) * 25
    return { items: filtered.slice(start, start + 25), total: filtered.length, page: filters.page }
  })
  function previewDiscovery(data: z.output<typeof discoveryFile>) {
    const known = new Set(store.list<StoredProspect>('organizations').map(organizationKey))
    return data.records.map((item) => {
      const key = organizationKey({ ...item, status: 'Nuevo', consent: 'Sin registro', sourceUrl: item.evidence.url, verifiedAt: item.evidence.consultedAt, notes: '', nextFollowUp: '' })
      const duplicate = known.has(key)
      known.add(key)
      return { name: item.name, city: item.city, type: item.applicationType, sourceUrl: item.evidence.url, statement: item.evidence.statement, opportunity: item.opportunity, duplicate }
    })
  }
  app.post('/api/discovery/preview', (request) => previewDiscovery(parse(discoveryFile, request.body)))
  app.post('/api/discovery/import', (request, reply) => store.transaction(() => {
    const { file, reviewer } = parse(z.strictObject({ file: discoveryFile, reviewer: review.shape.reviewer, acknowledge: review.shape.acknowledge }), request.body)
    const outcomes = previewDiscovery(file)
    const ids = file.records.flatMap((item, index) => outcomes[index].duplicate ? [] : [addDiscovery(item, reviewer)])
    return reply.code(201).send({ imported: ids.length, duplicates: file.records.length - ids.length, ids })
  }))
  function addDiscovery(item: z.output<typeof discoveryFile>['records'][number], reviewer: string, campaignId?: string) {
      const { evidence, corroboration, opportunity, technologies, confidence, ...candidate } = item
      const { org, engagement } = create(prospect.parse({ ...candidate, verifiedAt: evidence.consultedAt, status: 'Verificar' }))
      store.update('organizations', org.id, { ...org, sourceUrl: evidence.url, origin: campaignId ? 'INVESTIGACION_V3' : 'DESCUBRIMIENTO_MANUAL_V1', campaignId, responsible: reviewer, confidence })
      const primary = store.insert('public_sources', manualSource.capture(evidence), org.id)
      const secondary = corroboration ? store.insert('public_sources', manualSource.capture(corroboration), org.id) : undefined
      store.insert<Note>('observations', {
        sourceId: primary.id, title: 'Función digital publicada', category: 'Función comercial publicada', statement: evidence.statement,
        level: 'OBSERVACION_PUBLICA', severity: 'INFORMATIVA', confidence,
        impact: 'La función documentada puede orientar una conversación comercial.',
        limitations: 'Alcance documental. Se observó lo publicado por la fuente.', recommendation: opportunity,
        reviewer, reviewedAt: new Date().toISOString(),
      }, primary.id)
      store.insert('public_assets', { sourceId: primary.id, kind: 'Dominio', value: new URL(org.website).hostname,
        status: 'Confirmado con fuente', collectedAt: evidence.consultedAt, confidence: 'ALTA', note: 'Dominio oficial consignado en la ficha de descubrimiento.' }, primary.id)
      for (const tech of technologies) {
        const attributed = tech.source === 'corroboracion' ? must(secondary) : primary
        store.insert('public_assets', { sourceId: attributed.id, kind: 'Tecnología', value: tech.name,
          status: 'Confirmado con fuente', collectedAt: attributed.consultedAt, confidence: 'MEDIA', note: 'Integración nombrada por la fuente pública.' }, attributed.id)
      }
      store.insert('pipeline_events', { stage: 'Verificado', note: 'Ficha y fuente revisadas para el piloto.', service: opportunity }, engagement.id)
      store.log('Investigación comercial incorporada', org.id)
      if (campaignId) createDraft(org.id, 'Email')
      return org.id
  }
  app.post('/api/prospects', (request, reply) => reply.code(201).send(store.transaction(() => create(parse(prospect, request.body)).org)))
  app.get<{ Params: { id: string } }>('/api/prospects/:id', (request) => {
    const org = get(request.params.id)
    const keys = identity(org)
    const duplicates = store.list<StoredProspect>('organizations').filter((candidate) => candidate.id !== org.id)
      .flatMap((candidate) => {
        const matches = identity(candidate).flatMap((value, index) => value && value === keys[index] ? [['Dominio', 'Correo', 'Teléfono'][index]] : [])
        return matches.length ? [{ id: candidate.id, name: candidate.name, matches }] : []
      }).slice(0, 20)
    return { org, duplicates, sources: sourcesFor(org.id), observations: notesFor(org.id), drafts: store.list<Draft>('outreach_drafts', org.id).map((draft) => ({ ...draft, contentVersion: draftVersion(draft) })) }
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
        store.update('outreach_drafts', draft.id, draftContent(draft))
      }
    }
    store.log('Prospecto actualizado', org.id)
    return store.update<StoredProspect>('organizations', org.id, { ...org, ...dto.prospect, original: org.original, origin: org.origin }, key)
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
  function importRows(rows: { row: number; result: ReturnType<typeof prospect.safeParse>; original?: CrmRow }[]) {
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
              store.update('outreach_drafts', draft.id, draftContent(draft))
            }
            store.log('Exclusión importada', existing.id)
            exclusionsApplied++
          }
          continue
        }
        create(data, row.original)
        imported++
      }
      store.log('Importación de prospectos procesada')
      return { imported, duplicates, invalid, exclusionsApplied, version: 1 }
    })
  }
  app.post('/api/prospects/import', (request) => {
    const input = parse(z.strictObject({ csv: z.string().min(1).max(900000), version: z.literal(1) }), request.body)
    let rows: ReturnType<typeof readCrm>
    try { rows = readCrm(input.csv) }
    catch { throw problem(400, 'Revisá el formato CSV, los encabezados, las comillas y el límite de 1500 filas.') }
    return importRows(rows)
  })
  app.post('/api/prospects/import/json', (request) => {
    const input = parse(portable, request.body)
    return importRows(input.prospects.map((item, index) => ({
      row: index + 1, result: prospect.safeParse(item.prospect), original: item.original,
    })))
  })
  app.get('/api/prospects/export/json', (_request, reply) => {
    const prospects = store.list<StoredProspect>('organizations').map(portableProspect)
    const body = JSON.stringify({ version: 1, prospects })
    if (prospects.length > 1500 || Buffer.byteLength(body) > 900000) {
      throw problem(409, 'La cartera excede el límite de intercambio JSON. Usá una copia SQLite para conservar el conjunto completo.')
    }
    return attach(reply, 'reac-prospectos-v1.json', 'application/json; charset=utf-8', body)
  })
  function handoff(item: StoredProspect & { id: string }) {
    const blocked = optedOut(item)
    const approved = !blocked && store.list<Draft>('outreach_drafts', item.id).find((draft) => draft.reviewedAt)
    return { id: item.id, name: item.name, blocked, crmIndustry: crmIndustries.includes(item.industry) ? item.industry : 'Otro', approved: Boolean(approved), message: approved ? approved.body : '' }
  }
  app.get('/api/crm/preview', () => store.list<StoredProspect>('organizations').map((item) => {
    const { id, name, blocked, crmIndustry, approved } = handoff(item)
    return { id, name, blocked, industry: item.industry, crmIndustry, approved }
  }))
  app.get('/api/prospects/export', (request, reply) => {
    const { mode } = parse(z.strictObject({ mode: z.literal('handoff').optional() }), request.query)
    const rows = store.list<StoredProspect>('organizations').map((item) => {
      const transfer = mode === 'handoff' ? handoff(item) : undefined
      return ({
      presencia_web: 'Sin verificar', prioridad: 'Media', servicio: 'A definir', ...Object.fromEntries(Object.entries(item.original ?? {}).map(([key, value]) => [key, unwrapCrmCell(value)])),
      empresa: item.name, rubro: transfer?.crmIndustry ?? item.industry, ciudad: item.city, web: item.website,
      email: item.email, telefono: item.phone, fuente_url: item.sourceUrl, fecha_verificacion: item.verifiedAt,
      estado: item.status, notas: item.notes, consentimiento: item.consent, proximo_seguimiento: item.nextFollowUp,
      mensaje: transfer ? transfer.message : optedOut(item) ? '' : unwrapCrmCell(item.original?.mensaje ?? ''),
      ...(transfer?.blocked ? { estado: 'No contactar', consentimiento: 'Excluido' } : {}),
    })
    })
    return attach(reply, 'reac-leads-v1.csv', 'text/csv; charset=utf-8', crmCsv(rows))
  })
  app.get<{ Params: { id: string } }>('/api/prospects/:id/score', (request) => {
    const item = get(request.params.id)
    const weight = z.coerce.number().int().min(0).max(100)
    const weights = parse(z.strictObject({ site: weight.default(20), contact: weight.default(20), source: weight.default(35), application: weight.default(25) }), request.query)
    const signals = [
      { label: 'Tipo de aplicación publicado', weight: weights.application, factor: ['Marketplace', 'Comercio electrónico', 'Software de gestión', 'Portal de clientes'].includes(item.applicationType ?? '') ? 1 : item.applicationType === 'Reservas' ? 0.7 : 0, detail: item.applicationType ?? 'Sin clasificar' },
      { label: 'Sitio oficial registrado', weight: weights.site, factor: item.website ? 1 : 0, detail: item.website ? 'Registrado' : 'Pendiente' },
      { label: 'Canal público de contacto', weight: weights.contact, factor: item.email || item.phone || item.contact ? (item.contactPurpose === 'Derivación' ? 0.6 : 1) : 0, detail: item.contactPurpose ?? (item.email || item.phone || item.contact ? 'Canal registrado' : 'Pendiente') },
      { label: 'Evidencia pública revisada', weight: weights.source, factor: notesFor(item.id).some((note) => note.level === 'OBSERVACION_PUBLICA' && Boolean(note.reviewedAt)) ? 1 : 0, detail: 'Fuente atribuida y revisada' },
    ]
    const total = signals.reduce((sum, signal) => sum + signal.weight, 0)
    if (!total) throw problem(400, 'Asigná peso a por lo menos una señal.')
    const score = optedOut(item) ? null : Math.round(signals.reduce((sum, signal) => sum + signal.factor * signal.weight, 0) * 100 / total)
    return { score, signals: signals.map((signal) => ({ ...signal, present: signal.factor > 0 })) }
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
    const { channel } = parse(z.strictObject({ channel: z.enum(['Email', 'WhatsApp']).default('Email') }), request.body)
    return createDraft(org.id, channel)
  }))
  function createDraft(orgId: string, channel: NonNullable<Draft['channel']>) {
    const org = get(orgId)
    const signal = notesFor(org.id).find((item) => item.reviewedAt && item.level === 'OBSERVACION_PUBLICA' && item.category === 'Función comercial publicada')
    const personalized = signal ? 'En su sitio vi lo siguiente: ' + signal.statement + '\n\nSi les interesa, podemos conversar sobre ' + signal.recommendation.replace(/^Proponer\s+/i, '').replace(/\.$/, '') + '. ¿Con quién puedo coordinar una charla breve?' : undefined
    const saved = store.insert<Draft>('outreach_drafts', channel === 'WhatsApp' ? {
      channel, subject: 'Consulta por WhatsApp · Reac Studio',
      body: personalized ? 'Hola, equipo de ' + org.name + '. Soy Misael, programador web en Reac Studio.\n\n' + personalized : 'Hola, equipo de ' + org.name + '. Soy Misael, programador web en Reac Studio. Podemos preparar una revisión de su plataforma con alcance y autorización acordados. ¿Con quién puedo coordinar una charla breve para definir qué sería útil revisar?',
    } : {
      channel, subject: 'Consulta sobre su plataforma web | Reac Studio',
      body: personalized ? 'Hola, equipo de ' + org.name + ':\n\nSoy Misael, programador web en Reac Studio.\n\n' + personalized + '\n\nSaludos,\nMisael · Reac Studio' : 'Hola, equipo de ' + org.name + ':\n\nSoy Misael, programador web en Reac Studio. Podemos revisar la configuración de su plataforma con un alcance acordado y autorización previa. Esta invitación se basa en un relevamiento comercial y no presenta hallazgos técnicos.\n\n¿Les sirve una charla breve para definir qué valdría la pena revisar?\n\nSaludos,\nMisael · Reac Studio',
    }, org.id)
    store.log('Borrador creado', saved.id)
    return { ...saved, contentVersion: draftVersion(saved) }
  }
  app.put<{ Params: { id: string } }>('/api/drafts/:id', (request) => store.transaction(() => {
    const draft = must(store.find<Draft>('outreach_drafts', parse(id, request.params.id)))
    if (optedOut(get(draft.parent))) throw problem(409, 'Este prospecto está excluido de contacto.')
    const value = parse(message, request.body)
    store.log('Borrador editado', draft.id)
    return store.update('outreach_drafts', draft.id, { ...value, channel: draft.channel })
  }))
  app.post<{ Params: { id: string } }>('/api/drafts/:id/review', (request) => store.transaction(() => {
    const draft = must(store.find<Draft>('outreach_drafts', parse(id, request.params.id)))
    if (optedOut(get(draft.parent))) throw problem(409, 'Este prospecto está excluido de contacto.')
    const { reviewer, contentVersion } = parse(versionedReview, request.body)
    if (contentVersion !== draftVersion(draft)) throw problem(409, 'El mensaje cambió. Volvé a abrirlo para revisar el borrador actual.')
    store.log('Mensaje aprobado para uso manual', draft.id)
    return store.update('outreach_drafts', draft.id, { ...draftContent(draft), reviewer, reviewedAt: new Date().toISOString() })
  }))

  return { get, sourcesFor, notesFor, addDiscovery }
}
