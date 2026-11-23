import { useEffect, useId, useState } from 'react'
import './dashboard-preview.css'

export type PreviewTheme = 'light' | 'dark' | 'system'

const themeKey = 'reac-preview-theme'
const darkPreference = '(prefers-color-scheme: dark)'

function getPreviewTheme(): PreviewTheme {
  try {
    const value = localStorage.getItem(themeKey)
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark'
  } catch {
    return 'system'
  }
}

export function PreviewThemeSelect({ theme, onChange, label = 'Tema de la vista previa' }: { theme: PreviewTheme; onChange: (theme: PreviewTheme) => void; label?: string }) {
  return <label className="dash-preview__theme">
    <span>Apariencia</span>
    <select aria-label={label} value={theme} onChange={(event) => onChange(event.target.value as PreviewTheme)}>
      <option value="system">Sistema</option>
      <option value="light">Claro</option>
      <option value="dark">Oscuro</option>
    </select>
  </label>
}

const cohort = {
  total: 128,
  thisWeek: 24,
  verified: 96,
  pending: 21,
  contacted: 51,
  replied: 18,
  meetings: 10,
  proposals: 7,
  clients: 3,
  audits: 4,
  campaigns: 6,
}

const activity = [
  { label: 'Investigación incorporada', context: 'Reservas y comercio electrónico', when: 'Hoy, 10:40' },
  { label: 'Respuesta registrada', context: 'Estudio Mirador', when: 'Hoy, 09:15' },
  { label: 'Propuesta preparada', context: 'Comercio La Loma', when: 'Ayer, 16:32' },
]

const followups = [
  { name: 'Posada del Viento', detail: 'Revisar borrador de presentación', when: 'Hoy', tone: 'due' },
  { name: 'Estudio Mirador', detail: 'Confirmar horario de reunión', when: 'Mañana', tone: 'plan' },
  { name: 'Comercio La Loma', detail: 'Preparar seguimiento de propuesta', when: 'En 3 días', tone: 'plan' },
]

const regions = [
  { label: 'Córdoba Capital', count: 62 },
  { label: 'Traslasierra', count: 42 },
  { label: 'Villa Dolores', count: 24 },
]

const industries = [
  { label: 'Turismo y reservas', count: 48 },
  { label: 'Comercio electrónico', count: 35 },
  { label: 'Servicios profesionales', count: 28 },
  { label: 'Otros rubros', count: 17 },
]

const weeks = [
  { label: '02 nov.', researched: 13, verified: 6 },
  { label: '09 nov.', researched: 26, verified: 12 },
  { label: '16 nov.', researched: 37, verified: 22 },
  { label: '23 nov.', researched: 60, verified: 43 },
  { label: '30 nov.', researched: 69, verified: 49 },
  { label: '07 dic.', researched: 93, verified: 66 },
  { label: '14 dic.', researched: 104, verified: 78 },
  { label: '21 dic.', researched: 128, verified: 96 },
]

type Destination = 'research' | 'import' | 'map' | 'pending' | 'export' | 'followup'

const defaultLinks: Record<Destination, string> = {
  research: '#research',
  import: '#discovery',
  map: '#map',
  pending: '#prospects',
  export: '#exports',
  followup: '#prospects',
}

const quickActions: { key: Destination; label: string }[] = [
  { key: 'import', label: 'Importar empresas' },
  { key: 'map', label: 'Ver mapa' },
  { key: 'pending', label: 'Revisar pendientes' },
  { key: 'export', label: 'Exportar cartera' },
]

const percent = (numerator: number, denominator: number) => denominator === 0
  ? 'Sin datos'
  : new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 }).format(numerator / denominator)

