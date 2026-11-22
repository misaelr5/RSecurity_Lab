import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalize, organizationKey, observation, readCrm, redact, scopePolicy } from '@reac/core'
import { csvCell, renderReport } from '@reac/reporting'

test('CSV de muestra conserva columnas y asigna las tres regiones', async () => {
  const data = await readFile(new URL('../fixtures/prospectos-demo.csv', import.meta.url), 'utf8')
  const rows = readCrm('\uFEFF' + data)
  assert.deepEqual(rows.map((row) => row.result.success && row.result.data.region), ['Villa Dolores', 'Traslasierra', 'Córdoba Capital'])
  assert.equal(rows[1].original.presencia_web, 'Con web')
  assert.equal(rows[2].original.consentimiento, 'Excluido')
  assert.throws(() => readCrm('empresa,rubro,ciudad,empresa\nA,B,C,D'))
  assert.throws(() => readCrm('empresa,rubro,ciudad\n"A,B,C'))
  assert.throws(() => readCrm(''))
  assert.equal(readCrm('empresa,rubro,ciudad\nA,B,C\n')[0].result.success, true)
  const reversed = readCrm("empresa;rubro;ciudad;telefono;notas\nA;B;C;'+54 111111;''=literal")[0]
  if (!reversed.result.success) throw new Error('CSV separado por punto y coma inválido')
  assert.equal(reversed.original.telefono, "'+54 111111")
  assert.equal(reversed.result.data.phone, '+54 111111')
  assert.equal(reversed.result.data.notes, "'=literal")
  assert.match(csvCell(reversed.result.data.notes), /^"''=/)
  assert.equal(normalize('  Córdoba-Capital '), 'cordoba capital')
  if (!rows[0].result.success) throw new Error('Fixture incorrecto')
  const item = rows[0].result.data
  assert.equal(organizationKey(item), organizationKey({ ...item, name: 'TALLER CAUCE FICTICIO', city: 'villa dolores' }))
})

test('prospección no eleva heurísticas a hallazgos confirmados', () => {
  assert.equal(observation.shape.level.safeParse('HALLAZGO_CONFIRMADO').success, false)
  assert.equal(observation.shape.level.safeParse('POTENCIAL_RIESGO').success, true)
})

test('CSV neutraliza fórmulas, incluidos prefijos invisibles; HTML y MD escapan contenido', () => {
  for (const value of ['=2+2', '   +2', '\tvalor', '\ncontenido', '\uFEFF@nombre', ' -2', '＝2']) {
    assert.ok(csvCell(value).startsWith('"\''))
  }
  const report = { title: '<script>alert(1)</script>', sections: [{ title: 'Caso', lines: ['[enlace](javascript:alert(1))', 'ok\n# extra'] }] }
  const html = renderReport(report, 'html')
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>/)
  const md = renderReport(report, 'md')
  assert.match(md, /BORRADOR/)
  assert.doesNotMatch(md, /\n# extra|\[enlace\]\(javascript:/)
})

test('redacción reduce tokens, cookies y contraseñas antes de exportar informes', () => {
  const value = redact('Token=abc; password="muy secreto" api_key: xyz Cookie: session=xyz')
  assert.doesNotMatch(value, /abc|muy secreto|xyz/)
})
test('policy comprueba método, puerto, ruta y dirección literal antes del transporte', () => {
  const target = { mode: 'LAB_LOCAL' as const, hostname: '127.0.0.1', port: 9900, path: '/fixture', method: 'HEAD' }
  assert.equal(scopePolicy(target, 9900).allowed, true)
  for (const changed of [
    { hostname: 'localhost' }, { hostname: '127.0.0.2' }, { hostname: '::1' },
    { hostname: '169.254.169.254' }, { hostname: 'rebind.example' }, { hostname: 'good.example@127.0.0.1' }, { port: 9901 }, { path: '/fixture?next=other' }, { method: 'GET' },
    { mode: 'PROSPECCION_PASIVA' as const }, { mode: 'AUDITORIA_AUTORIZADA' as const },
  ]) assert.equal(scopePolicy({ ...target, ...changed }, 9900).allowed, false)
})
