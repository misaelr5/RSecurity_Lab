import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { backup } from 'node:sqlite'
import { basename, resolve } from 'node:path'
import { mkdir, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { z } from '@reac/core'
import { openStore, schemaVersion } from './store.ts'
import { registerPortfolio } from './portfolio.ts'
import { registerAudits } from './audits.ts'
import { registerReports } from './reports.ts'
import { parse } from './http.ts'

type Options = { database: string; fixturePort: number; port: number; bundle?: string; backupDir?: string; logger?: boolean }
const tools = ['Subfinder', 'WappalyzerGo', 'MDN HTTP Observatory', 'HTTPx', 'Nuclei', 'OWASP ZAP', 'OSV-Scanner', 'Semgrep', 'Gitleaks', 'Juice Shop', 'Trivy']
export const backupName = /^reac-backup-[a-f0-9-]{36}\.sqlite$/

export function createApp(options: Options) {
  const store = openStore(options.database)
  const app = Fastify({ logger: options.logger ?? false, disableRequestLogging: true, bodyLimit: 1024 * 1024, requestTimeout: 5000, connectionTimeout: 10000 })
  const localHost = '127.0.0.1:' + options.port
  const origin = 'http://' + localHost
  app.addHook('onClose', async () => { store.db.close() })
  app.addHook('onRequest', async (request, reply) => {
    reply.headers({
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cache-Control': 'no-store',
    })
    if (request.headers.host !== localHost || (request.headers.origin && request.headers.origin !== origin) ||
      (request.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(request.headers['sec-fetch-site']))) {
      return reply.code(403).send({ message: 'Esta aplicación solo admite su origen local.' })
    }
    if (['POST', 'PUT', 'DELETE'].includes(request.method) && !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
      return reply.code(415).send({ message: 'Usá Content-Type application/json.' })
    }
  })
  app.setErrorHandler((error, request, reply) => {
    const fields = error as { statusCode?: number; exposed?: boolean; name?: string; message?: string }
    const status = fields.statusCode && fields.statusCode >= 400 && fields.statusCode <= 599 ? fields.statusCode : 500
    if (status >= 500) request.log.error({ type: fields.name, route: request.routeOptions.url }, 'Error interno')
    return reply.code(status).send({ message: fields.exposed ? fields.message : status === 413 ? 'El archivo supera el tamaño permitido.' : status < 500 ? 'La solicitud es inválida.' : 'No se pudo completar la operación.' })
  })
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ message: 'Ruta inexistente.' }))

  const portfolio = registerPortfolio(app, store)
  const audits = registerAudits(app, store, options.fixturePort)
  registerReports(app, store, portfolio, audits)
  app.get('/api/health', () => {
    store.db.prepare('SELECT 1').get()
    return { status: 'PASS', storage: 'SQLite', schema: schemaVersion }
  })
  app.get('/api/settings', () => ({
    version: '0.1.0', database: basename(options.database), fixture: audits.tool,
    limits: { csvRows: 1500, requestBytes: 1048576, labRequestsPerSecond: 1, labConcurrency: 1, labTimeoutMs: 2000 },
    tools: tools.map((name) => ({ name, status: 'NO DISPONIBLE EN LA APP' })),
  }))
  app.get('/api/backups', async () => {
    const files = options.backupDir ? await readdir(options.backupDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    }) : []
    return files.filter((file) => backupName.test(file)).sort()
  })
  app.post('/api/backups', async (request, reply) => {
    parse(z.strictObject({}), request.body)
    if (!options.backupDir) return reply.code(503).send({ message: 'Respaldo no configurado.' })
    await mkdir(options.backupDir, { recursive: true })
    const filename = 'reac-backup-' + randomUUID() + '.sqlite'
    await backup(store.db, resolve(options.backupDir, filename))
    store.log('Respaldo local creado')
    return reply.code(201).send({ filename })
  })
  if (options.bundle) {
    void app.register(fastifyStatic, { root: options.bundle, wildcard: false, cacheControl: false })
  }
  return app
}

