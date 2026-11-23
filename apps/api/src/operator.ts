import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { z } from '@reac/core'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { parse, problem } from './http.ts'

const derive = promisify(scrypt)
const recordSchema = z.object({ salt: z.string().regex(/^[a-f0-9]{32}$/), hash: z.string().regex(/^[a-f0-9]{128}$/) })
export type Operator = z.output<typeof recordSchema>
export const readOperator = (value: string) => recordSchema.parse(JSON.parse(value))
const lifetime = 8 * 60 * 60 * 1000
const idle = 30 * 60 * 1000
const windowMs = 60_000

export function registerOperator(app: FastifyInstance, operator?: Operator) {
  let session: { token: string; expires: number; last: number } | undefined
  let researchSession: { token: string; expires: number } | undefined
  let failures = 0
  let since = 0
  let running = false

  function authenticated(request: FastifyRequest) {
    if (!operator) return true
    const current = session
    const now = Date.now()
    if (!current || now >= current.expires || now - current.last >= idle) return false
    const supplied = suppliedToken(request)
    if (!supplied || supplied.length !== current.token.length || !/^[a-f0-9]+$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(current.token, 'hex'))) return false
    current.last = now
    return true
  }
  const suppliedToken = (request: FastifyRequest) => request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  function authorizedResearch(request: FastifyRequest, path: string) {
    const scopedRoute = (request.method === 'POST' && path === '/api/research/jobs') ||
      (request.method === 'GET' && /^\/api\/research\/jobs\/[a-f0-9-]{36}\/summary$/i.test(path))
    const token = suppliedToken(request)
    return scopedRoute && researchSession && researchSession.expires > Date.now() && token &&
      timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(researchSession.token, 'hex'))
  }
  app.addHook('onRequest', async (request, reply) => {
    if (!operator) return
    const path = request.url.split('?')[0]
    if (!path.startsWith('/api') || ['/api/operator/status', '/api/operator/login', '/api/operator/research-session'].includes(path)) return
    if (!authenticated(request) && !authorizedResearch(request, path)) return reply.code(401).send({ message: 'Iniciá sesión para acceder a esta instancia.' })
  })
  app.get('/api/operator/status', (request) => ({ required: Boolean(operator), authenticated: authenticated(request) }))
  async function verifyKey(value: unknown) {
    if (!operator) throw problem(409, 'Esta es una instancia de prueba.')
    const { key } = parse(z.strictObject({ key: z.string().min(24).max(180) }), value)
    const now = Date.now()
    if (now - since >= windowMs) { failures = 0; since = now }
    if (running || failures >= 5) throw problem(429, 'Esperá un minuto antes de volver a intentar.')
    running = true
    try {
      const value = await derive(key, Buffer.from(operator.salt, 'hex'), 64) as Buffer
      if (!timingSafeEqual(value, Buffer.from(operator.hash, 'hex'))) {
        failures++
        throw problem(401, 'La clave no coincide.')
      }
      failures = 0
    } finally { running = false }
  }
  app.post('/api/operator/login', async (request, reply) => {
    await verifyKey(request.body)
    const now = Date.now()
    session = { token: randomBytes(32).toString('hex'), expires: now + lifetime, last: now }
    return reply.send({ authenticated: true, sessionToken: session.token })
  })
  app.post('/api/operator/research-session', async (request, reply) => {
    await verifyKey(request.body)
    researchSession = { token: randomBytes(32).toString('hex'), expires: Date.now() + 15 * 60 * 1000 }
    return reply.send({ sessionToken: researchSession.token })
  })
  app.post('/api/operator/logout', (request, reply) => {
    parse(z.strictObject({}), request.body)
    session = undefined
    researchSession = undefined
    return reply.send({ authenticated: false })
  })
}
