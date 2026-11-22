import { request as httpRequest } from 'node:http'
import { createHash } from 'node:crypto'
import { authorization, review, id, text, z, modes, fixturePath, scopePolicy, policyVersion } from '@reac/core'
import type { AuthorizationRecord } from '@reac/core'
import type { FastifyInstance } from 'fastify'
import type { Store } from './store.ts'
import { parse, must, problem } from './http.ts'

const requestSchema = z.strictObject({
  mode: z.enum(modes), authorizationId: id.optional(),
  hostname: text(253).optional(), path: text(300).optional(),
  port: z.number().int().min(1).max(65535).optional(), method: text(20).optional(),
})
type Status = 'RUNNING' | 'STOPPED' | 'FAILED' | 'COMPLETED' | 'BLOCKED'
export type Run = {
  mode: (typeof modes)[number]; status: Status; authorizationId?: string;
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
  app.get('/api/authorizations', () => store.list<AuthorizationRecord>('authorizations').map((item) => ({
    ...item, effectiveState: item.state === 'APPROVED' && Date.parse(item.endsAt) <= Date.now() ? 'EXPIRED' : item.state,
  })))
  app.post('/api/authorizations', (request, reply) => store.transaction(() => {
    const value = parse(authorization, request.body)
    must(store.find('organizations', value.organizationId))
    const engagement = must(store.list('engagements', value.organizationId)[0])
    const record = store.insert<AuthorizationRecord>('authorizations', { ...value, hostname: value.hostname.toLowerCase(), state: 'PENDING' }, engagement.id)
    store.insert('scope_assets', {
      hostname: record.hostname, port: record.port, path: record.path, methods: record.methods,
      maxRps: record.maxRps, maxConcurrency: record.maxConcurrency,
    }, record.id)
    store.log('Autorización registrada', record.id)
    return reply.code(201).send(record)
  }))
  app.post<{ Params: { id: string } }>('/api/authorizations/:id/review', (request) => store.transaction(() => {
    const record = get(request.params.id)
    const { reviewer } = parse(review, request.body)
    if (record.state !== 'PENDING' || !record.evidence || !record.emergency || Date.parse(record.endsAt) <= Date.now()) {
      throw problem(409, 'La revisión requiere estado pendiente, evidencia, contacto de emergencia y una fecha vigente.')
    }
    store.log('Autorización revisada en el registro', record.id)
    return store.update('authorizations', record.id, { ...record, state: 'APPROVED', reviewer, reviewedAt: new Date().toISOString() })
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
    return { run, evidence: store.list<Evidence>('evidence_refs', run.id), findings: store.list('findings', run.id) }
  })
  app.post('/api/lab/runs', (request, reply) => {
    const input = parse(requestSchema, request.body)
    const target = input.mode === 'LAB_LOCAL' ? {
      ...input, hostname: input.hostname ?? '127.0.0.1', port: input.port ?? fixturePort,
      path: input.path ?? fixturePath, method: input.method ?? 'HEAD',
    } : input
    const record = input.authorizationId ? store.find<AuthorizationRecord>('authorizations', input.authorizationId) : undefined
    const decision = scopePolicy(target, fixturePort, record)
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

