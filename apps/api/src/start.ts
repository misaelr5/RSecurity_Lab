import { ensureData, databasePath, dataRoot } from './storage-paths.ts'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { startFixture } from '../../../fixtures/lab.ts'
import { createApp } from './app.ts'

const port = Number(process.env.REAC_PORT ?? '4310')
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('REAC_PORT debe estar entre 1024 y 65535.')
const bundle = resolve(import.meta.dirname, '../../web/dist')
if (!existsSync(resolve(bundle, 'index.html'))) throw new Error('Ejecutá npm run build para generar la interfaz.')
await ensureData()
const database = databasePath(process.env.REAC_DATABASE ?? 'reac.sqlite')
const fixture = await startFixture()
const app = createApp({ database, port, fixturePort: fixture.port, bundle, backupDir: resolve(dataRoot, 'backups'), logger: true })
try {
  await app.listen({ host: '127.0.0.1', port })
} catch {
  await fixture.close()
  await app.close()
  throw new Error('No se pudo iniciar en 127.0.0.1. Verificá que el puerto esté libre.')
}
async function stop() {
  await app.close()
  await fixture.close()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

