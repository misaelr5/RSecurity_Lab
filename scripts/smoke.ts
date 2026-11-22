import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createApp } from '../apps/api/src/app.ts'
import { startFixture } from '../fixtures/lab.ts'

const probe = createServer()
probe.listen(0, '127.0.0.1')
await once(probe, 'listening')
const { port } = probe.address() as AddressInfo
await new Promise<void>((resolve) => probe.close(() => resolve()))
const fixture = await startFixture()
const app = createApp({ database: ':memory:', port, fixturePort: fixture.port, bundle: resolve('apps/web/dist') })
try {
  await app.listen({ host: '127.0.0.1', port })
  const base = 'http://127.0.0.1:' + port
  const home = await fetch(base)
  assert.match(await home.text(), /Reac Security Lab/)
  assert.match(home.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/)
  assert.equal((await (await fetch(base + '/api/health')).json()).status, 'PASS')
  const request = await fetch(base + '/api/lab/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"mode":"LAB_LOCAL"}' })
  assert.equal(request.status, 202)
  const { id } = await request.json()
  let latest
  for (let attempt = 0; attempt < 25; attempt++) {
    latest = await (await fetch(base + '/api/lab/runs/' + id)).json()
    if (latest.run.status !== 'RUNNING') break
    await delay(50)
  }
  assert.equal(latest.run.status, 'COMPLETED')
  assert.match(await (await fetch(base + '/api/reports/lab/' + id + '/export/md')).text(), /BORRADOR/)
  process.stdout.write('PASS · HTTP, SQLite, bundle, fixture local y reporte descargable\n')
} finally {
  await app.close()
  await fixture.close()
}

