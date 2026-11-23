import { useState } from 'react'
import { api, when } from './client.ts'
import type { Page } from './client.ts'
import { researchStatus } from './research-fields.tsx'
import { Empty, Feedback, Field, Resource, useAction, useResource, values } from './widgets.tsx'

const states = { ACTIVA: 'Activa', PAUSADA: 'Pausada', CERRADA: 'Cerrada' } as const
type CampaignStatus = keyof typeof states
type Results = { members: number; researched: number; verified: number; contacted: number; responses: number; meetings: number; proposals: number;
  clients: number; excluded: number; pendingDrafts: number; responseRate: number | null; conversionRate: number | null }
type Campaign = { id: string; name: string; objective: string; region: string; industry: string; targetCount: number | null;
  status: CampaignStatus; createdAt: string; metrics: Results & { batches: number } }
type Member = { id: string; organizationId: string; name: string; city: string; region: string; industry: string; status: string; excluded: boolean;
  contacted: boolean; responded: boolean; client: boolean }
type CampaignDetail = { campaign: Campaign; members: Member[]; jobs: { id: string; state: string; createdAt: string }[];
  performance: { byCity: (Results & { name: string })[]; byIndustry: (Results & { name: string })[] } }
const percent = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 })
const rate = (number: number | null) => number === null ? 'Sin datos' : percent.format(number)

export function Campaigns({ id, revision, refresh }: { id?: string; revision: number; refresh: () => void }) {
  return id ? <CampaignWorkspace id={id} revision={revision} refresh={refresh} /> : <CampaignIndex revision={revision} refresh={refresh} />
}

function CampaignIndex({ revision, refresh }: { revision: number; refresh: () => void }) {
  const list = useResource<Campaign[]>('/campaigns', revision)
  const [creating, setCreating] = useState(false)
  return <>
    <section className="panel"><div className="v4-section-heading"><h2>Seguimiento de campañas</h2>
      <button className="primary" onClick={() => setCreating(!creating)}>{creating ? 'Cerrar alta' : 'Crear campaña'}</button></div>
      <Resource result={list}>{(items) => items.length ? <div className="table-scroll inset"><table>
        <thead><tr><th scope="col">Campaña</th><th scope="col">Estado</th><th scope="col">Asociadas</th><th scope="col">Contactadas</th><th scope="col">Clientes</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td><a href={'#campaigns/' + item.id}>{item.name}</a><small>{[item.region, item.industry].filter(Boolean).join(' · ')}</small></td>
          <td>{states[item.status]}</td><td>{item.metrics.members}</td><td>{item.metrics.contacted}</td><td>{item.metrics.clients}</td>
        </tr>)}</tbody>
      </table></div> : <Empty>Creá una campaña para asociar empresas y medir sus resultados.</Empty>}</Resource>
    </section>
    {creating && <CampaignForm refresh={refresh} close={() => setCreating(false)} />}
  </>
}

