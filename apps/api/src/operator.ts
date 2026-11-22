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

export function registerOperator(app: FastifyInstance, port: number, operator?: Operator) {
  const name = 'reac_operator_' + port
  const cookie = '; HttpOnly; SameSite=Strict; Path=/api'
  let session: { token: string; expires: number; last: number } | undefined
  let failures = 0
  let since = 0
  let running = false

  function authenticated(request: FastifyRequest) {
    if (!operator) return true
    const current = session
    const now = Date.now()
    if (!current || now >= current.expires || now - current.last >= idle) return false
    const supplied = request.headers.cookie?.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(name + '='))?.slice(name.length + 1)
    if (!supplied || supplied.length !== current.token.length || !/^[a-f0-9]+$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(current.token, 'hex'))) return false
    current.last = now
    return true
  }
  app.addHook('onRequest', async (request, reply) => {
    if (!operator) return
    const path = request.url.split('?')[0]
    if (!path.startsWith('/api') || ['/api/operator/status', '/api/operator/login'].includes(path)) return
    if (!authenticated(request)) return reply.code(401).send({ message: 'Iniciá sesión para acceder a esta instancia.' })
  })
  app.get('/api/operator/status', (request) => ({ required: Boolean(operator), authenticated: authenticated(request) }))
  app.post('/api/operator/login', async (request, reply) => {
    if (!operator) throw problem(409, 'Esta es una instancia de prueba.')
    const { key } = parse(z.strictObject({ key: z.string().min(24).max(180) }), request.body)
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
      session = { token: randomBytes(32).toString('hex'), expires: now + lifetime, last: now }
      return reply.header('Set-Cookie', name + '=' + session.token + cookie + '; Max-Age=28800').send({ authenticated: true })
    } finally { running = false }
  })
  app.post('/api/operator/logout', (request, reply) => {
    parse(z.strictObject({}), request.body)
    session = undefined
    return reply.header('Set-Cookie', name + '=' + cookie + '; Max-Age=0').send({ authenticated: false })
  })
}
