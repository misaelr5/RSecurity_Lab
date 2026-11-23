import { useEffect, useState } from 'react'
import { api, when } from './client.ts'
import type { Audit, AuditDetail, Authorization, Organization, Page, Report, Settings } from './client.ts'
import { DownloadButton, Empty, Feedback, Field, Resource, Review, useAction, useResource, values } from './widgets.tsx'

type Props = { revision: number; refresh: () => void }

export function Audits({ revision, refresh }: Props) {
  const runs = useResource<Audit[]>('/lab/runs', revision)
  const action = useAction(refresh)
  const running = runs.value?.some((item) => item.status === 'RUNNING')
  const [section, setSection] = useState<'local' | 'records' | 'reviews'>('local')
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(refresh, 600)
    return () => window.clearInterval(timer)
  }, [running, refresh])
  return <>
    <div className="toolbar" aria-label="Área de auditorías">
      <button aria-pressed={section === 'local'} onClick={() => setSection('local')}>Laboratorio local</button>
      <button aria-pressed={section === 'reviews'} onClick={() => setSection('reviews')}>Resultados defensivos</button>
      <button aria-pressed={section === 'records'} onClick={() => setSection('records')}>Autorizaciones de clientes</button>
    </div>
    {section === 'reviews' ? <DefensiveReviews revision={revision} refresh={refresh} /> : section === 'records' ? <Authorizations revision={revision} refresh={refresh} /> : <>
      <section className="panel"><h2>Chequeo de configuración</h2>
        <p className="muted">Una solicitud HEAD al fixture incorporado en 127.0.0.1. Registra estado HTTP y presencia de encabezados. Límite de 2 segundos y una corrida a la vez.</p>
        <button className="primary" disabled={action.busy || running} onClick={() => void action.run(() => api('/lab/runs', 'POST', { mode: 'LAB_LOCAL' }), 'Prueba iniciada.')}>Ejecutar fixture local</button>
      </section>
      <Feedback state={action} />
      <section className="panel"><h2>Historial de corridas</h2>
        <Resource result={runs}>{(items) => items.some((item) => item.mode !== 'REVISION_DOCUMENTAL') ? <ul className="records">{items.filter((item) => item.mode !== 'REVISION_DOCUMENTAL').map((item) => <li className="run-row" key={item.id}>
          <div><strong>{item.status === 'COMPLETED' ? 'Completada' : item.status === 'RUNNING' ? 'En curso' : item.status === 'STOPPED' ? 'Detenida' : item.status === 'BLOCKED' ? 'Bloqueada' : 'Fallida'}</strong>
            <small>{when(item.createdAt)} · {item.mode}</small><p>{item.reason}</p></div>
          <div className="toolbar">
            {item.status === 'RUNNING' ? <button disabled={action.busy} onClick={() => void action.run(() => api('/lab/runs/' + item.id + '/stop', 'POST'), 'Solicitud de detención procesada.')}>Detener</button> : <>
              <a className="button" href={'#audit/' + item.id}>Ver evidencia</a><a className="button" href={'#reports/lab/' + item.id}>Ver informe</a>
            </>}
          </div>
        </li>)}</ul> : <Empty>Ejecutá el fixture para ver la primera corrida.</Empty>}</Resource>
      </section>
    </>}
  </>
}

export function AuditEvidence({ id, revision, refresh }: Props & { id: string }) {
  const result = useResource<AuditDetail>('/lab/runs/' + id, revision)
  const action = useAction(refresh)
  return <Resource result={result}>{({ run, evidence, findings }) => <>
    <div className="toolbar"><a className="button" href="#audits">Volver al laboratorio</a><a className="button" href={'#reports/lab/' + id}>Ver informe</a></div>
    <section className="panel"><h2>{run.project ?? run.status}</h2><p>{run.reason}</p><Feedback state={action} /><p className="muted">{run.tool} · Política v{run.policyVersion}</p>
      {evidence.map((item) => <div key={item.id}><p>HTTP {item.statusCode}</p><small className="digest">SHA-256 {item.sha256}</small></div>)}
      {findings.length ? <ul className="records">{findings.map((item) => 'title' in item
        ? <li key={item.id}>{item.title} <span className="tag">{item.present ? 'Presente' : 'Ausente'}</span></li>
        : <li key={item.id}><strong>{item.checkId} · {item.component}</strong> <span className="tag">{item.state}</span>
          <p className="muted">{item.reference || 'Sin referencia publicada'} · Severidad sugerida {item.severity ?? 'sin asignar'}</p>
          {item.reviews.length > 0 && <ul>{item.reviews.map((row, index) => <li key={index}>{row.state} · {row.reviewer} · {when(row.reviewedAt)} · {row.proofReference}</li>)}</ul>}
          <details><summary>Revisar resultado</summary><form className="fields" key={item.contentVersion} onSubmit={(event) => {
            const data = values(event)
            void action.run(() => api('/reviews/findings/' + item.id + '/review', 'POST', { ...data, contentVersion: item.contentVersion }), 'Resultado revisado.')
          }}>
            <Field label="Nuevo estado" name="state" options={['Pendiente de validación', 'Confirmado', 'Falso positivo', ...(item.state === 'Confirmado' ? ['Corregido', 'Riesgo aceptado'] : [])].filter((state) => state !== item.state)} />
            <Field label="Responsable de la revisión" name="reviewer" required />
            <Field label="Referencia a evidencia redactada" name="proofReference" required />
            <div className="wide"><button disabled={action.busy}>Guardar revisión</button></div>
          </form></details>
        </li>)}</ul> : <Empty>Sin resultados registrados.</Empty>}
    </section>
  </>}</Resource>
}

