import { redact } from '@reac/core'

export const batchCompletedAction = 'Lote de prospección procesado'

export type BatchActivity = { name: string; imported: number; duplicates: number }
export type DashboardJob = {
  imported?: number; duplicates?: number; goal?: number; mode?: string
  filters?: {
    city?: string; cities?: string[]; region?: string; regions?: string[]
    industry?: string; industries?: string[]; applicationType?: string; applicationTypes?: string[]
  }
}

export function describeBatch(job: DashboardJob): BatchActivity | undefined {
  const { imported, duplicates, filters = {} } = job
  if (typeof imported !== 'number' || !Number.isSafeInteger(imported) || imported < 0 ||
    typeof duplicates !== 'number' || !Number.isSafeInteger(duplicates) || duplicates < 0) return
  const parts = [
    ...(filters.cities ?? [filters.city]), ...(filters.regions ?? [filters.region]),
    ...(filters.industries ?? [filters.industry]), ...(filters.applicationTypes ?? [filters.applicationType]),
  ].filter((part): part is string => Boolean(part))
  const scope = [...new Set(parts)].map((part) => redact(part).replace(/\s+/g, ' ').trim()).join(' · ')
  const mode = job.mode === 'update' ? 'Actualización' : 'Prospección'
  const goal = job.goal ? ` · objetivo de ${job.goal} empresas` : ''
  return { name: scope ? `${mode} · ${scope}` : mode + goal, imported, duplicates }
}
