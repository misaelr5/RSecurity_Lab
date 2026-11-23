import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const filename = process.argv[2]
if (!filename) throw new Error('Especificá el archivo de investigación aprobado.')
const port = Number(process.env.REAC_PORT ?? '4324')
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto inválido.')
const root = 'http://127.0.0.1:' + port + '/api/v1'
const key = readFileSync(0, 'utf8').trim()
if (!key) throw new Error('El aprobador debe proporcionar la clave local por entrada estándar.')
const login = await fetch(root + '/operator/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) })
if (!login.ok) throw new Error('Falló el inicio de sesión operativa.')
const { sessionToken } = await login.json()
const authorization = 'Bearer ' + sessionToken
if (typeof sessionToken !== 'string') throw new Error('No se recibió la sesión de operador.')
async function call(path: string, data?: unknown) {
  const options: RequestInit = data === undefined ? { headers: { authorization } } : {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(data),
  }
  const response = await fetch(root + path, options)
  // Never emit response content or captured records on failure.
  if (!response.ok) throw new Error('Fallo de piloto en ' + path + ' con HTTP ' + response.status)
  return response.json()
}

try {
  const settings = await call('/settings')
  assert.equal(settings.database, 'reac-prospeccion.sqlite')
  assert.equal(settings.privateStorage, true)
  const file = JSON.parse(await readFile(filename, 'utf8'))
  const preview = await call('/discovery/preview', file)
  assert.equal(preview.length, 10)
  const imported = await call('/discovery/import', { file, reviewer: 'Fuentes públicas cotejadas durante el relevamiento de Reac Studio', acknowledge: true })
  const portfolio = await call('/prospects')
  const records = portfolio.items.filter((item: { name: string; city: string }) => preview.some((row: { name: string; city: string }) => row.name === item.name && row.city === item.city))
  assert.equal(records.length, 10)
  for (const item of records) {
    const detail = await call('/prospects/' + item.id)
    if (detail.org.origin !== 'DESCUBRIMIENTO_MANUAL_V1') continue
    if (!detail.drafts.length) await call('/prospects/' + item.id + '/drafts', { channel: 'Email' })
  }
  const transfer = await call('/crm/preview')
  assert.ok(transfer.length >= 10)
  console.log('PASS · ' + records.length + ' fichas con evidencia y borrador. Nuevas: ' + imported.imported)
} finally {
  await call('/operator/logout', {})
}
