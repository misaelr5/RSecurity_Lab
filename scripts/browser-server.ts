import { resolve } from 'node:path'
import { createApp } from '../apps/api/src/app.ts'
import { startFixture } from '../fixtures/lab.ts'
const fixture = await startFixture()
const app = createApp({ database: ':memory:', port: 4331, fixturePort: fixture.port, bundle: resolve('apps/web/dist') })
await app.listen({ host: '127.0.0.1', port: 4331 })
process.once('SIGTERM', async () => { await app.close(); await fixture.close() })

