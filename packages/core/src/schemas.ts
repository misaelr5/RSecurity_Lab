import { z } from 'zod'

export { z }
export const regions = ['Villa Dolores', 'Traslasierra', 'Córdoba Capital', 'Sin clasificar'] as const
export const statuses = ['Nuevo', 'Verificar', 'Listo para contactar', 'Contactado', 'Respondió', 'Reunión', 'Presupuesto', 'Ganado', 'Perdido', 'No contactar'] as const
export const consentOptions = ['Sin registro', 'Aceptó contacto', 'Excluido'] as const
export const modes = ['PROSPECCION_PASIVA', 'LAB_LOCAL', 'AUDITORIA_AUTORIZADA'] as const
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
  name: required(160), industry: required(120), city: required(120), region: z.enum(regions),
  website: optionalUrl.default(''), contact: text(160).default(''),
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
export const observation = z.strictObject({
  sourceId: id, title: required(160), category: required(120), statement: required(1400),
  level: z.enum(['OBSERVACION_PUBLICA', 'HIPOTESIS', 'POTENCIAL_RIESGO']),
  severity: z.enum(['INFORMATIVA', 'BAJA', 'MEDIA', 'ALTA', 'CRITICA']),
  confidence: z.enum(['BAJA', 'MEDIA', 'ALTA']), impact: required(900),
  limitations: required(900), recommendation: required(900),
})
export type Observation = z.output<typeof observation>
export const review = z.strictObject({ reviewer: required(100), acknowledge: z.literal(true) })
export const message = z.strictObject({ subject: required(220), body: required(4000) })
export type Message = z.output<typeof message>

export const authorization = z.strictObject({
  organizationId: id, owner: required(200), evidence: text(400).default(''),
  startsAt: instant, endsAt: instant, emergency: text(150).default(''),
  hostname: required(253).regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i),
  port: z.number().int().min(1).max(65535),
  path: required(300).regex(/^\/[a-zA-Z0-9/._~-]*$/).refine((value) => !/(?:^|\/)\.{1,2}(?:\/|$)/.test(value)),
  methods: z.array(z.enum(['HEAD', 'GET'])).min(1).max(2),
  maxRps: z.number().int().min(1).max(5), maxConcurrency: z.number().int().min(1).max(2),
  prohibited: required(500), timezone: required(100),
}).refine((item) => Date.parse(item.startsAt) < Date.parse(item.endsAt), 'La fecha de fin debe ser posterior al inicio')
export type Authorization = z.output<typeof authorization>

