import { useState } from 'react'
import { statuses } from '../../../packages/core/src/constants.ts'
import { DownloadButton, Empty, Feedback, Resource, useAction, useResource } from './widgets.tsx'
import { api, when } from './client.ts'

const segments = [['todas', 'Todas'], ['investigadas', 'Investigadas'], ['pendientes', 'Pendientes de verificar'], ['verificadas', 'Verificadas'],
  ['contactadas', 'Contactadas (hito registrado)'], ['respondieron', 'Respondieron'], ['clientes', 'Clientes'], ['descartadas', 'Descartadas'], ['excluidas', 'No contactar']]
type Company = {
  id: string; name: string; city: string; region: string; industry: string; state: string; stage: string;
  campaignId?: string; responsible?: string; createdAt: string; lastContact?: string; next: string; source: string; flags: Record<string, boolean>
}
export function CommercialRegister({ revision, refresh, exportOnly = false }: { revision: number; refresh: () => void; exportOnly?: boolean }) {
  const [query, setQuery] = useState({ segment: 'todas', city: '', region: '', status: '', q: '', campaign: '' })
  const [extras, setExtras] = useState({ from: '', to: '', industry: '', archived: 'all' })
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value)).toString()
  const historyParams = new URLSearchParams(Object.entries({ city: query.city, region: query.region, status: query.status, q: query.q,
    ...(query.campaign === 'none' ? { campaign: 'none' } : query.campaign ? { lot: query.campaign } : {}), ...extras }).filter(([, value]) => value)).toString()
  const result = useResource<Company[]>('/commercial/companies?' + params, revision)
  const campaigns = useResource<{ id: string; createdAt: string }[]>('/commercial/campaigns', revision)
  return <><section className="panel">
    <h2>{exportOnly ? 'Exportar historial' : 'Historial global'}</h2>
    <div className="fields v4-fields">
      {!exportOnly && <label className="field">Segmento<select value={query.segment} onChange={(event) => setQuery({ ...query, segment: event.target.value })}>
        {segments.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>}
      <label className="field">Localidad<input value={query.city} onChange={(event) => setQuery({ ...query, city: event.target.value })} maxLength={120} /></label>
      <label className="field">Región<input value={query.region} onChange={(event) => setQuery({ ...query, region: event.target.value })} maxLength={120} /></label>
      <label className="field">Estado comercial<select value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value })}>
        <option value="">Todos</option>{statuses.map((item) => <option key={item}>{item}</option>)}
      </select></label>
      <label className="field">Empresa o rubro<input value={query.q} onChange={(event) => setQuery({ ...query, q: event.target.value })} maxLength={120} /></label>
      <label className="field">Campaña<select value={query.campaign} onChange={(event) => setQuery({ ...query, campaign: event.target.value })}>
        <option value="">Todas</option><option value="none">Sin campaña</option>
        {campaigns.value?.map((item) => <option key={item.id} value={item.id}>Lote del {when(item.createdAt)}</option>)}
      </select></label>
      {exportOnly && <>
        <label className="field">Rubro<input value={extras.industry} onChange={(event) => setExtras({ ...extras, industry: event.target.value })} maxLength={120} /></label>
        <label className="field">Desde<input type="date" value={extras.from} max={extras.to || undefined} onChange={(event) => setExtras({ ...extras, from: event.target.value })} /></label>
        <label className="field">Hasta<input type="date" value={extras.to} min={extras.from || undefined} onChange={(event) => setExtras({ ...extras, to: event.target.value })} /></label>
        <label className="field">Archivado<select value={extras.archived} onChange={(event) => setExtras({ ...extras, archived: event.target.value })}>
          <option value="all">Todos</option><option value="included">Solo archivadas</option><option value="excluded">Solo activas</option>
        </select></label>
      </>}
    </div>
    {exportOnly && <div className="toolbar inset">
      <DownloadButton path={'/history/export?' + historyParams + '&format=csv'} filename="empresas-prospectadas.csv">CSV para Excel</DownloadButton>
      <DownloadButton path={'/history/export?' + historyParams + '&format=json'} filename="historial-comercial-v1.json" primary>JSON de la selección</DownloadButton>
      <DownloadButton path={'/history/export?' + historyParams + '&format=crm'} filename="reac-leads-v1.csv">CSV para Reac Leads</DownloadButton>
      <DownloadButton path={'/history/export?' + historyParams + '&format=geojson'} filename="historial-comercial.geojson">GeoJSON</DownloadButton>
      <DownloadButton path="/history/export?format=json" filename="historial-comercial-v1.json">JSON de todo el historial</DownloadButton>
    </div>}
    {!exportOnly && <Resource result={result}>{(items) => items.length ? <div className="table-scroll inset"><table>
      <thead><tr><th>Empresa</th><th>Ubicación</th><th>Estado y etapa</th><th>Último contacto</th><th>Próximo seguimiento</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}><td><a href={'#prospects/' + item.id}>{item.name}</a><small>{item.industry}{item.campaignId ? ' · Lote ' + item.campaignId.slice(0, 8) : ''}</small><small>Alta {when(item.createdAt)}{item.responsible ? ' · ' + item.responsible : ''}</small>
        {!exportOnly && <CommercialHistory company={item} revision={revision} />}</td>
      <td>{item.city}<small>{item.region}</small></td><td>{item.flags.excluidas ? 'No contactar' : item.state}<small>{item.stage}</small></td>
      <td>{item.lastContact ? when(item.lastContact) : 'Sin hito registrado'}</td><td>{item.next || 'Sin fecha'}</td></tr>)}</tbody>
    </table></div> : <Empty>No hay empresas que coincidan con estos filtros.</Empty>}</Resource>}
  </section>{exportOnly ? <HistoryImport refresh={refresh} /> : <ResearchHistory revision={revision} params={params} />}</>
}

