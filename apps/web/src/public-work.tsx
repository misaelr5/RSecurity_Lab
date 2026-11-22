import { useState } from 'react'
import { assetKinds, assetStates, pipelineStages } from '../../../packages/core/src/constants.ts'
import { api, today, when } from './client.ts'
import type { Asset, Pipeline, PipelineMetrics, PublicSource } from './client.ts'
import { Empty, Feedback, Field, Resource, useAction, useResource, values } from './widgets.tsx'

type ItemProps = { id: string; revision: number; refresh: () => void }

export function Assets({ id, sources, revision, refresh }: ItemProps & { sources: PublicSource[] }) {
  const path = '/prospects/' + id + '/assets'
  const [kind, setKind] = useState('')
  const result = useResource<Asset[]>(path + (kind ? '?kind=' + encodeURIComponent(kind) : ''), revision)
  const action = useAction(refresh)
  return <section className="panel">
    <h2>Activos y datos públicos</h2>
    <p className="muted">Cargá datos que ya estén publicados y vinculalos a la fuente que consultaste.</p>
    <Feedback state={action} />
    <label className="field">Tipo de dato<select value={kind} onChange={(event) => setKind(event.target.value)}>
      <option value="">Todos</option>{assetKinds.map((type) => <option key={type}>{type}</option>)}
    </select></label>
    <Resource result={result}>{(items) => items.length ? <ul className="records">{items.map((item) => {
      const source = sources.find((entry) => entry.id === item.sourceId)
      return <li key={item.id}><strong>{item.value}</strong><span className="tag">{item.kind}</span>
        <small>{item.status} · Confianza {item.confidence.toLowerCase()} · {item.collectedAt}</small>
        <p>{item.note}</p><small>{source?.provider} · {source?.url}</small>
      </li>
    })}</ul> : <Empty>Sin activos registrados para este filtro.</Empty>}</Resource>
    {sources.length ? <details><summary>Registrar activo</summary><form className="fields" onSubmit={(event) => {
      const data = values(event)
      const form = event.currentTarget
      void action.run(async () => { await api(path, 'POST', data); form.reset() }, 'Activo registrado.')
    }}>
      <label className="field wide">Fuente del activo<select name="sourceId" required>
        {sources.map((item) => <option value={item.id} key={item.id}>{item.provider} · {item.consultedAt}</option>)}
      </select></label>
      <Field label="Clase de dato" name="kind" options={assetKinds} />
      <Field label="Valor publicado" name="value" required />
      <Field label="Estado del dato" name="status" options={assetStates} />
      <Field label="Confianza del dato" name="confidence" options={['BAJA', 'MEDIA', 'ALTA']} />
      <Field label="Fecha del dato" name="collectedAt" type="date" value={today()} required />
      <Field label="Qué respalda la fuente" name="note" area required />
      <div className="wide"><button disabled={action.busy}>Guardar activo</button></div>
    </form></details> : <p className="muted">Registrá primero una fuente pública.</p>}
  </section>
}

export function CommercialTimeline({ id, revision, refresh, blocked }: ItemProps & { blocked: boolean }) {
  const path = '/prospects/' + id + '/pipeline'
  const resource = useResource<Pipeline>(path, revision)
  const action = useAction(refresh)
  return <section className="panel"><h2>Pipeline comercial</h2>
    <Feedback state={action} />
    <Resource result={resource}>{({ stage, events }) => {
      const next = pipelineStages.slice(pipelineStages.indexOf(stage) + 1)
        .filter((option) => !blocked || pipelineStages.indexOf(option) < pipelineStages.indexOf('Contacto preparado'))
      return <>
        <p>Etapa actual <span className="tag">{stage}</span></p>
        {next.length > 0 && <details><summary>Registrar avance</summary><form className="fields" key={stage} onSubmit={(event) => {
          const data = values(event)
          void action.run(() => api(path, 'POST', data), 'Avance registrado.')
        }}>
          <Field label="Etapa registrada" name="stage" options={next} />
          <Field label="Servicio considerado" name="service" />
          <Field label="Nota de seguimiento" name="note" area required />
          <div className="wide"><button disabled={action.busy}>Guardar avance</button></div>
        </form></details>}
        {events.length ? <ul className="records">{events.map((item) => <li key={item.id}>
          <strong>{item.stage}</strong><small>{when(item.createdAt)}{item.service ? ' · ' + item.service : ''}</small><p>{item.note}</p>
        </li>)}</ul> : <Empty>Los hitos registrados aparecen en este historial.</Empty>}
      </>
    }}</Resource>
  </section>
}

export function PipelineOverview({ revision }: { revision: number }) {
  const result = useResource<PipelineMetrics>('/pipeline/metrics', revision)
  return <section className="panel"><h2>Pipeline comercial</h2>
    <Resource result={result}>{(data) => <>
      <p>{data.contactados ? data.respondieron + ' de ' + data.contactados + ' contactos recibieron respuesta.' : 'Todavía no hay contactos registrados.'}</p>
      <dl className="summary">{data.stages.map((item) => <div key={item.stage}><dt>{item.stage}</dt><dd>{item.count}</dd></div>)}</dl>
    </>}</Resource>
  </section>
}

export function OpportunityScore({ id, revision }: Pick<ItemProps, 'id' | 'revision'>) {
  const [filter, setFilter] = useState('')
  const resource = useResource<{ score: number | null; signals: { label: string; weight: number; present: boolean }[] }>(
    '/prospects/' + id + '/score' + filter, revision)
  return <section className="panel">
    <h2>Prioridad comercial</h2>
    <p className="muted">Pondera la preparación de la ficha y la calidad de su evidencia para el contacto.</p>
    <Resource result={resource}>{(result) => <>
      <p>{result.score === null ? 'Ficha excluida de contacto' : 'Puntaje ' + result.score + ' de 100'}</p>
      <ul className="records">{result.signals.map((signal) => <li key={signal.label}>{signal.label}<small>
        {signal.present ? 'Registrado' : 'Pendiente'} · Peso {signal.weight}
      </small></li>)}</ul>
    </>}</Resource>
    <details><summary>Ajustar pesos para esta ficha</summary>
      <form className="fields" onSubmit={(event) => {
        const data = values(event)
        setFilter('?' + new URLSearchParams(data))
      }}>
        <Field label="Peso del sitio" name="site" type="number" value="20" required />
        <Field label="Peso del contacto" name="contact" type="number" value="20" required />
        <Field label="Peso de la evidencia" name="source" type="number" value="35" /><Field label="Peso del tipo de aplicación" name="application" type="number" value="25" required />
        <div className="wide"><small>Ingresá pesos entre 0 y 100.</small><button>Recalcular prioridad</button></div>
      </form>
    </details>
  </section>
}
