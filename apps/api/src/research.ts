import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { applicationTypes, discoveryFile, id, normalize, optedOut, required, text, z } from '@reac/core'
import type { Prospect } from '@reac/core'
import type { FastifyInstance } from 'fastify'
import type { Store } from './store.ts'
import type { registerPortfolio } from './portfolio.ts'
import { AIProviderError, ManualImportProvider } from './ai-provider.ts'
import type { AIProvider, ProspectingFilters } from './ai-provider.ts'
import { attach, parse, problem, must } from './http.ts'
import { hostname, identityKeys } from './prospect-identity.ts'
import type { IdentityHistory } from './prospect-identity.ts'
import { batchCompletedAction, describeBatch } from './research-activity.ts'

const filterValues = z.strictObject({
  quantity: z.number().int().min(1).max(100).optional(), region: text(120).optional(),
  city: text(120).optional(), industry: text(120).optional(), applicationType: z.enum(['', ...applicationTypes]).optional(),
  regions: z.array(required(120)).min(1).max(12).optional(), cities: z.array(required(120)).min(1).max(12).optional(),
  industries: z.array(required(120)).min(1).max(12).optional(), applicationTypes: z.array(z.enum(applicationTypes)).min(1).max(applicationTypes.length).optional(),
})
const configuration = z.strictObject({
  prompt: text(1000).default(''),
  filters: filterValues.default({}),
  useCodex: z.boolean().default(false),
  excludeExisting: z.boolean().default(true),
  excludeContacted: z.boolean().default(true),
  minimumConfidence: z.enum(['ALTA', 'MEDIA', 'BAJA']).default('BAJA'),
  mode: z.enum(['discover', 'update']).optional(), recentDays: z.number().int().min(1).max(3650).optional(),
  organizationId: id.optional(), campaignId: id.optional(),
})
const body = configuration.extend({ requestId: id, file: discoveryFile.optional(), verifiedSources: z.boolean().default(false) })
const savedSchema = z.strictObject({ name: required(120), configuration })
type Input = z.output<typeof body>
type Saved = z.output<typeof savedSchema>
type StartInput = { input: Input; catalogHash?: string }
const review = z.strictObject({ reviewer: required(120), confirm: z.literal(true) })
const reviewVersion = z.string().regex(/^[a-f0-9]{64}$/)
const decisions = review.extend({ decisions: z.array(z.strictObject({ id,
  action: z.enum(['approve', 'reject', 'exclude', 'link', 'edit', 'enrich']), organizationId: id.optional(),
  record: discoveryFile.shape.records.element.optional(), reason: text(500).optional(), contentVersion: reviewVersion.optional(),
})).min(1).max(25) })
const working = ['PENDIENTE', 'INVESTIGANDO', 'VERIFICANDO', 'IMPORTANDO']
type State = 'PENDIENTE' | 'INVESTIGANDO' | 'VERIFICANDO' | 'IMPORTANDO' | 'COMPLETADO' | 'PARCIAL' | 'FALLIDO' | 'CANCELADO'
export type ResearchCatalog = z.output<typeof discoveryFile>
type Record = ResearchCatalog['records'][number]
type Candidate = { record: Record; outcome: 'IMPORTADO' | 'DUPLICADO' | 'EXCLUIDO' | 'EN_REVISION' | 'FUERA_DE_CUPO' | 'RECHAZADO' | 'VINCULADO' | 'ACTUALIZAR' | 'ENRIQUECIMIENTO'; reason: string; organizationId?: string; reviewedAt?: string; reviewer?: string; decisionReason?: string; proposalId?: string; kind?: 'ambiguous' | 'incomplete'; sourceVerified?: boolean }
type Organization = Prospect & IdentityHistory & { archivedAt?: string }
type Job = {
  state: State; provider: string; requestHash: string; goal: number; filters?: ProspectingFilters & z.output<typeof filterValues>; reason?: string
  savedId?: string; campaignId?: string; mode?: 'discover' | 'update'; resumable?: boolean; attempts?: number
  found: number; verified: number; imported: number; duplicates: number; excluded: number; pending: number; skipped?: number; errors: number
}

