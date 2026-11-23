import { randomUUID, scryptSync } from 'node:crypto'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { RequestListener } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { createApp } from '../apps/api/src/app.ts'
import { restoreBackup } from '../apps/api/src/backups.ts'
import type { Operator } from '../apps/api/src/operator.ts'
import { openStore, schemaVersion, tablesForVersion } from '../apps/api/src/store.ts'
import { backupDirectory } from '../apps/api/src/storage-paths.ts'
import { startFixture } from '../fixtures/lab.ts'

async function setup(t: TestContext, handler?: RequestListener, backupDir?: string, operator?: Operator) {
  const fixture = await startFixture(handler)
  const app = createApp({ database: ':memory:', port: 4310, fixturePort: fixture.port, backupDir, operator })
  t.after(async () => { await app.close(); await fixture.close() })
  const send = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: object) => app.inject({
    method, url, headers: { host: '127.0.0.1:4310', ...(method === 'GET' ? {} : { 'content-type': 'application/json' }) },
    ...(method === 'GET' ? {} : { payload: body ?? {} }),
  })
  return { app, send, fixture }
}
const prospect = { name: 'Taller Ficticio', industry: 'Turismo', city: 'Nono', region: 'Traslasierra' }
const human = { reviewer: 'Operador de prueba', acknowledge: true }

test('flujo pasivo: CSV, edición, filtros, fuentes, mensaje, informe y exclusión', async (t) => {
  const { send } = await setup(t)
  assert.equal((await send('GET', '/api/v1/health')).json().schema, schemaVersion)
  assert.equal((await send('GET', '/api/dashboard')).json().total, 0)
  const csv = await readFile(new URL('../fixtures/prospectos-demo.csv', import.meta.url), 'utf8')
  assert.equal((await send('POST', '/api/prospects/import', { version: 1, csv })).json().imported, 3)
  assert.equal((await send('POST', '/api/prospects/import', { version: 1, csv })).json().duplicates, 3)
  assert.equal((await send('GET', '/api/prospects')).json().total, 3)
  assert.equal((await send('GET', '/api/prospects?status=Nuevo')).json().total, 1)
  const portable = (await send('GET', '/api/prospects/export/json')).json()
  assert.equal(portable.version, 1)
  assert.equal(portable.prospects.length, 3)
  assert.equal((await send('POST', '/api/prospects/import/json', portable)).json().duplicates, 3)
  assert.equal((await send('POST', '/api/prospects/import/json', { ...portable, version: 2 })).statusCode, 400)
  const list = (await send('GET', '/api/prospects?region=Traslasierra&industry=turismo')).json()
  assert.equal(list.total, 1)
  const id = list.items[0].id
  const path = '/api/prospects/' + id
  const detail = (await send('GET', path)).json()
  assert.equal(detail.org.original.presencia_web, 'Con web')
  assert.equal(detail.sources[0].provider, 'REAC_LEADS_CSV_V1')
  assert.equal((await send('POST', path + '/sources', { url: 'javascript:alert(1)', consultedAt: '2026-11-22', provider: 'Demo', statement: 'Ejemplo' })).statusCode, 400)
  const newSource = await send('POST', path + '/sources', { url: 'https://sample.example/?token=secreto', consultedAt: '2026-11-22', provider: 'Demo', statement: '<script>mal</script> token=privado' })
  assert.equal(newSource.statusCode, 201)
  const note = { sourceId: newSource.json().id, title: 'Referencia', category: 'Sitio', statement: 'Información ficticia', severity: 'INFORMATIVA', confidence: 'BAJA', impact: 'Condicionado', limitations: 'Ejemplo', recommendation: 'Revisar', level: 'OBSERVACION_PUBLICA' }
  assert.equal((await send('POST', path + '/observations', { ...note, level: 'HALLAZGO_CONFIRMADO' })).statusCode, 400)
  const saved = await send('POST', path + '/observations', note)
  assert.equal(saved.statusCode, 201)
  assert.equal((await send('POST', '/api/observations/' + saved.json().id + '/review', human)).statusCode, 200)
  assert.equal((await send('GET', '/api/dashboard')).json().verified, 1)
  const draft = (await send('POST', path + '/drafts')).json()
  assert.match(draft.body, /Reac Studio/)
  const whatsapp = (await send('POST', path + '/drafts', { channel: 'WhatsApp' })).json()
  assert.equal(whatsapp.channel, 'WhatsApp')
  assert.match(whatsapp.body, /coordinar una charla breve/)
  assert.equal((await send('GET', path + '/score?site=100&source=0&contact=0&application=0')).json().score, 100)
  const draftPath = '/api/drafts/' + draft.id
  assert.ok((await send('POST', draftPath + '/review', { ...human, contentVersion: draft.contentVersion })).json().reviewedAt)
  assert.equal((await send('PUT', draftPath, { subject: 'Edición', body: 'Consulta comercial' })).json().reviewedAt, undefined)
  assert.equal((await send('POST', draftPath + '/review', { ...human, contentVersion: draft.contentVersion })).statusCode, 409)
  const reportPath = '/api/reports/prospect/' + id
  const contentVersion = (await send('GET', reportPath)).json().contentVersion
  const report = await send('GET', reportPath + '/export/html')
  assert.match(report.body, /BORRADOR/)
  assert.match(report.body, /&lt;script&gt;/)
  assert.doesNotMatch(report.body, /<script>|privado|token=secreto/)
  assert.match((await send('GET', reportPath + '/export/md')).body, /BORRADOR/)
  assert.match((await send('GET', reportPath + '/export/csv')).body, /BORRADOR/)
  assert.equal((await send('POST', reportPath + '/review', { ...human, contentVersion })).statusCode, 200)
  assert.match((await send('GET', reportPath + '/export/md')).body, /REVISADO/)
  await send('POST', path + '/sources', { url: 'https://second.example', consultedAt: '2026-11-22', provider: 'Ejemplo', statement: 'Nuevo dato' })
  assert.match((await send('GET', reportPath + '/export/md')).body, /BORRADOR/)
  assert.equal((await send('POST', reportPath + '/review', { ...human, contentVersion })).statusCode, 409)
  const updated = (await send('POST', '/api/prospects/import', { version: 1, csv: 'empresa,rubro,ciudad,estado,consentimiento\nRefugio Arrayan ficticio,Turismo,Mina Clavero,No contactar,Excluido' })).json()
  assert.equal(updated.exclusionsApplied, 1)
  assert.equal((await send('POST', draftPath + '/review', human)).statusCode, 409)
  assert.equal((await send('POST', path + '/drafts')).statusCode, 409)
  assert.equal((await send('GET', path + '/score')).json().score, null)
  assert.equal((await send('DELETE', path)).statusCode, 409)
  assert.equal((await send('PUT', path, { prospect })).statusCode, 409)
  assert.equal((await send('PUT', path, { prospect, confirmUnblock: true })).statusCode, 200)
  const exported = await send('GET', '/api/prospects/export')
  assert.match(exported.body, /presencia_web/)
  assert.match(exported.body, /Con web/)
  assert.equal((await send('DELETE', path)).statusCode, 204)
  assert.ok((await send('GET', path)).json().org.archivedAt)
  assert.equal((await send('GET', '/api/prospects?archived=only')).json().total, 1)
})

