import { backup, DatabaseSync } from 'node:sqlite'
import { constants } from 'node:fs'
import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { schemaVersion, tablesForVersion } from './store.ts'

export const backupName = /^reac-backup-[a-f0-9-]{36}\.sqlite$/

export function verifyBackup(path: string) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const names = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map((entry) => entry.name))
    const version = Number(db.prepare('PRAGMA user_version').get()?.user_version)
    const tables = tablesForVersion(version)
    if (![1, schemaVersion].includes(version) || tables.some((table) => !names.has(table)) ||
      db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Respaldo incompatible o dañado.')
    for (const table of tables) db.prepare('SELECT id, parent, unique_key, data, created, updated FROM ' + table + ' LIMIT 0').all()
  } finally { db.close() }
}

export async function createBackup(db: DatabaseSync, dir: string) {
  await mkdir(dir, { recursive: true })
  const filename = 'reac-backup-' + randomUUID() + '.sqlite'
  const temporary = resolve(dir, filename + '.partial')
  try {
    await backup(db, temporary)
    verifyBackup(temporary)
    await rename(temporary, resolve(dir, filename))
    return filename
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function restoreBackup(source: string, output: string) {
  verifyBackup(source)
  await copyFile(source, output, constants.COPYFILE_EXCL)
  try {
    verifyBackup(output)
  } catch (error) {
    await rm(output)
    throw error
  }
}
