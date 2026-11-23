import { useState } from 'react'
import { api, when } from './client.ts'
import { readSearchFields, researchStatus, SearchFields } from './research-fields.tsx'
import type { ResearchMode, ResearchJob, SavedSearch } from './research-fields.tsx'
import { DownloadButton, Empty, Feedback, Field, Resource, useAction, useResource, values } from './widgets.tsx'

export function SavedResearch({ revision, refresh }: { revision: number; refresh: () => void }) {
  const searches = useResource<SavedSearch[]>('/research/saved', revision)
  const capabilities = useResource<{ codex: boolean }>('/research/capabilities', revision)
  const [editing, setEditing] = useState<string>()
  const action = useAction(refresh)
  return <Resource result={searches}>{(items) => <>
    <section className="panel">
      <div className="v4-section-heading"><div><h2>Configuraciones reutilizables</h2><p className="muted">Cada ejecución usa las fuentes y los filtros vigentes.</p></div>
        <button className="primary" onClick={() => setEditing('nueva')}>Crear búsqueda</button></div>
      {items.length ? <ul className="records">{items.map((item) => <li key={item.id}>
        <div className="v4-section-heading"><div><h3>{item.name}</h3><small>{item.configuration.mode === 'update' ? 'Actualización' : 'Descubrimiento'} · {when(item.updatedAt)}</small></div></div>
        <p>{item.configuration.prompt}</p>
        <div className="toolbar">
          <button disabled={action.busy} onClick={() => void action.run(async () => {
            const job = await api<ResearchJob>('/research/saved/' + item.id + '/run', 'POST', { requestId: crypto.randomUUID() })
            window.location.hash = 'research/' + job.id
          }, 'Búsqueda iniciada.')}>Ejecutar nuevamente</button>
          <button type="button" onClick={() => setEditing(item.id)}>Editar</button>
          <button disabled={action.busy} onClick={() => void action.run(() => api('/research/saved/' + item.id + '/duplicate', 'POST'), 'Configuración duplicada.')}>Duplicar configuración</button>
          <DownloadButton path={'/research/saved/' + item.id + '/export'} filename="busqueda-guardada.json">Exportar configuración</DownloadButton>
        </div>
        <SavedRuns id={item.id} revision={revision} />
      </li>)}</ul> : <Empty>Creá una búsqueda o guardá los filtros desde el formulario de prospección.</Empty>}
      <Feedback state={action} />
    </section>
    {editing && <Resource result={capabilities}>{(config) => <SearchEditor key={editing} search={items.find((item) => item.id === editing)} codex={config.codex}
      close={() => setEditing(undefined)} refresh={refresh} />}</Resource>}
  </>}</Resource>
}

function SearchEditor({ search, codex, close, refresh }: { search?: SavedSearch; codex: boolean; close: () => void; refresh: () => void }) {
  const [mode, setMode] = useState<ResearchMode>(search?.configuration.mode ?? 'discover')
  const action = useAction(() => { refresh(); close() })
  return <section className="panel">
    <h2>{search ? `Editar ${search.name}` : 'Crear búsqueda guardada'}</h2>
    <form className="fields v4-fields" onSubmit={(event) => {
      const data = values(event)
      const body = { name: data.name, configuration: readSearchFields(data) }
      const path = search ? '/research/saved/' + search.id : '/research/saved'
      void action.run(() => api(path, search ? 'PUT' : 'POST', body), 'Configuración guardada.')
    }}>
      <Field label="Nombre de la búsqueda" name="name" value={search?.name} required />
      <label className="field">Modalidad<select value={mode} onChange={(event) => setMode(event.target.value === 'update' ? 'update' : 'discover')}>
        <option value="discover">Descubrir empresas nuevas</option><option value="update">Actualizar prospectos</option>
      </select></label>
      <SearchFields codex={codex} mode={mode} configuration={search?.configuration} />
      <div className="toolbar wide"><button className="primary" disabled={action.busy}>Guardar configuración</button><button type="button" onClick={close}>Cancelar edición</button></div>
    </form><Feedback state={action} />
  </section>
}

function SavedRuns({ id, revision }: { id: string; revision: number }) {
  const [opened, setOpened] = useState(false)
  return <details onToggle={(event) => setOpened(event.currentTarget.open)}><summary>Comparar ejecuciones</summary>
    {opened && <SavedRunTable id={id} revision={revision} />}
  </details>
}

function SavedRunTable({ id, revision }: { id: string; revision: number }) {
  const runs = useResource<ResearchJob[]>('/research/saved/' + id + '/jobs', revision)
  return <Resource result={runs}>{(items) => items.length ? <div className="table-scroll inset"><table>
    <caption>Resultados por ejecución</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Resultado</th><th scope="col">Verificadas</th><th scope="col">Incorporadas</th><th scope="col">Duplicadas</th><th scope="col">Pendientes</th></tr></thead>
    <tbody>{items.map((job) => <tr key={job.id}><td><a href={'#research/' + job.id}>{when(job.createdAt)}</a></td>
      <td>{researchStatus(job.state)}</td><td>{job.verified}</td><td>{job.imported}</td><td>{job.duplicates}</td><td>{job.pending}</td></tr>)}</tbody>
  </table></div> : <Empty>Esta configuración todavía no tiene ejecuciones.</Empty>}</Resource>
}
