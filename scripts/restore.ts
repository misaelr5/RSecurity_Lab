import { constants } from 'node:fs'
import { copyFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { backupName } from '../apps/api/src/app.ts'
import { dataRoot, databasePath } from '../apps/api/src/storage-paths.ts'
import { schemaVersion } from '../apps/api/src/store.ts'

const [source, target] = process.argv.slice(2)
if (!source || !target || !backupName.test(source)) throw new Error('Usá npm run restore -- reac-backup-UUID.sqlite nombre-nuevo.sqlite')
const output = databasePath(target)
await copyFile(resolve(dataRoot, 'backups', source), output, constants.COPYFILE_EXCL)
try {
  const db = new DatabaseSync(output, { readOnly: true })
  try {
    if (db.prepare('PRAGMA user_version').get()?.user_version !== schemaVersion ||
      db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Respaldo incompatible o dañado.')
  } finally { db.close() }
} catch (error) {
  await rm(output)
  throw error
}
process.stdout.write('Restauración validada en data/' + target + '. Elegí ese nombre en REAC_DATABASE para abrirla.\n')