function PortfolioChart() {
  const [windowSize, setWindowSize] = useState(8)
  const fillId = useId()
  const visibleWeeks = weeks.slice(-windowSize)
  const ticks = [0, 35, 70, 105, 140]
  const x = (index: number) => 52 + index * (555 / (visibleWeeks.length - 1))
  const y = (count: number) => 176 - count * (155 / 140)
  const coordinates = (series: 'researched' | 'verified') => visibleWeeks.map((week, i) => x(i) + ',' + y(week[series])).join(' ')
  const chartTitle = 'Evolución acumulada desde ' + visibleWeeks[0].label + ': ' + cohort.total + ' investigadas y ' + cohort.verified + ' verificadas al cierre.'

  return <section className="dash-preview__panel dash-preview__chart" aria-labelledby="preview-evolution">
    <div className="dash-preview__panel-head">
      <div><h2 id="preview-evolution">Evolución de la cartera</h2><p>Acumulado semanal de empresas investigadas y verificadas</p></div>
      <div className="dash-preview__segmented" aria-label="Período de evolución">
        {[4, 8].map((size) => <button key={size} type="button" onClick={() => setWindowSize(size)} aria-pressed={size === windowSize}>{size} semanas</button>)}
      </div>
    </div>
    <svg viewBox="0 0 636 203" role="img" aria-label={chartTitle}>
      <defs><linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
        <stop className="dash-preview__area-start" offset="0%" /><stop className="dash-preview__area-end" offset="100%" />
      </linearGradient></defs>
      {ticks.map((value) => <g key={value}>
        <line className="dash-preview__gridline" x1="52" x2="607" y1={y(value)} y2={y(value)} />
        <text x="37" y={y(value) + 4} textAnchor="end">{value}</text>
      </g>)}
      <polygon fill={'url(#' + fillId + ')'} points={x(0) + ',176 ' + coordinates('researched') + ' ' + x(visibleWeeks.length - 1) + ',176'} />
      <polyline className="dash-preview__line-main" points={coordinates('researched')} />
      <polyline className="dash-preview__line-secondary" points={coordinates('verified')} />
      {visibleWeeks.map((week, i) => {
        const position = x(i)
        return <g key={week.label}>
          <circle className="dash-preview__point" cx={position} cy={y(week.researched)} r="3"><title>{week.label + ': ' + week.researched + ' investigadas'}</title></circle>
          <circle className="dash-preview__point-secondary" cx={position} cy={y(week.verified)} r="2.5"><title>{week.label + ': ' + week.verified + ' verificadas'}</title></circle>
          <text x={position} y="196" textAnchor="middle">{week.label}</text>
        </g>
      })}
    </svg>
    <div className="dash-preview__legend"><span>Investigadas</span><span>Verificadas</span></div>
    <details className="dash-preview__chart-table">
      <summary>Ver datos semanales</summary>
      <table>
        <caption>Series de la evolución acumulada</caption>
        <thead><tr><th scope="col">Semana</th><th scope="col">Investigadas</th><th scope="col">Verificadas</th></tr></thead>
        <tbody>{visibleWeeks.map((week) => <tr key={week.label}>
          <th scope="row">{week.label}</th><td>{week.researched}</td><td>{week.verified}</td>
        </tr>)}</tbody>
      </table>
    </details>
  </section>
}

function BarList({ rows, denominator }: { rows: { label: string; count: number }[]; denominator: number }) {
  return <ul className="dash-preview__bars">
    {rows.map((entry) => <li key={entry.label}>
      <span>{entry.label}</span><strong>{entry.count}</strong>
      <meter min={0} max={denominator} value={entry.count} aria-label={entry.label + ': ' + entry.count + ' de ' + denominator} />
    </li>)}
  </ul>
}