const keyFor = (value: Pick<Prospect, 'name' | 'city'>) => JSON.stringify([normalize(value.name), normalize(value.city)])
const confidenceOrder = { BAJA: 0, MEDIA: 1, ALTA: 2 } as const
const firstParty = (record: Record) => {
  const site = hostname(record.website)
  const evidence = hostname(record.evidence.url)
  return Boolean(site && (site === evidence || evidence.endsWith('.' + site)))
}
// External quotations never go to the interpreter. Impactful instructions are held for human review.
const suspicious = (text: string) => /(?:ignore|ignora|ignorá|disregard)\s+(?:las\s+|all\s+|previous\s+|anteriores?\s+)*(?:instructions?|instrucciones)|(?:system prompt|mensaje de sistema)/iu.test(text)
const withinReviewWindow = (date: string, now: number) => {
  const age = now - Date.parse(date)
  return age >= 0 && age <= 180 * 86400_000
}

const unavailableFields = (record: Record) => [!record.email && 'Correo comercial', !record.phone && 'Teléfono comercial', !record.address && 'Domicilio público'].filter(Boolean)
const lacksContact = (record: Record) => !record.email && !record.phone && !record.contact
const safeEvidence = (record: Record, now: number) => firstParty(record) && withinReviewWindow(record.evidence.consultedAt, now) &&
  !suspicious([record.evidence.statement, record.corroboration?.statement, record.opportunity].filter(Boolean).join(' '))
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const candidateVersion = (candidate: Candidate & { id: string; updatedAt: string }) => fingerprint([candidate.id, candidate.updatedAt, candidate.record, candidate.outcome, candidate.kind, candidate.organizationId])
type ResearchLinks = {
  requireCampaign?: (campaignId: string) => void
  addMember?: (campaignId: string, organizationId: string, jobId: string) => void
  proposeEnrichment?: (organizationId: string, record: Record, research: { jobId: string; candidateId: string }) => { id: string }
}

