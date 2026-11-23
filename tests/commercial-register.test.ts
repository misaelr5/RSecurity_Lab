import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readCrm, prospect } from '@reac/core'
import Fastify from 'fastify'
import { registerCommercialRegister } from '../apps/api/src/commercial-register.ts'
import { registerPortfolio } from '../apps/api/src/portfolio.ts'
import { openStore } from '../apps/api/src/store.ts'

test('historial comercial, métricas explícitas y exportaciones con filtros', async (t) => {
  const app = Fastify()
  const store = openStore(':memory:')
  t.after(async () => { await app.close(); store.db.close() })
  const portfolio = registerPortfolio(app, store)
  registerCommercialRegister(app, store, portfolio)
  const get = async (url: string) => {
    const response = await app.inject({ url })
    assert.equal(response.statusCode, 200, response.body)
    return response
  }
  const lot = store.insert('research_jobs', { state: 'COMPLETADO' })
  store.insert('research_jobs', { state: 'INVESTIGANDO' })
  const hotel = store.insert('organizations', {
    ...prospect.parse({
      name: '=Hotel Ejemplo', industry: 'Turismo', city: 'Córdoba', region: 'Córdoba Capital', status: 'Ganado',
      email: 'reservas@example.com', phone: '+54 351 555 0100', nextFollowUp: '2099-04-01',
      website: 'https://example.com/reservas?token=privado', sourceUrl: 'https://example.com/reservas?token=privado',
    }), campaignId: lot.id,
  })
  const engagement = store.insert('engagements', {}, hotel.id)
  const contact = store.insert('pipeline_events', { stage: 'Contactado', note: 'Llamada registrada' }, engagement.id)
  store.insert('pipeline_events', { stage: 'Respondió', note: 'Respuesta recibida' }, engagement.id)
  const source = store.insert('public_sources', { url: hotel.sourceUrl }, hotel.id)
  const observation = store.insert('observations', { level: 'OBSERVACION_PUBLICA', reviewedAt: '2026-11-01' }, source.id)
  store.log('Observación revisada', observation.id)
  store.insert('outreach_drafts', { subject: 'Aprobado', body: 'Texto aprobado', reviewedAt: '2026-11-01' }, hotel.id)
  store.insert('outreach_drafts', { subject: 'Pendiente', body: 'Texto pendiente' }, hotel.id)
  const excluded = store.insert('organizations', prospect.parse({
    name: 'Empresa excluida', industry: 'Turismo', city: 'Nono', region: 'Traslasierra', consent: 'Excluido',
  }))
  store.insert('outreach_drafts', { subject: 'Antes', body: 'Bloqueado', reviewedAt: '2026-11-01' }, excluded.id)
  store.insert('organizations', prospect.parse({
    name: 'Estado importado', industry: 'Turismo', city: 'Nono', region: 'Traslasierra', status: 'Contactado',
  }))
  const candidate = { name: 'Candidato sin ficha', city: 'Nono', region: 'Traslasierra', industry: 'Turismo',
    website: 'https://source.example/', evidence: { url: 'https://source.example/' } }
  store.insert('research_candidates', { record: candidate, outcome: 'EN_REVISION', reason: 'Fuente pendiente' }, lot.id)
  store.insert('research_candidates', { record: candidate, outcome: 'FUERA_DE_CUPO', reason: 'Cupo completo' }, lot.id)

  const matching = (await get('/api/commercial/companies?segment=contactadas&city=cordoba')).json()
  assert.deepEqual(matching.map((row: { id: string }) => row.id), [hotel.id])
  assert.equal(matching[0].lastContact, contact.createdAt)
  assert.equal((await get('/api/commercial/companies?region=traslasierra&status=No%20contactar')).json()[0].id, excluded.id)
  const history = (await get('/api/commercial/companies/' + hotel.id + '/history')).json()
  assert.equal(history.events.length, 2)
  assert.equal(history.history[0].action, 'Observación revisada')
  const research = (await get('/api/commercial/researched?segment=pendientes&campaign=' + lot.id)).json()
  assert.equal(research.length, 1)
  assert.equal(research[0].name, 'Candidato sin ficha')

  const metrics = (await get('/api/commercial/metrics')).json()
  assert.equal(metrics.total, 3)
  assert.equal(metrics.verified, 1)
  assert.equal(metrics.contacts, 1)
  assert.equal(metrics.responseRate, 1)
  assert.equal(metrics.conversionRate, 1)
  assert.equal(metrics.campaigns, 1)
  assert.equal(metrics.pendingCandidates, 1)
  assert.equal(metrics.weekly.length, 8)
  assert.deepEqual(metrics.followUps.map((entry: { id: string }) => entry.id), [hotel.id])

  const json = await get('/api/commercial/export?format=json&campaign=' + lot.id)
  assert.equal(json.json().companies[0].id, hotel.id)
  assert.doesNotMatch(json.body, /token=|reservas@example\.com|Texto aprobado/)
  const excel = await get('/api/commercial/export?format=csv&segment=verificadas')
  assert.match(excel.body, /'=Hotel Ejemplo/)
  const crm = await get('/api/commercial/export?format=crm&campaign=' + lot.id)
  const imported = readCrm(crm.body)
  assert.equal(imported.length, 1)
  assert.equal(imported[0].original.email, hotel.email)
  assert.equal(imported[0].original.proximo_seguimiento, hotel.nextFollowUp)
  assert.equal(imported[0].original.mensaje, 'Texto aprobado')
  const suppressed = readCrm((await get('/api/commercial/export?format=crm&segment=excluidas')).body)[0]
  assert.equal(suppressed.original.estado, 'No contactar')
  assert.equal(suppressed.original.mensaje, '')
})
