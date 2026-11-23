import type { FastifyInstance } from 'fastify'
import { normalize, optedOut, statuses, z } from '@reac/core'
import type { Prospect } from '@reac/core'
import { csvCell } from '@reac/reporting'
import { attach, parse } from './http.ts'
import type { Store } from './store.ts'

const georef = 'https://www.argentina.gob.ar/georef'
const localityUrl = 'https://apis.datos.gob.ar/georef/api/v2.0/localidades'
const cartography = {
  source: 'Dirección General de Catastro de Córdoba / IDECOR',
  url: 'https://www.idecor.gob.ar/3087-2/',
  license: 'CC BY-SA 4.0',
  modified: true,
  // Límite provincial de Córdoba, derivado CCBY-SA del WFS público de IDECOR con simplificación de 0,008°.
  outline: [[-62.1484,-30.3977],[-62.1298,-30.4816],[-61.8433,-30.7475],[-62.123,-31.6059],[-62.2414,-31.7005],[-62.2176,-31.7407],[-62.2228,-31.8844],[-62.1884,-31.9225],[-62.1671,-31.9872],[-62.1964,-32.1147],[-62.1785,-32.159],[-62.1437,-32.1946],[-62.0373,-32.2635],[-62.0117,-32.3468],[-61.9145,-32.495],[-61.9133,-32.5266],[-61.931,-32.5447],[-61.9052,-32.5524],[-61.9021,-32.5689],[-61.9263,-32.5834],[-61.9212,-32.5942],[-61.8917,-32.5905],[-61.8902,-32.6148],[-61.9464,-32.6512],[-61.9467,-32.6784],[-61.9078,-32.696],[-61.858,-32.6948],[-61.8281,-32.7549],[-61.7962,-32.7735],[-61.7779,-32.8308],[-61.7923,-32.8771],[-61.7717,-32.9016],[-61.791,-32.9585],[-61.7876,-33.0062],[-61.9334,-33.1343],[-62.8895,-34.3861],[-63.3914,-34.3868],[-63.3857,-35.0021],[-65.109,-35.0156],[-65.1129,-33.8449],[-65.1429,-33.1973],[-65.0852,-33.144],[-65.0403,-33.1337],[-65.0541,-33.0985],[-65.0121,-33.0284],[-65.0243,-32.9894],[-64.9901,-32.9341],[-64.9753,-32.8153],[-64.9423,-32.7683],[-64.9459,-32.7174],[-64.9109,-32.6876],[-64.9262,-32.6657],[-64.9208,-32.6425],[-64.9396,-32.6215],[-64.8996,-32.5759],[-64.9284,-32.5636],[-64.9469,-32.5167],[-64.9334,-32.3372],[-64.9542,-32.3058],[-64.9773,-32.3215],[-65.2112,-32.3265],[-65.2193,-32.2797],[-65.2101,-32.2349],[-65.232,-32.2092],[-65.2244,-32.168],[-65.2459,-32.0884],[-65.3162,-32.0401],[-65.6274,-31.8983],[-65.77,-31.8884],[-65.771,-31.0434],[-65.5192,-30.4764],[-65.3983,-30.1251],[-65.1193,-30.0758],[-64.8978,-29.8869],[-64.9498,-29.5895],[-64.2746,-29.4988],[-63.9814,-29.5508],[-63.9623,-29.6236],[-63.8739,-29.6307],[-63.8411,-29.5794],[-63.8115,-29.579],[-63.7836,-29.5839],[-63.7959,-29.6149],[-63.7549,-29.6229],[-63.7485,-29.6521],[-63.7207,-29.6663],[-63.6377,-29.6553],[-63.4654,-29.6643],[-63.4799,-29.7252],[-63.4599,-29.7251],[-63.4598,-29.7565],[-62.8074,-29.8338],[-62.83,-29.8416],[-62.8392,-29.8648],[-62.82,-29.9037],[-62.7881,-29.8974],[-62.7465,-29.9185],[-62.7158,-29.9492],[-62.6967,-29.9923],[-62.6552,-30.0076],[-62.6757,-30.0352],[-62.6651,-30.0482],[-62.6058,-30.046],[-62.5894,-30.0637],[-62.5545,-30.0608],[-62.5668,-30.1217],[-62.5957,-30.1643],[-62.5742,-30.1939],[-62.589,-30.2268],[-62.5653,-30.2881],[-62.1742,-30.2819],[-62.1484,-30.3977]],
}

const localities = {
  cordoba: ['14014010', -64.183606532, -31.416804475],
  'villa dolores': ['14133200', -65.190239696, -31.944976763],
  'mina clavero': ['14126090', -65.005000339, -31.729427643],
  nono: ['14126110', -65.002498778, -31.797204699],
  'villa cura brochero': ['14126200', -65.018606389, -31.706460725],
  'san javier y yacanto': ['14133170', -65.030268367, -32.026469651],
  'villa de las rosas': ['14133190', -65.052115338, -31.947086539],
  'los hornillos': ['14133120', -64.989754936, -31.903342468],
  panaholma: ['14126120', -65.054953292, -31.632953599],
  'san lorenzo': ['14126140', -65.017720994, -31.670919664],
  'villa sarmiento': ['14126210', -65.193098314, -31.936241107],
  'san pedro': ['14126160', -65.218867850, -31.936473985],
  'las tapias': ['14133100', -65.097966111, -31.953053644],
  'la poblacion': ['14133070', -65.029617254, -32.066252611],
  luyaba: ['14133150', -65.058482569, -32.149721185],
  'la paz': ['14133060', -65.048264539, -32.217525316],
  'las calles': ['14126050', -64.971425081, -31.824043850],
  'agua de oro': ['14021010', -64.300640522, -31.062228855],
  'villa allende': ['14021290', -64.297701308, -31.293649626],
  'alta gracia': ['14147010', -64.429871976, -31.649792126],
} as const
const aliases = { 'cordoba capital': 'cordoba', 'ciudad de cordoba': 'cordoba', 'san javier': 'san javier y yacanto',
  yacanto: 'san javier y yacanto', 'las rosas': 'villa de las rosas', 'cura brochero': 'villa cura brochero' } as const
