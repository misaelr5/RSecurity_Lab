import { readFile } from 'node:fs/promises'

const api = 'http://127.0.0.1:4320/api'
async function call(path: string, body?: object) {
  const response = await fetch(api + path, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('La demo recibió HTTP ' + response.status + ' al usar ' + path)
  return response.json()
}
if ((await call('/settings')).database !== 'reac-demo.sqlite') throw new Error('Usá la base dedicada reac-demo.sqlite para cargar la demo.')
const { total, lab } = await call('/dashboard')
if (!total) {
  const csv = await readFile(new URL('../fixtures/prospectos-demo.csv', import.meta.url), 'utf8')
  await call('/prospects/import', { csv, version: 1 })
}
const { items } = await call('/prospects?q=Taller+Cauce&region=Villa+Dolores')
const org = items.find((item: { name: string }) => item.name === 'Taller Cauce (ficticio)')
if (!org) throw new Error('No se encontró la ficha ficticia de la demo.')
const path = '/prospects/' + org.id
const detail = await call(path)
const source = detail.sources.find((item: { provider: string }) => item.provider === 'Catálogo de muestra') ?? await call(path + '/sources', {
  url: 'https://cauce.example/catalogo', consultedAt: '2026-11-22',
  provider: 'Catálogo de muestra', statement: 'El catálogo sintético describe un formulario de consultas comerciales.',
})
const note = detail.observations.find((item: { sourceId: string }) => item.sourceId === source.id) ?? await call(path + '/observations', {
  sourceId: source.id, category: 'Funcionalidad', title: 'Formulario comercial en el catálogo',
  statement: 'El material de muestra describe un formulario para iniciar consultas.',
  level: 'OBSERVACION_PUBLICA', severity: 'INFORMATIVA', confidence: 'ALTA',
  impact: 'Permitiría centralizar consultas de posibles clientes.',
  limitations: 'Evidencia ficticia. Alcance limitado al catálogo cargado.',
  recommendation: 'Si se acuerda una evaluación, confirmar requisitos y alcance con la empresa.',
})
if (!note.reviewedAt) await call('/observations/' + note.id + '/review', { reviewer: 'Operador de demo', acknowledge: true })
if (!detail.drafts.length) await call(path + '/drafts', {})
const assets = await call(path + '/assets')
if (!assets.some((item: { value: string }) => item.value === 'cauce.example')) {
  await call(path + '/assets', { sourceId: source.id, kind: 'Dominio', value: 'cauce.example', status: 'Confirmado con fuente',
    collectedAt: '2026-11-22', confidence: 'ALTA', note: 'El catálogo ficticio muestra este dominio reservado para ejemplos.' })
}
if ((await call(path + '/pipeline')).stage === 'Descubierto') {
  await call(path + '/pipeline', { stage: 'Verificado', note: 'Revisión de las fuentes de muestra.' })
}
const fixture = await readFile(new URL('../fixtures/resultados-defensivos-demo.json', import.meta.url), 'utf8')
await call('/reviews/import', JSON.parse(fixture))
if (!lab) await call('/lab/runs', { mode: 'LAB_LOCAL' })
process.stdout.write('Demo lista en http://127.0.0.1:4320/\n')
