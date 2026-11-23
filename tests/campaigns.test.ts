import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { prospect } from '@reac/core'
import Fastify from 'fastify'
import { addCampaignMember, registerCampaigns } from '../apps/api/src/campaigns.ts'
import { openStore } from '../apps/api/src/store.ts'

test('campañas agrupan fichas sin duplicar y miden hitos explícitos durante la pertenencia', async (t) => {
  const store = openStore(':memory:')
  const app = Fastify()
  registerCampaigns(app, store)
  t.after(async () => { await app.close(); store.db.close() })
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload })
  const org = (name: string, status = 'Nuevo') => store.insert('organizations', prospect.parse({ name, status, industry: 'Turismo', city: 'Nono', region: 'Traslasierra' }))
  const old = org('Viejo')
  const next = org('Actual', 'Ganado')
  const other = org('Solo respuesta', 'Ganado')
  const excluded = org('Excluida', 'No contactar')
  const discarded = org('Descartada', 'Perdido')
  const archived = org('Archivada')
  store.update('organizations', archived.id, { ...archived, archivedAt: new Date().toISOString() })
  const created = await post('/api/campaigns', { name: 'Ronda A', region: 'Traslasierra', industry: 'Turismo', targetCount: 20 })
  assert.equal(created.statusCode, 201, created.body)
  const campaign = created.json()
  const path = '/api/campaigns/' + campaign.id
  assert.equal(campaign.targetCount, 20)
  assert.equal(campaign.metrics.responseRate, null)
  assert.equal((await post('/api/campaigns', { name: 'RONDA Á' })).statusCode, 409)

  const attached = await post(path + '/members', { organizationIds: [old.id, next.id, next.id, other.id, excluded.id, discarded.id, archived.id] })
  assert.deepEqual(attached.json(), { added: 3, existing: 0, excluded: 3 })
  assert.deepEqual((await post(path + '/members', { organizationIds: [next.id] })).json(), { added: 0, existing: 1, excluded: 0 })
  assert.equal((await post(path + '/members', { organizationIds: [randomUUID()] })).statusCode, 404)

  const sameOrgAnotherCampaign = (await post('/api/campaigns', { name: 'Ronda B' })).json()
  const job = store.insert('research_jobs', { campaignId: sameOrgAnotherCampaign.id, state: 'COMPLETADO' })
  assert.equal(store.transaction(() => addCampaignMember(store, sameOrgAnotherCampaign.id, next.id, 'INVESTIGACION', job.id)), 'added')
  const research = store.insert('research_jobs', { campaignId: campaign.id, state: 'COMPLETADO' })
  store.insert('research_candidates', { record: { name: 'Hotel Solar', city: 'Nono', industry: 'Turismo' } }, research.id)
  store.insert('research_candidates', { record: { name: 'Hótel Solar', city: 'Nono', industry: 'Turismo' } }, research.id)
  store.insert('research_candidates', { record: { name: 'Otro hotel', city: 'Villa Dolores', industry: 'Turismo' } }, research.id)
  const before = (await app.inject({ url: path })).json()
  const member = before.members.find((row: { organizationId: string }) => row.organizationId === next.id)
  const timelineAt = Date.parse(member.joinedAt)
  function events(organizationId: string, rows: [string, number][]) {
    const engagement = store.insert('engagements', {}, organizationId)
    for (const [stage, offset] of rows) {
      const createdAt = new Date(timelineAt + offset).toISOString()
      store.restoreRow('pipeline_events', { id: randomUUID(), parent: engagement.id, createdAt, updatedAt: createdAt }, { stage })
    }
  }
  events(old.id, [['Contactado', -2000], ['Respondió', 2000]])
  events(next.id, [['Contactado', 1000], ['Respondió', 2000], ['Reunión', 3000], ['Propuesta comercial enviada', 4000], ['Cliente', 5000]])
  events(other.id, [['Respondió', 2000], ['Auditoría propuesta', 3000]])
  const evidence = store.insert('public_sources', {}, next.id)
  store.insert('observations', { reviewedAt: new Date().toISOString(), level: 'OBSERVACION_PUBLICA' }, evidence.id)
  store.update('organizations', old.id, { ...old, status: 'No contactar' })
  store.insert('outreach_drafts', { subject: 'Pendiente' }, next.id)
  store.insert('outreach_drafts', { subject: 'Aprobado', reviewedAt: new Date().toISOString() }, next.id)
  store.insert('outreach_drafts', { subject: 'Retenido' }, old.id)
  const result = (await app.inject({ url: path })).json()
  assert.deepEqual(result.campaign.metrics, {
    members: 3, researched: 2, verified: 1, contacted: 1, responses: 1, meetings: 1, proposals: 1, clients: 1, excluded: 1, batches: 1,
    responseRate: 1, conversionRate: 1, pendingDrafts: 1,
  })
  assert.deepEqual(result.performance.byCity.map(({ name, members, researched, contacted, responseRate }: {
    name: string; members: number; researched: number; contacted: number; responseRate: number | null
  }) => ({ name, members, researched, contacted, responseRate })), [
    { name: 'Nono', members: 3, researched: 1, contacted: 1, responseRate: 1 },
    { name: 'Villa Dolores', members: 0, researched: 1, contacted: 0, responseRate: null },
  ])
  const secondary = (await app.inject({ url: '/api/campaigns/' + sameOrgAnotherCampaign.id })).json()
  assert.equal(secondary.members[0].jobId, job.id)
  assert.equal(secondary.campaign.metrics.batches, 1)
  assert.equal((await app.inject({ method: 'PATCH', url: path, payload: { status: 'PAUSADA' } })).statusCode, 200)
  assert.equal((await post(path + '/members', { organizationIds: [next.id] })).statusCode, 409)
  assert.equal((await app.inject({ url: path })).json().members.length, 3)
})
