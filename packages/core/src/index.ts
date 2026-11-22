import { parse } from 'csv-parse/sync'
import { prospect, source, modes } from './schemas.ts'
import type { Prospect, Source, Authorization } from './schemas.ts'
import type { z } from './schemas.ts'
export * from './schemas.ts'

export const crmHeaders = [
  'empresa', 'rubro', 'ciudad', 'web', 'instagram', 'email', 'telefono', 'fuente_url',
  'fecha_verificacion', 'presencia_web', 'oportunidad', 'servicio', 'prioridad',
  'estado', 'mensaje', 'proximo_seguimiento', 'notas', 'consentimiento',
] as const
export type CrmRow = Partial<Record<(typeof crmHeaders)[number], string>>
export const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
export const organizationKey = (item: Prospect) => JSON.stringify([normalize(item.name), normalize(item.city)])
export const optedOut = (item: Prospect) => item.status === 'No contactar' || item.consent === 'Excluido'
export const regionFor = (city: string): Prospect['region'] => {
  const name = normalize(city)
  if (name === 'villa dolores') return 'Villa Dolores'
  if (['cordoba', 'cordoba capital'].includes(name)) return 'Córdoba Capital'
  if (['mina clavero', 'nono', 'cura brochero', 'villa cura brochero', 'las rosas', 'villa de las rosas', 'san javier', 'traslasierra', 'san pedro', 'las tapias', 'los hornillos', 'yaconanto', 'yacanto'].includes(name)) return 'Traslasierra'
  return 'Sin clasificar'
}

export function readCrm(csv: string) {
  const headerError = 'El CSV debe incluir encabezados únicos empresa, rubro y ciudad del formato Reac Leads.'
  let headed = false
  const records = parse(csv, {
    bom: true, skip_empty_lines: true, max_record_size: 16384,
    columns: (headers: string[]) => {
      const fields = headers.map((header) => header.trim().toLowerCase())
      if (!['empresa', 'rubro', 'ciudad'].every((key) => fields.includes(key)) || new Set(fields).size !== fields.length) throw new Error(headerError)
      headed = true
      return fields
    },
  }) as Record<string, string>[]
  if (!headed) throw new Error(headerError)
  if (records.length > 1500) throw new Error('El límite es 1500 filas por importación.')
  return records.map((record, index) => {
    const original: CrmRow = Object.fromEntries(crmHeaders.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]))
    const result = prospect.safeParse({
      name: original.empresa, industry: original.rubro, city: original.ciudad,
      region: regionFor(original.ciudad ?? ''), website: original.web, email: original.email,
      phone: original.telefono, sourceUrl: original.fuente_url, verifiedAt: original.fecha_verificacion,
      status: original.estado || undefined, consent: original.consentimiento || undefined,
      notes: original.notas, nextFollowUp: original.proximo_seguimiento,
    })
    return { row: index + 2, original, result }
  })
}

export interface PublicSourceProvider {
  name: string
  capture(value: Source): Source
}
export const manualSource: PublicSourceProvider = { name: 'MANUAL', capture: (value) => source.parse(value) }
export const csvSource: PublicSourceProvider = { name: 'REAC_LEADS_CSV_V1', capture: (value) => source.parse(value) }

export const policyVersion = '1'
export const fixturePath = '/fixture'
export type Mode = z.output<ReturnType<typeof import('./schemas.ts').z.enum<typeof modes>>>
export type ScopeRequest = { mode: Mode; hostname?: string; port?: number; path?: string; method?: string }
export type AuthorizationRecord = Authorization & { state: 'PENDING' | 'APPROVED' | 'REVOKED'; reviewer?: string; reviewedAt?: string }
const denied = (reason: string) => ({ allowed: false as const, reason, policyVersion })

export function scopePolicy(request: ScopeRequest, fixturePort: number, record?: AuthorizationRecord, now = Date.now()) {
  if (request.mode === 'PROSPECCION_PASIVA') return denied('La prospección solo registra fuentes aportadas manualmente.')
  if (request.mode === 'AUDITORIA_AUTORIZADA') {
    if (!record || record.state !== 'APPROVED' || !record.reviewer || !record.reviewedAt || !record.evidence || !record.emergency) return denied('Falta una autorización revisada con evidencia y contacto de emergencia.')
    if (now < Date.parse(record.startsAt) || now >= Date.parse(record.endsAt)) return denied('La solicitud está fuera de la ventana autorizada.')
    if (request.hostname !== record.hostname || request.port !== record.port || request.path !== record.path || !record.methods.some((method) => method === request.method)) return denied('El activo o método está fuera del alcance registrado.')
    return denied('Esta versión solo ejecuta el fixture local.')
  }
  if (request.mode === 'LAB_LOCAL' && request.hostname === '127.0.0.1' && request.port === fixturePort && request.path === fixturePath && request.method === 'HEAD') {
    return { allowed: true as const, reason: 'Fixture local fijo.', policyVersion }
  }
  return denied('Destino o método fuera del fixture. Solo se admite loopback literal, sin DNS.')
}

export const redact = (value: string) => value
  .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redactado]')
  .replace(/\b(?:cookie|set-cookie)\s*:\s*[^\r\n]+/gi, '[redactado]')
  .replace(/\b(?:password|token|api[_-]?key|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)(?=\s|$|[,;])/gi, '[redactado]')

