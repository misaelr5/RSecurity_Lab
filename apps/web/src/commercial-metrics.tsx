import { useState } from 'react'
import type { CSSProperties } from 'react'
import { when } from './client.ts'
import type { Dashboard as WorkspaceActivity } from './client.ts'
import { Resource, useResource } from './widgets.tsx'
import './workbench.css'

type Region = { name: string; count: number }
type Week = { startsAt: string; newCompanies: number; contacts: number }
type Metrics = {
  total: number; newInPeriod: number; verified: number; pending: number; pendingCandidates: number
  firstPendingCandidate: { id: string; name: string } | null
  contacts: number; responses: number; meetings: number; sentProposals: number; clients: number
  responseRate: number | null; conversionRate: number | null; activeCampaigns: number; duplicatesAvoided: number
  regions: Region[]; weekly: Week[]; followUps: { id: string; name: string; date: string }[]
}

const percent = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 })
const day = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
const displayWeek = (value: string) => day.format(new Date(value))
const ratio = (value: number | null) => value === null ? 'Sin datos' : percent.format(value)
const width = (value: number, max: number) => ({ '--ratio': `${max ? value / max * 100 : 0}%` }) as CSSProperties

export function CommercialMetrics({ revision }: { revision: number }) {
  const metrics = useResource<Metrics>('/commercial/metrics?days=30', revision)
  const workspace = useResource<WorkspaceActivity>('/dashboard', revision)
  return <div className="workbench">
    <section className="workbench-intro" aria-labelledby="portfolio-title">
      <h2 id="portfolio-title">Cartera de prospectos</h2>
      <div className="workbench-actions"><a className="button" href="#research">Nueva búsqueda con IA</a><a className="button primary" href="#reprospect">Reprospectar <span aria-hidden="true">→</span></a></div>
    </section>
    <Resource result={metrics}>{(data) => <>
      <section className="workbench-inbox" aria-labelledby="queue-title">
        <header className="workbench-inbox-head">
          <h2 id="queue-title">Por resolver</h2>
          <a href="#review">Ver bandeja de revisión <span aria-hidden="true">→</span></a>
        </header>
        <div className="workbench-inbox-grid">
          <div className="workbench-task">
            <h3><b>{data.pendingCandidates}</b><span>{data.pendingCandidates === 1 ? 'Candidata por revisar' : 'Candidatas por revisar'}</span></h3>
            {data.firstPendingCandidate ? <a href={'#review/' + encodeURIComponent(data.firstPendingCandidate.id)}>
              <span>Revisar {data.firstPendingCandidate.name}</span><span aria-hidden="true">→</span>
            </a> : <p>{data.pendingCandidates ? 'Consultá las candidatas en la bandeja.' : 'Bandeja al día.'}</p>}
          </div>
          <div className="workbench-task">
            <Resource result={workspace}>{({ pending, firstPendingDraft }) => <>
              <h3><b>{pending}</b><span>{pending === 1 ? 'Borrador por revisar' : 'Borradores por revisar'}</span></h3>
              {firstPendingDraft ? <a href={'#prospect/' + encodeURIComponent(firstPendingDraft.organizationId) + '/drafts/' + encodeURIComponent(firstPendingDraft.draftId)}>
                <span>Revisar borrador de {firstPendingDraft.name}</span><span aria-hidden="true">→</span>
              </a> : <p>{pending ? 'Consultá los borradores en la cartera.' : 'Todos los borradores están revisados.'}</p>}
            </>}</Resource>
          </div>
        </div>
        {data.pending > data.pendingCandidates && <p className="workbench-pending-facts"><a href="#companies">Fichas pendientes de verificar en la cartera</a> · {data.pending - data.pendingCandidates}</p>}
      </section>
      <div className="workbench-kpis" aria-label="Resumen de cartera">
        <div><span>Empresas en cartera</span><strong>{data.total}</strong><a href="#prospects">Abrir cartera</a></div>
        <div><span>Verificadas</span><strong>{data.verified}</strong><a href="#evidence">Ver evidencia</a></div>
        <div><span>Contactadas</span><strong>{data.contacts}</strong><small>{data.responses} con respuesta registrada</small></div>
        <div><span>Campañas activas</span><strong>{data.activeCampaigns}</strong><a href="#campaigns">Ver campañas</a></div>
      </div>

      <div className="workbench-grid">
        <section className="workbench-panel workbench-trend" aria-labelledby="trend-title">
          <div className="workbench-section-head"><h2 id="trend-title">Evolución de la cartera</h2></div>
          <ActivityChart weekly={data.weekly} />
          <PeriodSummary defaultCount={data.newInPeriod} revision={revision} />
        </section>

        <section className="workbench-panel" aria-labelledby="followups-title">
          <div className="workbench-section-head"><h2 id="followups-title">Próximos seguimientos</h2></div>
          {data.followUps.length ? <ul className="workbench-followups">{data.followUps.slice(0, 4).map((item) => <li key={item.id}>
            <a href={'#prospect/' + item.id}>{item.name}</a><time dateTime={item.date}>{displayWeek(item.date + 'T12:00:00')}</time>
          </li>)}</ul> : <p className="workbench-empty">Sin seguimientos agendados.</p>}
        </section>

        <section className="workbench-panel" aria-labelledby="coverage-title">
          <div className="workbench-section-head"><div><h2 id="coverage-title">Presencia por región</h2><p>Distribución de las empresas registradas.</p></div><a href="#map">Abrir mapa <span aria-hidden="true">→</span></a></div>
          <Territory regions={data.regions} total={data.total} />
        </section>

        <section className="workbench-panel" aria-labelledby="pipeline-title">
          <div className="workbench-section-head"><div><h2 id="pipeline-title">Resultados comerciales</h2><p>Hitos registrados en la cartera.</p></div></div>
          <dl className="workbench-outcomes">{[['Respondieron', data.responses], ['Reuniones', data.meetings], ['Propuestas enviadas', data.sentProposals], ['Clientes', data.clients],
            ['Tasa de respuesta', ratio(data.responseRate)], ['Conversión', ratio(data.conversionRate)]].map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl>
        </section>
      </div>
    </>}</Resource>

    <Resource result={workspace}>{(data) => <section className="workbench-panel workbench-recent" aria-labelledby="recent-title">
      <div className="workbench-section-head"><h2 id="recent-title">Actividad reciente</h2><a href="#companies">Ver historial <span aria-hidden="true">→</span></a></div>
      {metrics.value && <p className="workbench-caption">{metrics.value.duplicatesAvoided} duplicados evitados en el historial de lotes</p>}
      {data.activity.length ? <ul className="workbench-timeline">{data.activity.slice(0, 6).map((event) => <li key={event.id}>
        {event.batch && event.entity ? <div><a href={'#research/' + encodeURIComponent(event.entity)}>{event.batch.name}</a><small>
          {event.batch.asOfCompletion ? 'Al cierre' : 'Total actual del lote'} · {event.batch.imported} {event.batch.imported === 1 ? 'empresa incorporada' : 'empresas incorporadas'} · {event.batch.duplicates} {event.batch.duplicates === 1 ? 'duplicado evitado' : 'duplicados evitados'}
        </small></div> : <span>{event.action}</span>}
        <time dateTime={event.createdAt}>{when(event.createdAt)}</time></li>)}</ul>
        : <p className="workbench-empty">La actividad aparecerá al registrar una ficha, un lote o una revisión.</p>}
      <div className="workbench-links"><a href="#saved">Búsquedas guardadas</a><a href="#enrichment">Enriquecer fichas</a><a href="#exports">Exportar historial</a>
        <a href="#audits">Autorizaciones ({data.authorized})</a><a href="#preview">Vista previa del dashboard</a></div>
    </section>}</Resource>
  </div>
}

function PeriodSummary({ defaultCount, revision }: { defaultCount: number; revision: number }) {
  const [days, setDays] = useState('30')
  return <div className="workbench-period-summary">
    <label className="field workbench-period">Período de altas<select value={days} onChange={(event) => setDays(event.target.value)}>
      <option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option>
    </select></label>
    <div aria-live="polite">{days === '30' ? <PeriodCount count={defaultCount} /> : <SelectedPeriod days={days} revision={revision} />}</div>
  </div>
}

function SelectedPeriod({ days, revision }: { days: string; revision: number }) {
  const result = useResource<Pick<Metrics, 'newInPeriod'>>('/commercial/metrics?days=' + days, revision)
  return <Resource result={result}>{({ newInPeriod }) => <PeriodCount count={newInPeriod} />}</Resource>
}

function PeriodCount({ count }: { count: number }) {
  return <span><strong>{count}</strong> {count === 1 ? 'alta en el período' : 'altas en el período'}</span>
}

function ActivityChart({ weekly }: { weekly: Week[] }) {
  const active = weekly.filter(({ newCompanies, contacts }) => newCompanies > 0 || contacts > 0)
  if (!active.length) return <p className="workbench-empty">Sin altas ni contactos en las últimas ocho semanas.</p>
  if (active.length === 1) {
    const [week] = active
    return <p className="workbench-single-week">Semana del <time dateTime={week.startsAt}>{displayWeek(week.startsAt)}</time>
      <strong>{week.newCompanies} {week.newCompanies === 1 ? 'alta' : 'altas'} · {week.contacts} {week.contacts === 1 ? 'contacto' : 'contactos'}</strong>
      Única semana con actividad en las últimas ocho.</p>
  }
  const max = Math.max(...active.flatMap(({ newCompanies, contacts }) => [newCompanies, contacts]))
  const scale = Math.ceil(max / 4) * 4
  return <>
    <p className="workbench-caption">Altas y contactos de las últimas ocho semanas.</p>
    <div className="workbench-chart" aria-hidden="true">
      <div className="workbench-axis">{Array.from({ length: 5 }, (_, i) => <span key={i}>{scale - (scale / 4) * i}</span>)}</div>
      <div className="workbench-plot">{weekly.map((week) => <div className="workbench-week" key={week.startsAt}>
        <div className="workbench-bars"><i style={width(week.newCompanies, scale)} /><i style={width(week.contacts, scale)} /></div><span>{displayWeek(week.startsAt)}</span>
      </div>)}</div>
    </div>
    <div className="workbench-chart-key" aria-hidden="true"><span>Altas</span><span>Contactos</span></div>
    <details className="workbench-chart-data"><summary>Ver datos semanales</summary><div className="table-scroll"><table>
      <thead><tr><th scope="col">Semana</th><th scope="col">Nuevas</th><th scope="col">Contactadas</th></tr></thead>
      <tbody>{weekly.map((week) => <tr key={week.startsAt}><th scope="row">{displayWeek(week.startsAt)}</th><td>{week.newCompanies}</td><td>{week.contacts}</td></tr>)}</tbody>
    </table></div></details>
  </>
}

function Territory({ regions, total }: { regions: Region[]; total: number }) {
  if (!regions.length) return <p className="workbench-empty">Todavía no hay empresas para agrupar por región.</p>
  return <ul className="workbench-territory">{regions.map(({ name, count }) => <li key={name}>
    <span>{name}</span><i aria-hidden="true" style={width(count, total)} /><b>{count}</b>
  </li>)}</ul>
}