test('rechaza origen cruzado, nombres falsos de Host y cuerpos de formulario', async (t) => {
  const { app } = await setup(t)
  assert.equal((await app.inject({ url: '/api/health', headers: { host: 'domain.example' } })).statusCode, 403)
  assert.equal((await app.inject({ url: '/api/health', headers: { host: '127.0.0.1:4310', origin: 'http://192.168.0.5' } })).statusCode, 403)
  assert.equal((await app.inject({ method: 'POST', url: '/api/prospects', headers: { host: '127.0.0.1:4310', 'content-type': 'text/plain' }, payload: '{}' })).statusCode, 415)
})

test('registro de autorización no abre transporte externo y comprueba evidencias, ventana y alcance', async (t) => {
  let calls = 0
  const { send } = await setup(t, (_request, response) => { calls++; response.writeHead(200).end() })
  const org = (await send('POST', '/api/prospects', prospect)).json()
  const now = Date.now()
  const value = {
    organizationId: org.id, owner: 'Entidad ficticia', evidence: 'Expediente sintético', startsAt: new Date(now - 2000).toISOString(),
    endsAt: new Date(now + 100000).toISOString(), documentSha256: 'a'.repeat(64), emergency: 'Canal ficticio', hostname: 'cliente.example', port: 443,
    path: '/demo', methods: ['HEAD'], maxRps: 1, maxConcurrency: 1, prohibited: 'Cambios de estado', timezone: 'UTC',
  }
  const target = { mode: 'AUDITORIA_AUTORIZADA', hostname: 'cliente.example', port: 443, path: '/demo', method: 'HEAD' }
  const blocked = await send('POST', '/api/lab/runs', target)
  assert.equal(blocked.statusCode, 403)
  assert.equal(blocked.json().status, 'BLOCKED')
  const report = (await send('GET', '/api/reports/lab/' + blocked.json().id + '/export/md')).body
  assert.match(report, /antes del transporte HTTP/)
  assert.doesNotMatch(report, /HEAD al fixture/)
  const incomplete = (await send('POST', '/api/authorizations', { ...value, emergency: '' })).json()
  assert.equal((await send('POST', '/api/authorizations/' + incomplete.id + '/review', { ...human, contentVersion: incomplete.contentVersion })).statusCode, 409)
  const expired = (await send('POST', '/api/authorizations', { ...value, endsAt: new Date(now - 1000).toISOString() })).json()
  assert.equal((await send('POST', '/api/authorizations/' + expired.id + '/review', { ...human, contentVersion: expired.contentVersion })).statusCode, 409)
  const current = (await send('POST', '/api/authorizations', value)).json()
  assert.equal((await send('POST', '/api/authorizations/' + current.id + '/review', { ...human, contentVersion: current.contentVersion })).json().state, 'APPROVED')
  const run = (await send('POST', '/api/lab/runs', { ...target, authorizationId: current.id })).json()
  assert.match(run.reason, /solo ejecuta el fixture/)
  const mismatch = (await send('POST', '/api/lab/runs', { ...target, authorizationId: current.id, method: 'POST' })).json()
  assert.match(mismatch.reason, /fuera del alcance/)
  const replacement = { ...value, documentSha256: 'b'.repeat(64) }
  assert.equal((await send('POST', '/api/authorizations/' + current.id + '/supersede', {
    contentVersion: 'f'.repeat(64), replacement,
  })).statusCode, 409)
  const next = (await send('POST', '/api/authorizations/' + current.id + '/supersede', {
    contentVersion: current.contentVersion, replacement,
  })).json()
  assert.equal(next.state, 'PENDING')
  assert.equal(next.supersedes, current.id)
  assert.equal((await send('POST', '/api/authorizations/' + next.id + '/review', {
    ...human, contentVersion: current.contentVersion,
  })).statusCode, 409)
  const rows = (await send('GET', '/api/authorizations')).json()
  const previous = rows.find((item: { id: string }) => item.id === current.id)
  assert.equal(previous.state, 'REVOKED')
  assert.equal(previous.documentSha256, value.documentSha256)
  assert.ok(previous.reviewedAt)
  assert.equal((await send('GET', '/api/dashboard')).json().authorized, 0)
  assert.equal((await send('POST', '/api/authorizations/' + next.id + '/revoke')).json().state, 'REVOKED')
  assert.equal((await send('POST', '/api/lab/runs', { mode: 'PROSPECCION_PASIVA' })).json().status, 'BLOCKED')
  assert.equal((await send('POST', '/api/lab/runs', { mode: 'LAB_LOCAL', hostname: 'dns.example' })).json().status, 'BLOCKED')
  assert.equal(calls, 0)
})

