import assert from 'node:assert/strict'
import { test } from 'node:test'
import { discoveryRecord, prospect } from '@reac/core'
import Fastify from 'fastify'
import { proposeResearchEnrichment, registerEnrichment } from '../apps/api/src/enrichment.ts'
import { openStore } from '../apps/api/src/store.ts'

const date = new Date().toISOString().slice(0, 10)
const source = { url: 'https://hotel.example/reservas', consultedAt: date, provider: 'Hotel ficticio', statement: 'Publica la dirección y el canal de reservas.' }

test('enriquecimiento compara evidencia, aplica una selección y conserva contacto y estado previos', async (t) => {
  const store = openStore(':memory:')
  const app = Fastify()
  registerEnrichment(app, store)
  t.after(async () => { await app.close(); store.db.close() })
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload })
  const org = store.insert('organizations', prospect.parse({
    name: 'Hotel ficticio', website: 'https://hotel.example/', status: 'Respondió', consent: 'Aceptó contacto', city: 'Nono',
    region: 'Traslasierra', industry: 'Turismo', address: 'Domicilio anterior', email: 'vigente@hotel.example',
    verifiedAt: '2021-01-01', sourceUrl: 'https://hotel.example/archivo', nextFollowUp: '2030-08-01',
  }))
  const contact = store.insert('contacts', { contact: org.contact, email: org.email, phone: org.phone, consent: org.consent }, org.id)
  const engagement = store.insert('engagements', { status: org.status, nextFollowUp: org.nextFollowUp }, org.id)
  const draft = store.insert('outreach_drafts', { subject: 'Existente', body: 'Contenido revisado.', reviewedAt: '2021-01-01' }, org.id)
  const path = '/api/prospects/' + org.id + '/enrichment'
  const payload = { provider: 'ORCA', source, fields: { address: 'Domicilio publicado', email: 'distinto@hotel.example', applicationType: 'Reservas' } }
  const creation = await post(path, payload)
  assert.equal(creation.statusCode, 201, creation.body)
  const proposal = creation.json()
  assert.equal((await post(path, payload)).json().id, proposal.id)
  assert.deepEqual(proposal.comparison.map((row: { disposition: string }) => row.disposition), ['ACTUALIZABLE', 'NUEVO', 'CONSERVAR_EXISTENTE'])
  assert.equal(store.count('public_sources'), 0)
  assert.equal((await post(path, { ...payload, source: { ...source, url: 'https://hotel.example.unrelated.example/' } })).statusCode, 400)
  assert.equal((await post(path, { ...payload, fields: { consent: 'Aceptó contacto' } })).statusCode, 400)
  const url = path + '/' + proposal.id + '/review'
  const review = { decision: 'APROBAR', reviewer: 'Operador', contentVersion: proposal.contentVersion, acknowledge: true }
  assert.equal((await post(url, { ...review, fields: ['email'] })).statusCode, 409)
  assert.equal((await post(url, { ...review, fields: ['address'], contentVersion: '0'.repeat(64) })).statusCode, 409)
  assert.equal((await post(url, { ...review, fields: ['address', 'applicationType'] })).statusCode, 200)
  assert.equal((await post(url, { ...review, fields: ['address'] })).statusCode, 409)
  const result = store.find<typeof org>('organizations', org.id)!
  assert.equal(result.address, 'Domicilio publicado')
  assert.equal(result.applicationType, 'Reservas')
  assert.equal(result.email, org.email)
  assert.equal(result.sourceUrl, org.sourceUrl)
  assert.equal(result.verifiedAt, org.verifiedAt)
  assert.equal(result.status, org.status)
  assert.equal(result.consent, org.consent)
  assert.equal(result.nextFollowUp, org.nextFollowUp)
  assert.deepEqual(store.find('contacts', contact.id), contact)
  assert.deepEqual(store.find('engagements', engagement.id), engagement)
  assert.deepEqual(store.find('outreach_drafts', draft.id), draft)
  assert.equal(store.count('public_sources'), 1)
  const approved = (await app.inject({ url: path })).json()[0]
  assert.deepEqual(approved.appliedFields, ['address', 'applicationType'])
  assert.equal(approved.comparison[0].current, 'Domicilio anterior')
  assert.equal(approved.reviewer, 'Operador')

  const newPhone = '+54 (351) 555-0101'
  const missing = (await post(path, { ...payload, fields: { phone: newPhone } })).json()
  assert.equal(missing.comparison[0].disposition, 'NUEVO')
  const fill = await post(path + '/' + missing.id + '/review', { ...review, fields: ['phone'], contentVersion: missing.contentVersion })
  assert.equal(fill.statusCode, 200, fill.body)
  assert.equal(store.find<typeof org>('organizations', org.id)?.phone, newPhone)
  assert.equal(store.find<typeof contact>('contacts', contact.id)?.phone, newPhone)
  assert.equal(store.find<typeof contact>('contacts', contact.id)?.email, org.email)
})

test('exclusión sobreviniente bloquea un borrador de investigación y mantiene el historial de rechazo', async (t) => {
  const store = openStore(':memory:')
  const app = Fastify()
  registerEnrichment(app, store)
  t.after(async () => { await app.close(); store.db.close() })
  const org = store.insert('organizations', prospect.parse({ name: 'Hotel ficticio', city: 'Nono', website: 'https://hotel.example/', region: 'Traslasierra', industry: 'Turismo' }))
  const record = discoveryRecord.parse({ name: org.name, city: org.city, region: org.region, industry: org.industry,
    website: org.website, evidence: source, opportunity: 'Revisar la atención comercial.', applicationType: 'Reservas' })
  const job = store.insert('research_jobs', {})
  const candidate = store.insert('research_candidates', { record }, job.id)
  const ref = { jobId: job.id, candidateId: candidate.id }
  const draft = store.transaction(() => proposeResearchEnrichment(store, org.id, record, ref))
  assert.deepEqual(draft.research, ref)
  assert.equal(store.find<typeof org>('organizations', org.id)?.applicationType, undefined)
  const path = '/api/prospects/' + org.id + '/enrichment'
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload })
  const reviewPath = path + '/' + draft.id + '/review'
  store.update('organizations', org.id, { ...org, status: 'No contactar', consent: 'Excluido' })
  const review = { reviewer: 'Operador', acknowledge: true, contentVersion: draft.contentVersion }
  assert.equal((await post(reviewPath, { ...review, decision: 'APROBAR', fields: ['applicationType'] })).statusCode, 409)
  const blocked = (await app.inject({ url: path })).json()[0]
  assert.equal(blocked.comparison[0].disposition, 'BLOQUEADO')
  assert.equal((await post(path, { provider: 'MANUAL', source, fields: { applicationType: 'Reservas' } })).statusCode, 409)
  const rejected = await post(reviewPath, { ...review, decision: 'RECHAZAR', contentVersion: blocked.contentVersion })
  assert.equal(rejected.json().state, 'RECHAZADA')
  assert.equal(store.count('public_sources'), 0)
})
