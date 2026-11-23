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

const filterValues = z.strictObject({
  quantity: z.number().int().min(1).max(100).optional(), region: text(120).optional(),
  city: text(120).optional(), industry: text(120).optional(), applicationType: z.enum(['', ...applicationTypes]).optional(),
})
const body = z.strictObject({
  requestId: id,
  prompt: text(1000).default(''),
  filters: filterValues.default({}),
  file: discoveryFile.optional(),
  useCodex: z.boolean().default(false),
  verifiedSources: z.boolean().default(false),
  excludeExisting: z.boolean().default(true),
  excludeContacted: z.boolean().default(true),
  minimumConfidence: z.enum(['ALTA', 'MEDIA', 'BAJA']).default('MEDIA'),
})
const review = z.strictObject({ reviewer: required(120), confirm: z.literal(true) })
const working = ['PENDIENTE', 'INVESTIGANDO', 'VERIFICANDO', 'IMPORTANDO']
type State = 'PENDIENTE' | 'INVESTIGANDO' | 'VERIFICANDO' | 'IMPORTANDO' | 'COMPLETADO' | 'PARCIAL' | 'FALLIDO' | 'CANCELADO'
type Record = z.output<typeof discoveryFile>['records'][number]
type Candidate = { record: Record; outcome: 'IMPORTADO' | 'DUPLICADO' | 'EXCLUIDO' | 'EN_REVISION'; reason: string; organizationId?: string }
type Job = {
  state: State; provider: string; requestHash: string; goal: number; filters?: ProspectingFilters; reason?: string
  found: number; verified: number; imported: number; duplicates: number; excluded: number; pending: number; errors: number
}