const traslasierraOnly = new Set(['san pedro', 'san lorenzo', 'la paz', 'villa sarmiento', 'san javier', 'yacanto'])

type Organization = Prospect & { campaignId?: string; province?: string; address?: string }
type Filter = z.output<typeof filters>
const filters = z.strictObject({
  q: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(120).optional(),
  campaign: z.union([z.uuid(), z.literal('none')]).optional(),
  status: z.enum(statuses).optional(),
})

function position(item: Organization) {
  const region = normalize(item.region)
  const city = normalize(item.city)
  if (item.province && !['cordoba', 'provincia de cordoba'].includes(normalize(item.province))) return null
  if (!item.province && !['villa dolores', 'traslasierra', 'cordoba capital'].includes(region)) return null
  if (traslasierraOnly.has(city) && region !== 'traslasierra') return null
  const locality = aliases[city as keyof typeof aliases] ?? city
  if (!Object.hasOwn(localities, locality)) return null
  const [id, longitude, latitude] = localities[locality as keyof typeof localities]
  return {
    longitude, latitude, precision: 'LOCALIDAD_APROXIMADA' as const,
    source: 'Servicio Georef – argentina.gob.ar/georef',
    sourceUrl: localityUrl + '?id=' + id,
    license: 'CC BY 4.0',
  }
}

function publicWebsite(value: string) {
  try {
    const site = new URL(value)
    if (!['https:', 'http:'].includes(site.protocol) || site.username || site.password) return ''
    // Se omiten consultas y fragmentos al enlazar el sitio registrado.
    return site.origin + site.pathname
  } catch { return '' }
}

function geographicCsv(rows: unknown[][]) {
  // Solo las coordenadas numéricas verificadas se serializan como decimales. Cada texto usa el escape compartido.
  const lines = rows.map((row) => row.map((cell) => typeof cell === 'number' && Number.isFinite(cell) ? String(cell) : csvCell(cell)).join(','))
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

export function registerCommercialMap(app: FastifyInstance, store: Store) {
  function view(query: Filter) {
    const rows = store.list<Organization>('organizations').map((item) => ({
      id: item.id,
      name: item.name,
      city: item.city,
      region: item.region,
      industry: item.industry,
      status: optedOut(item) ? 'No contactar' as const : item.status,
      campaignId: item.campaignId ?? null,
      website: publicWebsite(item.website),
      nextFollowUp: item.nextFollowUp,
      location: position(item),
    }))
    const cities = [...new Set(rows.map((row) => row.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
    const industries = [...new Set(rows.map((row) => row.industry).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
    const campaigns = [...new Set(rows.map((row) => row.campaignId).filter((row): row is string => Boolean(row)))].sort()
    const q = normalize(query.q ?? '')
    const items = rows.filter((row) =>
      (!q || normalize([row.name, row.city, row.website].join(' ')).includes(q)) &&
      (!query.city || normalize(row.city) === normalize(query.city)) &&
      (!query.industry || normalize(row.industry) === normalize(query.industry)) &&
      (!query.campaign || (query.campaign === 'none' ? row.campaignId === null : row.campaignId === query.campaign)) &&
      (!query.status || row.status === query.status))
    return { items, cities, industries, campaigns, cartography, attribution: georef }
  }

  app.get('/api/map/prospects', (request) => view(parse(filters, request.query)))
  app.get('/api/map/export', (request, reply) => {
    const { format, ...query } = parse(filters.extend({ format: z.enum(['geojson', 'csv', 'json']) }), request.query)
    const items = view(query).items.map(({ id, name, city, region, industry, location }) => ({
      id, name, city, region, industry, location,
    }))
    if (format === 'csv') {
      return attach(reply, 'mapa-prospectos.csv', 'text/csv; charset=utf-8', geographicCsv([
        ['id', 'empresa', 'localidad', 'region', 'rubro', 'longitud', 'latitud', 'precision', 'fuente_coordenadas', 'licencia'],
        ...items.map((item) => [item.id, item.name, item.city, item.region, item.industry, item.location?.longitude,
          item.location?.latitude, item.location?.precision ?? 'SIN_COORDENADAS', item.location?.sourceUrl, item.location?.license]),
      ]))
    }
    if (format === 'geojson') {
      const features = items.map(({ location, ...item }) => ({
        type: 'Feature',
        id: item.id,
        geometry: location ? { type: 'Point', coordinates: [location.longitude, location.latitude] } : null,
        properties: { ...item, precision: location?.precision ?? 'SIN_COORDENADAS',
          coordinateSource: location?.sourceUrl ?? null, coordinateLicense: location?.license ?? null },
      }))
      return attach(reply, 'mapa-prospectos.geojson', 'application/geo+json', JSON.stringify({ type: 'FeatureCollection', features }))
    }
    return attach(reply, 'mapa-prospectos.json', 'application/json', JSON.stringify({ version: 1, items }))
  })
}
