import { useState } from 'react'
import { applicationTypes } from '../../../packages/core/src/constants.ts'
import { api, today, when } from './client.ts'
import type { Detail, Organization, Page } from './client.ts'
import { Empty, Feedback, Field, Resource, useAction, useResource, values } from './widgets.tsx'

const fieldNames = { legalName: 'Razón social', industry: 'Rubro', region: 'Región', city: 'Localidad', province: 'Provincia', address: 'Dirección',
  website: 'Sitio corporativo', applicationType: 'Tipo de aplicación',
  contact: 'Canal comercial', email: 'Correo comercial', phone: 'Teléfono comercial' } as const
type ChangeField = keyof typeof fieldNames
const fields = Object.keys(fieldNames) as ChangeField[]
const decisions = { NUEVO: 'Incorporar dato', ACTUALIZABLE: 'Fuente más reciente', SIN_CAMBIO: 'Sin cambios', CONSERVAR_EXISTENTE: 'Conservar dato verificado', BLOQUEADO: 'Fuente o ficha fuera de alcance' } as const
type Change = { field: ChangeField; current: string; proposed: string; disposition: keyof typeof decisions; confidence?: string; reason?: string }
type Proposal = { id: string; provider: 'ORCA' | 'MANUAL'; source: { url: string; consultedAt: string; statement: string };
  state: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'; comparison: Change[]; contentVersion: string; reviewedAt?: string; reviewer?: string;
  appliedFields?: ChangeField[]; research?: { jobId: string } }
const isEligible = (item: Change) => ['NUEVO', 'ACTUALIZABLE'].includes(item.disposition)

export function Enrichment({ id, revision, refresh }: { id?: string; revision: number; refresh: () => void }) {
  return id ? <EnrichmentProfile id={id} revision={revision} refresh={refresh} /> : <EnrichmentDirectory revision={revision} />
}

function EnrichmentDirectory({ revision }: { revision: number }) {
  const [query, setQuery] = useState('')
  const result = useResource<Page>('/prospects?q=' + encodeURIComponent(query), revision)
  return <section className="panel">
    <div className="v4-section-heading"><div><h2>Elegí una ficha para enriquecer</h2><p className="muted">Actualizá los datos con evidencia del sitio oficial.</p></div>
      <a className="button" href="#update-prospects">Actualizar prospectos por lote</a></div>
    <label className="field inset">Buscar empresa<input value={query} maxLength={120} onChange={(event) => setQuery(event.target.value)} /></label>
    <Resource result={result}>{({ items, total }) => items.length ? <>
      <ul className="records">{items.map((item) => <li key={item.id} className="run-row"><div><strong>{item.name}</strong><small>{item.city} · {item.industry}</small></div>
        <a className="button" href={'#enrichment/' + item.id}>Abrir enriquecimiento</a></li>)}</ul>
      {total > items.length && <p className="muted">Se muestran {items.length} de {total}. Afiná la búsqueda para encontrar la empresa.</p>}
    </> : <Empty>No hay empresas que coincidan con la búsqueda.</Empty>}</Resource>
  </section>
}

function EnrichmentProfile({ id, revision, refresh }: { id: string; revision: number; refresh: () => void }) {
  const company = useResource<Detail>('/prospects/' + id, revision)
  const proposals = useResource<Proposal[]>('/prospects/' + id + '/enrichment', revision)
  const [creating, setCreating] = useState(false)
  return <Resource result={company}>{({ org }) => {
    const blocked = org.archivedAt || org.consent === 'Excluido' || org.status === 'No contactar' || org.status === 'Perdido'
    const eligible = !blocked && Boolean(org.website)
    return <>
      <section className="panel"><div className="v4-section-heading"><div><h2>{org.name}</h2><p className="muted">{org.city} · {org.industry}</p></div>
        <a href={'#prospect/' + org.id} className="button">Abrir ficha comercial</a></div>
        <p className="inset">Investigá el sitio oficial desde Orca y cargá la evidencia pública que respalda el cambio.</p>
        {eligible ? <button className="primary" onClick={() => setCreating(!creating)}>{creating ? 'Cerrar carga' : 'Cargar propuesta'}</button>
          : <Empty>{blocked ? 'Esta ficha está archivada, descartada o excluida del enriquecimiento.' : 'Registrá primero un sitio oficial en la ficha comercial.'}</Empty>}
      </section>
      {eligible && creating && <ProposalForm org={org} refresh={() => { refresh(); setCreating(false) }} />}
      <section className="panel"><h2>Comparación de versiones</h2>
        <Resource result={proposals}>{(items) => items.length ? <ul className="records v4-review-items">{items.map((item) =>
          <li key={item.id}><ProposalDetails proposal={item} org={org} refresh={refresh} eligible={eligible} /></li>)}</ul>
          : <Empty>Todavía no hay propuestas de enriquecimiento para esta empresa.</Empty>}</Resource>
      </section>
    </>
  }}</Resource>
}

