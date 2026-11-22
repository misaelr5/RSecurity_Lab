import { ensureData, databasePath, backupDirectory, privateRoot, activeDataRoot } from './storage-paths.ts'
import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { startFixture } from '../../../fixtures/lab.ts'
import { createApp } from './app.ts'
import { readOperator } from './operator.ts'

const port = Number(process.env.REAC_PORT ?? '4310')
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('REAC_PORT debe estar entre 1024 y 65535.')
const bundle = resolve(import.meta.dirname, '../../web/dist')
if (!existsSync(resolve(bundle, 'index.html'))) throw new Error('Ejecutá npm run build para generar la interfaz.')
const root = activeDataRoot()
await ensureData(root)
const filename = process.env.REAC_DATABASE ?? 'reac.sqlite'
const database = databasePath(filename, root)
const demo = process.env.REAC_DEMO === '1'
if (demo && (filename !== 'reac-demo.sqlite' || process.env.REAC_STORAGE === 'private')) throw new Error('REAC_DEMO solo se admite con reac-demo.sqlite en el workspace.')
const operator = demo ? undefined : readOperator(readFileSync(resolve(privateRoot(), 'operator.json'), 'utf8'))
const fixture = await startFixture()
let app: ReturnType<typeof createApp>
try {
  app = createApp({ database, port, fixturePort: fixture.port, bundle, backupDir: backupDirectory(filename, root), logger: true, operator })
} catch (error) {
  await fixture.close()
  throw error
}
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
