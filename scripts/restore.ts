import { resolve } from 'node:path'
import { backupName, restoreBackup } from '../apps/api/src/backups.ts'
import { backupDirectory, activeDataRoot, databasePath } from '../apps/api/src/storage-paths.ts'

const [source, target, option, ...extra] = process.argv.slice(2)
if (!source || !target || !backupName.test(source) || extra.length || (option && option !== '--legacy')) {
  throw new Error('Usá npm run restore -- reac-backup-UUID.sqlite nombre-nuevo.sqlite [--legacy]')
}
const root = activeDataRoot()
const dir = option === '--legacy' ? resolve(root, 'backups') : backupDirectory(process.env.REAC_DATABASE ?? 'reac.sqlite', root)
await restoreBackup(resolve(dir, source), databasePath(target, root))
process.stdout.write('Restauración validada en ' + target + '. Elegí ese nombre en REAC_DATABASE para abrirla.\n')