function ProposalForm({ org, refresh }: { org: Organization; refresh: () => void }) {
  const action = useAction(refresh)
  return <section className="panel"><h2>Nueva propuesta de enriquecimiento</h2>
    <form className="fields v4-fields" onSubmit={(event) => {
      const data = values(event)
      void action.run(async () => {
        const proposed = Object.fromEntries(fields.map((name) => [name, data[name]?.trim()]).filter(([, value]) => value))
        if (!Object.keys(proposed).length) throw new Error('Completá al menos un dato publicado para comparar.')
        await api('/prospects/' + org.id + '/enrichment', 'POST', {
          provider: data.provider, confidence: data.confidence, source: { url: data.url, consultedAt: data.consultedAt, provider: data.publisher, statement: data.statement }, fields: proposed,
        })
      }, 'Propuesta guardada.')
    }}>
      <label className="field">Origen de la evidencia<select name="provider"><option value="ORCA">Investigación desde Orca</option><option value="MANUAL">Consulta manual</option></select></label>
      <Field label="Nombre de la publicación" name="publisher" value={org.name} required />
      <Field label="URL HTTPS de la fuente" name="url" type="url" value={org.website} required />
      <Field label="Fecha de consulta" name="consultedAt" type="date" value={today()} required />
      <label className="field">Confianza de la evidencia<select name="confidence" defaultValue="MEDIA">
        <option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option>
      </select></label>
      <Field label="Qué confirma la fuente" name="statement" area required />
      {fields.map((field) => <Field key={field} label={fieldNames[field]} name={field}
        options={field === 'applicationType' ? ['', ...applicationTypes.filter((item) => item !== 'Sin clasificar')] : undefined}
        type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : field === 'website' ? 'url' : 'text'} />)}
      <div className="wide"><button className="primary" disabled={action.busy}>Preparar comparación</button></div>
    </form><Feedback state={action} />
  </section>
}

function ProposalDetails({ proposal, org, refresh, eligible }: { proposal: Proposal; org: Organization; refresh: () => void; eligible: boolean }) {
  const [selected, setSelected] = useState<ChangeField[]>([])
  const action = useAction(refresh)
  const allowed = proposal.comparison.filter(isEligible).map((item) => item.field)
  const chosen = selected.filter((item) => allowed.includes(item))
  return <>
    <div className="v4-section-heading"><div><h3>{proposal.provider === 'ORCA' ? 'Evidencia cotejada desde Orca' : 'Evidencia manual'}</h3>
      <small>{proposal.source.consultedAt} · {proposal.state === 'PENDIENTE' ? 'Pendiente de revisión' : proposal.state === 'APROBADA' ? 'Aprobada' : 'Rechazada'}</small></div>
      <a href={proposal.source.url} target="_blank" rel="noopener noreferrer">Ver fuente oficial</a></div>
    <p>{proposal.source.statement}</p>
    {proposal.research && <a href={'#research/' + proposal.research.jobId}>Ver lote de origen</a>}
    <div className="table-scroll inset"><table>
      <thead><tr><th scope="col">Dato</th><th scope="col">Valor anterior</th><th scope="col">Propuesta</th><th scope="col">Criterio</th></tr></thead>
      <tbody>{proposal.comparison.map((item) => <tr key={item.field}><th scope="row">{fieldNames[item.field]}</th>
        <td>{item.current || 'Vacío'}</td><td>{item.proposed}{item.confidence && <small>Confianza {item.confidence.toLowerCase()}</small>}</td>
        <td>{decisions[item.disposition]}{item.reason && <small>{item.reason}</small>}</td></tr>)}</tbody>
    </table></div>
    {proposal.reviewedAt && <p className="muted">Revisó {proposal.reviewer} · {when(proposal.reviewedAt)}{proposal.appliedFields?.length ? ' · Aplicados: ' + proposal.appliedFields.map((field) => fieldNames[field]).join(', ') : ''}</p>}
    {eligible && proposal.state === 'PENDIENTE' && <details><summary>Revisar propuesta</summary>
      <form className="fields v4-fields" onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter
        const decision = submitter instanceof HTMLButtonElement && submitter.value === 'RECHAZAR' ? 'RECHAZAR' : 'APROBAR'
        const data = values(event)
        void action.run(async () => {
          if (decision === 'APROBAR' && !chosen.length) throw new Error('Elegí los datos que querés actualizar.')
          await api('/prospects/' + org.id + '/enrichment/' + proposal.id + '/review', 'POST', {
            decision, reviewer: data.reviewer, acknowledge: true, contentVersion: proposal.contentVersion,
            ...(decision === 'APROBAR' ? { fields: chosen } : {}),
          })
        }, 'Revisión registrada.')
      }}>
        {allowed.map((field) => <label className="check" key={field}><input type="checkbox" checked={chosen.includes(field)}
          onChange={(event) => setSelected(event.target.checked ? [...selected, field] : selected.filter((item) => item !== field))} />Aplicar {fieldNames[field].toLowerCase()}</label>)}
        {!allowed.length && <p className="muted wide">La comparación no contiene cambios elegibles.</p>}
        <Field label="Responsable de la revisión" name="reviewer" required />
        <label className="check wide"><input type="checkbox" required />Confirmo que revisé la fuente y los valores de esta propuesta.</label>
        <div className="toolbar wide"><button className="primary" value="APROBAR" disabled={!chosen.length || action.busy}>Aplicar cambios seleccionados</button>
          <button value="RECHAZAR" disabled={action.busy}>Rechazar propuesta</button></div>
      </form>
    </details>}
    <Feedback state={action} />
  </>
}
