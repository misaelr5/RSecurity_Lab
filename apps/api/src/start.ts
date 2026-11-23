import { ensureData, databasePath, backupDirectory, privateRoot, activeDataRoot } from './storage-paths.ts'
import { resolve } from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { discoveryFile } from '@reac/core'
import { startFixture } from '../../../fixtures/lab.ts'
import { createApp } from './app.ts'
import { CodexCLIProvider } from './ai-provider.ts'
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
const operatorFile = demo ? undefined : resolve(privateRoot(), 'operator.json')
if (operatorFile && !existsSync(operatorFile)) throw new Error('Prepará el operador con scripts/operator.ps1 antes de iniciar.')
const operator = operatorFile ? readOperator(readFileSync(operatorFile, 'utf8')) : undefined
const catalogName = process.env.REAC_RESEARCH_CATALOG
let researchCatalog
if (catalogName) {
  if (demo) throw new Error('La demo sin sesión admite únicamente sus datos ficticios.')
  if (!/^[a-z0-9][a-z0-9_-]{0,79}\.json$/i.test(catalogName)) throw new Error('Usá un nombre JSON simple para el catálogo local.')
  const catalogPath = resolve(root, catalogName)
  const info = statSync(catalogPath, { throwIfNoEntry: false })
  if (!info?.isFile() || info.size > 500_000) throw new Error('El catálogo local debe ser un JSON de hasta 500 KB en la carpeta de datos.')
  try { researchCatalog = discoveryFile.parse(JSON.parse(readFileSync(catalogPath, 'utf8').replace(/^\uFEFF/, ''))) }
  catch { throw new Error('El catálogo local no cumple el esquema de descubrimiento v1.') }
}
const fixture = await startFixture()
let app: ReturnType<typeof createApp>
try {
  app = createApp({ database, port, fixturePort: fixture.port, bundle, backupDir: backupDirectory(filename, root), logger: true, operator, privateStorage: process.env.REAC_STORAGE === 'private',
    researchCatalog, aiProvider: process.env.REAC_CODEX_ENABLED === '1' ? new CodexCLIProvider() : undefined })
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
