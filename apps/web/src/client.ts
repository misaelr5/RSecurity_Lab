import type { Prospect, Source, Observation, AuthorizationRecord, Message, PublicAsset, PipelineEvent } from '@reac/core'
import type { Report as PrintableReport } from '@reac/reporting'
type Report = PrintableReport & { contentVersion: string }
import type { Finding } from '../../api/src/defensive-reviews.ts'
import type { Run } from '../../api/src/audits.ts'

export type Entity<T> = T & { id: string; createdAt: string; updatedAt: string }
export type Organization = Entity<Prospect & { origin: string }>
export type Reviewed = { reviewedAt?: string; reviewer?: string }
export type PublicSource = Entity<Source>
export type Asset = Entity<PublicAsset>
export type Pipeline = { stage: PipelineEvent['stage']; events: Entity<PipelineEvent>[] }
export type PipelineMetrics = { stages: { stage: string; count: number }[]; contactados: number; respondieron: number }
export type Detail = { org: Organization; duplicates: { id: string; name: string; matches: string[] }[]; sources: PublicSource[]; observations: Entity<Observation & Reviewed>[]; drafts: Entity<Message & Reviewed & { contentVersion: string; channel?: 'Email' | 'WhatsApp' }>[] }
export type Dashboard = { total: number; regions: Record<string, number>; verified: number; pending: number; authorized: number; lab: number; activity: Entity<{ action: string }>[] }
export type Page = { items: Organization[]; total: number; page: number }
export type Audit = Entity<Run>
export type Authorization = Entity<AuthorizationRecord & { effectiveState: string; contentVersion: string }>
export type AuditDetail = { run: Audit; evidence: { id: string; statusCode: number; sha256: string }[]; findings: ({ id: string; title: string; present: boolean } | Entity<Finding & { contentVersion: string }>)[] }
export type Settings = { database: string; version: string; fixture: string; tools: { name: string; status: string }[]; limits: Record<string, number> }
export type { Report }

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/v1' + path, {
    method,
    ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
  })
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/operator/')) window.dispatchEvent(new Event('reac-session-expired'))
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message ?? error.reason ?? 'La operación no se pudo completar.')
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

export const when = (value: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
export const today = () => new Date().toLocaleDateString('sv-SE')
