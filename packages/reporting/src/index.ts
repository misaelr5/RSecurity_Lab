import { crmHeaders } from '@reac/core'
import type { CrmRow } from '@reac/core'

export function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^[\t\r\n]|^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}

export function csv(rows: readonly (readonly unknown[])[]) {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function crmCsv(rows: CrmRow[]) {
  return csv([crmHeaders, ...rows.map((row) => crmHeaders.map((key) => row[key]))])
}

const html = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char] ?? char)
const markdown = (value: string) => value.replace(/[\r\n]+/g, ' ').replace(/[\\\x60*_[\]<>|#&~!]/g, '\\$&')
export type Report = { title: string; reviewedAt?: string; reviewer?: string; sections: { title: string; lines: string[] }[] }
export type Format = 'md' | 'html' | 'csv'

export function renderReport(report: Report, format: Format) {
  const state = report.reviewedAt ? 'REVISADO' : 'BORRADOR'
  const sections = [
    { title: 'Control de revisión', lines: [state, 'Confidencial · Reac Studio', 'Formato v1', ...(report.reviewedAt && report.reviewer ? [report.reviewer, report.reviewedAt] : [])] },
    ...report.sections,
  ]
  if (format === 'csv') return csv([['informe', 'seccion', 'detalle'], ...sections.flatMap((section) => section.lines.map((line) => [report.title, section.title, line]))])
  if (format === 'md') return ['# ' + markdown(report.title), ...sections.flatMap((section) => ['', '## ' + markdown(section.title), '', ...section.lines.map((line) => '- ' + markdown(line))]), ''].join('\n')
  const content = sections.map((section) =>
    '<section><h2>' + html(section.title) + '</h2><ul>' + section.lines.map((line) => '<li>' + html(line) + '</li>').join('') + '</ul></section>').join('')
  return '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' +
    html(report.title) + '</title><style>body{font:16px/1.5 system-ui;margin:40px auto;padding:0 24px;max-width:760px;color:#172330} h2{border-bottom:1px solid #ccc}li{margin:.4em 0;overflow-wrap:anywhere}@media print{body{margin:0}h2{break-after:avoid}}</style><main><h1>' +
    html(report.title) + '</h1>' + content + '</main></html>'
}

