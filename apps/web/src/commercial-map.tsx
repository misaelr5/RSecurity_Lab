import { useEffect, useMemo, useRef, useState } from 'react'
import { statuses } from '../../../packages/core/src/constants.ts'
import { DownloadButton, Empty, Feedback, Resource, useAction, useResource, values } from './widgets.tsx'
import { api, today, when } from './client.ts'
import { StreetMap } from './street-map.tsx'
import type { MapLocation } from './street-map.tsx'
import './commercial-map.css'

type Marker = {
  id: string
  name: string
  city: string
  industry: string
  status: string
  campaignId: string | null
  website: string
  nextFollowUp: string
  lastContact?: string
  archived?: boolean
  location: MapLocation | null
}
type MapView = {
  items: Marker[]
  cities: string[]
  regions?: string[]
  industries: string[]
  campaigns: string[]
  commercialCampaigns?: { id: string; name: string }[]
  coverage?: { city: string; registered: number; contacted: number; pending: number; campaigns: number }[]
  cartography: { source: string; url: string; license: string; modified: boolean; outline: [number, number][] }
  attribution: string
}

const categories = {
  initial: 'En revisión',
  ready: 'Lista para contactar',
  contacted: 'Contacto registrado',
  won: 'Cliente',
  closed: 'Descartada o excluida',
  mixed: 'Estados combinados',
} as const
type Category = keyof typeof categories

function category(status: string): Category {
  if (status === 'Ganado') return 'won'
  if (['Perdido', 'No contactar'].includes(status)) return 'closed'
  if (['Contactado', 'Respondió', 'Reunión', 'Presupuesto'].includes(status)) return 'contacted'
  if (status === 'Listo para contactar') return 'ready'
  return 'initial'
}

type MapProps = { revision: number; refresh: () => void; campaignId?: string; prospectId?: string }

export function CommercialMap(props: MapProps) {
  return <MapWorkspace key={JSON.stringify([props.campaignId, props.prospectId])} {...props} />
}