test('fixture local crea evidencia mínima y reporte con resultados informativos', async (t) => {
  const { send } = await setup(t)
  const response = await send('POST', '/api/lab/runs', { mode: 'LAB_LOCAL' })
  assert.equal(response.statusCode, 202)
  const id = response.json().id
  let snapshot
  for (let attempt = 0; attempt < 30; attempt++) {
    snapshot = (await send('GET', '/api/lab/runs/' + id)).json()
    if (snapshot.run.status !== 'RUNNING') break
    await delay(40)
  }
  assert.equal(snapshot.run.status, 'COMPLETED')
  assert.equal(snapshot.evidence[0].statusCode, 200)
  assert.equal(snapshot.evidence[0].sha256.length, 64)
  assert.equal(snapshot.findings.length, 3)
  assert.ok(snapshot.findings.every((item: { level: string }) => item.level === 'RESULTADO_DE_CONFIGURACION'))
  assert.match((await send('GET', '/api/reports/lab/' + id + '/export/md')).body, /BORRADOR/)
})

test('fixture no sigue redirecciones, aplica tasa y permite cancelar', async (t) => {
  let redirected = 0
  let hang = false
  const { send, fixture } = await setup(t, (request, response) => {
    if (request.url !== '/fixture') redirected++
    if (!hang) response.writeHead(302, { Location: '/otro' }).end()
  })
  const initial = await send('POST', '/api/lab/runs', { mode: 'LAB_LOCAL' })
  assert.equal(initial.statusCode, 202)
  const id = initial.json().id
  let run
  for (let attempt = 0; attempt < 30; attempt++) {
    run = (await send('GET', '/api/lab/runs/' + id)).json().run
    if (run.status !== 'RUNNING') break
    await delay(25)
  }
  assert.equal(run.status, 'FAILED')
  assert.match(run.reason, /redirección/)
  assert.equal(redirected, 0)
  assert.equal((await send('POST', '/api/lab/runs', { mode: 'LAB_LOCAL', port: fixture.port })).statusCode, 429)
  await delay(1050)
  hang = true
  const running = (await send('POST', '/api/lab/runs', { mode: 'LAB_LOCAL' })).json()
  const stopped = (await send('POST', '/api/lab/runs/' + running.id + '/stop')).json()
  assert.equal(stopped.status, 'STOPPED')
})

