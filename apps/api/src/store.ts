import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'

export const schemaVersion = 1
type Table = 'organizations' | 'contacts' | 'engagements' | 'public_sources' | 'observations' | 'outreach_drafts' | 'authorizations' | 'scope_assets' | 'audit_runs' | 'findings' | 'evidence_refs' | 'activity_log' | 'report_reviews'
type Row<T> = T & { id: string; parent: string | null; createdAt: string; updatedAt: string }

const relations: Record<Table, Table | null> = {
  organizations: null, contacts: 'organizations', engagements: 'organizations',
  public_sources: 'organizations', observations: 'public_sources', outreach_drafts: 'organizations',
  authorizations: 'engagements', scope_assets: 'authorizations', audit_runs: null,
  findings: 'audit_runs', evidence_refs: 'audit_runs', activity_log: null, report_reviews: null,
}

export function openStore(path: string) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA busy_timeout=2000; PRAGMA foreign_keys=ON;')
  try {
    const version = db.prepare('PRAGMA user_version').get()?.user_version
    if (version !== 0 && version !== schemaVersion) throw new Error('Versión de SQLite incompatible.')
    if (version === 0) {
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const [table, parent] of Object.entries(relations)) {
          db.exec('CREATE TABLE ' + table + ' (id TEXT PRIMARY KEY NOT NULL, parent TEXT ' +
            (parent ? 'NOT NULL REFERENCES ' + parent + '(id) ON DELETE CASCADE' : 'CHECK(parent IS NULL)') +
            ', unique_key TEXT UNIQUE, data TEXT NOT NULL CHECK(json_valid(data)), created TEXT NOT NULL, updated TEXT NOT NULL) STRICT;')
          if (parent) db.exec('CREATE INDEX ' + table + '_parent ON ' + table + '(parent);')
        }
        db.exec('PRAGMA user_version = 1; COMMIT;')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  } catch (error) {
    db.close()
    throw error
  }

  const decode = <T>(row: Record<string, unknown>): Row<T> => ({
    ...JSON.parse(String(row.data)) as T,
    id: String(row.id), parent: row.parent as string | null,
    createdAt: String(row.created), updatedAt: String(row.updated),
  })
  function list<T>(table: Table, parent?: string) {
    const rows = parent === undefined
      ? db.prepare('SELECT * FROM ' + table + ' ORDER BY created DESC, rowid DESC').all()
      : db.prepare('SELECT * FROM ' + table + ' WHERE parent=? ORDER BY created DESC, rowid DESC').all(parent)
    return rows.map(decode<T>)
  }
  function count(table: Table) {
    return Number(db.prepare('SELECT COUNT(*) AS total FROM ' + table).get()?.total)
  }
  function find<T>(table: Table, id: string, column: 'id' | 'unique_key' = 'id') {
    const row = db.prepare('SELECT * FROM ' + table + ' WHERE ' + column + '=?').get(id)
    return row ? decode<T>(row) : undefined
  }
  function insert<T>(table: Table, data: T, parent: string | null = null, key: string | null = null) {
    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO ' + table + ' VALUES(?,?,?,?,?,?)').run(id, parent, key, JSON.stringify(data), now, now)
    return find<T>(table, id)!
  }
  function update<T>(table: Table, id: string, data: T, key?: string) {
    const now = new Date().toISOString()
    db.prepare('UPDATE ' + table + ' SET data=?, updated=?, unique_key=COALESCE(?,unique_key) WHERE id=?').run(JSON.stringify(data), now, key ?? null, id)
    return find<T>(table, id)!
  }
  function remove(table: Table, id: string) {
    db.prepare('DELETE FROM ' + table + ' WHERE id=?').run(id)
  }
  function transaction<T>(run: () => T) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = run()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  function log(action: string, entity?: string) {
    insert('activity_log', { action, entity, actor: 'operador local' })
  }
  return { db, list, count, find, insert, update, remove, transaction, log }
}
export type Store = ReturnType<typeof openStore>

