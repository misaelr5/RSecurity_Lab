import { useState } from 'react'
import { statuses } from '../../../packages/core/src/constants.ts'
import { DownloadButton, Empty, Resource, useResource, values } from './widgets.tsx'
import './commercial-map.css'

type Location = { longitude: number; latitude: number; precision: 'LOCALIDAD_APROXIMADA'; sourceUrl: string }
type Marker = {
  id: string
  name: string
  city: string
  industry: string
  status: string
  campaignId: string | null
  website: string
  nextFollowUp: string
  location: Location | null
}
type MapView = {
  items: Marker[]
  cities: string[]
  industries: string[]
  campaigns: string[]
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
const width = 800
const height = 540
type Point = [number, number]
type Group = { x: number; y: number; markers: Marker[] }

function category(status: string): Category {
  if (status === 'Ganado') return 'won'
  if (['Perdido', 'No contactar'].includes(status)) return 'closed'
  if (['Contactado', 'Respondió', 'Reunión', 'Presupuesto'].includes(status)) return 'contacted'
  if (status === 'Listo para contactar') return 'ready'
  return 'initial'
}

function projection(frame: Point[]) {
  const west = Math.min(...frame.map(([lon]) => lon))
  const east = Math.max(...frame.map(([lon]) => lon))
  const south = Math.min(...frame.map(([, lat]) => lat))
  const north = Math.max(...frame.map(([, lat]) => lat))
  const centerLon = (west + east) / 2
  const centerLat = (south + north) / 2
  const longitudeRatio = Math.cos(centerLat * Math.PI / 180)
  const spanLon = Math.max(east - west, 0.18) * longitudeRatio
  const spanLat = Math.max(north - south, 0.14)
  const scale = Math.min((width - 130) / spanLon, (height - 110) / spanLat)
  return ([lon, lat]: Point): Point => [
    width / 2 + (lon - centerLon) * longitudeRatio * scale,
    height / 2 + (centerLat - lat) * scale,
  ]
}

function groupMarkers(items: Marker[], project: (point: Point) => Point) {
  const groups: Group[] = []
  for (const item of items) {
    if (!item.location) continue
    const [x, y] = project([item.location.longitude, item.location.latitude])
    const nearby = groups.find((group) => Math.hypot(group.x - x, group.y - y) <= 28)
    if (nearby) nearby.markers.push(item)
    else groups.push({ x, y, markers: [item] })
  }
  return groups
}

export function CommercialMap({ revision }: { revision: number }) {
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<string>()
  const [extent, setExtent] = useState<'visible' | 'province'>('visible')
  const result = useResource<MapView>('/map/prospects' + (query ? '?' + query : ''), revision)
  return <Resource result={result}>{(data) => {
    const positions: Point[] = data.items.flatMap((item) => item.location ? [[item.location.longitude, item.location.latitude] as Point] : [])
    const project = projection(extent === 'province' || !positions.length ? data.cartography.outline : positions)
    const outlinePath = data.cartography.outline.map((point, index) => (index ? 'L' : 'M') + project(point).join(' ')).join(' ') + ' Z'
    const groups = groupMarkers(data.items, project)
    const selected = groups.find((group) => group.markers.some((item) => item.id === selection))
    const listed = selected ? selected.markers : data.items
    return <section className="panel commercial-map" aria-label="Mapa de prospectos">
      <form className="commercial-map-filters" onSubmit={(event) => {
        const fields = values(event)
        setSelection(undefined)
        setQuery(new URLSearchParams(Object.entries(fields).filter(([, value]) => value.trim())).toString())
      }}>
        <label className="field">Buscar empresas<input name="q" maxLength={120} defaultValue={new URLSearchParams(query).get('q') ?? ''} /></label>
        <MapFilter name="city" label="Localidad" options={data.cities.map(option)} query={query} />
        <MapFilter name="industry" label="Rubro" options={data.industries.map(option)} query={query} />
        <MapFilter name="campaign" label="Campaña" options={[{ value: 'none', label: 'Sin campaña' }, ...data.campaigns.map((id) => ({
          value: id, label: 'Lote ' + id.slice(0, 8),
        }))]} query={query} />
        <MapFilter name="status" label="Estado" options={statuses.map(option)} query={query} />
        <div className="commercial-map-actions"><button className="primary">Aplicar filtros</button></div>
      </form>
      <div className="commercial-map-toolbar">
        <p role="status">{positions.length} con ubicación aproximada · {data.items.length - positions.length} sin coordenadas</p>
        <div>
          <button aria-pressed={extent === 'visible'} onClick={() => setExtent('visible')}>Ajustar a resultados</button>
          <button aria-pressed={extent === 'province'} onClick={() => setExtent('province')}>Ver provincia</button>
        </div>
      </div>
      <div className="commercial-map-columns">
        <figure>
          <svg className="commercial-map-canvas" role="group" aria-label="Córdoba con marcadores de prospectos por localidad" viewBox={'0 0 ' + width + ' ' + height}>
            <defs>
              <pattern id="commercial-map-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M36 0H0V36" className="commercial-map-gridlines" />
              </pattern>
            </defs>
            <rect width={width} height={height} className="commercial-map-background" />
            <rect width={width} height={height} fill="url(#commercial-map-grid)" />
            <path className="commercial-map-outline" d={outlinePath} />
            {groups.map((group) => {
              const top = group.markers[0]
              const label = [...new Set(group.markers.map((item) => item.city))].join(', ')
              const kinds = new Set(group.markers.map((item) => category(item.status)))
              const kind = kinds.size === 1 ? category(top.status) : 'mixed'
              const select = () => setSelection(top.id)
              return <g key={top.id} role="button" tabIndex={0}
                aria-label={group.markers.length + ' prospectos en ' + label}
                aria-pressed={selected === group} className="commercial-map-marker"
                data-category={kind} transform={'translate(' + group.x + ' ' + group.y + ')'}
                onClick={select} onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() }
                }}>
                <circle r={group.markers.length === 1 ? 13 : 17} />
                <text textAnchor="middle" dy=".34em">{group.markers.length}</text>
                <title>{label}</title>
              </g>
            })}
          </svg>
          <figcaption>
            Centroides de localidades: <a href={data.attribution} target="_blank" rel="noreferrer">Servicio Georef</a> · CC BY 4.0.
            {' '}Límite simplificado: <a href={data.cartography.url} target="_blank" rel="noreferrer">{data.cartography.source}</a> · {data.cartography.license}.
          </figcaption>
        </figure>
        <div className="commercial-map-results">
          <div className="commercial-map-toolbar">
            <h2>{selected ? 'Grupo seleccionado' : 'Prospectos'}</h2>
            {selected && <button onClick={() => setSelection(undefined)}>Ver todos</button>}
          </div>
          {listed.length ? <ul className="records">{listed.map((item) => <li key={item.id}>
            <strong>{item.name}</strong>
            <small>{item.city} · {item.industry}</small>
            <small>{item.status} · {item.location ? 'Localidad aproximada' : 'Sin coordenadas'}</small>
            {item.nextFollowUp && <small>Próximo seguimiento: <time dateTime={item.nextFollowUp}>{item.nextFollowUp}</time></small>}
            <div className="commercial-map-links">
              <a href={'#prospect/' + encodeURIComponent(item.id)}>Ficha e historial</a>
              {item.website && <a href={item.website} target="_blank" rel="noreferrer">Web oficial</a>}
            </div>
          </li>)}</ul> : <Empty>El mapa no tiene prospectos con los filtros actuales.</Empty>}
        </div>
      </div>
      <ul className="commercial-map-legend" aria-label="Estados del mapa">{Object.entries(categories).map(([kind, label]) =>
        <li key={kind} data-category={kind}><span aria-hidden="true" />{label}</li>)}</ul>
      <div className="toolbar commercial-map-download">
        {['geojson', 'csv', 'json'].map((format) => <DownloadButton key={format} path={'/map/export?' + (query ? query + '&' : '') + 'format=' + format} filename={'mapa-prospectos.' + format}>
          Exportar mapa {format === 'geojson' ? 'GeoJSON' : format.toUpperCase()}
        </DownloadButton>)}
      </div>
    </section>
  }}</Resource>
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
