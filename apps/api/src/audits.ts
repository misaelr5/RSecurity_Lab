import { request as httpRequest } from 'node:http'
import { createHash } from 'node:crypto'
import { authorization, versionedReview, sha256, id, text, z, modes, fixturePath, scopePolicy, policyVersion } from '@reac/core'
import type { Authorization, AuthorizationRecord } from '@reac/core'
import type { FastifyInstance } from 'fastify'
import type { Store } from './store.ts'
import { findingVersion } from './defensive-reviews.ts'
import type { Finding } from './defensive-reviews.ts'
import { parse, must, problem } from './http.ts'

const requestSchema = z.strictObject({
  mode: z.enum(modes), authorizationId: id.optional(),
  hostname: text(253).optional(), path: text(300).optional(),
  port: z.number().int().min(1).max(65535).optional(), method: text(20).optional(),
})
type Status = 'RUNNING' | 'STOPPED' | 'FAILED' | 'COMPLETED' | 'BLOCKED'
export type Run = {
  mode: (typeof modes)[number] | 'REVISION_DOCUMENTAL'; status: Status; authorizationId?: string;
  project?: string; collectedAt?: string;
  reason: string; policyVersion: string; tool: string; startedAt?: string; finishedAt?: string;
}
type Evidence = { statusCode: number; headers: { name: string; present: boolean }[]; sha256: string; capturedAt: string }
const names = ['x-content-type-options', 'referrer-policy', 'content-security-policy']

function readFixture(port: number, signal: AbortSignal) {
  return new Promise<Omit<Evidence, 'sha256' | 'capturedAt'>>((resolve, reject) => {
    const request = httpRequest({
      hostname: '127.0.0.1', port, path: fixturePath, method: 'HEAD',
      signal, agent: false, maxHeaderSize: 8192,
      lookup: (_hostname, _options, callback) => callback(new Error('DNS deshabilitado en el laboratorio.'), '', 4),
    }, (response) => {
      const statusCode = response.statusCode ?? 0
      response.destroy()
      if (statusCode >= 300 && statusCode < 400) return reject(new Error('El fixture respondió con una redirección.'))
      if (statusCode !== 200) return reject(new Error('El fixture respondió con un estado inesperado.'))
      resolve({ statusCode, headers: names.map((name) => ({ name, present: Object.hasOwn(response.headers, name) })) })
    })
    request.on('error', reject)
    request.end()
  })
}

export function authorizationVersion(record: AuthorizationRecord) {
  const { organizationId, owner, evidence, documentSha256, startsAt, endsAt, emergency,
    hostname, port, path, methods, maxRps, maxConcurrency, prohibited, timezone } = record
  return createHash('sha256').update(JSON.stringify({ organizationId, owner, evidence, documentSha256,
    startsAt, endsAt, emergency, hostname, port, path, methods, maxRps, maxConcurrency, prohibited, timezone })).digest('hex')
}

export function authorizationState(record: AuthorizationRecord) {
  if (record.state !== 'APPROVED') return record.state
  if (!record.documentSha256 || record.reviewedVersion !== authorizationVersion(record)) return 'REVIEW_REQUIRED'
  return Date.parse(record.endsAt) <= Date.now() ? 'EXPIRED' : 'APPROVED'
}