export function registerResearch(app: FastifyInstance, store: Store, portfolio: ReturnType<typeof registerPortfolio>, codex?: AIProvider, catalog?: ResearchCatalog, links: ResearchLinks = {}) {
  const manual = new ManualImportProvider()
  let active: { id: string; controller: AbortController; work: Promise<void> } | undefined
  let lastCodex = -Infinity
  const get = (value: unknown) => must(store.find<Job>('research_jobs', parse(id, value)))
  const rows = (job: string) => store.list<Candidate>('research_candidates', job)
  const update = (job: string, change: Partial<Job>) => store.update<Job>('research_jobs', job, { ...get(job), ...change })
  const catalogHash = catalog && fingerprint(catalog)
  for (const job of store.list<Job>('research_jobs')) {
    if (working.includes(job.state)) update(job.id, { state: 'PARCIAL', resumable: true, reason: 'Trabajo interrumpido antes de guardar resultados.' })
  }
  app.addHook('preClose', async () => {
    active?.controller.abort()
    await active?.work
  })

  function commercialIndex(currentJob?: string) {
    const organizations = store.list<Organization>('organizations')
    const byName = new Map(organizations.map((entry) => [keyFor(entry), entry]))
    const matched = new Map<string, typeof organizations>()
    for (const entry of organizations) {
      for (const key of new Set([...identityKeys(entry), ...(entry.knownIdentities ?? [])])) {
        const values = matched.get(key) ?? []
        values.push(entry)
        matched.set(key, values)
      }
    }
    const contacted = new Set(store.list<{ stage: string }>('pipeline_events').filter((row) => row.stage === 'Contactado').map((row) => row.parent))
    const engagement = new Map(store.list('engagements').map((item) => [item.parent, item.id]))
    const seen = new Map<string, Candidate[]>()
    for (const candidate of store.list<Candidate>('research_candidates')) {
      if (candidate.parent === currentJob || candidate.outcome === 'FUERA_DE_CUPO') continue
      for (const key of identityKeys(candidate.record)) {
        const values = seen.get(key) ?? []
        values.push(candidate)
        seen.set(key, values)
      }
    }
    return { byName, matched, contacted, engagement, seen }
  }

  function matches(record: Record, index: ReturnType<typeof commercialIndex>) {
    return [...new Map(identityKeys(record).flatMap((key) => index.matched.get(key) ?? []).map((row) => [row.id, row])).values()]
  }

  function collision(record: Record, index: ReturnType<typeof commercialIndex>, excludeContacted = true, useHistory = true): Omit<Candidate, 'record'> | undefined {
    const exact = index.byName.get(keyFor(record))
    const all = matches(record, index)
    const history = identityKeys(record).flatMap((key) => index.seen.get(key) ?? [])
    const excludedByReview = history.some((old) => old.outcome === 'EXCLUIDO' && Boolean(old.reviewedAt))
    if (all.some(optedOut) || excludedByReview) return { outcome: 'EXCLUIDO', reason: 'Identidad vinculada a una exclusión vigente.' }
    if (all.some((item) => item.archivedAt || item.status === 'Perdido') || history.some((old) => old.outcome === 'RECHAZADO' && keyFor(old.record) === keyFor(record))) {
      return { outcome: 'EXCLUIDO', reason: 'Identidad descartada o archivada en el historial.' }
    }
    if (excludeContacted && all.some((item) => index.contacted.has(index.engagement.get(item.id) ?? ''))) return { outcome: 'EXCLUIDO', reason: 'Existe un hito de contacto registrado.' }
    if (exact) return { outcome: 'DUPLICADO', organizationId: exact.id, reason: 'Ya existe una ficha con el mismo nombre y ubicación.' }
    if (all.length) return { outcome: 'EN_REVISION', kind: 'ambiguous', reason: 'Identidad compartida. Revisá la relación con la ficha existente.' }
    if (useHistory && history.some((old) => keyFor(old.record) === keyFor(record))) return { outcome: 'DUPLICADO', reason: 'La empresa ya está en el historial de investigación.' }
    if (useHistory && history.length) return { outcome: 'EN_REVISION', kind: 'ambiguous', reason: 'La identidad coincide parcialmente con una investigación anterior.' }
    return undefined
  }

  function selectedRecords(source: ResearchCatalog, filters: NonNullable<Job['filters']>, confidence: Input['minimumConfidence']) {
    const candidates = new Map<string, Record>()
    for (const record of source.records) {
      const level = confidenceOrder[record.confidence]
      if (level < confidenceOrder[confidence]) continue
      const accepts = (actual: string, multiple: string[] | undefined, single: string) => {
        const expected = multiple ?? (single ? [single] : [])
        return !expected.length || expected.some((filter) => normalize(actual).includes(normalize(filter)))
      }
      if (!accepts(record.region, filters.regions, filters.region) || !accepts(record.city, filters.cities, filters.city) ||
        !accepts(record.industry, filters.industries, filters.industry) || !accepts(record.applicationType, filters.applicationTypes, filters.applicationType)) continue
      const key = keyFor(record)
      const previous = candidates.get(key)
      if (!previous || level > confidenceOrder[previous.confidence] ||
        (level === confidenceOrder[previous.confidence] && record.evidence.consultedAt > previous.evidence.consultedAt)) candidates.set(key, record)
    }
    return [...candidates.values()].sort((a, b) => confidenceOrder[b.confidence] - confidenceOrder[a.confidence] || b.evidence.consultedAt.localeCompare(a.evidence.consultedAt))
  }

  function updateCandidate(record: Record, input: Input, index: ReturnType<typeof commercialIndex>, now: number): Omit<Candidate, 'record'> {
    const candidates = matches(record, index)
    if (identityKeys(record).some((key) => index.seen.get(key)?.some((old) => old.outcome === 'EXCLUIDO' && Boolean(old.reviewedAt)))) {
      return { outcome: 'EXCLUIDO', reason: 'Identidad vinculada a una exclusión vigente.' }
    }
    if (input.organizationId && !candidates.some((org) => org.id === input.organizationId)) return { outcome: 'FUERA_DE_CUPO', reason: 'La evidencia corresponde a otra ficha.' }
    const exact = candidates.find((org) => keyFor(org) === keyFor(record))
    const target = input.organizationId ? candidates.find((org) => org.id === input.organizationId) : exact ?? (candidates.length === 1 ? candidates[0] : undefined)
    if (!target) return { outcome: 'EN_REVISION', kind: 'ambiguous', reason: 'Identificá la ficha existente antes de proponer cambios.' }
    if (target.archivedAt || optedOut(target) || target.status === 'Perdido') return { outcome: 'EXCLUIDO', reason: 'La ficha está archivada, descartada o excluida.' }
    if (input.recentDays && Math.max(Date.parse(target.createdAt), Date.parse(target.verifiedAt) || 0) < now - input.recentDays * 86400_000) return { outcome: 'FUERA_DE_CUPO', reason: 'La ficha está fuera del período solicitado.' }
    return { outcome: 'ACTUALIZAR', organizationId: target.id, reason: 'Compará la fuente con la ficha existente antes de aplicar cambios.' }
  }

  function candidateCategory(candidate: Candidate) {
    if (candidate.outcome === 'IMPORTADO' || candidate.outcome === 'VINCULADO' || candidate.outcome === 'ENRIQUECIMIENTO') return 'verified'
    if (candidate.outcome === 'EXCLUIDO' || candidate.outcome === 'RECHAZADO') return 'excluded'
    if (candidate.outcome === 'DUPLICADO' || candidate.kind === 'ambiguous' || (candidate.outcome === 'EN_REVISION' && candidate.reason.startsWith('Identidad compartida'))) return 'duplicate'
    if (candidate.kind === 'incomplete') return 'incomplete'
    return 'pending'
  }

  app.get('/api/research/capabilities', () => ({ codex: Boolean(codex), catalogSize: catalog?.records.length ?? 0 }))
  app.get('/api/research/jobs', () => store.list<Job>('research_jobs').slice(0, 100).map(summary))
  function summary({ requestHash, ...job }: ReturnType<typeof get>) {
    void requestHash
    return job
  }
  app.get<{ Params: { id: string } }>('/api/research/jobs/:id', (request) => {
    const job = get(request.params.id)
    return { job: summary(job), results: rows(job.id).map((candidate) => ({ ...candidate, contentVersion: candidateVersion(candidate) })) }
  })
  app.get<{ Params: { id: string } }>('/api/research/jobs/:id/export', (request, reply) => {
    const job = get(request.params.id)
    const { requestHash: _requestHash, ...summary } = job
    void _requestHash
    return attach(reply, 'lote-prospeccion.json', 'application/json; charset=utf-8', JSON.stringify({ version: 1, job: summary, results: rows(job.id).map((entry) => ({ outcome: entry.outcome, reason: entry.reason, organizationId: entry.organizationId, name: entry.record.name, city: entry.record.city, source: entry.record.evidence.url, confidence: entry.record.confidence })) }))
  })
  app.get<{ Params: { id: string } }>('/api/research/jobs/:id/summary', (request) => summary(get(request.params.id)))

  function launch(input: Input, savedId?: string) {
    const requestHash = fingerprint(savedId ? { input, savedId } : input)
    const found = store.find<Job>('research_jobs', input.requestId, 'unique_key')
    if (found) {
      const { requestId, prompt, filters, file, useCodex, verifiedSources, excludeExisting, excludeContacted, minimumConfidence,
        mode, recentDays, organizationId, campaignId } = input
      const legacy = !mode && !recentDays && !organizationId && !campaignId && !savedId && !store.list('research_inputs', found.id).length &&
        fingerprint({ requestId, prompt, filters, file, useCodex, verifiedSources, excludeExisting, excludeContacted, minimumConfidence }) === found.requestHash
      if (found.requestHash !== requestHash && !legacy) throw problem(409, 'Ese identificador corresponde a otra solicitud.')
      return { status: 200, job: summary(found) }
    }
    if (active) throw problem(409, 'Ya hay una búsqueda en ejecución.')
    if (input.organizationId && input.mode !== 'update') throw problem(400, 'La ficha se selecciona al actualizar prospectos.')
    if (input.campaignId) {
      if (!links.requireCampaign) throw problem(503, 'Campañas comerciales no está disponible.')
      links.requireCampaign(input.campaignId)
    }
    const initial: Job = {
      state: 'PENDIENTE', provider: input.useCodex ? 'codex-cli' : 'manual', requestHash,
      goal: input.filters.quantity ?? 20, found: 0, verified: 0, imported: 0, duplicates: 0, excluded: 0, pending: 0, errors: 0,
      mode: input.mode ?? 'discover', savedId, campaignId: input.campaignId, attempts: 1,
    }
    const created = store.transaction(() => {
      const job = store.insert('research_jobs', initial, null, input.requestId)
      store.insert<StartInput>('research_inputs', { input, catalogHash: input.file ? undefined : catalogHash }, job.id, job.id)
      return job
    })
    execute(created.id, input)
    return { status: 202, job: summary(created) }
  }

  function execute(job: string, input: Input) {
    const controller = new AbortController()
    const { signal } = controller
    const work = (async () => {
      try {
        await delay(0, undefined, { signal })
        const source = input.file ?? catalog
        if (!source) {
          update(job, { state: 'PARCIAL', reason: 'La instancia no tiene un catálogo local y el lote no adjuntó fuentes.' })
          return
        }
        update(job, { state: 'INVESTIGANDO' })
        if (input.useCodex && !codex) throw new AIProviderError('unavailable')
        if (input.useCodex && performance.now() - lastCodex < 15_000) throw new AIProviderError('usage_limit')
        if (input.useCodex) lastCodex = performance.now()
        const provider = input.useCodex ? codex! : manual
        const interpretation = await provider.interpret(input.prompt || 'Buscá 20 empresas', signal)
        signal.throwIfAborted()
        const filters = { ...interpretation, ...input.filters }
        const attested = input.file ? input.verifiedSources : Boolean(catalog)
        const eligible = selectedRecords(source, filters, input.minimumConfidence)
        update(job, { state: 'VERIFICANDO', goal: filters.quantity, filters, found: eligible.length })
        await delay(0, undefined, { signal })
        update(job, { state: 'IMPORTANDO' })
        await delay(0, undefined, { signal })
        store.transaction(() => {
          let index = commercialIndex(job)
          if (input.campaignId) links.requireCampaign?.(input.campaignId)
          const counts = { verified: 0, imported: 0, duplicates: 0, excluded: 0, pending: 0, skipped: 0 }
          const now = Date.now()
          for (const record of eligible) {
            const verified = attested && record.confidence === 'ALTA' && safeEvidence(record, now)
            if (verified) counts.verified++
            let conflict = input.mode === 'update' ? updateCandidate(record, input, index, now) : collision(record, index, input.excludeContacted)
            if (conflict?.outcome === 'ACTUALIZAR' && counts.pending >= filters.quantity) conflict = { outcome: 'FUERA_DE_CUPO', reason: 'El lote alcanzó el cupo de actualizaciones.' }
            let candidate: Candidate
            if (conflict) {
              candidate = { record, ...conflict, organizationId: conflict.outcome === 'DUPLICADO' && input.excludeExisting ? undefined : conflict.organizationId }
              if (candidate.outcome === 'DUPLICADO') counts.duplicates++
              else if (candidate.outcome === 'EXCLUIDO') counts.excluded++
              else if (candidate.outcome === 'FUERA_DE_CUPO') counts.skipped++
              else counts.pending++
            } else if (counts.imported >= filters.quantity) {
              candidate = { record, outcome: 'FUERA_DE_CUPO', reason: 'El lote alcanzó la cantidad solicitada.' }
              counts.skipped++
            } else if (!verified || lacksContact(record)) {
              const incomplete = lacksContact(record)
              candidate = { record, outcome: 'EN_REVISION', kind: incomplete ? 'incomplete' : undefined,
                reason: incomplete ? 'Falta documentar un canal comercial público.' : 'Requiere confirmación de la procedencia y del dato publicado.' }
              counts.pending++
            } else {
              const organizationId = portfolio.addDiscovery(record, input.file ? 'Fuentes verificadas por el operador' : 'Catálogo local cotejado', job)
              if (input.campaignId) links.addMember?.(input.campaignId, organizationId, job)
              candidate = { record, outcome: 'IMPORTADO', reason: 'Fuente pública atribuida y confirmada en el lote.', organizationId }
              counts.imported++
              index = commercialIndex(job)
            }
            store.insert('research_candidates', { ...candidate, sourceVerified: verified }, job)
          }
          const completed = input.mode === 'update' ? eligible.length > 0 : counts.imported >= filters.quantity
          const state = completed ? 'COMPLETADO' : 'PARCIAL'
          const reason = input.mode === 'update' && completed ? 'Comparaciones preparadas para revisión.' :
            state === 'PARCIAL' ? 'La evidencia o la cantidad disponible quedó por debajo del objetivo.' : undefined
          const completedJob = update(job, { ...counts, state, reason, resumable: false })
          store.log(batchCompletedAction, job, describeBatch(completedJob))
        })
      } catch (error) {
        const state = signal.aborted ? 'CANCELADO' : 'FALLIDO'
        const reason = signal.aborted ? 'Cancelado antes de guardar resultados.' :
          error instanceof AIProviderError ? 'Proveedor de IA: ' + error.code : 'La investigación se interrumpió.'
        update(job, { state, reason, resumable: true, errors: signal.aborted ? 0 : 1 })
      } finally {
        active = undefined
      }
    })()
    active = { id: job, controller, work }
  }

  app.post('/api/research/jobs', (request, reply) => {
    const result = launch(parse(body, request.body))
    return reply.code(result.status).send(result.job)
  })

  app.post<{ Params: { id: string } }>('/api/research/jobs/:id/resume', (request, reply) => {
    parse(z.strictObject({}), request.body)
    const job = get(request.params.id)
    if (active?.id === job.id) return reply.code(202).send(summary(job))
    if (active) throw problem(409, 'Ya hay una búsqueda en ejecución.')
    const requestCopy = store.find<StartInput>('research_inputs', job.id, 'unique_key')
    if (!job.resumable || !requestCopy || rows(job.id).length) throw problem(409, 'El lote ya guardó resultados o no tiene una solicitud recuperable.')
    if (!requestCopy.input.file && requestCopy.catalogHash !== catalogHash) throw problem(409, 'El catálogo cambió. Iniciá una nueva ejecución.')
    if (requestCopy.input.campaignId) links.requireCampaign?.(requestCopy.input.campaignId)
    const restarted = update(job.id, { state: 'PENDIENTE', reason: undefined, errors: 0, resumable: false, attempts: (job.attempts ?? 1) + 1 })
    execute(job.id, requestCopy.input)
    return reply.code(202).send(summary(restarted))
  })
  app.post<{ Params: { id: string } }>('/api/research/jobs/:id/cancel', async (request) => {
    parse(z.strictObject({}), request.body)
    const job = get(request.params.id)
    const running = active
    if (running?.id === job.id) {
      running.controller.abort()
      await running.work
    }
    return summary(get(job.id))
  })
  const saved = (value: unknown) => must(store.find<Saved>('saved_searches', parse(id, value)))
  const savedKey = (name: string) => normalize(name)
  function saveSearch(value: Saved, existingId?: string) {
    const key = savedKey(value.name)
    const collision = store.find<Saved>('saved_searches', key, 'unique_key')
    if (collision && collision.id !== existingId) throw problem(409, 'Ya existe una búsqueda con ese nombre.')
    return existingId ? store.update('saved_searches', existingId, value, key) : store.insert('saved_searches', value, null, key)
  }
  app.get('/api/research/saved', () => store.list<Saved>('saved_searches'))
  app.post('/api/research/saved', (request, reply) => reply.code(201).send(saveSearch(parse(savedSchema, request.body))))
  app.put<{ Params: { id: string } }>('/api/research/saved/:id', (request) => saveSearch(parse(savedSchema, request.body), saved(request.params.id).id))
  app.post<{ Params: { id: string } }>('/api/research/saved/:id/duplicate', (request, reply) => {
    parse(z.strictObject({}), request.body)
    const { configuration, name } = saved(request.params.id)
    let number = 1
    let label: string
    do {
      label = name.slice(0, 100) + ' · Copia ' + number++
    } while (store.find('saved_searches', savedKey(label), 'unique_key'))
    return reply.code(201).send(saveSearch({ configuration, name: label }))
  })
  app.get<{ Params: { id: string } }>('/api/research/saved/:id/export', (request, reply) => {
    const { name, configuration } = saved(request.params.id)
    return attach(reply, 'busqueda-guardada-v1.json', 'application/json; charset=utf-8', JSON.stringify({ version: 1, name, configuration }))
  })
  app.get<{ Params: { id: string } }>('/api/research/saved/:id/jobs', (request) => {
    const id = saved(request.params.id).id
    return store.list<Job>('research_jobs').filter((job) => job.savedId === id).slice(0, 100).map(summary)
  })
  app.post<{ Params: { id: string } }>('/api/research/saved/:id/run', (request, reply) => {
    const options = parse(z.strictObject({ requestId: id, file: discoveryFile.optional(), verifiedSources: z.boolean().default(false) }), request.body)
    const entry = saved(request.params.id)
    const previous = store.find<Job>('research_jobs', options.requestId, 'unique_key')
    if (previous?.savedId === entry.id) {
      const original = store.find<StartInput>('research_inputs', previous.id, 'unique_key')?.input
      if (!original || original.verifiedSources !== options.verifiedSources || fingerprint(original.file ?? null) !== fingerprint(options.file ?? null)) throw problem(409, 'El identificador corresponde a otro archivo o confirmación.')
      return reply.send(summary(previous))
    }
    const result = launch(parse(body, { ...entry.configuration, ...options }), entry.id)
    return reply.code(result.status).send(result.job)
  })

  app.post('/api/research/simulate', async (request) => {
    const input = parse(body.omit({ requestId: true }), request.body)
    const filters = { ...await manual.interpret(input.prompt || 'Buscá 20 empresas'), ...input.filters }
    const source = input.file ?? catalog
    const records = source ? selectedRecords(source, filters, input.minimumConfidence) : []
    const index = commercialIndex()
    const counts = { duplicates: 0, exclusions: 0, pending: 0, available: 0 }
    const now = Date.now()
    for (const record of records) {
      const match = input.mode === 'update' ? updateCandidate(record, { ...input, requestId: '' }, index, now) : collision(record, index, input.excludeContacted)
      if (match?.outcome === 'DUPLICADO') counts.duplicates++
      else if (match?.outcome === 'EXCLUIDO') counts.exclusions++
      else if (match?.outcome === 'FUERA_DE_CUPO') continue
      else if (match || lacksContact(record) || !safeEvidence(record, now) || record.confidence !== 'ALTA' || (input.file && !input.verifiedSources)) counts.pending++
      else counts.available++
    }
    return { ...counts, provider: input.useCodex ? 'Codex CLI (para la ejecución)' : 'Filtros locales', known: records.length, quantity: filters.quantity,
      estimated: false, filters, cost: 'Simulación local, sin turno ni cargo de proveedor.', quota: input.useCodex ? 'La cuota disponible de ChatGPT no está expuesta.' : 'Sin cuota externa.',
      limits: ['Solo filas conocidas del catálogo o archivo.', '100 filas por lote y una ejecución simultánea.', 'La interpretación final de Codex puede cambiar los filtros.'] }
  })

  app.get('/api/research/review', (request) => {
    const { category, page, candidateId } = parse(z.strictObject({ candidateId: id.optional(), category: z.enum(['verified', 'pending', 'duplicate', 'incomplete', 'excluded', 'error', 'all']).default('all'),
      page: z.coerce.number().int().min(1).max(10000).default(1) }), request.query)
    const index = commercialIndex()
    const records = candidateId ? [must(store.find<Candidate>('research_candidates', candidateId))] : category === 'error' ? [] : store.list<Candidate>('research_candidates')
    const candidates = records.filter((value) => category === 'all' || category === candidateCategory(value))
    const errors = !candidateId && (category === 'all' || category === 'error') ? store.list<Job>('research_jobs').filter((job) => job.state === 'FALLIDO').slice(0, 100).map(summary) : []
    return { candidates: candidates.slice((page - 1) * 100, page * 100).map((value) => ({ ...value, jobId: value.parent, category: candidateCategory(value), missing: unavailableFields(value.record), contentVersion: candidateVersion(value),
      matches: matches(value.record, index).map(({ id, name, city }) => ({ id, name, city })) })), total: candidates.length, page, errors }
  })

  function applyReview(candidate: NonNullable<ReturnType<typeof store.find<Candidate>>>, job: ReturnType<typeof get>, decision: z.output<typeof decisions>['decisions'][number], reviewer: string) {
    if (working.includes(job.state)) throw problem(409, 'Esperá que termine el lote.')
    if (!['EN_REVISION', 'ACTUALIZAR'].includes(candidate.outcome)) throw problem(409, 'La ficha no está pendiente dentro de este lote.')
    if (decision.contentVersion !== candidateVersion(candidate)) throw problem(409, 'Volvé a cargar la candidatura, su contenido cambió.')
    const reviewedAt = new Date().toISOString()
    const index = commercialIndex()
    let change: Partial<Candidate>
    if (decision.action === 'edit') {
      if (!decision.record) throw problem(400, 'Adjuntá la ficha corregida.')
      const kind = lacksContact(decision.record) ? 'incomplete' : collision(decision.record, index, false, false)?.kind
      change = { record: decision.record, kind, reason: 'Ficha corregida para revisión.' }
    } else if (decision.action === 'reject' || decision.action === 'exclude') {
      if (!decision.reason) throw problem(400, 'Registrá el motivo de la decisión.')
      change = { outcome: decision.action === 'reject' ? 'RECHAZADO' : 'EXCLUIDO', reason: decision.action === 'reject' ? 'Candidatura descartada por el operador.' : 'Exclusión decidida por el operador.' }
    } else {
      const record = candidate.record
      if (!safeEvidence(record, Date.now())) throw problem(409, 'Corregí la evidencia y verificá una fuente corporativa reciente antes de confirmar.')
      if (decision.action === 'approve') {
        if (candidate.outcome === 'ACTUALIZAR') throw problem(409, 'Prepará una propuesta de enriquecimiento para una ficha existente.')
        if (lacksContact(record) || collision(record, index, true, false)) throw problem(409, 'La ficha conserva una coincidencia, exclusión o falta de información.')
        if (candidate.kind === 'ambiguous') throw problem(409, 'Revisá y corregí primero la identidad ambigua.')
        if (job.campaignId) links.requireCampaign?.(job.campaignId)
        const organizationId = portfolio.addDiscovery(record, reviewer, job.id)
        if (job.campaignId) links.addMember?.(job.campaignId, organizationId, job.id)
        change = { outcome: 'IMPORTADO', reason: 'Fuente confirmada en revisión humana.', organizationId }
      } else {
        const target = matches(record, index).find((org) => org.id === (decision.organizationId ?? candidate.organizationId))
        if (!target || optedOut(target) || target.archivedAt || target.status === 'Perdido') throw problem(409, 'Elegí una coincidencia activa y habilitada.')
        if (decision.action === 'enrich') {
          if (!links.proposeEnrichment) throw problem(503, 'Enriquecimiento no está disponible.')
          const proposal = links.proposeEnrichment(target.id, record, { jobId: job.id, candidateId: candidate.id })
          change = { outcome: 'ENRIQUECIMIENTO', organizationId: target.id, proposalId: proposal.id, reason: 'Propuesta preparada para comparar y aprobar campos.' }
        } else {
          if (!store.list<Record['evidence']>('public_sources', target.id).some((source) => source.url === record.evidence.url &&
            source.consultedAt === record.evidence.consultedAt && source.statement === record.evidence.statement)) store.insert('public_sources', record.evidence, target.id)
          change = { outcome: 'VINCULADO', organizationId: target.id, reason: 'Coincidencia vinculada a la ficha seleccionada. Sus datos actuales se conservaron.' }
        }
      }
    }
    const verified = decision.action === 'edit' ? false : decision.action === 'approve' || Boolean(candidate.sourceVerified)
    const saved = store.update<Candidate>('research_candidates', candidate.id, { ...candidate, ...change, reviewedAt, reviewer, decisionReason: decision.reason, sourceVerified: verified })
    const verifiedCount = Math.min(job.found, Math.max(0, job.verified + Number(verified) - Number(Boolean(candidate.sourceVerified))))
    if (decision.action !== 'edit') {
      const imported = job.imported + Number(saved.outcome === 'IMPORTADO')
      update(job.id, { imported, verified: verifiedCount, pending: Math.max(0, job.pending - 1),
        excluded: job.excluded + Number(saved.outcome === 'EXCLUIDO'), state: imported >= job.goal ? 'COMPLETADO' : job.state })
    } else update(job.id, { verified: verifiedCount })
    store.log('Decisión de revisión comercial registrada', candidate.id)
    return saved
  }

  app.post('/api/research/review', (request) => store.transaction(() => {
    const input = parse(decisions, request.body)
    if (input.decisions.length > 1 && input.decisions.some(({ action }) => !['reject', 'exclude'].includes(action))) throw problem(409, 'Revisá individualmente los cambios de ficha.')
    return { results: input.decisions.map((decision) => {
      const candidate = must(store.find<Candidate>('research_candidates', decision.id))
      return applyReview(candidate, get(candidate.parent), decision, input.reviewer)
    }) }
  }))
  app.post<{ Params: { id: string; candidateId: string } }>('/api/research/jobs/:id/candidates/:candidateId/review', (request) => store.transaction(() => {
    const job = get(request.params.id)
    const candidate = must(store.find<Candidate>('research_candidates', parse(id, request.params.candidateId)))
    const { reviewer, contentVersion } = parse(review.extend({ contentVersion: reviewVersion.optional() }), request.body)
    if (candidate.parent !== job.id) throw problem(409, 'La ficha no pertenece al lote.')
    return applyReview(candidate, job, { id: candidate.id, action: 'approve', contentVersion: contentVersion ?? (job.mode ? undefined : candidateVersion(candidate)) }, reviewer)
  }))
}
