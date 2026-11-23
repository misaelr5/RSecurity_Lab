import Fastify from 'fastify'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { openStore } from '../apps/api/src/store.ts'
import { registerPortfolio } from '../apps/api/src/portfolio.ts'
import { registerHistory } from '../apps/api/src/history.ts'

function setup(t: TestContext) {
  const app = Fastify()
  const store = openStore(':memory:')
  const portfolio = registerPortfolio(app, store)
  registerHistory(app, store, portfolio)
  t.after(async () => { await app.close(); store.db.close() })
  const get = (url: string) => app.inject({ url })
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload })
  return { get, post, store }
}

const urls = { write: '/api/history/import', read: '/api/history/export' }
const hotel = {
  name: '=Hospedaje Ejemplo', city: 'Nono', region: 'Traslasierra', industry: 'Turismo', applicationType: 'Reservas',
  website: 'https://hospedaje.example/?token=credencial', sourceUrl: 'https://hospedaje.example/reservas?token=credencial',
  verifiedAt: '2026-11-22', status: 'No contactar', consent: 'Excluido', contact: 'Canal interno',
  email: 'privado@example.com', phone: '+54 351 555 1234', notes: 'Texto privado sin trazabilidad',
}

test('historial filtrado reproduce identificadores, exclusiones, evidencias e hitos comerciales', async (t) => {
  const source = setup(t)
  const target = setup(t)
  const campaign = source.store.insert('campaigns', {
    name: 'Alojamientos', objective: 'Objetivo interno confidencial', region: 'Traslasierra', industry: 'Turismo', targetCount: null, status: 'ACTIVA',
  }, null, 'alojamientos')
  const lot = source.store.insert('research_jobs', { state: 'COMPLETADO', goal: 1, provider: 'manual', requestHash: 'sensible', campaignId: campaign.id })
  const created = await source.post('/api/prospects', hotel)
  assert.equal(created.statusCode, 201, created.body)
  const org = created.json()
  source.store.update('organizations', org.id, { ...org, campaignId: lot.id,
    knownIdentities: ['domain:anterior.example', 'email:interno@example.com', 'phone:3515559999'] })
  const member = source.store.insert('campaign_memberships', { campaignId: campaign.id, origin: 'INVESTIGACION', jobId: lot.id }, org.id, campaign.id + ':' + org.id)
  const engagement = source.store.list('engagements', org.id)[0]
  const contact = source.store.list('contacts', org.id)[0]
  const contactEvent = source.store.insert('pipeline_events', { stage: 'Contactado', note: 'Texto de interacción privado' }, engagement.id)
  const documentary = source.store.insert('pipeline_events', { stage: 'Autorizado', note: 'Documento confidencial' }, engagement.id)
  const evidence = source.store.list('public_sources', org.id)[0]
  const verified = source.store.insert('observations', { level: 'OBSERVACION_PUBLICA', confidence: 'ALTA', reviewedAt: new Date().toISOString() }, evidence.id)
  source.store.insert('authorizations', { evidence: 'Ruta privada que no se exporta' }, engagement.id)
  const researched = source.store.insert('research_candidates', { record: { name: 'Candidato Ejemplo', city: 'Nono', region: 'Traslasierra',
    industry: 'Turismo', applicationType: 'Reservas', website: 'https://candidato.example/', evidence: { url: 'https://candidato.example/consulta',
      consultedAt: '2026-11-22', statement: 'Texto fuente privado' }, confidence: 'MEDIA' }, outcome: 'EXCLUIDO', reviewedAt: new Date().toISOString(),
    reviewer: 'Revisión local', reason: 'Datos ausentes' }, lot.id)
  await source.post('/api/prospects', { name: 'Empresa en otra localidad', city: 'Córdoba', region: 'Córdoba Capital', industry: 'Comercio' })
  const day = org.createdAt.slice(0, 10)
  const filter = `city=nono&region=traslasierra&industry=turismo&campaign=${campaign.id}&lot=${lot.id}&from=${day}&to=${day}`
  const exportResponse = await source.get(urls.read + '?' + filter)
  assert.equal(exportResponse.statusCode, 200, exportResponse.body)
  const archive = exportResponse.json()
  assert.equal(archive.companies.length, 1)
  assert.equal(archive.companies[0].id, org.id)
  assert.equal(archive.companies[0].milestones.length, 2)
  assert.equal(archive.candidates[0].id, researched.id)
  assert.deepEqual(archive.companies[0].knownIdentities, ['domain:anterior.example'])
  assert.doesNotMatch(exportResponse.body, /credencial|privado|confidencial|sensible|Ruta privada|1234|interno@|5559999/)
  assert.match((await source.get(urls.read + '?format=csv&' + filter)).body, /'=Hospedaje Ejemplo/)
  assert.match((await source.get(urls.read + '?format=crm&' + filter)).body, /No contactar/)
  const geo = (await source.get(urls.read + '?format=geojson&' + filter)).json()
  assert.equal(geo.features.length, 2)
  assert.equal(geo.features[0].id, org.id)
  assert.equal(geo.features[0].geometry.type, 'Point')
  assert.equal(geo.features[0].properties.precision, 'LOCALIDAD_APROXIMADA')
  assert.equal((await source.get(urls.read + '?archived=included')).json().companies.length, 0)
  assert.equal((await source.get(urls.read + '?from=2026-11-22&to=2026-11-21')).statusCode, 400)

  const restored = await target.post(urls.write, { archive, acknowledge: true })
  assert.equal(restored.statusCode, 200, restored.body)
  assert.deepEqual(restored.json(), { restored: 1, unchanged: 0, conflicts: 0, candidates: 1, campaigns: 1, lots: 1, exclusions: 1 })
  assert.equal(target.store.find('organizations', org.id)?.createdAt, org.createdAt)
  assert.equal(target.store.find<{ status: string }>('organizations', org.id)?.status, 'No contactar')
  assert.equal(target.store.find('contacts', contact.id)?.parent, org.id)
  assert.equal(target.store.find('observations', verified.id)?.parent, evidence.id)
  assert.equal(target.store.find('pipeline_events', contactEvent.id)?.parent, engagement.id)
  assert.equal(target.store.find('pipeline_events', documentary.id), undefined)
  assert.equal(target.store.count('authorizations'), 0)
  assert.equal(target.store.find('research_candidates', researched.id)?.parent, lot.id)
  assert.equal(target.store.find<{ reviewer?: string }>('research_candidates', researched.id)?.reviewer, 'Revisión local')
  assert.equal(target.store.find<{ campaignId: string }>('campaign_memberships', member.id)?.campaignId, campaign.id)

  const second = await target.post(urls.write, { archive, acknowledge: true })
  assert.deepEqual(second.json(), { restored: 0, unchanged: 1, conflicts: 0, candidates: 0, campaigns: 0, lots: 0, exclusions: 0 })
  const reexport = (await target.get(urls.read + '?city=Nono')).json()
  assert.ok(reexport.companies[0].milestones.some((item: { id: string }) => item.id === documentary.id))
  assert.equal(reexport.companies[0].verifiedAt, org.verifiedAt)
  const older = structuredClone(archive)
  older.companies[0].status = 'Nuevo'
  older.companies[0].consent = 'Sin registro'
  older.companies[0].verifiedAt = ''
  assert.equal((await target.post(urls.write, { archive: older, acknowledge: true })).json().unchanged, 1)
  assert.equal(target.store.find<{ status: string }>('organizations', org.id)?.status, 'No contactar')
  assert.equal(target.store.find<{ verifiedAt: string }>('organizations', org.id)?.verifiedAt, org.verifiedAt)
})

test('historial rechaza campos externos y conflictos de relaciones sin escritura parcial', async (t) => {
  const source = setup(t)
  const target = setup(t)
  await source.post('/api/prospects', hotel)
  await source.post('/api/prospects', { ...hotel, name: 'Segunda ficha' })
  const { companies, ...archive } = (await source.get(urls.read)).json()
  const payload = { archive: { ...archive, companies }, acknowledge: true }
  const missingOwner = { ...payload, archive: { ...payload.archive, companies: [{ ...companies[0], campaignId: randomUUID() }] } }
  assert.equal((await target.post(urls.write, missingOwner)).statusCode, 400)
  const unlisted = { ...payload, archive: { ...payload.archive, authorizations: [] } }
  assert.equal((await target.post(urls.write, unlisted)).statusCode, 400)
  assert.equal(target.store.count('organizations'), 0)
  const stable = (await target.post('/api/prospects', { name: 'Existente', city: 'Nono', region: 'Traslasierra', industry: 'Turismo' })).json()
  companies[1].contact.id = target.store.list('contacts', stable.id)[0].id
  assert.equal((await target.post(urls.write, payload)).statusCode, 409)
  assert.equal(target.store.count('organizations'), 1)
  assert.equal(target.store.count('contacts'), 1)
})
