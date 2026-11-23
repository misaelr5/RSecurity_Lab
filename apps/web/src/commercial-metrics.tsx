import { Resource, useResource, Empty } from './widgets.tsx'

type Group = { name: string; count: number }
type Metrics = {
  newWeek: number; verified: number; pending: number; contacts: number; responses: number; meetings: number
  proposals: number; clients: number; authorized: number; campaigns: number; responseRate: number | null; conversionRate: number | null
  regions: Group[]; industries: Group[]; weekly: { startsAt: string; newCompanies: number; contacts: number }[]
  stages: { stage: string; count: number }[]; followUps: { id: string; name: string; date: string }[]
}

const percentage = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 })
const rate = (value: number | null) => value === null ? 'Sin datos' : percentage.format(value)
const weekDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' })

export function CommercialMetrics({ revision }: { revision: number }) {
  const result = useResource<Metrics>('/commercial/metrics', revision)
  return <section className="panel">
    <h2>Actividad comercial</h2>
    <div className="toolbar">
      <a className="button primary" href="#reprospect">Reprospectar</a>
      {Object.entries({ research: 'Nueva búsqueda con IA', saved: 'Búsquedas guardadas', discovery: 'Importar empresas', review: 'Revisar pendientes', map: 'Ver mapa', exports: 'Exportar historial', preview: 'Vista previa del dashboard' })
        .map(([path, text]) => <a key={path} className="button" href={'#' + path}>{text}</a>)}
    </div>
    <Resource result={result}>{(data) => <>
      <dl className="summary inset">{[
        ['Nuevas esta semana', data.newWeek], ['Verificadas', data.verified], ['Pendientes', data.pending], ['Contactadas', data.contacts],
        ['Respondieron', data.responses], ['En reunión', data.meetings], ['Auditorías propuestas', data.proposals], ['Clientes', data.clients],
        ['Autorizaciones vigentes', data.authorized], ['Lotes terminados', data.campaigns], ['Tasa de respuesta', rate(data.responseRate)], ['Conversión', rate(data.conversionRate)],
      ].map(([text, value]) => <div key={text}><dt>{text}</dt><dd>{value}</dd></div>)}</dl>
      <div className="split inset">
        <Breakdown title="Regiones" groups={data.regions} />
        <Breakdown title="Rubros" groups={data.industries} />
        <Breakdown title="Etapa actual" groups={data.stages.filter((item) => item.count > 0).map(({ stage, count }) => ({ name: stage, count }))} />
        <div><h3>Próximos seguimientos</h3>{data.followUps.length ? <ul className="records">{data.followUps.map((item) =>
          <li key={item.id}><a href={'#prospect/' + item.id}>{item.name}</a><small>{item.date}</small></li>)}</ul> : <Empty>Sin seguimientos agendados.</Empty>}</div>
      </div>
      <div className="table-scroll inset"><table><caption>Evolución semanal</caption><thead><tr><th>Semana</th><th>Nuevas</th><th>Contactadas</th></tr></thead>
        <tbody>{data.weekly.map((item) => <tr key={item.startsAt}><td>{weekDate.format(new Date(item.startsAt))}</td><td>{item.newCompanies}</td><td>{item.contacts}</td></tr>)}</tbody></table></div>
    </>}</Resource>
  </section>
}

function Breakdown({ title, groups }: { title: string; groups: Group[] }) {
  return <div><h3>{title}</h3>{groups.length ? <ul className="records">{groups.map((group) =>
    <li key={group.name}>{group.name} · {group.count}</li>)}</ul> : <Empty>Sin registros.</Empty>}</div>
}
