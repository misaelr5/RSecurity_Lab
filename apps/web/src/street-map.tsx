import { useEffect, useRef, useState } from 'react'
import { control, divIcon, featureGroup, latLng, latLngBounds, map, marker, polygon, tileLayer } from 'leaflet'
import type { LatLng, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type MapLocation = { longitude: number; latitude: number; precision: 'LOCALIDAD_APROXIMADA' | 'EXACTA'; sourceUrl: string; verifiedOn?: string }
export type MapPin = { id: string; name: string; city: string; location: MapLocation | null; category: string }
type MapData = { items: MapPin[]; outline: [number, number][] }
const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const attribution = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'

function pack(pins: MapPin[], instance: LeafletMap) {
  const clusters: { center: LatLng; pins: MapPin[] }[] = []
  for (const item of pins) {
    if (!item.location) continue
    const center = latLng(item.location.latitude, item.location.longitude)
    if (!instance.getBounds().pad(.12).contains(center)) continue
    const point = instance.latLngToLayerPoint(center)
    const match = clusters.find((entry) => instance.latLngToLayerPoint(entry.center).distanceTo(point) <= 32)
    if (match) match.pins.push(item)
    else clusters.push({ center, pins: [item] })
  }
  return clusters
}

export function StreetMap({ data, selected, onSelect }: { data: MapData; selected: string[]; onSelect: (ids: string[]) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const viewer = useRef<LeafletMap>(null)
  const [streets, setStreets] = useState(true)
  const [tileStatus, setTileStatus] = useState<'loading' | 'ready' | 'partial' | 'unavailable'>('loading')
  const [zoom, setZoom] = useState(0)
  const { items, outline } = data

  function fit(province: boolean) {
    const bounds = latLngBounds(items.flatMap(({ location }) => location ? [latLng(location.latitude, location.longitude)] : []))
    if (province || !bounds.isValid()) bounds.extend(latLngBounds(outline.map(([lng, lat]) => latLng(lat, lng))))
    if (bounds.isValid()) viewer.current?.fitBounds(bounds, { padding: [36, 36], maxZoom: 12, animate: false })
  }

  useEffect(() => {
    if (!container.current) return
    const instance = map(container.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false,
      zoomAnimation: false, minZoom: 4, maxZoom: 19, worldCopyJump: true })
    instance.setView([-31.5, -64.7], 8)
    control.attribution({ prefix: false }).addTo(instance)
    control.scale({ imperial: false, position: 'bottomleft' }).addTo(instance)
    instance.getContainer().setAttribute('aria-label', 'Mapa interactivo de prospectos')
    const handleZoom = () => setZoom(instance.getZoom())
    instance.on('zoomend', handleZoom)
    handleZoom()
    viewer.current = instance
    const resize = new ResizeObserver(() => instance.invalidateSize({ pan: false }))
    resize.observe(instance.getContainer())
    return () => { resize.disconnect(); instance.remove(); viewer.current = null }
  }, [])

  useEffect(() => {
    const instance = viewer.current
    if (!instance) return
    const boundary = polygon(outline.map(([lng, lat]) => latLng(lat, lng)), { className: 'street-boundary', weight: 1.5, interactive: false }).addTo(instance)
    const bounds = latLngBounds(items.flatMap(({ location }) => location ? [latLng(location.latitude, location.longitude)] : []))
    instance.fitBounds(bounds.isValid() ? bounds : boundary.getBounds(), { padding: [36, 36], maxZoom: 12, animate: false })
    return () => { boundary.remove() }
  }, [items, outline])

  useEffect(() => {
    const instance = viewer.current
    if (!instance || !streets) return
    let loaded = 0
    let failed = 0
    // The per-image policy sends only the local origin, while the app-wide policy stays unchanged.
    const tiles = tileLayer(tileUrl, { attribution, referrerPolicy: 'origin', maxZoom: 19, noWrap: true, keepBuffer: 1 })
    tiles.on('loading', () => { loaded = 0; failed = 0; setTileStatus('loading') })
    tiles.on('tileload', () => { loaded++; setTileStatus('ready') })
    tiles.on('tileerror', () => { failed++ })
    tiles.on('load', () => { setTileStatus(loaded === 0 ? 'unavailable' : failed ? 'partial' : 'ready') })
    tiles.addTo(instance)
    return () => { tiles.remove(); tiles.off() }
  }, [streets])

  useEffect(() => {
    const instance = viewer.current
    if (!instance || selected.length !== 1) return
    const point = items.find(({ id }) => id === selected[0])?.location
    if (!point) return
    // A locality centroid warrants a city view. Only a confirmed address warrants street-level zoom.
    const zoom = Math.max(instance.getZoom(), point.precision === 'EXACTA' ? 15 : 11)
    instance.setView([point.latitude, point.longitude], zoom, { animate: false })
  }, [items, selected])

  useEffect(() => {
    const instance = viewer.current
    if (!instance) return
    const layers = featureGroup().addTo(instance)
    const draw = () => {
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.pinId : undefined
      layers.clearLayers()
      for (const cluster of pack(items, instance)) {
        const pins = cluster.pins
        const isSelected = pins.some(({ id }) => selected.includes(id))
        const unique = new Set(pins.map(({ category }) => category))
        const tone = unique.size === 1 ? pins[0].category : 'mixed'
        const precision = pins.every(({ location }) => location?.precision === 'EXACTA') ? 'exact' : 'approximate'
        const city = [...new Set(pins.map(({ city }) => city))].join(', ')
        const label = pins.length + ' prospectos en ' + city
        const symbol = document.createElement('span')
        symbol.textContent = pins.length.toString()
        const icon = divIcon({ className: `street-pin ${tone} ${precision}${isSelected ? ' is-selected' : ''}`, html: symbol,
          iconSize: [36, 36], iconAnchor: [18, 18] })
        const point = marker(cluster.center, { icon, title: pins.length === 1 ? pins[0].name : label, keyboard: true, autoPanOnFocus: false }).addTo(layers)
        const element = point.getElement()
        if (element) element.dataset.pinId = pins[0].id
        element?.setAttribute('aria-label', label)
        element?.setAttribute('aria-pressed', String(isSelected))
        element?.addEventListener('keydown', (event) => {
          if (event.key === ' ') { event.preventDefault(); onSelect(pins.map(({ id }) => id)) }
        })
        point.on('click', () => onSelect(pins.map(({ id }) => id)))
        if (element && focused === pins[0].id) element.focus({ preventScroll: true })
      }
    }
    draw()
    instance.on('moveend', draw)
    return () => { instance.off('moveend', draw); layers.remove() }
  }, [items, onSelect, selected])

  return <div className="street-frame" data-layer={streets ? 'streets' : 'outline'} data-map-status={streets ? tileStatus : 'outline'} data-zoom={zoom}>
    <div ref={container} className="street-canvas" />
    <div className="street-tools" role="group" aria-label="Controles del mapa">
      <div className="street-switch">
        <button type="button" aria-pressed={streets} onClick={() => { setTileStatus('loading'); setStreets(true) }} disabled={streets}>Calles</button>
        <button type="button" aria-pressed={!streets} onClick={() => setStreets(false)} disabled={!streets}>Contorno</button>
      </div>
      <div className="street-zoom">
        <button type="button" aria-label="Acercar mapa" onClick={() => viewer.current?.zoomIn()} disabled={zoom >= 19}>+</button>
        <button type="button" aria-label="Alejar mapa" onClick={() => viewer.current?.zoomOut()} disabled={zoom <= 4}>−</button>
      </div>
      <div className="street-switch">
        <button type="button" onClick={() => fit(false)}>Ajustar a resultados</button>
        <button type="button" onClick={() => fit(true)}>Ver provincia</button>
      </div>
    </div>
    {streets && (tileStatus === 'unavailable' || tileStatus === 'partial') && <p className="street-status" role="status">
      {tileStatus === 'partial' ? 'Algunas calles quedaron sin cargar.' : 'Fondo de calles no disponible. El contorno y los puntos siguen visibles.'}
    </p>}
  </div>
}