type Restored = { restored: number; unchanged: number; conflicts: number; candidates: number; lots: number; campaigns: number; exclusions: number }
function HistoryImport({ refresh }: { refresh: () => void }) {
  const action = useAction(refresh)
  const [result, setResult] = useState<Restored>()
  return <section className="panel">
    <h2>Reimportar historial versionado</h2><p className="muted">Incorporá registros e interacciones faltantes desde un JSON exportado por Security Lab. Revisá los conflictos después de la importación.</p>
    <form className="fields v4-fields" onSubmit={(event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      setResult(undefined)
      void action.run(async () => {
        const file = data.get('archive')
        if (!(file instanceof File) || !file.size) throw new Error('Elegí un archivo JSON de historial.')
        let archive: unknown
        try { archive = JSON.parse(await file.text()) } catch { throw new Error('El archivo JSON es inválido.') }
        setResult(await api<Restored>('/history/import', 'POST', { archive, acknowledge: data.get('acknowledge') === 'on' }))
      }, 'Se procesó el historial.')
    }}>
      <label className="field wide">Archivo JSON de historial<input type="file" name="archive" accept=".json,application/json" required /></label>
      <label className="check wide"><input type="checkbox" name="acknowledge" required />Confirmo la importación incremental de este historial.</label>
      <div className="wide"><button disabled={action.busy}>Reimportar historial</button></div>
    </form>
    <Feedback state={action} />
    {result && <dl className="summary inset">{[['Fichas restauradas', result.restored], ['Ya presentes', result.unchanged], ['Conflictos', result.conflicts],
      ['Candidatas', result.candidates], ['Lotes', result.lots], ['Campañas', result.campaigns], ['Exclusiones', result.exclusions]]
      .map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>}
  </section>
}

type HistoryEntry = { id: string; createdAt: string }
type History = { events: (HistoryEntry & { stage: string; note?: string })[]; history: (HistoryEntry & { action: string })[] }
function CommercialHistory({ company, revision }: { company: Company; revision: number }) {
  const [expanded, setExpanded] = useState(false)
  return <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>Interacciones</summary>
    {expanded && <CompanyTimeline company={company} revision={revision} />}
  </details>
}
function CompanyTimeline({ company, revision }: { company: Company; revision: number }) {
  const data = useResource<History>('/commercial/companies/' + company.id + '/history', revision)
  return <Resource result={data}>{({ events, history }) => {
    const items = [...events.map((entry) => ({ ...entry, title: entry.stage })), ...history.map((entry) => ({ ...entry, title: entry.action, note: undefined }))]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return <>{company.source && <a href={company.source} target="_blank" rel="noopener noreferrer">Fuente de descubrimiento</a>}
      {items.length ? <ul className="records">{items.map((item) => <li key={item.id}>
        <strong>{item.title}</strong><time dateTime={item.createdAt}>{when(item.createdAt)}</time>{item.note && <p>{item.note}</p>}
      </li>)}</ul> : <Empty>Sin interacciones registradas.</Empty>}</>
  }}</Resource>
}

type Researched = { id: string; jobId: string; name: string; city: string; industry: string; outcome: string; reason: string; researchedAt: string; source: string }
function ResearchHistory({ revision, params }: { revision: number; params: string }) {
  const data = useResource<Researched[]>('/commercial/researched?' + params, revision)
  return <Resource result={data}>{(items) => items.length > 0 && <section className="panel">
    <h2>Investigadas sin ficha comercial</h2>
    <ul className="records">{items.map((item) => <li key={item.id}>
      <strong>{item.name}</strong><small>{item.city} · {item.industry} · {when(item.researchedAt)}</small>
      <p>{({ EN_REVISION: 'Pendiente de verificación.', EXCLUIDO: 'Excluida.', FUERA_DE_CUPO: 'Fuera de cupo.', RECHAZADO: 'Rechazada.' } as Record<string, string>)[item.outcome] ?? item.outcome} {item.reason}</p>
      <div className="toolbar"><a href={'#research/' + item.jobId}>Ver lote</a>
        {item.source && <a href={item.source} target="_blank" rel="noopener noreferrer">Fuente de descubrimiento</a>}</div>
    </li>)}</ul>
  </section>}</Resource>
}
