import { useState } from 'react'
import { DownloadButton, Empty, Resource, useResource } from './widgets.tsx'
import { when } from './client.ts'

const segments = [['todas', 'Todas'], ['investigadas', 'Investigadas'], ['verificadas', 'Verificadas'], ['contactadas', 'Contactadas (hito registrado)'],
  ['respondieron', 'Respondieron'], ['clientes', 'Clientes'], ['excluidas', 'No contactar']]
type Company = {
  id: string; name: string; city: string; region: string; industry: string; state: string; stage: string;
  campaignId?: string; responsible?: string; createdAt: string; lastContact?: string; next: string; source: string; flags: Record<string, boolean>
}
export function CommercialRegister({ revision, exportOnly = false }: { revision: number; exportOnly?: boolean }) {
  const [query, setQuery] = useState({ segment: 'todas', city: '', q: '', campaign: '' })
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value)).toString()
  const result = useResource<Company[]>('/commercial/companies?' + params, revision)
  const campaigns = useResource<{ id: string; createdAt: string }[]>('/research/jobs', revision)
  return <section className="panel">
    <h2>{exportOnly ? 'Elegí qué exportar' : 'Historial global'}</h2>
    <div className="fields">
      <label className="field">Segmento<select value={query.segment} onChange={(event) => setQuery({ ...query, segment: event.target.value })}>
        {segments.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
      <label className="field">Localidad<input value={query.city} onChange={(event) => setQuery({ ...query, city: event.target.value })} maxLength={120} /></label>
      <label className="field">Empresa o rubro<input value={query.q} onChange={(event) => setQuery({ ...query, q: event.target.value })} maxLength={120} /></label>
      <label className="field">Campaña<select value={query.campaign} onChange={(event) => setQuery({ ...query, campaign: event.target.value })}>
        <option value="">Todas</option>{campaigns.value?.map((item) => <option key={item.id} value={item.id}>{when(item.createdAt)} · {item.id.slice(0, 8)}</option>)}
      </select></label>
    </div>
    {exportOnly && <div className="toolbar inset">
      <DownloadButton path={'/commercial/export?' + params + '&format=csv'} filename="empresas-prospectadas.csv">CSV para Excel</DownloadButton>
      <DownloadButton path={'/commercial/export?' + params + '&format=json'} filename="empresas-prospectadas.json">JSON de la selección</DownloadButton>
      <DownloadButton path={'/commercial/export?' + params + '&format=crm'} filename="reac-leads-v1.csv">CSV para Reac Leads</DownloadButton>
      <a className="button" href="#map">Exportar ubicaciones desde el mapa</a>
    </div>}
    <Resource result={result}>{(items) => items.length ? <div className="table-scroll inset"><table>
      <thead><tr><th>Empresa</th><th>Ubicación</th><th>Estado y etapa</th><th>Último contacto</th><th>Próximo seguimiento</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}><td><a href={'#prospect/' + item.id}>{item.name}</a><small>{item.industry}{item.campaignId ? ' · Lote ' + item.campaignId.slice(0, 8) : ''}</small><small>Alta {when(item.createdAt)}{item.responsible ? ' · ' + item.responsible : ''}</small></td>
      <td>{item.city}<small>{item.region}</small></td><td>{item.flags.excluidas ? 'No contactar' : item.state}<small>{item.stage}</small></td>
      <td>{item.lastContact ? when(item.lastContact) : 'Sin hito registrado'}</td><td>{item.next || 'Sin fecha'}</td></tr>)}</tbody>
    </table></div> : <Empty>No hay empresas que coincidan con estos filtros.</Empty>}</Resource>
  </section>
}