function MapWorkspace({ revision, refresh, campaignId, prospectId }: MapProps) {
  const [query, setQuery] = useState(campaignId ? new URLSearchParams({ campaign: campaignId }).toString() : '')
  const [advanced, setAdvanced] = useState(Boolean(campaignId))
  const [selection, setSelection] = useState<string[]>(prospectId ? [prospectId] : [])
  const panelHeading = useRef<HTMLHeadingElement>(null)
  const returnTo = useRef<string | null>(null)
  const result = useResource<MapView>('/map/prospects' + (query ? '?' + query : ''), revision)
  const ready = Boolean(result.value)
  const viewport = useMemo(() => result.value ? {
    items: result.value.items.map((item) => ({ ...item, category: item.archived ? 'closed' : category(item.status) })),
    outline: result.value.cartography.outline,
  } : undefined, [result.value])
  useEffect(() => {
    if (selection.length && panelHeading.current) panelHeading.current.focus()
    else if (returnTo.current) {
      document.getElementById('map-result-' + returnTo.current)?.focus()
      returnTo.current = null
    }
  }, [selection, ready])
  return <Resource result={result}>{(data) => {
    const positioned = data.items.filter((item) => item.location).length
    const selected = data.items.filter((item) => selection.includes(item.id))
    const listed = selected.length ? selected : data.items
    const exact = data.items.filter((item) => item.location?.precision === 'EXACTA').length
    const applied = new URLSearchParams(query)
    const extraCount = ['region', 'industry', 'campaign', 'status'].filter((key) => applied.has(key)).length
    const detail = selected.length === 1 ? selected[0] : undefined
    return <section className="commercial-map" aria-label="Mapa de prospectos">
      <form className="commercial-map-filters" onSubmit={(event) => {
        const fields = values(event)
        setSelection([])
        setQuery(new URLSearchParams(Object.entries(fields).filter(([, value]) => value.trim())).toString())
      }}>
        <label className="field">Buscar empresas<input name="q" maxLength={120} defaultValue={new URLSearchParams(query).get('q') ?? ''} /></label>
        <MapFilter name="city" label="Localidad" options={data.cities.map(option)} query={query} />
        <button type="button" aria-expanded={advanced} aria-controls="map-extra-filters" onClick={() => setAdvanced(!advanced)}>
          Más filtros{extraCount ? ' (' + extraCount + ')' : ''} <span aria-hidden="true">{advanced ? '−' : '+'}</span>
        </button>
        <div id="map-extra-filters" className="commercial-map-extra" hidden={!advanced}>
          <MapFilter name="region" label="Región" options={(data.regions ?? []).map(option)} query={query} />
          <MapFilter name="industry" label="Rubro" options={data.industries.map(option)} query={query} />
          <MapFilter name="campaign" label="Campaña" options={[{ value: 'none', label: 'Sin campaña' }, ...(data.commercialCampaigns ?? []).map(({ id, name }) => ({ value: id, label: name })), ...data.campaigns.map((id) => ({
            value: id, label: 'Lote ' + id.slice(0, 8),
          }))]} query={query} />
          <MapFilter name="status" label="Estado" options={statuses.map(option)} query={query} />
        </div>
        <div className="commercial-map-actions"><button className="primary">Aplicar filtros</button>
          {query && <button type="button" onClick={() => { setQuery(''); setSelection([]) }}>Limpiar</button>}</div>
      </form>
      <div className="commercial-map-columns">
        <figure>
          {viewport && <StreetMap data={viewport} selected={selection} onSelect={setSelection} />}
          <figcaption>
            Puntos aproximados de <a href={data.attribution} target="_blank" rel="noreferrer">Georef</a> · CC BY 4.0. Contorno de <a href={data.cartography.url} target="_blank" rel="noreferrer">IDECOR</a> · {data.cartography.license}.
          </figcaption>
        </figure>
        <div className="commercial-map-results">
          <div className="commercial-map-toolbar">
            <h2 ref={panelHeading} tabIndex={-1}>{detail ? detail.name : selected.length ? 'Grupo seleccionado' : 'Empresas en el mapa'}</h2>
            {selection.length > 0 && <button type="button" onClick={() => { returnTo.current = selection[0]; setSelection([]) }}>Ver todas</button>}
          </div>
          {selection.length > 0 && !selected.length && <p role="status">La empresa seleccionada no aparece entre estos resultados.</p>}
          {detail ? <div className="commercial-map-detail" key={detail.id}>
            <p>{[detail.city, detail.industry].filter(Boolean).join(' · ')}</p>
            <dl><div><dt>Ubicación</dt><dd>{precisionLabel(detail)}</dd></div>
              <div><dt>Estado comercial</dt><dd>{detail.status}{detail.archived ? ' · Archivada' : ''}</dd></div>
              {detail.lastContact && <div><dt>Último contacto</dt><dd><time dateTime={detail.lastContact}>{when(detail.lastContact)}</time></dd></div>}
              {detail.nextFollowUp && <div><dt>Próximo seguimiento</dt><dd><time dateTime={detail.nextFollowUp}>{detail.nextFollowUp}</time></dd></div>}
            </dl>
            <div className="commercial-map-links">
              <a className="button" href={'#prospect/' + encodeURIComponent(detail.id)}>Ficha e historial</a>
              {detail.website && <a href={detail.website} target="_blank" rel="noreferrer">Web oficial</a>}
              {detail.location && <a href={detail.location.sourceUrl} target="_blank" rel="noreferrer">Fuente de ubicación</a>}
            </div>
            <LocationForm item={detail} refresh={refresh} />
          </div> : <>
            <p className="muted commercial-map-count" role="status">{selected.length ? selected.length + ' empresas en el grupo' :
              (positioned - exact) + ' aproximadas · ' + exact + ' exactas · ' + (data.items.length - positioned) + ' sin coordenadas'}</p>
            {listed.length ? <ul className="commercial-map-list">{listed.map((item) => <li key={item.id}>
              <button id={'map-result-' + item.id} type="button" className="street-result" aria-label={item.name} aria-describedby={'map-meta-' + item.id} onClick={() => setSelection([item.id])}>
                <strong>{item.name}</strong><span id={'map-meta-' + item.id}>{[item.city, precisionLabel(item)].filter(Boolean).join(' · ')}</span><i aria-hidden="true">›</i>
              </button>
            </li>)}</ul> : <Empty>El mapa no tiene prospectos con los filtros actuales.</Empty>}
          </>}
        </div>
      </div>
      <ul className="commercial-map-legend" aria-label="Estados del mapa">{Object.entries(categories).map(([kind, label]) =>
        <li key={kind} data-category={kind}><span aria-hidden="true" />{label}</li>)}<li><i aria-hidden="true" />Marcador discontinuo: localidad aproximada</li></ul>
      <CoverageTable data={data.coverage ?? []} />
      <div className="toolbar commercial-map-download">
        {['geojson', 'csv', 'json'].map((format) => <DownloadButton key={format} path={'/map/export?' + (query ? query + '&' : '') + 'format=' + format} filename={'mapa-prospectos.' + format}>
          Exportar mapa {format === 'geojson' ? 'GeoJSON' : format.toUpperCase()}
        </DownloadButton>)}
      </div>
    </section>
  }}</Resource>
}