export function registerAudits(app: FastifyInstance, store: Store, fixturePort: number) {
  let active: { id: string; controller: AbortController; done: Promise<void> } | undefined
  let last = -Infinity
  const tool = 'HTTP HEAD · Node.js ' + process.versions.node + ' · fixture v1'
  const get = (raw: unknown) => must(store.find<AuthorizationRecord>('authorizations', parse(id, raw)))
  const getRun = (raw: unknown) => must(store.find<Run>('audit_runs', parse(id, raw)))

  app.addHook('preClose', async () => {
    const job = active
    if (job) {
      job.controller.abort()
      await job.done
    }
  })
  for (const run of store.list<Run>('audit_runs').filter((item) => item.status === 'RUNNING')) {
    store.transaction(() => {
      store.update('audit_runs', run.id, { ...run, status: 'STOPPED', reason: 'Interrumpido por el cierre de la aplicación.', finishedAt: new Date().toISOString() })
      store.log('Prueba local interrumpida', run.id)
    })
  }
  const present = <T extends AuthorizationRecord>(record: T) => ({
    ...record, effectiveState: authorizationState(record), contentVersion: authorizationVersion(record),
  })
  function createAuthorization(value: Authorization, supersedes?: string) {
    must(store.find('organizations', value.organizationId))
    const engagement = must(store.list('engagements', value.organizationId)[0])
    const record = store.insert<AuthorizationRecord>('authorizations', {
      ...value, hostname: value.hostname.toLowerCase(), state: 'PENDING', supersedes,
    }, engagement.id)
    store.insert('scope_assets', {
      hostname: record.hostname, port: record.port, path: record.path, methods: record.methods,
      maxRps: record.maxRps, maxConcurrency: record.maxConcurrency,
    }, record.id)
    store.log('Autorización registrada', record.id)
    return record
  }
  app.get('/api/authorizations', () => store.list<AuthorizationRecord>('authorizations').map(present))
  app.post('/api/authorizations', (request, reply) => store.transaction(() =>
    reply.code(201).send(present(createAuthorization(parse(authorization, request.body))))))
  app.post<{ Params: { id: string } }>('/api/authorizations/:id/supersede', (request, reply) => store.transaction(() => {
    const previous = get(request.params.id)
    const { replacement, contentVersion } = parse(z.strictObject({ replacement: authorization, contentVersion: sha256 }), request.body)
    if (previous.supersededBy || contentVersion !== authorizationVersion(previous) || replacement.organizationId !== previous.organizationId) {
      throw problem(409, 'La versión seleccionada cambió o no corresponde a esta organización.')
    }
    const next = createAuthorization(replacement, previous.id)
    store.update<AuthorizationRecord>('authorizations', previous.id, { ...previous, state: 'REVOKED', supersededBy: next.id })
    store.log('Autorización reemplazada', previous.id)
    return reply.code(201).send(present(next))
  }))
  app.post<{ Params: { id: string } }>('/api/authorizations/:id/review', (request) => store.transaction(() => {
    const record = get(request.params.id)
    const { reviewer, contentVersion } = parse(versionedReview, request.body)
    const state = authorizationState(record)
    if (contentVersion !== authorizationVersion(record) || record.supersededBy ||
      !['PENDING', 'REVIEW_REQUIRED'].includes(state) || !record.evidence || !record.documentSha256 ||
      !record.emergency || Date.parse(record.endsAt) <= Date.now()) {
      throw problem(409, 'La revisión requiere la versión vigente, la referencia y SHA-256 del documento, y un contacto de emergencia.')
    }
    store.log('Autorización revisada en el registro', record.id)
    return present(store.update<AuthorizationRecord>('authorizations', record.id, {
      ...record, state: 'APPROVED', reviewer, reviewedAt: new Date().toISOString(), reviewedVersion: contentVersion,
    }))
  }))
  app.post<{ Params: { id: string } }>('/api/authorizations/:id/revoke', (request) => store.transaction(() => {
    const record = get(request.params.id)
    parse(z.strictObject({}), request.body)
    store.log('Autorización revocada', record.id)
    return store.update('authorizations', record.id, { ...record, state: 'REVOKED' })
  }))
  app.get('/api/lab/runs', () => store.list<Run>('audit_runs').slice(0, 100))
  app.get<{ Params: { id: string } }>('/api/lab/runs/:id', (request) => {
    const run = getRun(request.params.id)
    const findings = run.mode === 'REVISION_DOCUMENTAL'
      ? store.list<Finding>('findings', run.id).map((item) => ({ ...item, contentVersion: findingVersion(item) }))
      : store.list('findings', run.id)
    return { run, evidence: store.list<Evidence>('evidence_refs', run.id), findings }
  })
  app.post('/api/lab/runs', (request, reply) => {
    const input = parse(requestSchema, request.body)
    const target = input.mode === 'LAB_LOCAL' ? {
      ...input, hostname: input.hostname ?? '127.0.0.1', port: input.port ?? fixturePort,
      path: input.path ?? fixturePath, method: input.method ?? 'HEAD',
    } : input
    const record = input.authorizationId ? store.find<AuthorizationRecord>('authorizations', input.authorizationId) : undefined
    const scoped = record && record.reviewedVersion !== authorizationVersion(record)
      ? { ...record, reviewedVersion: undefined } : record
    const decision = scopePolicy(target, fixturePort, scoped)
    const base = { mode: input.mode, policyVersion, tool, authorizationId: record?.id }
    if (!decision.allowed) {
      const blocked = store.transaction(() => {
        const saved = store.insert<Run>('audit_runs', { ...base, status: 'BLOCKED', reason: decision.reason, finishedAt: new Date().toISOString() })
        store.log('Operación bloqueada por alcance', saved.id)
        return saved
      })
      return reply.code(403).send(blocked)
    }
    if (active || performance.now() - last < 1000) throw problem(429, 'Esperá un segundo. El laboratorio permite una sola prueba a la vez.')
    const run = store.transaction(() => {
      const saved = store.insert<Run>('audit_runs', { ...base, status: 'RUNNING', reason: decision.reason, startedAt: new Date().toISOString() })
      store.log('Prueba local iniciada', saved.id)
      return saved
    })
    last = performance.now()
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(2000)])
    const done = (async () => {
      let result: Awaited<ReturnType<typeof readFixture>> | undefined
      let reason = ''
      try { result = await readFixture(fixturePort, signal) }
      catch (error) {
        const message = error instanceof Error ? error.message : ''
        reason = ['El fixture respondió con una redirección.', 'El fixture respondió con un estado inesperado.'].includes(message)
          ? message : signal.aborted ? 'Se alcanzó el tiempo máximo de 2 segundos.' : 'El fixture no respondió a la comprobación.'
      }
      const status: Status = controller.signal.aborted ? 'STOPPED' : result ? 'COMPLETED' : 'FAILED'
      store.transaction(() => {
        if (result && status === 'COMPLETED') {
          const evidence = store.insert<Evidence>('evidence_refs', {
            ...result, capturedAt: new Date().toISOString(),
            sha256: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
          }, run.id)
          for (const header of result.headers) {
            store.insert('findings', {
              title: header.name, level: 'RESULTADO_DE_CONFIGURACION', severity: 'INFORMATIVA',
              present: header.present, evidenceId: evidence.id,
            }, run.id)
          }
        }
        store.update<Run>('audit_runs', run.id, {
          ...run, status, finishedAt: new Date().toISOString(),
          reason: status === 'STOPPED' ? 'Detenido por el operador.' : reason || decision.reason,
        })
        store.log(status === 'COMPLETED' ? 'Prueba local completada' : 'Prueba local finalizada sin resultados', run.id)
      })
    })().catch((error: unknown) => {
      app.log.error({ type: error instanceof Error ? error.name : 'UnknownError', runId: run.id }, 'No se pudo guardar la corrida')
      const current = store.find<Run>('audit_runs', run.id)
      if (current?.status === 'RUNNING') {
        try { store.update('audit_runs', run.id, { ...current, status: 'FAILED', reason: 'No se pudo guardar la corrida.', finishedAt: new Date().toISOString() }) }
        catch { app.log.error({ runId: run.id }, 'La corrida se recuperará al reiniciar') }
      }
    }).finally(() => { active = undefined })
    active = { id: run.id, controller, done }
    return reply.code(202).send(run)
  })
  app.post<{ Params: { id: string } }>('/api/lab/runs/:id/stop', async (request) => {
    parse(z.strictObject({}), request.body)
    const run = getRun(request.params.id)
    const job = active
    if (job?.id === run.id) {
      job.controller.abort()
      await job.done
    }
    return getRun(run.id)
  })
  return { getRun, tool }
}