function DefensiveReviews({ revision, refresh }: Props) {
  const result = useResource<Audit[]>('/lab/runs', revision)
  const action = useAction(refresh)
  return <>
    <section className="panel"><h2>Importar resultados redactados</h2><p className="muted">Usá el JSON v1 de un proyecto propio o autorizado. Incluí identificadores de control y referencias. Conservá la evidencia sensible fuera del archivo.</p>
      <form className="toolbar" onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        const file = new FormData(form).get('file')
        void action.run(async () => {
          if (!(file instanceof File) || !file.size || file.size > 200000) throw new Error('Seleccioná un JSON v1 de hasta 200 KB.')
          let data: unknown
          try { data = JSON.parse(await file.text()) } catch { throw new Error('El archivo tiene un formato JSON inválido.') }
          await api('/reviews/import', 'POST', data)
          form.reset()
        }, 'Resultado documental registrado.')
      }}>
        <label className="field">Archivo de resultados<input type="file" name="file" accept=".json,application/json" required /></label>
        <button disabled={action.busy}>Importar resultados</button>
      </form><Feedback state={action} />
    </section>
    <section className="panel"><h2>Revisiones documentales</h2><Resource result={result}>{(items) => {
      const reviews = items.filter((item) => item.mode === 'REVISION_DOCUMENTAL')
      return reviews.length ? <ul className="records">{reviews.map((item) => <li className="run-row" key={item.id}>
        <div><strong>{item.project}</strong><small>{item.tool} · {item.collectedAt}</small></div>
        <div className="toolbar"><a className="button" href={'#audit/' + item.id}>Revisar resultados</a><a className="button" href={'#reports/lab/' + item.id}>Ver informe</a></div>
      </li>)}</ul> : <Empty>Todavía no importaste resultados defensivos.</Empty>
    }}</Resource></section>
  </>
}

function OrganizationPicker({ revision }: { revision: number }) {
  const [query, setQuery] = useState('')
  const [item, setItem] = useState<Organization>()
  const result = useResource<Page>('/prospects?q=' + encodeURIComponent(query), revision)
  return <div className="wide"><label className="field">Buscar empresa<input value={query} onChange={(event) => { setQuery(event.target.value); setItem(undefined) }} maxLength={120} /></label>
    <Resource result={result}>{(page) => <label className="field">Empresa<select name="organizationId" value={item?.id ?? ''} required onChange={(event) => setItem(page.items.find((entry) => entry.id === event.target.value))}>
      <option value="">Seleccioná una ficha</option>{page.items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.city}</option>)}
    </select></label>}</Resource>
  </div>
}

