import { useEffect, useState } from 'react'
import { applicationTypes } from '../../../packages/core/src/constants.ts'
import { api, when } from './client.ts'
import { DownloadButton, Empty, Feedback, Field, Resource, Review, useAction, useResource, values } from './widgets.tsx'

type Props = { revision: number; refresh: () => void; jobId?: string }
type Job = { id: string; state: string; goal: number; found: number; verified: number; imported: number; duplicates: number; excluded: number; pending: number; errors: number; reason?: string; provider: string; createdAt: string }
type Result = { id: string; organizationId?: string; record: { name: string; city: string; confidence: string; evidence: { url: string; statement: string } }; outcome: string; reason: string }
const working = ['PENDIENTE', 'INVESTIGANDO', 'VERIFICANDO', 'IMPORTANDO']
const status = (value: string) => value.toLowerCase().replace(/^\p{L}/u, (letter) => letter.toUpperCase()).replaceAll('_', ' ')

export function ResearchWork({ revision, refresh, jobId }: Props) {
  const capabilities = useResource<{ codex: boolean; sources: string[] }>('/research/capabilities', revision)
  const jobs = useResource<Job[]>('/research/jobs', revision)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [attempt, setAttempt] = useState<{ id: string; payload: string }>()
  const action = useAction(refresh)
  return <>
    {!jobId && <section className="panel"><h2>Nueva búsqueda</h2>
      <p className="muted">Buscá dentro del catálogo de resultados aportados o incluí un lote de fuentes públicas investigado en Orca.</p>
      <Resource result={capabilities}>{(config) => <form className="fields" onSubmit={(event) => {
        const file = new FormData(event.currentTarget).get('file')
        const data = values(event)
        void action.run(async () => {
          let source: unknown
          if (file instanceof File && file.size) {
            if (file.size > 500000) throw new Error('Usá un JSON de hasta 500 KB.')
            try { source = JSON.parse(await file.text()) } catch { throw new Error('El archivo JSON es inválido.') }
          }
          const filters = { quantity: data.quantity ? Number(data.quantity) : undefined, region: data.region || undefined, city: data.city || undefined,
            industry: data.industry || undefined, applicationType: data.applicationType || undefined }
          const payload = {
            prompt: data.prompt, filters, file: source, useCodex: Boolean(data.useCodex), verifiedSources: Boolean(data.verifiedSources),
            excludeExisting: Boolean(data.excludeExisting), excludeContacted: Boolean(data.excludeContacted), minimumConfidence: data.minimumConfidence,
          }
          const encoded = JSON.stringify(payload)
          const next = !attempt ? requestId : attempt.payload === encoded ? attempt.id : crypto.randomUUID()
          setAttempt({ id: next, payload: encoded })
          const job = await api<Job>('/research/jobs', 'POST', { ...payload, requestId: next })
          setRequestId(crypto.randomUUID())
          setAttempt(undefined)
          window.location.hash = 'research/' + job.id
        }, 'Búsqueda iniciada.')
      }}>
        <Field label="Instrucción de búsqueda" name="prompt" area value="Buscá 20 empresas de Córdoba Capital" />
        <Field label="Cantidad" name="quantity" type="number" />
        <Field label="Región de búsqueda" name="region" />
        <Field label="Ciudad" name="city" />
        <Field label="Rubro de búsqueda" name="industry" />
        <Field label="Aplicación" name="applicationType" options={['', ...applicationTypes]} />
        <Field label="Confianza mínima" name="minimumConfidence" options={['MEDIA', 'ALTA', 'BAJA']} />
        <label className="field wide">Archivo de fuentes JSON<input type="file" name="file" accept=".json,application/json" /></label>
        <label className="check"><input type="checkbox" name="verifiedSources" />Cotejé las fuentes del archivo para importación automática.</label>
        <label className="check"><input type="checkbox" name="useCodex" disabled={!config.codex} defaultChecked={config.codex} />Interpretar la consulta con Codex{config.codex ? '' : ' (deshabilitado)'}</label>
        <label className="check"><input type="checkbox" name="excludeExisting" defaultChecked />Excluir fichas existentes.</label>
        <label className="check"><input type="checkbox" name="excludeContacted" defaultChecked />Excluir empresas ya contactadas.</label>
        <div className="wide"><button className="primary" disabled={action.busy}>Iniciar investigación</button></div>
      </form>}</Resource><Feedback state={action} />
    </section>}
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
    if (!running) return
    const timer = window.setInterval(refresh, 1000)
    return () => window.clearInterval(timer)
  }, [running, refresh])
  const action = useAction(refresh)
  return <Resource result={result}>{({ job, results }) => <section className="panel">
    <h2>{status(job.state)}</h2><p className="muted">Lote <code>{job.id}</code> · {job.provider}</p>
    <p>{job.reason}</p><dl className="summary">{[
      ['Objetivo', job.goal], ['Encontradas', job.found], ['Verificadas', job.verified], ['Incorporadas', job.imported],
      ['Duplicadas', job.duplicates], ['Excluidas', job.excluded], ['Pendientes', job.pending], ['Errores', job.errors],
    ].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
    <div className="toolbar">
      <a className="button" href="#research">Nueva búsqueda</a>
      {running && <button disabled={action.busy} onClick={() => void action.run(() => api('/research/jobs/' + id + '/cancel', 'POST'), 'Cancelación procesada.')}>Cancelar</button>}
      {!running && <DownloadButton path={'/research/jobs/' + id + '/export'} filename="lote-prospeccion.json">Descargar resultado del lote</DownloadButton>}
    </div><Feedback state={action} />
    {results.length > 0 && <ul className="records">{results.map((item) => <li key={item.id}>
      <strong>{item.organizationId ? <a href={'#prospect/' + item.organizationId}>{item.record.name}</a> : item.record.name}</strong>
      <span className="tag">{status(item.outcome)}</span><small>{item.record.city} · {item.record.confidence}</small>
      <p>{item.record.evidence.statement}</p><p className="muted">{item.reason}</p>
      <a href={item.record.evidence.url} target="_blank" rel="noopener noreferrer">Ver fuente</a>
      {item.outcome === 'EN_REVISION' && <details><summary>Revisar ficha</summary><Review
        label="Confirmar e incorporar" acknowledgement="Confirmé la fuente pública y que la ficha corresponde a esta organización." busy={action.busy}
        onReview={(payload) => void action.run(() => api('/research/jobs/' + id + '/candidates/' + item.id + '/review', 'POST',
          { reviewer: payload.reviewer, confirm: payload.acknowledge }), 'Ficha incorporada.')} /></details>}
    </li>)}</ul>}
  </section>}</Resource>
}