export function useDashboardTheme() {
  const [theme, setTheme] = useState<PreviewTheme>(getPreviewTheme)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(darkPreference).matches)
  const resolvedTheme = theme === 'system' ? systemDark ? 'dark' : 'light' : theme
  useEffect(() => {
    const preference = window.matchMedia(darkPreference)
    const update = () => setSystemDark(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  function changeTheme(value: PreviewTheme) {
    setTheme(value)
    try { localStorage.setItem(themeKey, value) } catch { /* The active theme still works. */ }
  }
  return { theme, changeTheme, resolvedTheme }
}

export function DashboardPreview({ appearance }: { appearance: ReturnType<typeof useDashboardTheme> }) {
  const { theme, changeTheme, resolvedTheme } = appearance
  const navigation = defaultLinks

  const funnel = [
    { label: 'Contactadas', count: cohort.contacted },
    { label: 'Respondieron', count: cohort.replied },
    { label: 'Reunión', count: cohort.meetings },
    { label: 'Propuesta enviada', count: cohort.proposals },
    { label: 'Clientes', count: cohort.clients },
  ]

  return <div className="dash-preview" data-preview-theme={resolvedTheme}>
    <header className="dash-preview__top">
      <a href="#dashboard" className="dash-preview__brand" aria-label="Volver al dashboard de Reac Security Lab">
        <span aria-hidden="true">R</span><strong>Reac Security Lab</strong>
      </a>
      <p className="dash-preview__sample">Vista previa con datos ficticios</p>
      <PreviewThemeSelect theme={theme} onChange={changeTheme} />
    </header>
    <main className="dash-preview__main">
      <section className="dash-preview__intro" aria-labelledby="preview-title">
        <div><h1 id="preview-title">Prospección comercial</h1><p>Priorizá empresas verificadas y seguí las conversaciones en curso.</p></div>
        <a href={navigation.research} className="dash-preview__primary">Nueva búsqueda con IA</a>
      </section>
      <nav className="dash-preview__links" aria-label="Acciones rápidas">
        {quickActions.map((action) => <a key={action.key} href={navigation[action.key]}>{action.label}</a>)}
      </nav>
      <dl className="dash-preview__kpis">
        <div><dt>Empresas registradas</dt><dd>{cohort.total}</dd><small>+{cohort.thisWeek} esta semana</small></div>
        <div><dt>Verificadas</dt><dd>{cohort.verified}</dd><small>{cohort.pending} pendientes de verificar</small></div>
        <div><dt>Contactadas</dt><dd>{cohort.contacted}</dd><small>{cohort.replied} respondieron</small></div>
        <div><dt>Tasa de respuesta</dt><dd>{percent(cohort.replied, cohort.contacted)}</dd><small>{cohort.replied} de {cohort.contacted} contactadas</small></div>
      </dl>
      <div className="dash-preview__grid">
        <div className="dash-preview__span-eight"><PortfolioChart /></div>
        <section className="dash-preview__panel dash-preview__span-four" aria-labelledby="preview-followups">
          <div className="dash-preview__panel-head"><div><h2 id="preview-followups">Próximos seguimientos</h2><p>Acciones que requieren atención</p></div></div>
          <ul className="dash-preview__ledger">
            {followups.map((item) => <li key={item.name}><div><strong>{item.name}</strong><span>{item.detail}</span></div><small data-tone={item.tone}>{item.when}</small></li>)}
          </ul>
          <a className="dash-preview__quiet-link" href={navigation.followup}>Preparar seguimientos</a>
        </section>
        <section className="dash-preview__panel dash-preview__span-four" aria-labelledby="preview-funnel">
          <div className="dash-preview__panel-head"><div><h2 id="preview-funnel">Embudo comercial</h2><p>{percent(cohort.clients, cohort.contacted)} de conversión a cliente</p></div></div>
          <BarList rows={funnel} denominator={cohort.contacted} />
        </section>
        <section className="dash-preview__panel dash-preview__span-four" aria-labelledby="preview-distribution">
          <div className="dash-preview__panel-head"><div><h2 id="preview-distribution">Rubros</h2><p>Distribución de la cartera</p></div></div>
          <BarList rows={industries} denominator={cohort.total} />
        </section>
        <section className="dash-preview__panel dash-preview__span-four" aria-labelledby="preview-territory">
          <div className="dash-preview__panel-head"><div><h2 id="preview-territory">Cobertura territorial</h2><p>Empresas agrupadas por región</p></div></div>
          <BarList rows={regions} denominator={cohort.total} />
          <a className="dash-preview__quiet-link" href={navigation.map}>Abrir mapa comercial</a>
        </section>
        <section className="dash-preview__panel dash-preview__span-eight" aria-labelledby="preview-activity">
          <div className="dash-preview__panel-head"><div><h2 id="preview-activity">Actividad reciente</h2></div></div>
          <ul className="dash-preview__ledger dash-preview__ledger--activity">
            {activity.map((item) => <li key={item.label}><div><strong>{item.label}</strong><span>{item.context}</span></div><small>{item.when}</small></li>)}
          </ul>
        </section>
        <section className="dash-preview__panel dash-preview__span-four" aria-labelledby="preview-operations">
          <div className="dash-preview__panel-head"><div><h2 id="preview-operations">Operación</h2></div></div>
          <dl className="dash-preview__operations">
            <div><dt>Campañas realizadas</dt><dd>{cohort.campaigns}</dd></div>
            <div><dt>Auditorías autorizadas</dt><dd>{cohort.audits}</dd></div>
          </dl>
        </section>
      </div>
    </main>
  </div>
}
