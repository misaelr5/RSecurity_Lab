import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

export const dataRoot = resolve(import.meta.dirname, '../../../data')
export const ensureData = () => mkdir(dataRoot, { recursive: true })
export function databasePath(filename: string) {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}\.sqlite$/i.test(filename)) throw new Error('Usá un nombre SQLite simple dentro de data/.')
  return resolve(dataRoot, filename)
}

