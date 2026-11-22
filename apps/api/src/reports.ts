import { createHash } from 'node:crypto'
import { id, redact, review, z } from '@reac/core'
import { renderReport } from '@reac/reporting'
import type { Report } from '@reac/reporting'
import type { FastifyInstance } from 'fastify'
import type { Store } from './store.ts'
import type { registerPortfolio } from './portfolio.ts'
import type { registerAudits } from './audits.ts'
import { attach, parse } from './http.ts'

const route = z.strictObject({ kind: z.enum(['prospect', 'lab']), id })
const formats = {
  md: 'text/markdown; charset=utf-8', html: 'text/html; charset=utf-8', csv: 'text/csv; charset=utf-8',
}

export function registerReports(app: FastifyInstance, store: Store, portfolio: ReturnType<typeof registerPortfolio>, audits: ReturnType<typeof registerAudits>) {
  function build(kind: 'prospect' | 'lab', idValue: string): Report {
    if (kind === 'prospect') {
      const item = portfolio.get(idValue)
      return {
        title: 'Relevamiento público preliminar · ' + item.name,
        sections: [
          { title: 'Resumen ejecutivo', lines: [item.industry, item.city + ' · ' + item.region, 'Revisión comercial de fuentes aportadas manualmente. Las hipótesis requieren validación dentro de un alcance acordado.'] },
          { title: 'Fuentes y metodología', lines: portfolio.sourcesFor(item.id).map((item) => item.consultedAt + ' · ' + item.provider + ' · ' + item.url.replace(/[?#].*$/, '') + ' · ' + item.statement) },
          { title: 'Observaciones y revisión', lines: portfolio.notesFor(item.id).map((item) => [item.level, item.title, item.category, item.statement, item.severity, item.confidence, item.impact, item.limitations, item.recommendation, 'Fuente ' + item.sourceId, item.reviewedAt ? 'Revisada ' + item.reviewedAt : 'Pendiente de revisión'].join(' · ')) },
          { title: 'Límites y próximos pasos', lines: ['Alcance limitado a evidencia pública registrada. Una evaluación técnica requiere autorización y alcance acordado.'] },
        ],
      }
    }
    const item = audits.getRun(idValue)
    const evidence = store.list<{ statusCode: number; sha256: string; capturedAt: string }>('evidence_refs', item.id)
    const findings = store.list<{ title: string; present: boolean }>('findings', item.id)
    return {
      title: 'Verificación de configuración · Laboratorio local',
      sections: [
        { title: 'Resumen ejecutivo', lines: [item.status, item.reason, 'Ejercicio sobre un entorno ficticio. Los resultados describen el comportamiento del fixture.'] },
        { title: 'Alcance y metodología', lines: ['HEAD al fixture local de Reac Security Lab (127.0.0.1).', item.tool, item.startedAt ?? item.createdAt, item.finishedAt ?? 'En curso', 'Política de alcance v' + item.policyVersion] },
        { title: 'Evidencia técnica', lines: evidence.map((entry) => 'HTTP ' + entry.statusCode + ' · ' + entry.capturedAt + ' · SHA-256 ' + entry.sha256) },
        { title: 'Resultados', lines: findings.map((entry) => entry.title + ' · ' + (entry.present ? 'Presente' : 'Ausente') + ' · Informativa') },
        { title: 'Límites y validación', lines: ['Se observó presencia de encabezados. Validar el valor de configuración y su efecto requiere una evaluación específica.'] },
      ],
    }
  }
  function content(kind: 'prospect' | 'lab', idValue: string) {
    const raw = build(kind, idValue)
    const report: Report = {
      title: redact(raw.title),
      sections: raw.sections.map((section) => ({ title: section.title, lines: section.lines.length ? section.lines.map(redact) : ['Sin registros.'] })),
    }
    return { report, key: [kind, idValue, createHash('sha256').update(JSON.stringify(report)).digest('hex')].join(':') }
  }
  app.get('/api/reports/:kind/:id', (request) => {
    const { kind, id } = parse(route, request.params)
    const { report, key } = content(kind, id)
    const approval = store.find<{ reviewer: string; reviewedAt: string }>('report_reviews', key, 'unique_key')
    return { ...report, reviewer: approval?.reviewer, reviewedAt: approval?.reviewedAt }
  })
  app.post('/api/reports/:kind/:id/review', (request) => store.transaction(() => {
    const { kind, id } = parse(route, request.params)
    const { reviewer } = parse(review, request.body)
    const { key } = content(kind, id)
    const existing = store.find('report_reviews', key, 'unique_key')
    if (existing) return existing
    store.log('Informe revisado', id)
    return store.insert('report_reviews', { reviewer: redact(reviewer), reviewedAt: new Date().toISOString() }, null, key)
  }))
  app.get('/api/reports/:kind/:id/export/:format', (request, reply) => {
    const { kind, id, format } = parse(route.extend({ format: z.enum(['md', 'html', 'csv']) }), request.params)
    const { report, key } = content(kind, id)
    const approval = store.find<{ reviewer: string; reviewedAt: string }>('report_reviews', key, 'unique_key')
    return attach(reply, 'reac-informe-v1.' + format, formats[format],
      renderReport({ ...report, reviewer: approval?.reviewer, reviewedAt: approval?.reviewedAt }, format))
  })
}