function Authorizations({ revision, refresh }: Props) {
  const result = useResource<Authorization[]>('/authorizations', revision)
  const action = useAction(refresh)
  const [adding, setAdding] = useState(false)
  const [revoke, setRevoke] = useState<string>()
  const [replacing, setReplacing] = useState<Authorization>()
  return <>
    <section className="panel"><h2>Registro documental</h2><p className="muted">Registrá el alcance y la referencia al documento. El estado de revisión queda en la bitácora. La ejecución técnica está limitada al fixture local.</p>
      <button onClick={() => { setReplacing(undefined); setAdding(!adding) }}>{adding ? 'Cerrar registro' : 'Registrar autorización'}</button>
      {(adding || replacing) && <form key={replacing?.id ?? 'new'} className="fields inset" onSubmit={(event) => {
        const data = values(event)
        const { port, maxRps, maxConcurrency, methods, startsAt, endsAt, ...rest } = data
        const payload = { ...rest, port: Number(port), maxRps: Number(maxRps), maxConcurrency: Number(maxConcurrency),
          methods: methods.split(' + '), startsAt, endsAt }
        void action.run(async () => {
          if (replacing) await api('/authorizations/' + replacing.id + '/supersede', 'POST', { replacement: payload, contentVersion: replacing.contentVersion })
          else await api('/authorizations', 'POST', payload)
          setAdding(false)
          setReplacing(undefined)
        }, 'Autorización pendiente de revisión.')
      }}>
        {replacing ? <div className="wide"><h3>Nueva versión para {replacing.owner}</h3><p>La versión anterior quedará revocada al guardar.</p><input type="hidden" name="organizationId" value={replacing.organizationId} /></div> : <OrganizationPicker revision={revision} />}
        <Field label="Titular y firmante" name="owner" value={replacing?.owner} required /><Field label="Referencia al documento firmado" name="evidence" value={replacing?.evidence} />
        <Field label="SHA-256 del documento firmado" name="documentSha256" value={replacing?.documentSha256} />
        <Field label="Inicio ISO 8601 con zona" name="startsAt" value={replacing?.startsAt} required /><Field label="Fin ISO 8601 con zona" name="endsAt" value={replacing?.endsAt} required />
        <Field label="Zona horaria" name="timezone" value={replacing?.timezone ?? 'America/Argentina/Cordoba'} required />
        <Field label="Contacto de emergencia" name="emergency" value={replacing?.emergency} /><Field label="Hostname exacto" name="hostname" value={replacing?.hostname} required /><Field label="Puerto" name="port" type="number" value={String(replacing?.port ?? 443)} required />
        <Field label="Ruta exacta" name="path" value={replacing?.path ?? '/'} required /><Field label="Métodos permitidos" options={['HEAD', 'GET', 'HEAD + GET']} name="methods" value={replacing?.methods.length === 2 ? 'HEAD + GET' : replacing?.methods[0]} required />
        <Field label="Solicitudes por segundo" name="maxRps" type="number" value={String(replacing?.maxRps ?? 1)} required /><Field label="Concurrencia" name="maxConcurrency" type="number" value={String(replacing?.maxConcurrency ?? 1)} required />
        <Field label="Pruebas prohibidas" name="prohibited" value={replacing?.prohibited} area required />
        <div className="wide"><small>Formato de fecha: 2027-01-12T09:00:00-03:00</small><button className="primary" disabled={action.busy}>{replacing ? 'Guardar nueva versión' : 'Guardar autorización'}</button>{replacing && <button type="button" onClick={() => setReplacing(undefined)}>Cancelar reemplazo</button>}</div>
      </form>}
    </section>
    <Feedback state={action} />
    <section className="panel"><h2>Autorizaciones registradas</h2>
      <Resource result={result}>{(items) => items.length ? <ul className="records">{items.map((item) => <li key={item.id}>
        <strong>{item.owner}</strong><span className="tag">{({ PENDING: 'Pendiente', APPROVED: 'Revisada', REVOKED: 'Revocada', EXPIRED: 'Vencida', REVIEW_REQUIRED: 'Requiere nueva versión' })[item.effectiveState] ?? item.effectiveState}</span>
        <p>{item.hostname}:{item.port}{item.path} · {item.methods.join(' / ')}<br />{item.startsAt} a {item.endsAt} · {item.timezone}</p>
        <small>Documento: {item.evidence || 'Pendiente'} · Emergencia: {item.emergency || 'Pendiente'} · {item.maxRps} req/s · Concurrencia {item.maxConcurrency}</small>
        <p className="muted">Prohibiciones: {item.prohibited}</p>
        {item.documentSha256 && <small>Huella SHA-256 <code>{item.documentSha256}</code></small>}
        {item.supersededBy && <small>Reemplazada por otra versión.</small>}
        {item.reviewer && <small>Responsable {item.reviewer} · {item.reviewedAt && when(item.reviewedAt)}</small>}
        {item.effectiveState === 'PENDING' && <details><summary>Revisar autorización</summary><Review label="Registrar aprobación documental" busy={action.busy} acknowledgement="Verifiqué la identidad, la titularidad, el documento firmado y el alcance." onReview={(payload) => void action.run(() => api('/authorizations/' + item.id + '/review', 'POST', { ...payload, contentVersion: item.contentVersion }), 'Revisión registrada.')} /></details>}
        {!item.supersededBy && <button onClick={() => { setAdding(false); setReplacing(item); window.scrollTo(0, 0) }}>Crear nueva versión</button>}
        {['PENDING', 'APPROVED', 'REVIEW_REQUIRED'].includes(item.effectiveState) && (revoke === item.id
          ? <div className="toolbar"><button onClick={() => setRevoke(undefined)}>Cancelar</button><button className="danger" disabled={action.busy} onClick={() => void action.run(async () => {
            await api('/authorizations/' + item.id + '/revoke', 'POST')
            setRevoke(undefined)
          }, 'Autorización revocada.')}>Confirmar revocación</button></div>
          : <button onClick={() => setRevoke(item.id)}>Revocar autorización</button>)}
      </li>)}</ul> : <Empty>Las autorizaciones se cargan a partir de una ficha de prospecto.</Empty>}</Resource>
    </section>
  </>
}

