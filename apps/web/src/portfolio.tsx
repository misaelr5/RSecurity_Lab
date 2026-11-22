import { Assets, CommercialTimeline, OpportunityScore } from './public-work.tsx'
import { useState } from 'react'
import { regions, statuses, consentOptions, applicationTypes } from '../../../packages/core/src/constants.ts'
import { api, today, when } from './client.ts'
import type { Detail, Organization, Page } from './client.ts'
import { Empty, Feedback, Field, Resource, Review, useAction, useResource, values } from './widgets.tsx'

type Props = { revision: number; refresh: () => void; open: (path: string) => void }

export function Prospects({ revision, refresh, open, sourcesOnly = false }: Props & { sourcesOnly?: boolean }) {
  const [query, setQuery] = useState({ q: '', region: '', industry: '', applicationType: '', status: '', page: '1' })
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value))
  const result = useResource<Page>('/prospects?' + params, revision)
  const knownRegions = useResource<string[]>('/prospect-regions', revision)
  const action = useAction(refresh)
  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number; invalid: { row: number; fields: string[] }[]; exclusionsApplied: number }>()
  const update = (field: keyof typeof query, value: string) => setQuery({ ...query, page: '1', [field]: value })
  return <>
    {!sourcesOnly && <div className="toolbar">
      <button className="primary" onClick={() => { setAdding(!adding); setImporting(false) }}>{adding ? 'Cerrar alta' : 'Nuevo prospecto'}</button>
      <button onClick={() => { setImporting(!importing); setAdding(false) }}>{importing ? 'Cerrar importación' : 'Importar CSV o JSON'}</button>
      <a className="button" href="/api/v1/prospects/export">Exportar CSV</a><a className="button" href="/api/v1/prospects/export/json">Exportar JSON</a>
    </div>}
    {adding && <ProspectForm busy={action.busy} onSave={(data) => void action.run(async () => {
      const org = await api<Organization>('/prospects', 'POST', data.prospect)
      setAdding(false)
      open('prospect/' + org.id)
    }, 'Prospecto guardado.')} />}
    {importing && <section className="panel"><h2>Importar prospectos</h2>
      <p className="muted">Seleccioná un CSV de Reac Leads o un JSON v1 de Security Lab con hasta 1500 filas. Los duplicados conservan la ficha existente y las exclusiones se aplican.</p>
      <form className="toolbar" onSubmit={(event) => {
        event.preventDefault()
        const file = new FormData(event.currentTarget).get('file')
        void action.run(async () => {
          if (!(file instanceof File) || !file.size) throw new Error('Seleccioná un archivo CSV o JSON.')
          if (file.size > 900000) throw new Error('El archivo supera el máximo de 900 KB.')
          const contents = await file.text()
          if (file.name.toLowerCase().endsWith('.json')) {
            let data: unknown
            try { data = JSON.parse(contents) }
            catch { throw new Error('El archivo JSON tiene un formato inválido.') }
            setImportResult(await api('/prospects/import/json', 'POST', data))
          } else {
            setImportResult(await api('/prospects/import', 'POST', { csv: contents, version: 1 }))
          }
        }, 'Archivo procesado.')
      }}><label className="field">Archivo de prospectos<input type="file" name="file" accept=".csv,.json,text/csv,application/json" required /></label><button disabled={action.busy}>Importar archivo</button></form>
      {importResult && <div className="import-result"><p>{importResult.imported} nuevas · {importResult.duplicates} duplicadas · {importResult.invalid.length} inválidas · {importResult.exclusionsApplied} exclusiones aplicadas</p>
        {importResult.invalid.length > 0 && <details><summary>Filas para corregir</summary><ul>{importResult.invalid.map((item) => <li key={item.row}>Fila {item.row}: {item.fields.join(', ')}</li>)}</ul></details>}</div>}
    </section>}
    <Feedback state={action} />
    <section className="panel">
      <div className="filters">
        <label className="field">Buscar<input value={query.q} onChange={(e) => update('q', e.target.value)} placeholder="Empresa, localidad o dominio" maxLength={120} /></label>
        <label className="field">Región<select value={query.region} onChange={(e) => update('region', e.target.value)}><option value="">Todas</option>{(knownRegions.value ?? regions).map((region) => <option key={region}>{region}</option>)}</select></label>
        <label className="field">Rubro<input value={query.industry} onChange={(e) => update('industry', e.target.value)} placeholder="Todos los rubros" maxLength={120} /></label>
        <label className="field">Tipo de aplicación<select value={query.applicationType} onChange={(e) => update('applicationType', e.target.value)}><option value="">Todas</option>{applicationTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="field">Seguimiento<select value={query.status} onChange={(e) => update('status', e.target.value)}><option value="">Todos</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      </div>
      <Resource result={result}>{(page) => page.items.length ? <>
        <div className="table-scroll"><table><thead><tr><th>Empresa</th><th>Localidad</th><th>Rubro</th><th>Seguimiento</th></tr></thead><tbody>
          {page.items.map((item) => <tr key={item.id}><td><a href={'#' + (sourcesOnly ? 'evidence/' : 'prospect/') + item.id}>{item.name}</a><small>{item.website ? new URL(item.website).hostname : 'Sitio pendiente'}</small></td><td>{item.city}</td><td>{item.industry}{item.applicationType && <small>{item.applicationType}</small>}</td><td><span className="tag">{item.status === 'No contactar' || item.consent === 'Excluido' ? 'Excluido' : item.status}</span></td></tr>)}
        </tbody></table></div>
        <div className="toolbar pagination"><button disabled={page.page <= 1} onClick={() => update('page', String(page.page - 1))}>Anterior</button><span>{page.total} fichas · página {page.page}</span><button disabled={page.page * 25 >= page.total} onClick={() => update('page', String(page.page + 1))}>Siguiente</button></div>
      </> : <Empty>{sourcesOnly ? 'Creá una ficha de prospecto para asociar evidencia.' : 'No hay fichas para estos filtros. Creá un prospecto o importá un CSV.'}</Empty>}</Resource>
    </section>
  </>
}