function CampaignForm({ campaign, refresh, close }: { campaign?: Campaign; refresh: () => void; close: () => void }) {
  const action = useAction(() => { refresh(); close() })
  return <section className="panel"><h2>{campaign ? 'Editar campaña' : 'Nueva campaña'}</h2>
    <form className="fields v4-fields" onSubmit={(event) => {
      const data = values(event)
      const body = { name: data.name, objective: data.objective, region: data.region, industry: data.industry, status: data.status,
        targetCount: data.targetCount ? Number(data.targetCount) : null }
      void action.run(async () => {
        const result = await api<Campaign>(campaign ? '/campaigns/' + campaign.id : '/campaigns', campaign ? 'PATCH' : 'POST', body)
        if (!campaign) window.location.hash = 'campaigns/' + result.id
      }, 'Campaña guardada.')
    }}>
      <Field label="Nombre de campaña" name="name" value={campaign?.name} required />
      <label className="field">Estado de campaña<select name="status" defaultValue={campaign?.status ?? 'ACTIVA'}>
        {Object.entries(states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <Field label="Objetivo" name="objective" area value={campaign?.objective} />
      <Field label="Región" name="region" value={campaign?.region} /><Field label="Rubro" name="industry" value={campaign?.industry} />
      <label className="field">Cantidad objetivo<input name="targetCount" type="number" min="1" max="10000" defaultValue={campaign?.targetCount ?? undefined} /></label>
      <div className="toolbar wide"><button className="primary" disabled={action.busy}>Guardar campaña</button><button type="button" onClick={close}>Cancelar edición</button></div>
    </form><Feedback state={action} />
  </section>
}

function CampaignWorkspace({ id, revision, refresh }: { id: string; revision: number; refresh: () => void }) {
  const detail = useResource<CampaignDetail>('/campaigns/' + id, revision)
  const [editing, setEditing] = useState(false)
  const [associating, setAssociating] = useState(false)
  return <Resource result={detail}>{({ campaign, members, jobs, performance }) => <>
    <section className="panel">
      <div className="v4-section-heading"><div><h2>{campaign.name}</h2><p className="muted">{[campaign.region, campaign.industry, when(campaign.createdAt)].filter(Boolean).join(' · ')}</p></div>
        <span className="tag">{states[campaign.status]}</span></div>
      {campaign.objective && <p className="inset">{campaign.objective}</p>}
      <div className="toolbar inset">
        <a className="button" href="#campaigns">Volver a campañas</a>
        <a className="button primary" href={'#reprospect/' + campaign.id}>Reprospectar en campaña</a>
        <button onClick={() => setEditing(!editing)}>{editing ? 'Cerrar edición' : 'Editar campaña'}</button>
        <button onClick={() => setAssociating(!associating)}>{associating ? 'Cerrar selector' : 'Asociar empresas'}</button>
        <a className="button" href={'#map/' + campaign.id}>Ver cobertura</a>
      </div>
      <dl className="summary inset">{[['Objetivo', campaign.targetCount ?? 'Sin definir'], ['Investigadas', campaign.metrics.researched], ['Asociadas', campaign.metrics.members],
        ['Verificadas', campaign.metrics.verified], ['Borradores pendientes', campaign.metrics.pendingDrafts], ['Contactadas', campaign.metrics.contacted],
        ['Respondieron', campaign.metrics.responses], ['Reuniones', campaign.metrics.meetings], ['Propuestas', campaign.metrics.proposals],
        ['Clientes', campaign.metrics.clients], ['Excluidas', campaign.metrics.excluded], ['Respuesta', rate(campaign.metrics.responseRate)],
        ['Conversión', rate(campaign.metrics.conversionRate)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>
    {editing && <CampaignForm campaign={campaign} refresh={refresh} close={() => setEditing(false)} />}
    {associating && <MembersPicker id={id} revision={revision} refresh={refresh} existing={new Set(members.map((member) => member.organizationId))} />}
    <section className="panel"><h2>Empresas asociadas</h2>
      {members.length ? <div className="table-scroll"><table><thead><tr><th scope="col">Empresa</th><th scope="col">Ubicación</th><th scope="col">Estado</th><th scope="col">Contacto</th></tr></thead>
        <tbody>{members.map((member) => <tr key={member.id}><td><a href={'#prospect/' + member.organizationId}>{member.name}</a><small>{member.industry}</small></td>
          <td>{member.city}<small>{member.region}</small></td><td>{member.excluded ? 'Excluida' : member.status}</td>
          <td>{member.client ? 'Cliente' : member.responded ? 'Respondió' : member.contacted ? 'Registrado' : 'Sin contacto registrado'}</td></tr>)}</tbody>
      </table></div> : <Empty>Asociá empresas de la cartera o iniciá una búsqueda en esta campaña.</Empty>}
    </section>
    {performance && <section className="panel"><h2>Rendimiento por ciudad y rubro</h2><div className="split">
      <PerformanceTable rows={performance.byCity} name="Ciudad" /><PerformanceTable rows={performance.byIndustry} name="Rubro" />
    </div></section>}
    <section className="panel"><h2>Lotes de la campaña</h2>{jobs.length ? <ul className="records">{jobs.map((job) => <li key={job.id}>
      <a href={'#research/' + job.id}>{when(job.createdAt)}</a><small>{researchStatus(job.state)}</small>
    </li>)}</ul> : <Empty>La campaña todavía no tiene lotes.</Empty>}</section>
  </>}</Resource>
}

function PerformanceTable({ rows, name }: { rows: (Results & { name: string })[]; name: string }) {
  return rows.length ? <div className="table-scroll"><table><caption>{name}</caption>
    <thead><tr><th scope="col">{name}</th><th scope="col">Empresas</th><th scope="col">Contactadas</th><th scope="col">Respuestas</th><th scope="col">Clientes</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.name}><th scope="row">{row.name}</th><td>{row.members}</td><td>{row.contacted}</td><td>{row.responses}</td><td>{row.clients}</td></tr>)}</tbody>
  </table></div> : <Empty>Sin datos por {name.toLowerCase()}.</Empty>
}

function MembersPicker({ id, revision, refresh, existing }: { id: string; revision: number; refresh: () => void; existing: Set<string> }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [summary, setSummary] = useState<{ added: number; existing: number; excluded: number }>()
  const matches = useResource<Page>('/prospects?q=' + encodeURIComponent(query), revision)
  const action = useAction(() => { refresh(); setSelected([]) })
  return <section className="panel"><h2>Asociar empresas de la cartera</h2>
    <label className="field">Buscar en la cartera<input value={query} maxLength={120} onChange={(event) => setQuery(event.target.value)} /></label>
    <Resource result={matches}>{({ items }) => <ul className="records">{items.filter((item) => !existing.has(item.id)).map((item) => {
      const blocked = item.status === 'No contactar' || item.status === 'Perdido' || item.consent === 'Excluido'
      return <li key={item.id}><label className="check"><input type="checkbox" disabled={blocked} checked={selected.includes(item.id)}
        onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((key) => key !== item.id))} />
        <span>{item.name}<small>{item.city}{blocked ? ' · Excluida o descartada' : ''}</small></span></label></li>
    })}</ul>}</Resource>
    <div className="toolbar inset"><button disabled={!selected.length || action.busy} onClick={() => void action.run(async () => {
      setSummary(await api('/campaigns/' + id + '/members', 'POST', { organizationIds: selected }))
    }, 'Se procesó la selección.')}>Asociar selección ({selected.length})</button>
      {selected.length > 0 && <button onClick={() => setSelected([])}>Limpiar selección</button>}</div>
    <Feedback state={action} />{summary && <p className="muted" role="status">{summary.added} asociadas · {summary.existing} ya asociadas · {summary.excluded} excluidas.</p>}
  </section>
}
