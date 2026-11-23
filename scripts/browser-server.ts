import { scryptSync } from 'node:crypto'
import { resolve } from 'node:path'
import { createApp } from '../apps/api/src/app.ts'
import { startFixture } from '../fixtures/lab.ts'
const fixture = await startFixture()
const salt = '45'.repeat(16)
const auth = { salt, hash: scryptSync('clave-sintetica-de-pruebas-e2e', Buffer.from(salt, 'hex'), 64).toString('hex') }
const app = createApp({ database: ':memory:', port: 4331, fixturePort: fixture.port, bundle: resolve('apps/web/dist'), operator: auth })
await app.listen({ host: '127.0.0.1', port: 4331 })
process.once('SIGTERM', async () => { await app.close(); await fixture.close() })
