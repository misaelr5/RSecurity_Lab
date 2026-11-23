import Fastify, { LogController } from 'fastify'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { readdir, lstat } from 'node:fs/promises'
import { z } from '@reac/core'
import { openStore, schemaVersion } from './store.ts'
import { registerDefensiveReviews } from './defensive-reviews.ts'
import { registerResearch } from './research.ts'
import type { ResearchCatalog } from './research.ts'
import { registerCommercialMap } from './commercial-map.ts'
import { registerCommercialRegister } from './commercial-register.ts'
import { registerHistory } from './history.ts'
import { addCampaignMember, registerCampaigns, requireOpenCampaign } from './campaigns.ts'
import { proposeResearchEnrichment, registerEnrichment } from './enrichment.ts'
import type { AIProvider } from './ai-provider.ts'
import { registerPipeline } from './pipeline.ts'
import { registerPublicAssets } from './public-assets.ts'
import { registerPortfolio } from './portfolio.ts'
import { registerAudits } from './audits.ts'
import { registerReports } from './reports.ts'
import { parse } from './http.ts'
import { registerOperator } from './operator.ts'
import type { Operator } from './operator.ts'
import type { Prospect } from '@reac/core'
import { backupName, createBackup } from './backups.ts'

type Options = { database: string; fixturePort: number; port: number; bundle?: string; backupDir?: string; logger?: boolean; operator?: Operator; privateStorage?: boolean; aiProvider?: AIProvider; researchCatalog?: ResearchCatalog }
const tools = ['Subfinder', 'WappalyzerGo', 'MDN HTTP Observatory', 'HTTPx', 'Nuclei', 'OWASP ZAP', 'OSV-Scanner', 'Semgrep', 'Gitleaks', 'Juice Shop', 'Trivy']

export function createApp(options: Options) {
  const store = openStore(options.database)
  let releaseRuntime: () => void
  try { releaseRuntime = store.acquireRuntime() } catch (error) { store.db.close(); throw error }
  const app = Fastify({
    logger: options.logger ?? false, logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1024 * 1024, requestTimeout: 5000, connectionTimeout: 10000,
    rewriteUrl: (request) => (request.url ?? '/').replace(/^\/api\/v1(?=\/)/, '/api'),
  })
  const localHost = '127.0.0.1:' + options.port
  const origin = 'http://' + localHost
  app.addHook('onClose', async () => { try { releaseRuntime() } finally { store.db.close() } })
  app.addHook('onRequest', async (request, reply) => {
    reply.headers({
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cache-Control': 'no-store',
    })
    if (request.headers.host !== localHost || (request.headers.origin && request.headers.origin !== origin) ||
      (request.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(request.headers['sec-fetch-site']))) {
      return reply.code(403).send({ message: 'Esta aplicación solo admite su origen local.' })
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
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

  registerOperator(app, options.operator)
  const portfolio = registerPortfolio(app, store)
  const audits = registerAudits(app, store, options.fixturePort)
  const assets = registerPublicAssets(app, store)
  registerPipeline(app, store)
  registerResearch(app, store, portfolio, options.aiProvider, options.researchCatalog, {
    requireCampaign: (id) => { requireOpenCampaign(store, id) },
    addMember: (id, organizationId, jobId) => { addCampaignMember(store, id, organizationId, 'INVESTIGACION', jobId) },
    proposeEnrichment: (organizationId, record, reference) => proposeResearchEnrichment(store, organizationId, record, reference),
  })
  registerCommercialMap(app, store)
  registerCommercialRegister(app, store, portfolio)
  registerHistory(app, store, portfolio)
  registerCampaigns(app, store)
  registerEnrichment(app, store)
  registerDefensiveReviews(app, store)
  registerReports(app, store, portfolio, audits, assets)
  app.get('/api/health', () => {
    store.db.prepare('SELECT 1').get()
    return { status: 'PASS', storage: 'SQLite', schema: schemaVersion }
  })
  app.get('/api/settings', () => ({
    version: '0.1.0', privateStorage: options.privateStorage === true, database: basename(options.database), fixture: audits.tool,
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
  app.get('/api/retention', async () => {
    const day = new Date().toISOString().slice(0, 10)
    const age = (value: string) => (Date.parse(day) - Date.parse(value)) / 86400000
    const records = store.list<Prospect>('organizations')
    const files = options.backupDir ? await readdir(options.backupDir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    }) : []
    const dates = options.backupDir ? await Promise.all(files.filter((entry) => entry.isFile() && backupName.test(entry.name))
      .map(async (entry) => (await lstat(resolve(options.backupDir!, entry.name))).mtime.toISOString().slice(0, 10))) : []
    return { prospectiveReviewDays: 180, backupReviewDays: 90, unverified: records.filter((entry) => !entry.verifiedAt).length,
      prospectReviewDue: records.filter((entry) => entry.verifiedAt && (age(entry.verifiedAt) < 0 || age(entry.verifiedAt) >= 180)).length,
      backupReviewDue: dates.filter((date) => age(date) >= 90).length }
  })
  app.post('/api/backups', async (request, reply) => {
    parse(z.strictObject({}), request.body)
    if (!options.backupDir) return reply.code(503).send({ message: 'Respaldo no configurado.' })
    const filename = await createBackup(store.db, options.backupDir)
    store.log('Respaldo local creado')
    return reply.code(201).send({ filename })
  })
  if (options.bundle) {
    const root = options.bundle
    const index = readFileSync(resolve(root, 'index.html'))
    app.get('/', (_request, reply) => reply.type('text/html; charset=utf-8').send(index))
    for (const entry of readdirSync(resolve(root, 'assets'), { withFileTypes: true })) {
      if (!entry.isFile() || !/^[\w-]+\.(?:js|css)$/.test(entry.name)) continue
      const file = readFileSync(resolve(root, 'assets', entry.name))
      const type = entry.name.endsWith('.js') ? 'text/javascript' : 'text/css'
      app.get('/assets/' + entry.name, (_request, reply) => reply.type(type).send(file))
    }
  }
  return app
}