function ProspectForm({ item, busy, onSave }: { item?: Organization; busy: boolean; onSave: (value: Record<string, unknown>) => void }) {
  return <form className="panel fields" onSubmit={(event) => {
    const { confirmUnblock, ...prospect } = values(event)
    onSave({ prospect, confirmUnblock: Boolean(confirmUnblock) })
  }}>
    <h2 className="wide">{item ? 'Editar ficha' : 'Nueva ficha'}</h2>
    <Field label="Empresa" name="name" value={item?.name} required /><Field label="Rubro" name="industry" value={item?.industry} required />
    <Field label="Localidad" name="city" value={item?.city} required /><label className="field">Región<input name="region" list="known-prospect-regions" defaultValue={item?.region ?? 'Sin clasificar'} required maxLength={120} /><datalist id="known-prospect-regions">{regions.map((region) => <option value={region} key={region} />)}</datalist></label>
    <Field label="Tipo de aplicación" name="applicationType" value={item?.applicationType ?? 'Sin clasificar'} options={applicationTypes} />
    <Field label="Sitio web" name="website" value={item?.website} type="url" /><Field label="Contacto comercial" name="contact" value={item?.contact} />
    <Field label="Email comercial" name="email" value={item?.email} type="email" /><Field label="Teléfono comercial" name="phone" value={item?.phone} type="tel" />
    <Field label="URL de referencia" name="sourceUrl" value={item?.sourceUrl} type="url" /><Field label="Fecha de verificación" name="verifiedAt" value={item?.verifiedAt} type="date" />
    <Field label="Seguimiento" name="status" value={item?.status} options={statuses} /><Field label="Consentimiento" name="consent" value={item?.consent} options={consentOptions} />
    <Field label="Próximo seguimiento" name="nextFollowUp" value={item?.nextFollowUp} type="date" /><Field label="Notas" name="notes" value={item?.notes} area />
    {item && (item.status === 'No contactar' || item.consent === 'Excluido') && <label className="check wide"><input type="checkbox" name="confirmUnblock" />Confirmo explícitamente la reapertura si cambio el estado y el consentimiento.</label>}
    <div className="wide"><button className="primary" disabled={busy}>Guardar ficha</button></div>
  </form>
}