const hostname = (value: string) => value ? new URL(value).hostname.replace(/^www\./, '').toLowerCase() : ''
const identities = (value: Pick<Prospect, 'website' | 'email' | 'phone' | 'registrationId'>) => {
  const digits = value.phone.replace(/\D/g, '')
  return [hostname(value.website), value.email.toLowerCase(), digits.length >= 8 ? digits.slice(-10) : '', normalize(value.registrationId ?? '')]
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

export function registerResearch(app: FastifyInstance, store: Store, portfolio: ReturnType<typeof registerPortfolio>, codex?: AIProvider) {
  const manual = new ManualImportProvider()
  let active: { id: string; controller: AbortController; work: Promise<void> } | undefined
  let lastCodex = -Infinity
  const get = (value: unknown) => must(store.find<Job>('research_jobs', parse(id, value)))
  const rows = (job: string) => store.list<Candidate>('research_candidates', job)
  const update = (job: string, change: Partial<Job>) => store.update<Job>('research_jobs', job, { ...get(job), ...change })
  for (const job of store.list<Job>('research_jobs')) {
    if (working.includes(job.state)) update(job.id, { state: 'PARCIAL', reason: 'Trabajo interrumpido antes de guardar resultados.' })
  }
  app.addHook('preClose', async () => {
    active?.controller.abort()
    await active?.work
  })

  function commercialIndex() {
    const organizations = store.list<Prospect>('organizations')
    const byName = new Map(organizations.map((entry) => [keyFor(entry), entry]))
    const matched = new Map<string, typeof organizations>()
    for (const entry of organizations) {
      identities(entry).forEach((value, index) => {
        if (!value) return
        const key = index + ':' + value
        const values = matched.get(key) ?? []
        values.push(entry)
        matched.set(key, values)
      })
    }
    const contacted = new Set(store.list<{ stage: string }>('pipeline_events')
      .filter((row) => ['Contactado', 'Respondió', 'Auditoría propuesta', 'Autorizado', 'Auditando', 'Informe entregado', 'Remediación', 'Cerrado'].includes(row.stage))
      .map((row) => row.parent))
    const engagement = new Map(store.list('engagements').map((item) => [item.parent, item.id]))
    return { byName, matched, contacted, engagement }
  }

  function collision(record: Record, index: ReturnType<typeof commercialIndex>, excludeContacted = true) {
    const exact = index.byName.get(keyFor(record))
    const matches = identities(record).flatMap((value, position) => value ? index.matched.get(position + ':' + value) ?? [] : [])
    const all = exact ? [...matches, exact] : matches
    if (all.some(optedOut)) return { outcome: 'EXCLUIDO' as const, reason: 'Identidad vinculada a una ficha excluida.' }
    if (excludeContacted && all.some((item) => ['Contactado', 'Respondió', 'Reunión', 'Presupuesto', 'Ganado'].includes(item.status) ||
      index.contacted.has(index.engagement.get(item.id) ?? ''))) return { outcome: 'EXCLUIDO' as const, reason: 'Existe un hito de contacto registrado.' }
    if (exact) return { outcome: 'DUPLICADO' as const, organizationId: exact.id, reason: 'Ya existe una ficha con el mismo nombre y ubicación.' }
    if (matches.length) return { outcome: 'EN_REVISION' as const, reason: 'Identidad compartida. Revisá la posible relación antes de crear otra ficha.' }
    return undefined
  }

  app.get('/api/research/capabilities', () => ({ codex: Boolean(codex), sources: ['Catálogo local', 'Resultados públicos de Orca'] }))
  app.get('/api/research/jobs', () => store.list<Job>('research_jobs').slice(0, 100))
  app.get<{ Params: { id: string } }>('/api/research/jobs/:id', (request) => {
    const job = get(request.params.id)
    return { job, results: rows(job.id) }
  })
  app.get<{ Params: { id: string } }>('/api/research/jobs/:id/export', (request, reply) => {
    const job = get(request.params.id)
    const { requestHash: _requestHash, ...summary } = job
    void _requestHash
    return attach(reply, 'lote-prospeccion.json', 'application/json; charset=utf-8', JSON.stringify({ version: 1, job: summary, results: rows(job.id).map((entry) => ({ outcome: entry.outcome, reason: entry.reason, organizationId: entry.organizationId, name: entry.record.name, city: entry.record.city, source: entry.record.evidence.url, confidence: entry.record.confidence })) }))
  })
  app.get<{ Params: { id: string } }>('/api/research/jobs/:id/summary', (request) => get(request.params.id))
  app.post('/api/research/jobs', (request, reply) => {
    const input = parse(body, request.body)
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const found = store.find<Job>('research_jobs', input.requestId, 'unique_key')
    if (found) {
      if (found.requestHash !== requestHash) throw problem(409, 'Ese identificador corresponde a otra solicitud.')
      return reply.code(200).send(found)
    }
    if (active) throw problem(409, 'Ya hay una búsqueda en ejecución.')
    const initial: Job = {
      state: 'PENDIENTE', provider: input.useCodex ? 'codex-cli' : 'manual', requestHash,
      goal: input.filters.quantity ?? 20, found: 0, verified: 0, imported: 0, duplicates: 0, excluded: 0, pending: 0, errors: 0,
    }
    const created = store.insert('research_jobs', initial, null, input.requestId)
    const controller = new AbortController()
    const { signal } = controller
    const work = (async () => {
      const job = created.id
      try {
        await delay(0, undefined, { signal })
        update(job, { state: 'INVESTIGANDO' })
        if (input.useCodex && !codex) throw new AIProviderError('unavailable')
        if (input.useCodex && performance.now() - lastCodex < 15_000) throw new AIProviderError('usage_limit')
        if (input.useCodex) lastCodex = performance.now()
        const provider = input.useCodex ? codex! : manual
        const interpretation = await provider.interpret(input.prompt || 'Buscá 20 empresas', signal)
        signal.throwIfAborted()
        const filters = { ...interpretation, ...input.filters }
        const catalog = input.file?.records ?? store.list<Candidate>('research_candidates')
          .filter((entry) => entry.outcome === 'IMPORTADO' || entry.outcome === 'EN_REVISION').map((entry) => entry.record)
        const candidates = new Map<string, Record>()
        for (const record of catalog) {
          if (![[filters.region, record.region], [filters.city, record.city], [filters.industry, record.industry],
            [filters.applicationType, record.applicationType]].every(([filter, actual]) => !filter || normalize(actual).includes(normalize(filter)))) continue
          const previous = candidates.get(keyFor(record))
          if (!previous || (confidenceOrder[record.confidence] >= confidenceOrder[previous.confidence] && record.evidence.consultedAt > previous.evidence.consultedAt)) {
            candidates.set(keyFor(record), record)
          }
        }
        const eligible = [...candidates.values()].slice(0, 100)
        update(job, { state: 'VERIFICANDO', goal: filters.quantity, filters, found: eligible.length })
        await delay(0, undefined, { signal })
        update(job, { state: 'IMPORTANDO' })
        await delay(0, undefined, { signal })
        store.transaction(() => {
          let index = commercialIndex()
          const counts = { verified: 0, imported: 0, duplicates: 0, excluded: 0, pending: 0 }
          for (const record of eligible) {
            if (counts.imported >= filters.quantity) break
            const verified = Boolean(input.file && input.verifiedSources && record.confidence === 'ALTA' &&
              firstParty(record) && !suspicious(record.evidence.statement))
            if (verified) counts.verified++
            const conflict = collision(record, index, input.excludeContacted)
            let candidate: Candidate
            if (conflict) {
              candidate = { record, ...conflict, organizationId: !input.excludeExisting && 'organizationId' in conflict ? conflict.organizationId : undefined }
              if (candidate.outcome === 'DUPLICADO') counts.duplicates++
              else if (candidate.outcome === 'EXCLUIDO') counts.excluded++
              else counts.pending++
            } else if (!verified || confidenceOrder[record.confidence] < confidenceOrder[input.minimumConfidence]) {
              candidate = { record, outcome: 'EN_REVISION', reason: 'Requiere confirmación de la procedencia y del dato publicado.' }
              counts.pending++
            } else {
              const organizationId = portfolio.addDiscovery(record, 'Lote de fuentes verificadas por el operador', job)
              candidate = { record, outcome: 'IMPORTADO', reason: 'Fuente pública atribuida y confirmada en el lote.', organizationId }
              counts.imported++
              index = commercialIndex()
            }
            store.insert('research_candidates', candidate, job)
          }
          const state = counts.imported >= filters.quantity ? 'COMPLETADO' : 'PARCIAL'
          update(job, { ...counts, state, reason: state === 'PARCIAL' ? 'La evidencia o la cantidad disponible quedó por debajo del objetivo.' : undefined })
          store.log('Lote de prospección procesado', job)
        })
      } catch (error) {
        const state = signal.aborted ? 'CANCELADO' : 'FALLIDO'
        const reason = signal.aborted ? 'Cancelado antes de guardar resultados.' :
          error instanceof AIProviderError ? 'Proveedor de IA: ' + error.code : 'La investigación se interrumpió.'
        update(job, { state, reason, errors: signal.aborted ? 0 : 1 })
      } finally {
        active = undefined
      }
    })()
    active = { id: created.id, controller, work }
    return reply.code(202).send(created)
  })
  app.post<{ Params: { id: string } }>('/api/research/jobs/:id/cancel', async (request) => {
    parse(z.strictObject({}), request.body)
    const job = get(request.params.id)
    const running = active
    if (running?.id === job.id) {
      running.controller.abort()
      await running.work
    }
    return get(job.id)
  })
  app.post<{ Params: { id: string; candidateId: string } }>('/api/research/jobs/:id/candidates/:candidateId/review', (request) => store.transaction(() => {
    const job = get(request.params.id)
    if (working.includes(job.state)) throw problem(409, 'Esperá que termine el lote.')
    const candidate = must(store.find<Candidate>('research_candidates', parse(id, request.params.candidateId)))
    const { reviewer } = parse(review, request.body)
    if (candidate.parent !== job.id || candidate.outcome !== 'EN_REVISION') throw problem(409, 'La ficha no está pendiente dentro de este lote.')
    if (collision(candidate.record, commercialIndex())) throw problem(409, 'La ficha conserva una coincidencia o exclusión.')
    const organizationId = portfolio.addDiscovery(candidate.record, reviewer, job.id)
    const saved = store.update<Candidate>('research_candidates', candidate.id, { ...candidate, outcome: 'IMPORTADO', reason: 'Fuente confirmada en revisión humana.', organizationId })
    const imported = job.imported + 1
    update(job.id, { imported, verified: job.verified + 1, pending: job.pending - 1, state: imported >= job.goal ? 'COMPLETADO' : 'PARCIAL' })
    return saved
  }))
}