test('exportación SQLite crea una copia válida con datos y esquema', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'reac-backup-'))
  try {
    const { send } = await setup(t, undefined, dir)
    await send('POST', '/api/prospects', prospect)
    const response = await send('POST', '/api/backups')
    assert.equal(response.statusCode, 201)
    const files = await readdir(dir)
    assert.deepEqual(files, [response.json().filename])
    assert.notEqual(backupDirectory('demo.sqlite', dir), backupDirectory('reac.sqlite', dir))
    const output = join(dir, 'restored.sqlite')
    await restoreBackup(join(dir, files[0]), output)
    await assert.rejects(restoreBackup(join(dir, files[0]), output), { code: 'EEXIST' })
    const copy = new DatabaseSync(output, { readOnly: true })
    try {
      assert.equal(copy.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok')
      assert.equal(copy.prepare('SELECT COUNT(*) AS count FROM organizations').get()?.count, 1)
    } finally { copy.close() }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('activos pasivos requieren fuente propia y aparecen atributos e historial en el informe', async (t) => {
  const { send } = await setup(t)
  const a = (await send('POST', '/api/prospects', { ...prospect, website: 'https://lab.example' })).json()
  const b = (await send('POST', '/api/prospects', { ...prospect, name: 'Otra ficha', website: 'https://www.lab.example' })).json()
  const route = '/api/prospects/' + a.id
  const fonte = (await send('POST', route + '/sources', {
    url: 'https://catalogo.example', consultedAt: '2026-11-22', provider: 'Catálogo ficticio', statement: 'Lista una plataforma de prueba.',
  })).json()
  const asset = { sourceId: fonte.id, kind: 'Subdominio', value: 'portal.lab.example', status: 'Histórico',
    collectedAt: '2026-11-22', confidence: 'MEDIA', note: 'El catálogo documenta ese nombre en esa fecha.' }
  assert.equal((await send('POST', '/api/prospects/' + b.id + '/assets', asset)).statusCode, 400)
  assert.equal((await send('POST', route + '/assets', { ...asset, value: 'https://portal.lab.example/' })).statusCode, 400)
  assert.equal((await send('POST', route + '/assets', asset)).statusCode, 201)
  assert.equal((await send('POST', route + '/assets', { ...asset, value: 'PORTAL.LAB.EXAMPLE.' })).statusCode, 409)
  assert.equal((await send('GET', route + '/assets?kind=Tecnolog%C3%ADa')).json().length, 0)
  assert.equal((await send('GET', route + '/assets')).json()[0].sourceId, fonte.id)
  assert.deepEqual((await send('GET', route)).json().duplicates.map((candidate: { id: string }) => candidate.id), [b.id])
  const report = await send('GET', '/api/reports/prospect/' + a.id + '/export/md')
  assert.match(report.body, /portal\.lab\.example/)
  assert.match(report.body, /Histórico/)
})

test('pipeline registra hitos y métricas, respeta opt-out y exige autorización vigente', async (t) => {
  const { send } = await setup(t)
  const a = (await send('POST', '/api/prospects', prospect)).json()
  const b = (await send('POST', '/api/prospects', { ...prospect, name: 'Excluida', consent: 'Excluido' })).json()
  const path = '/api/prospects/' + a.id + '/pipeline'
  const add = (stage: string) => send('POST', path, { stage, note: 'Hito ficticio' })
  assert.equal((await send('GET', path)).json().stage, 'Descubierto')
  assert.equal((await add('Autorizado')).statusCode, 409)
  assert.equal((await send('POST', '/api/prospects/' + b.id + '/pipeline', { stage: 'Contactado', note: 'Exclusión' })).statusCode, 409)
  assert.equal((await add('Contactado')).statusCode, 201)
  assert.equal((await add('Respondió')).statusCode, 201)
  assert.equal((await add('Contactado')).statusCode, 409)
  const metrics = (await send('GET', '/api/pipeline/metrics')).json()
  assert.equal(metrics.contactados, 1)
  assert.equal(metrics.respondieron, 1)
  assert.equal(metrics.stages.find((entry: { stage: string }) => entry.stage === 'Respondió').count, 1)
})

test('migración SQLite de v1 a v4 preserva datos y genera respaldo anterior restaurable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reac-migration-'))
  const path = join(dir, 'previous.sqlite')
  try {
    const original = openStore(path)
    const org = original.insert('organizations', prospect)
    const undo = tablesForVersion(schemaVersion).filter((table) => !tablesForVersion(1).includes(table)).reverse()
    for (const table of undo) original.db.exec('DROP TABLE ' + table)
    original.db.exec('PRAGMA user_version=1')
    original.db.close()
    const upgraded = openStore(path)
    try {
      assert.equal(upgraded.db.prepare('PRAGMA user_version').get()?.user_version, schemaVersion)
      assert.equal(upgraded.find<{ name: string }>('organizations', org.id)?.name, prospect.name)
      assert.equal(upgraded.count('public_assets'), 0)
    } finally { upgraded.db.close() }
    const backupDir = backupDirectory('previous.sqlite', dir)
    const backups = await readdir(backupDir)
    assert.equal(backups.length, 1)
    const restored = join(dir, 'migration-restored.sqlite')
    await restoreBackup(join(backupDir, backups[0]), restored)
    const copy = new DatabaseSync(restored, { readOnly: true })
    try {
      assert.equal(copy.prepare('PRAGMA user_version').get()?.user_version, 1)
      assert.equal(copy.prepare('SELECT count(*) AS n FROM organizations').get()?.n, 1)
    } finally { copy.close() }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('importación defensiva inerte, revisión versionada e informe con historial', async (t) => {
  const { send } = await setup(t)
  const sample = JSON.parse(await readFile(new URL('../fixtures/resultados-defensivos-demo.json', import.meta.url), 'utf8'))
  assert.equal((await send('POST', '/api/reviews/import', { ...sample, ownedOrAuthorized: false })).statusCode, 400)
  assert.equal((await send('POST', '/api/reviews/import', {
    ...sample, results: [{ ...sample.results[0], secret: 'valor-sintetico' }],
  })).statusCode, 400)
  const saved = await send('POST', '/api/reviews/import', sample)
  assert.equal(saved.statusCode, 201)
  assert.equal((await send('POST', '/api/reviews/import', sample)).json().id, saved.json().id)
  const runId = saved.json().id
  const current = (await send('GET', '/api/lab/runs/' + runId)).json()
  assert.equal(current.run.mode, 'REVISION_DOCUMENTAL')
  assert.equal(current.findings[0].state, 'Pendiente de validación')
  assert.deepEqual(current.evidence, [])
  const finding = current.findings[0]
  const url = '/api/reviews/findings/' + finding.id + '/review'
  const review = { reviewer: 'Operador ficticio', contentVersion: finding.contentVersion, proofReference: 'Expediente sintético' }
  assert.equal((await send('POST', url, { ...review, state: 'Corregido' })).statusCode, 409)
  assert.equal((await send('POST', url, { ...review, state: 'Confirmado' })).json().state, 'Confirmado')
  assert.equal((await send('POST', url, { ...review, state: 'Falso positivo' })).statusCode, 409)
  const report = await send('GET', '/api/reports/lab/' + runId + '/export/md')
  assert.match(report.body, /Expediente sintético|sintético/)
  assert.match(report.body, /Revisión defensiva/)
  assert.equal((await send('GET', '/api/dashboard')).json().lab, 0)
})

test('sesión monousuario protege archivos, exige clave y se invalida con logout', async (t) => {
  const key = 'clave-sintetica-api-autoridad-local'
  const salt = '46'.repeat(16)
  const { app, send } = await setup(t, undefined, undefined, { salt, hash: scryptSync(key, Buffer.from(salt, 'hex'), 64).toString('hex') })
  assert.equal((await send('GET', '/api/v1/prospects/export')).statusCode, 401)
  assert.equal((await send('POST', '/api/v1/operator/login', { key: 'incorrecta-sintetica-de-prueba' })).statusCode, 401)
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/operator/login', headers: { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:9999', 'content-type': 'application/json' }, payload: { key } })).statusCode, 403)
  const login = await send('POST', '/api/v1/operator/login', { key })
  assert.equal(login.statusCode, 200)
  assert.equal(login.headers['set-cookie'], undefined)
  assert.match(login.json().sessionToken, /^[a-f0-9]{64}$/)
  const headers = { host: '127.0.0.1:4310', authorization: 'Bearer ' + login.json().sessionToken, 'content-type': 'application/json' }
  const cliLogin = await send('POST', '/api/v1/operator/research-session', { key })
  assert.equal(cliLogin.statusCode, 200)
  const cli = { ...headers, authorization: 'Bearer ' + cliLogin.json().sessionToken }
  const lot = await app.inject({ method: 'POST', url: '/api/v1/research/jobs', headers: cli, payload: { requestId: randomUUID() } })
  assert.equal(lot.statusCode, 202)
  const lotUrl = '/api/v1/research/jobs/' + lot.json().id
  assert.equal((await app.inject({ url: lotUrl + '/summary', headers: cli })).statusCode, 200)
  const secondCli = await send('POST', '/api/v1/operator/research-session', { key })
  assert.equal(secondCli.statusCode, 200)
  assert.equal((await app.inject({ url: lotUrl + '/summary', headers: cli })).statusCode, 200)
  assert.equal((await app.inject({ url: lotUrl, headers: cli })).statusCode, 401)
  assert.equal((await app.inject({ url: '/api/v1/prospects/export', headers: cli })).statusCode, 401)
  const historyLogin = await send('POST', '/api/v1/operator/history-session', { key })
  const history = { ...headers, authorization: 'Bearer ' + historyLogin.json().sessionToken }
  assert.equal((await app.inject({ url: '/api/v1/history/export?format=json', headers: history })).statusCode, 200)
  assert.equal((await app.inject({ url: lotUrl + '/summary', headers: history })).statusCode, 401)
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/history/import', headers: history, payload: {} })).statusCode, 401)
  assert.equal((await app.inject({ url: '/api/v1/retention', headers })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/operator/logout', headers, payload: {} })).statusCode, 200)
  assert.equal((await app.inject({ url: '/api/v1/prospects/export', headers })).statusCode, 401)
  assert.equal((await app.inject({ url: lotUrl + '/summary', headers: cli })).statusCode, 401)
})

