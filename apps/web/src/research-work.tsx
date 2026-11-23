import { useEffect, useState } from 'react'
import { api, when } from './client.ts'
import { DownloadButton, Empty, Feedback, Field, Resource, Review, useAction, useResource, values } from './widgets.tsx'
import { readSearchFields, researchStatus as status, SearchFields } from './research-fields.tsx'
import type { ResearchJob as Job, ResearchMode, SearchConfiguration } from './research-fields.tsx'

type Props = { revision: number; refresh: () => void; jobId?: string; reprospect?: boolean; campaignId?: string; initialMode?: ResearchMode }
type Result = { id: string; organizationId?: string; contentVersion: string; record: { name: string; city: string; confidence: string; evidence: { url: string; statement: string } }; outcome: string; reason: string }
const working = ['PENDIENTE', 'INVESTIGANDO', 'VERIFICANDO', 'IMPORTANDO']
type Simulation = { provider: string; known: number; duplicates: number; exclusions: number; pending: number; available: number; quantity: number;
  estimated: boolean; cost: unknown; quota: unknown; limits: unknown; filters: SearchConfiguration['filters'] }

export function ResearchWork({ revision, refresh, jobId, reprospect = false, campaignId, initialMode = 'discover' }: Props) {
  const capabilities = useResource<{ codex: boolean; catalogSize: number }>('/research/capabilities', revision)
  const jobs = useResource<Job[]>('/research/jobs', revision)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [attempt, setAttempt] = useState<{ id: string; payload: string }>()
  const [mode, setMode] = useState<ResearchMode>(initialMode)
  const [simulation, setSimulation] = useState<Simulation>()
  const action = useAction(refresh)
  return <>
    {!jobId && <section className="panel"><h2>{reprospect ? 'Reprospectar' : initialMode === 'update' ? 'Actualizar prospectos por lote' : 'Nueva búsqueda'}</h2>
      <p className="muted">Buscá en el catálogo local o adjuntá un lote de fuentes públicas investigado en Orca.</p>
      <div className="toolbar v4-mode" role="group" aria-label="Modalidad de búsqueda">
        <button type="button" aria-pressed={mode === 'discover'} onClick={() => { setMode('discover'); setSimulation(undefined) }}>Descubrir empresas nuevas</button>
        <button type="button" aria-pressed={mode === 'update'} onClick={() => { setMode('update'); setSimulation(undefined) }}>Actualizar prospectos</button>
      </div>
      <p className="muted">{mode === 'update' ? 'Los cambios propuestos quedan pendientes de revisión.' : 'La búsqueda consulta el historial y las exclusiones antes de incorporar empresas.'}</p>
      <Resource result={capabilities}>{(config) => <form className="fields v4-fields" onChange={() => setSimulation(undefined)} onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter
        const intent = submitter instanceof HTMLButtonElement ? submitter.value : 'run'
        const file = new FormData(event.currentTarget).get('file')
        const data = values(event)
        void action.run(async () => {
          const configuration = { ...readSearchFields(data), ...(campaignId ? { campaignId } : {}) }
          if (intent === 'save') {
            if (!data.name.trim()) throw new Error('Ingresá un nombre para guardar esta búsqueda.')
            await api('/research/saved', 'POST', { name: data.name, configuration })
            return
          }
          let source: unknown
          if (file instanceof File && file.size) {
            if (file.size > 500000) throw new Error('Usá un JSON de hasta 500 KB.')
            try { source = JSON.parse(await file.text()) } catch { throw new Error('El archivo JSON es inválido.') }
          }
          const payload = { ...configuration, file: source, verifiedSources: Boolean(data.verifiedSources) }
          if (intent === 'simulate') {
            setSimulation(await api<Simulation>('/research/simulate', 'POST', payload))
            return
          }
          const encoded = JSON.stringify(payload)
          const next = !attempt ? requestId : attempt.payload === encoded ? attempt.id : crypto.randomUUID()
          setAttempt({ id: next, payload: encoded })
          const job = await api<Job>('/research/jobs', 'POST', { ...payload, requestId: next })
          setRequestId(crypto.randomUUID())
          setAttempt(undefined)
          window.location.hash = 'research/' + job.id
        }, intent === 'save' ? 'Búsqueda guardada.' : intent === 'simulate' ? 'Simulación calculada.' : 'Búsqueda iniciada.')
      }}>
        <SearchFields key={mode} codex={config.codex} mode={mode} />
        <label className="field wide">Archivo de fuentes JSON<input type="file" name="file" accept=".json,application/json" /></label>
        {mode === 'discover' && <label className="check wide"><input type="checkbox" name="verifiedSources" />Cotejé las fuentes del archivo para importación automática.</label>}
        <p className="muted wide">{config.catalogSize ? `Catálogo local disponible con ${config.catalogSize} fichas.` : 'Para investigar desde esta pantalla, adjuntá un lote JSON.'}</p>
        <div className="toolbar wide"><button className="primary" value="run" disabled={action.busy}>{mode === 'update' ? 'Iniciar actualización' : reprospect ? 'Reprospectar' : 'Iniciar investigación'}</button>
          <button value="simulate" disabled={action.busy}>Simular búsqueda</button></div>
        <details className="wide"><summary>Guardar esta búsqueda</summary><div className="toolbar inset v4-inline-fields">
          <Field label="Nombre de la búsqueda" name="name" /><button value="save" disabled={action.busy}>Guardar esta búsqueda</button>
          <a href="#saved">Ver búsquedas guardadas</a>
        </div></details>
      </form>}</Resource><Feedback state={action} />
    </section>}
    {!jobId && simulation && <SimulationResult simulation={simulation} />}
    {jobId && <ResearchJob id={jobId} revision={revision} refresh={refresh} />}
    <section className="panel"><h2>Historial de búsquedas</h2>
      <Resource result={jobs}>{(items) => items.length ? <ul className="records">{items.map((item) => <li key={item.id} className="run-row">
        <div><strong>{status(item.state)}</strong> <small>{when(item.createdAt)} · {item.provider} · {item.imported}/{item.goal} incorporadas</small></div>
        <a className="button" href={'#research/' + item.id}>Abrir lote</a>
      </li>)}</ul> : <Empty>Sin búsquedas registradas.</Empty>}</Resource>
    </section>
  </>
}
function ResearchJob({ id, revision, refresh }: { id: string; revision: number; refresh: () => void }) {
  const result = useResource<{ job: Job; results: Result[] }>('/research/jobs/' + id, revision)
  const running = result.value ? working.includes(result.value.job.state) : true
  useEffect(() => {
    if (!running || result.error) return
    const timer = window.setInterval(refresh, 1000)
    return () => window.clearInterval(timer)
  }, [running, refresh, result.error])
  const action = useAction(refresh)
  return <Resource result={result}>{({ job, results }) => <section className="panel">
    <h2>{status(job.state)}</h2><p className="muted">Lote <code>{job.id}</code> · {job.provider}</p>
    <p>{job.reason}</p><dl className="summary">{[
      ['Objetivo', job.goal], ['Encontradas', job.found], ['Verificadas', job.verified], ['Incorporadas', job.imported],
      ['Duplicadas', job.duplicates], ['Excluidas', job.excluded], ['Pendientes', job.pending], ['Fuera de cupo', job.skipped ?? 0], ['Errores', job.errors],
    ].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
    <div className="toolbar">
      <a className="button" href="#research">Nueva búsqueda</a>
      {running && <button disabled={action.busy} onClick={() => void action.run(() => api('/research/jobs/' + id + '/cancel', 'POST'), 'Cancelación procesada.')}>Cancelar</button>}
      {!running && (job.resumable ?? ['CANCELADO', 'FALLIDO'].includes(job.state)) && <button disabled={action.busy} onClick={() => void action.run(() => api('/research/jobs/' + id + '/resume', 'POST'), 'Se reanudó el mismo lote.')}>Reanudar lote</button>}
      {!running && <DownloadButton path={'/research/jobs/' + id + '/export'} filename="lote-prospeccion.json">Descargar resultado del lote</DownloadButton>}
      {!running && <a className="button" href="#review">Abrir bandeja de revisión</a>}
    </div><Feedback state={action} />
    {results.length > 0 && <ul className="records">{results.map((item) => <li key={item.id}>
      <strong>{item.organizationId ? <a href={'#prospect/' + item.organizationId}>{item.record.name}</a> : item.record.name}</strong>
      <span className="tag">{status(item.outcome)}</span><small>{item.record.city} · {item.record.confidence}</small>
      <p>{item.record.evidence.statement}</p><p className="muted">{item.reason}</p>
      <a href={item.record.evidence.url} target="_blank" rel="noopener noreferrer">Ver fuente</a>
      {item.outcome === 'EN_REVISION' && <details><summary>Revisar ficha</summary><Review
        label="Confirmar e incorporar" acknowledgement="Confirmé la fuente pública y que la ficha corresponde a esta organización." busy={action.busy}
        onReview={(payload) => void action.run(() => api('/research/jobs/' + id + '/candidates/' + item.id + '/review', 'POST',
          { reviewer: payload.reviewer, confirm: payload.acknowledge, contentVersion: item.contentVersion }), 'Ficha incorporada.')} /></details>}
    </li>)}</ul>}
  </section>}</Resource>
}

function SimulationResult({ simulation }: { simulation: Simulation }) {
  const labels = [['Objetivo', simulation.quantity], ['Fuentes conocidas', simulation.known], ['Ya investigadas', simulation.duplicates],
    ['Excluidas', simulation.exclusions], ['Pendientes', simulation.pending], ['Disponibles para el lote', simulation.available]]
  return <section className="panel" aria-labelledby="simulation-title"><h2 id="simulation-title">Resultado de la simulación</h2>
    <p className="muted">{simulation.estimated ? 'Estimación preliminar.' : 'Conteos reales para las fuentes locales disponibles.'} Proveedor previsto · {simulation.provider}</p>
    <dl className="summary">{labels.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <dl className="summary inset">
      <div><dt>Costo</dt><dd>{typeof simulation.cost === 'string' ? simulation.cost : 'Sin cotización informada'}</dd></div>
      <div><dt>Cuota</dt><dd>{typeof simulation.quota === 'string' ? simulation.quota : 'Sin cuota informada'}</dd></div>
      <div><dt>Límites</dt><dd>{Array.isArray(simulation.limits) ? simulation.limits.join(' ') : typeof simulation.limits === 'string' ? simulation.limits : 'Una búsqueda activa por instancia'}</dd></div>
      <div><dt>Filtros</dt><dd>{[simulation.filters.regions?.join(', ') ?? simulation.filters.region, simulation.filters.cities?.join(', ') ?? simulation.filters.city,
        simulation.filters.industries?.join(', ') ?? simulation.filters.industry, simulation.filters.applicationType].filter(Boolean).join(' · ') || 'Sin filtros adicionales'}</dd></div>
    </dl>
  </section>
}
