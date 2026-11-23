import { applicationTypes } from '../../../packages/core/src/constants.ts'
import { Field } from './widgets.tsx'

export type ResearchMode = 'discover' | 'update'
export type SearchConfiguration = {
  prompt: string
  filters: { quantity?: number; region?: string; city?: string; industry?: string; applicationType?: string; regions?: string[]; cities?: string[]; industries?: string[] }
  useCodex: boolean
  excludeExisting: boolean
  excludeContacted: boolean
  minimumConfidence: string
  mode: ResearchMode
  recentDays?: number
  campaignId?: string
}
export type SavedSearch = { id: string; name: string; configuration: SearchConfiguration; updatedAt: string }
export type ResearchJob = {
  id: string; state: string; goal: number; found: number; verified: number; imported: number; duplicates: number; excluded: number; pending: number
  skipped?: number; errors: number; reason?: string; provider: string; createdAt: string; mode?: ResearchMode; resumable?: boolean
}

export function readSearchFields(data: Record<string, string>): SearchConfiguration {
  const regions = separateLabels(data.region)
  const cities = separateLabels(data.city)
  const industries = separateLabels(data.industry)
  return {
    prompt: data.prompt,
    filters: { quantity: data.quantity ? Number(data.quantity) : undefined, region: regions.length === 1 ? regions[0] : undefined,
      city: cities.length === 1 ? cities[0] : undefined, industry: industries.length === 1 ? industries[0] : undefined,
      regions: regions.length > 1 ? regions : undefined, cities: cities.length > 1 ? cities : undefined, industries: industries.length > 1 ? industries : undefined,
      applicationType: data.applicationType || undefined },
    useCodex: Boolean(data.useCodex), excludeExisting: Boolean(data.excludeExisting), excludeContacted: Boolean(data.excludeContacted),
    minimumConfidence: data.minimumConfidence,
    mode: data.mode === 'update' ? 'update' : 'discover',
    recentDays: data.mode === 'update' && data.recentDays ? Number(data.recentDays) : undefined,
    campaignId: data.campaignId || undefined,
  }
}

const separateLabels = (value = '') => [...new Set(value.split(',').map((label) => label.trim()).filter(Boolean))]

export function SearchFields({ codex, configuration, mode = 'discover' }: { codex: boolean; configuration?: SearchConfiguration; mode?: ResearchMode }) {
  const filters = configuration?.filters
  return <>
    <input type="hidden" name="mode" value={mode} />
    <Field label="Instrucción de búsqueda" name="prompt" area value={configuration?.prompt ?? (mode === 'update' ? 'Actualizá las empresas investigadas en los últimos 30 días' : 'Buscá 20 empresas de Córdoba Capital')} />
    <label className="field">Cantidad<input name="quantity" type="number" min="1" max="100" defaultValue={filters?.quantity} /></label>
    <Field label="Región de búsqueda" name="region" value={filters?.regions?.join(', ') ?? filters?.region} />
    <Field label="Ciudad" name="city" value={filters?.cities?.join(', ') ?? filters?.city} />
    <Field label="Rubro de búsqueda" name="industry" value={filters?.industries?.join(', ') ?? filters?.industry} />
    <p className="muted wide">Separá con comas varias regiones, ciudades o rubros.</p>
    <Field label="Aplicación" name="applicationType" options={['', ...applicationTypes]} value={filters?.applicationType} />
    <Field label="Confianza mínima" name="minimumConfidence" options={['BAJA', 'MEDIA', 'ALTA']} value={configuration?.minimumConfidence} />
    {mode === 'update' && <label className="field">Investigadas en los últimos días<input name="recentDays" type="number" min="1" max="3650" defaultValue={configuration?.recentDays ?? 30} /></label>}
    <label className="check"><input type="checkbox" name="useCodex" disabled={!codex} defaultChecked={codex && (configuration?.useCodex ?? true)} />Interpretar la consulta con Codex{codex ? '' : ' (deshabilitado)'}</label>
    <input type="hidden" name="excludeExisting" value={mode === 'discover' ? 'on' : ''} />
    {mode === 'discover' && <label className="check"><input type="checkbox" name="excludeContacted" defaultChecked={configuration?.excludeContacted ?? true} />Excluir empresas ya contactadas.</label>}
    {configuration?.campaignId && <input type="hidden" name="campaignId" value={configuration.campaignId} />}
  </>
}

export const researchStatus = (value: string) => value.toLowerCase().replace(/^\p{L}/u, (letter) => letter.toUpperCase()).replaceAll('_', ' ')