test('una segunda instancia conserva el trabajo de la primera base', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reac-lease-'))
  const database = join(dir, 'guard.sqlite')
  const options = { database, port: 4310, fixturePort: 4450 }
  let owner: ReturnType<typeof createApp> | undefined
  try {
    owner = createApp(options)
    assert.throws(() => createApp({ ...options, port: 4311 }), /Ya existe una instancia/)
    await owner.close()
    owner = createApp(options)
    assert.equal((await owner.inject({ url: '/api/health', headers: { host: '127.0.0.1:4310' } })).statusCode, 200)
  } finally {
    await owner?.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('ubicación exacta requiere confirmación y se conserva en las exportaciones', async (t) => {
  const { send } = await setup(t)
  const organization = (await send('POST', '/api/prospects', prospect)).json()
  const path = '/api/map/prospects/' + organization.id + '/location'
  const location = { latitude: -31.8, longitude: -65.01, verifiedOn: new Date().toISOString().slice(0, 10),
    sourceUrl: 'https://www.openstreetmap.org/?token=entrada-local#map=17/-31.8/-65.01' }
  assert.equal((await send('PUT', path, { ...location, confirm: false })).statusCode, 400)
  assert.equal((await send('PUT', path, { ...location, latitude: -100, confirm: true })).statusCode, 400)
  const confirmed = (await send('PUT', path, { ...location, confirm: true })).json()
  assert.equal(confirmed.precision, 'EXACTA')
  assert.equal(confirmed.sourceUrl, 'https://www.openstreetmap.org/#map=17/-31.8/-65.01')
  const archive = (await send('GET', '/api/history/export?format=json')).json()
  assert.equal(archive.companies[0].mapLocation.sourceUrl, confirmed.sourceUrl)
  const geojson = (await send('GET', '/api/map/export?format=geojson')).json()
  assert.deepEqual(geojson.features[0].geometry.coordinates, [location.longitude, location.latitude])
  assert.equal(geojson.features[0].properties.precision, 'EXACTA')
  assert.equal((await send('DELETE', path)).json().location.precision, 'LOCALIDAD_APROXIMADA')
})

test('descubrimiento manual exige confirmación, conserva duplicados y enlaza transferencia CRM', async (t) => {
  const { send } = await setup(t)
  const file = JSON.parse(await readFile(new URL('../fixtures/investigacion-demo.json', import.meta.url), 'utf8'))
  const preview = await send('POST', '/api/discovery/preview', file)
  assert.equal(preview.json()[0].duplicate, false)
  assert.equal((await send('GET', '/api/prospects')).json().total, 0)
  assert.equal((await send('POST', '/api/discovery/import', { file, ...human, acknowledge: false })).statusCode, 400)
  const result = (await send('POST', '/api/discovery/import', { file, ...human })).json()
  assert.equal(result.imported, 1)
  const [orgId] = result.ids
  assert.equal((await send('POST', '/api/discovery/import', { file, ...human })).json().duplicates, 1)
  assert.equal((await send('GET', '/api/prospects?region=Villa+Dolores&industry=Comercio&applicationType=Comercio+electr%C3%B3nico')).json().total, 1)
  assert.equal((await send('GET', '/api/prospects?applicationType=Reservas')).json().total, 0)
  const draft = (await send('POST', '/api/prospects/' + orgId + '/drafts')).json()
  assert.match(draft.body, /retiro de pedidos web/)
  assert.doesNotMatch((await send('GET', '/api/prospects/export?mode=handoff')).body, /retiro de pedidos web/)
  assert.equal((await send('POST', '/api/drafts/' + draft.id + '/review', { ...human, contentVersion: draft.contentVersion })).statusCode, 200)
  assert.match((await send('GET', '/api/prospects/export?mode=handoff')).body, /retiro de pedidos web/)
  assert.equal((await send('GET', '/api/crm/preview')).json()[0].crmIndustry, 'Otro')
})

test('las fechas futuras quedan en revisión y no cuentan como verificación comercial', async (t) => {
  const { send } = await setup(t)
  const consultedAt = new Date(Date.now() + 86400_000 * 365).toISOString().slice(0, 10)
  const evidence = { url: 'https://ejemplo.example/reservas', consultedAt, provider: 'Fixture', statement: 'Formulario de reservas.' }
  const created = await send('POST', '/api/prospects', { ...prospect, website: 'https://ejemplo.example/', verifiedAt: consultedAt })
  assert.equal(created.statusCode, 201)
  const orgId = created.json().id
  const source = await send('POST', '/api/prospects/' + orgId + '/sources', evidence)
  const observation = await send('POST', '/api/prospects/' + orgId + '/observations', {
    sourceId: source.json().id, level: 'OBSERVACION_PUBLICA', title: 'Formulario', category: 'Función comercial publicada',
    statement: 'Solicitud de reservas.', severity: 'INFORMATIVA', confidence: 'ALTA', impact: 'Operación comercial.',
    limitations: 'Fuente documental.', recommendation: 'Confirmar fecha.',
  })
  assert.equal(observation.statusCode, 201)
  assert.equal((await send('POST', '/api/observations/' + observation.json().id + '/review', human)).statusCode, 200)
  const metrics = (await send('GET', '/api/commercial/metrics')).json()
  assert.equal(metrics.verified, 0)
  assert.equal(metrics.pending, 1)
  assert.equal((await send('GET', '/api/retention')).json().prospectReviewDue, 1)
  const response = await send('POST', '/api/discovery/import', { ...human, file: { version: 1, records: [{
    ...prospect, name: 'Otra ficha de prueba', website: 'https://ejemplo.example/', evidence, applicationType: 'Reservas',
    opportunity: 'Coordinar una conversación.',
  }] } })
  assert.equal(response.statusCode, 400)
  assert.equal((await send('GET', '/api/commercial/metrics')).json().total, 1)
})