export function Reports({ kind, id, revision, refresh }: Props & { kind?: string; id?: string }) {
  if ((kind !== 'prospect' && kind !== 'lab') || !id) return <section className="panel"><h2>Elegí un informe</h2><p className="muted">Abrí un relevamiento desde su ficha o elegí una corrida local.</p><div className="toolbar">
    <a className="button" href="#prospects">Ir a prospectos</a><a className="button" href="#audits">Ir al laboratorio</a>
  </div></section>
  return <ReportView key={id} path={'/reports/' + kind + '/' + id} revision={revision} refresh={refresh} />
}

function ReportView({ path, revision, refresh }: Props & { path: string }) {
  const result = useResource<Report>(path, revision)
  const action = useAction(refresh)
  return <><Feedback state={action} /><Resource result={result}>{(report) => <section className="panel report">
    <p className="print-brand">Reac Studio · Documento confidencial</p>
    <div className="profile"><h2>{report.title}</h2><span className="tag">{report.reviewedAt ? 'Revisado' : 'Borrador'}</span></div>
    <div className="toolbar">{['md', 'html', 'csv'].map((format) => <DownloadButton key={format} path={path + '/export/' + format} filename={'reac-informe-v1.' + format}>Descargar {format.toUpperCase()}</DownloadButton>)}<button onClick={() => window.print()}>Imprimir o guardar PDF</button></div>
    {report.sections.map((section) => <div key={section.title}><h3>{section.title}</h3><ul>{section.lines.map((line, index) => <li key={index}>{line}</li>)}</ul></div>)}
    {report.reviewedAt ? <p className="notice">Revisado por {report.reviewer} · {when(report.reviewedAt)}</p>
      : <Review label="Marcar informe como revisado" busy={action.busy} onReview={(payload) => void action.run(() => api(path + '/review', 'POST', { ...payload, contentVersion: report.contentVersion }), 'Revisión del informe registrada.')} />}
  </section>}</Resource></>
}
export function Configuration({ revision, refresh }: Props) {
  const settings = useResource<Settings>('/settings', revision)
  const backups = useResource<string[]>('/backups', revision)
  const retention = useResource<{ prospectiveReviewDays: number; backupReviewDays: number; unverified: number; prospectReviewDue: number; backupReviewDue: number }>('/retention', revision)
  const health = useResource<{ status: string; schema: number }>('/health', revision)
  const action = useAction(refresh)
  return <>
    <section className="panel"><h2>Entorno</h2><Resource result={health}>{(value) => <p>Estado de almacenamiento <span className="tag">{value.status}</span> · Esquema SQLite v{value.schema}</p>}</Resource>
      <Resource result={settings}>{(value) => <><p>Base local <code>data/{value.database}</code> · App v{value.version}</p><p className="muted">Hasta {value.limits.csvRows} filas por CSV. Laboratorio a {value.limits.labRequestsPerSecond} solicitud por segundo y {value.limits.labTimeoutMs} ms de espera.</p>
        <h3>Herramientas</h3><p>{value.fixture}</p><ul className="tool-list">{value.tools.map((tool) => <li key={tool.name}>{tool.name}<small>{tool.status}</small></li>)}</ul></>}</Resource>
    </section>
    <section className="panel retention-summary"><h2>Revisión de conservación</h2>
      <Resource result={retention}>{(item) => <><p>Revisá las fuentes cada {item.prospectiveReviewDays} días y las copias cada {item.backupReviewDays} días.</p><p>{item.unverified} fichas sin fecha de verificación · {item.prospectReviewDue} fichas y {item.backupReviewDue} copias para revisar.</p></>}</Resource>
    </section>
    <section className="panel"><h2>Copias de SQLite</h2>
      <button className="primary" disabled={action.busy} onClick={() => void action.run(() => api('/backups', 'POST'), 'Copia creada en la carpeta de respaldo de esta base.')}>Crear copia de respaldo</button>
      <Feedback state={action} />
      <Resource result={backups}>{(items) => items.length ? <ul className="records">{items.map((item) => <li key={item}><code>{item}</code></li>)}</ul> : <Empty>Todavía no hay copias de respaldo.</Empty>}</Resource>
      <p className="muted">Con REAC_DATABASE apuntando a la base de origen, ejecutá desde PowerShell <code>npm run restore -- NOMBRE-DE-LA-COPIA.sqlite restaurada.sqlite</code>. Luego elegí <code>REAC_DATABASE=restaurada.sqlite</code> en <code>.env</code> y reiniciá.</p>
    </section>
  </>
}