export function ProspectDetail({ id, revision, refresh, open, onlyEvidence }: Props & { id: string; onlyEvidence: boolean }) {
  const result = useResource<Detail>('/prospects/' + id, revision)
  return <Resource result={result}>{(data) => <PortfolioDetail data={data} refresh={refresh} open={open} onlyEvidence={onlyEvidence} revision={revision} />}</Resource>
}
function PortfolioDetail({ data, refresh, open, onlyEvidence, revision }: Props & { data: Detail; onlyEvidence: boolean }) {
  const { org } = data
  const action = useAction(refresh)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const blocked = org.status === 'No contactar' || org.consent === 'Excluido'
  const run = action.run
  return <>
    <div className="toolbar"><a className="button" href={onlyEvidence ? '#evidence' : '#prospects'}>Volver al listado</a><a className="button" href={'#reports/prospect/' + org.id}>Ver informe</a>
      {!onlyEvidence && <button onClick={() => setEditing(!editing)}>{editing ? 'Cerrar edición' : 'Editar ficha'}</button>}
    </div>
    <Feedback state={action} />
    <section className="panel profile"><div><h2>{org.name}</h2><p className="muted">{org.industry} · {org.city} · {org.region}{org.applicationType ? ' · ' + org.applicationType : ''}</p></div><span className="tag">{blocked ? 'Excluido' : org.status}</span>
      {!onlyEvidence && <dl className="summary"><div><dt>Sitio web</dt><dd>{org.website || 'Pendiente'}</dd></div><div><dt>Contacto</dt><dd>{[org.contact, org.email, org.phone].filter(Boolean).join(' · ') || 'Pendiente'}</dd></div><div><dt>Importación</dt><dd>{org.origin === 'MANUAL' ? 'Registro manual' : 'Reac Leads · CSV v1'}</dd></div><div><dt>Próximo seguimiento</dt><dd>{org.nextFollowUp || 'Sin fecha'}</dd></div></dl>}
    </section>
    {!onlyEvidence && data.duplicates.length > 0 && <section className="panel"><h2>Coincidencias de identidad</h2><p className="muted">Comprobá si las fichas corresponden a la misma empresa.</p><ul className="records">{data.duplicates.map((item) => <li key={item.id}><a href={'#prospect/' + item.id}>{item.name}</a><small>{item.matches.join(' · ')}</small></li>)}</ul></section>}
    {editing && <ProspectForm item={org} busy={action.busy} onSave={(payload) => void run(async () => {
      await api('/prospects/' + org.id, 'PUT', payload)
      setEditing(false)
    }, 'Ficha actualizada.')} />}
    <div className="split">
      <section className="panel"><h2>Fuentes públicas</h2>
        {data.sources.length ? <ul className="records">{data.sources.map((item) => <li key={item.id}><strong>{item.provider}</strong><small>{item.consultedAt} · {item.url}</small><p>{item.statement}</p>{item.terms && <small>{item.terms}</small>}</li>)}</ul> : <Empty>Agregá la referencia, la fecha y el dato observado.</Empty>}
        <details><summary>Agregar fuente</summary><form className="fields" onSubmit={(event) => {
          const payload = values(event)
          void run(() => api('/prospects/' + org.id + '/sources', 'POST', payload), 'Fuente registrada.')
        }}>
          <Field label="URL de la fuente" name="url" type="url" required /><Field label="Fecha de consulta" name="consultedAt" type="date" value={today()} required />
          <Field label="Proveedor o publicación" name="provider" required /><Field label="Fragmento o evidencia" name="statement" area required /><Field label="Nota sobre condiciones de uso" name="terms" area />
          <div className="wide"><button disabled={action.busy}>Guardar fuente</button></div>
        </form></details>
      </section>
      <section className="panel"><h2>Observaciones</h2>
        {data.observations.length ? <ul className="records">{data.observations.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{item.level.replaceAll('_', ' ')} · {item.category} · {item.severity} · confianza {item.confidence.toLowerCase()}</small><p>{item.statement}</p><p className="muted">Impacto condicionado: {item.impact}<br />Límites: {item.limitations}<br />Acción: {item.recommendation}</p>
          {item.reviewedAt ? <small>Revisada por {item.reviewer} · {when(item.reviewedAt)}</small> : <details><summary>Revisar observación</summary><Review busy={action.busy} label="Registrar revisión" onReview={(payload) => void run(() => api('/observations/' + item.id + '/review', 'POST', payload), 'Observación revisada.')} /></details>}</li>)}</ul>
          : <Empty>Vinculá una observación a una fuente de esta ficha.</Empty>}
        {data.sources.length > 0 && <details><summary>Agregar observación</summary><form className="fields" onSubmit={(event) => {
          const payload = values(event)
          void run(() => api('/prospects/' + org.id + '/observations', 'POST', payload), 'Observación registrada.')
        }}>
          <label className="field wide">Fuente<select name="sourceId">{data.sources.map((item) => <option value={item.id} key={item.id}>{item.provider} · {item.consultedAt}</option>)}</select></label>
          <Field label="Título" name="title" required /><Field label="Categoría" name="category" required /><Field label="Nivel de verificación" name="level" options={['OBSERVACION_PUBLICA', 'HIPOTESIS', 'POTENCIAL_RIESGO']} />
          <Field label="Severidad tentativa" name="severity" options={['INFORMATIVA', 'BAJA', 'MEDIA', 'ALTA', 'CRITICA']} /><Field label="Confianza" name="confidence" options={['BAJA', 'MEDIA', 'ALTA']} />
          <Field label="Observación" name="statement" area required /><Field label="Impacto condicionado" name="impact" area required /><Field label="Límites y evidencia faltante" name="limitations" area required /><Field label="Acción recomendada" name="recommendation" area required />
          <div className="wide"><button disabled={action.busy}>Guardar observación</button></div>
        </form></details>}
      </section>
    </div>
    <Assets id={org.id} sources={data.sources} revision={revision} refresh={refresh} />
    {!onlyEvidence && <div className="split"><CommercialTimeline id={org.id} revision={revision} refresh={refresh} blocked={blocked} /><OpportunityScore id={org.id} revision={revision} /></div>}
    {!onlyEvidence && <section className="panel">
      <h2>Mensajes comerciales</h2>
      {blocked ? <Empty>El prospecto está excluido de contacto.</Empty> : <>
        <p className="muted">Prepará y revisá el mensaje para usarlo por tu cuenta.</p>
        <button onClick={() => void run(() => api('/prospects/' + org.id + '/drafts', 'POST'), 'Borrador creado.')} disabled={action.busy}>Crear borrador</button>
        <button onClick={() => void run(() => api('/prospects/' + org.id + '/drafts', 'POST', { channel: 'WhatsApp' }), 'Borrador de WhatsApp creado.')} disabled={action.busy}>Preparar WhatsApp</button>
      </>}
      <ul className="records">{data.drafts.map((item) => <li key={item.id}><strong>{item.subject}</strong><span className="tag">{item.channel ?? 'Email'}</span>
        <small>{item.reviewedAt ? 'Aprobado para uso manual · ' + item.reviewer : 'Borrador'}</small><p className="pre">{item.body}</p>
        {!blocked && <div className="split"><details><summary>Editar mensaje</summary><form className="fields" onSubmit={(event) => {
          const payload = values(event)
          void run(() => api('/drafts/' + item.id, 'PUT', payload), 'Mensaje guardado como borrador.')
        }}><Field label="Asunto" name="subject" value={item.subject} required /><Field label="Mensaje" name="body" value={item.body} area required /><div className="wide"><button disabled={action.busy}>Guardar borrador</button></div></form></details>
          {!item.reviewedAt && <details><summary>Aprobar mensaje</summary><Review busy={action.busy} label="Aprobar para uso manual" onReview={(payload) => void run(() => api('/drafts/' + item.id + '/review', 'POST', { ...payload, contentVersion: item.contentVersion }), 'Mensaje aprobado.')} /></details>}</div>}
      </li>)}</ul>
    </section>}
    {!onlyEvidence && !blocked && <details className="panel"><summary>Eliminar ficha</summary><p>Se eliminarán sus datos, fuentes, observaciones y borradores.</p>
      {!deleting ? <button onClick={() => setDeleting(true)}>Preparar eliminación</button> : <div className="toolbar"><button onClick={() => setDeleting(false)}>Cancelar</button><button className="danger" disabled={action.busy} onClick={() => void run(async () => {
        await api('/prospects/' + org.id, 'DELETE')
        open('prospects')
      }, 'Ficha eliminada.')}>Confirmar eliminación</button></div>}
    </details>}
  </>
}
