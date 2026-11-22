import { basename, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

export const dataRoot = resolve(import.meta.dirname, '../../../data')
export function privateRoot() {
  if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA no está disponible en Windows.')
  return resolve(process.env.LOCALAPPDATA, 'ReacStudio', 'SecurityLab')
}
export const activeDataRoot = () => process.env.REAC_STORAGE === 'private' ? privateRoot() : dataRoot
export const ensureData = (root = dataRoot) => mkdir(root, { recursive: true, mode: 0o700 })
export function databasePath(filename: string, root = dataRoot) {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}\.sqlite$/i.test(filename)) throw new Error('Usá un nombre SQLite simple dentro de data/.')
  return resolve(root, filename)
}

export function backupDirectory(filename: string, root = dataRoot) {
  return resolve(root, 'backups', basename(databasePath(filename)).toLowerCase())
}
