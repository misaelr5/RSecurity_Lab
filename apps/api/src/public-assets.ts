import { id, publicAsset, z } from '@reac/core'
import type { Prospect, PublicAsset, Source } from '@reac/core'
import type { FastifyInstance } from 'fastify'
import type { Store } from './store.ts'
import { parse, must, problem } from './http.ts'

export function registerPublicAssets(app: FastifyInstance, store: Store) {
  const organization = (value: string) => must(store.find<Prospect>('organizations', parse(id, value)))
  const list = (orgId: string) => store.list('public_sources', orgId)
    .flatMap((item) => store.list<PublicAsset>('public_assets', item.id))
  app.get<{ Params: { id: string } }>('/api/prospects/:id/assets', (request) => {
    const item = organization(request.params.id)
    const filters = parse(z.strictObject({ kind: publicAsset.shape.kind.optional() }), request.query)
    return list(item.id).filter((entry) => !filters.kind || filters.kind === entry.kind)
  })
  app.post<{ Params: { id: string } }>('/api/prospects/:id/assets', (request, reply) => store.transaction(() => {
    const item = organization(request.params.id)
    const value = parse(publicAsset, request.body)
    const source = must(store.find<Source>('public_sources', value.sourceId))
    if (source.parent !== item.id) throw problem(400, 'Elegí una fuente de esta organización.')
    const domain = value.kind === 'Dominio' || value.kind === 'Subdominio'
    const key = JSON.stringify([source.id, value.kind, domain ? value.value.toLowerCase().replace(/\.$/, '') : value.value])
    if (store.find('public_assets', key, 'unique_key')) throw problem(409, 'Este dato ya está vinculado a la fuente.')
    const entry = store.insert<PublicAsset>('public_assets', value, source.id, key)
    store.log('Activo público registrado', entry.id)
    return reply.code(201).send(entry)
  }))
  return { list }
}
