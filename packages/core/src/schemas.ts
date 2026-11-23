import { z } from 'zod'
import { statuses, consentOptions, assetKinds, assetStates, pipelineStages, applicationTypes } from './constants.ts'
export * from './constants.ts'

export { z }
export const id = z.uuid()
export const text = (max = 500) => z.string().trim().max(max)
export const required = (max = 500) => text(max).min(1)
export const url = text(2000).refine((value) => {
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
  } catch { return false }
}, 'Ingresá una URL HTTP o HTTPS sin credenciales')
export const optionalUrl = z.union([url, z.literal('')])
export const date = z.iso.date()
export const optionalDate = z.union([date, z.literal('')])
export const instant = z.iso.datetime({ offset: true })
export const prospect = z.strictObject({
  name: required(160), industry: required(120), city: required(120), region: required(120),
  legalName: text(200).optional(), province: text(120).optional(), address: text(250).optional(), registrationId: text(80).optional(),
  applicationType: z.enum(applicationTypes).optional(), contactPurpose: z.enum(['Comercial', 'Derivación', 'Sin verificar']).optional(), website: optionalUrl.default(''), contact: text(160).default(''),
  email: z.union([z.email(), z.literal('')]).default(''), phone: text(60).default(''),
  sourceUrl: optionalUrl.default(''), verifiedAt: optionalDate.default(''),
  status: z.enum(statuses).default('Nuevo'), consent: z.enum(consentOptions).default('Sin registro'),
  notes: text(3000).default(''), nextFollowUp: optionalDate.default(''),
})
export type Prospect = z.output<typeof prospect>
export const source = z.strictObject({
  url, consultedAt: date, provider: required(120), statement: required(1400),
  terms: text(350).default(''),
})
export type Source = z.output<typeof source>
export const discoveryRecord = prospect.pick({ name: true, legalName: true, province: true, address: true, registrationId: true, industry: true, city: true, region: true, website: true, contact: true, contactPurpose: true, email: true, phone: true }).extend({
  website: url, applicationType: z.enum(applicationTypes).exclude(['Sin clasificar']),
  evidence: source, corroboration: source.optional(), opportunity: required(500),
  confidence: z.enum(['ALTA', 'MEDIA', 'BAJA']).default('MEDIA'),
  technologies: z.array(z.strictObject({ name: required(100), source: z.enum(['principal', 'corroboracion']) })).max(5).default([]),
}).refine((entry) => Boolean(entry.corroboration) || !entry.technologies.some((tech) => tech.source === 'corroboracion'), { path: ['technologies'], message: 'Agregá la fuente de corroboración de la tecnología.' })
export const discoveryFile = z.strictObject({ version: z.literal(1), records: z.array(discoveryRecord).min(1).max(100) })

export const publicAsset = z.strictObject({
  sourceId: id, kind: z.enum(assetKinds), value: required(300), status: z.enum(assetStates),
  collectedAt: date, confidence: z.enum(['BAJA', 'MEDIA', 'ALTA']), note: required(700),
}).refine(({ kind, value }) => !['Dominio', 'Subdominio'].includes(kind) ||
  (value.length <= 253 && /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.?$/u.test(value)),
  { path: ['value'], message: 'Ingresá un nombre de dominio, sin protocolo ni ruta.' })
export type PublicAsset = z.output<typeof publicAsset>

export const pipelineEvent = z.strictObject({ stage: z.enum(pipelineStages), note: required(700), service: text(160).default('') })
export type PipelineEvent = z.output<typeof pipelineEvent>
export const observation = z.strictObject({
  sourceId: id, title: required(160), category: required(120), statement: required(1400),
  level: z.enum(['OBSERVACION_PUBLICA', 'HIPOTESIS', 'POTENCIAL_RIESGO']),
  severity: z.enum(['INFORMATIVA', 'BAJA', 'MEDIA', 'ALTA', 'CRITICA']),
  confidence: z.enum(['BAJA', 'MEDIA', 'ALTA']), impact: required(900),
  limitations: required(900), recommendation: required(900),
})
export type Observation = z.output<typeof observation>
export const sha256 = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
export const review = z.strictObject({ reviewer: required(100), acknowledge: z.literal(true) })
export const versionedReview = review.extend({ contentVersion: sha256 })
export const message = z.strictObject({ subject: required(220), body: required(4000) })
export type Message = z.output<typeof message>

export const authorization = z.strictObject({
  organizationId: id, owner: required(200), evidence: text(400).default(''),
  documentSha256: z.union([sha256, z.literal('')]).default(''),
  startsAt: instant, endsAt: instant, emergency: text(150).default(''),
  hostname: required(253).regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i),
  port: z.number().int().min(1).max(65535),
  path: required(300).regex(/^\/[a-zA-Z0-9/._~-]*$/).refine((value) => !/(?:^|\/)\.{1,2}(?:\/|$)/.test(value)),
  methods: z.array(z.enum(['HEAD', 'GET'])).min(1).max(2),
  maxRps: z.number().int().min(1).max(5), maxConcurrency: z.number().int().min(1).max(2),
  prohibited: required(500), timezone: required(100),
}).refine((item) => Date.parse(item.startsAt) < Date.parse(item.endsAt), 'La fecha de fin debe ser posterior al inicio')
export type Authorization = z.output<typeof authorization>