function precisionLabel(item: Marker) {
  if (!item.location) return 'Sin coordenadas'
  return item.location.precision === 'EXACTA' ? 'Ubicación exacta' : 'Localidad aproximada'
}

function LocationForm({ item, refresh }: { item: Marker; refresh: () => void }) {
  const action = useAction(refresh)
  const fixed = item.location?.precision === 'EXACTA' ? item.location : undefined
  const path = '/map/prospects/' + item.id + '/location'
  return <details className="street-location"><summary>{fixed ? 'Editar ubicación exacta' : 'Confirmar ubicación exacta'}</summary>
    <form className="fields" onSubmit={(event) => {
      const fields = values(event)
      void action.run(() => api(path, 'PUT', { latitude: Number(fields.latitude), longitude: Number(fields.longitude),
        sourceUrl: fields.sourceUrl, verifiedOn: today(), confirm: true }), 'Ubicación confirmada.')
    }}>
      <label className="field">Latitud<input name="latitude" type="number" step="any" min="-90" max="90" defaultValue={fixed?.latitude} required /></label>
      <label className="field">Longitud<input name="longitude" type="number" step="any" min="-180" max="180" defaultValue={fixed?.longitude} required /></label>
      <label className="field wide">Fuente pública HTTPS<input name="sourceUrl" type="url" defaultValue={fixed?.sourceUrl} placeholder="https://…" required /></label>
      <label className="check wide"><input type="checkbox" required />Confirmé que la ubicación corresponde a esta empresa.</label>
      <div className="toolbar wide"><button className="primary" disabled={action.busy}>Guardar ubicación</button>
        {fixed && <button type="button" disabled={action.busy} onClick={() => void action.run(() => api(path, 'DELETE'), 'Ubicación exacta retirada.')}>Retirar ubicación exacta</button>}</div>
    </form><Feedback state={action} />
  </details>
}

function CoverageTable({ data }: { data: NonNullable<MapView['coverage']> }) {
  return <section className="inset"><h2>Cobertura de la cartera</h2><p className="muted">Conteos de las empresas que coinciden con los filtros.</p>
    {data.length ? <div className="table-scroll inset"><table>
      <thead><tr><th scope="col">Localidad</th><th scope="col">Registradas</th><th scope="col">Contactadas</th><th scope="col">Pendientes</th><th scope="col">Campañas</th></tr></thead>
      <tbody>{data.map((row) => <tr key={row.city}><th scope="row">{row.city || 'Localidad pendiente'}</th><td>{row.registered}</td><td>{row.contacted}</td><td>{row.pending}</td><td>{row.campaigns}</td></tr>)}</tbody>
    </table></div> : <Empty>Sin datos de cobertura para estos filtros.</Empty>}
  </section>
}

const option = (value: string) => ({ value, label: value })

function MapFilter({ name, label, options, query }: { name: string; label: string; options: { value: string; label: string }[]; query: string }) {
  return <label className="field">{label}
    <select name={name} defaultValue={new URLSearchParams(query).get(name) ?? ''}>
      <option value="">Todas</option>
      {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  </label>
}
