import { useState } from 'react'
import { api } from './client.ts'
import { DownloadButton, Empty, Feedback, Resource, Review, useAction, useResource } from './widgets.tsx'

const directories = [
  ['Villa Dolores', 'Alojamientos · Municipalidad', 'https://villadolores.gov.ar/alojamientos-villa-dolores/'],
  ['Traslasierra', 'Alojamientos · Guía de Nono', 'https://www.nonoturismo.gob.ar/guiadeservicios/alojamiento/'],
  ['Córdoba Capital', 'Alojamiento · Turismo Córdoba', 'https://turismo.cordoba.gob.ar/que-hacer-en-cordoba-capital/alojamiento/'],
  ['Córdoba Capital', 'Empresas · Innovab', 'https://innovab.cordoba.gob.ar/'],
]
type Preview = { name: string; city: string; type: string; sourceUrl: string; statement: string; opportunity: string; duplicate: boolean }
type Incoming = { file: unknown; preview: Preview[] }
type Transfer = { id: string; name: string; blocked: boolean; industry: string; crmIndustry: string; approved: boolean }

export function Discovery({ revision, refresh }: { revision: number; refresh: () => void }) {
  const [incoming, setIncoming] = useState<Incoming>()
  const [transfer, setTransfer] = useState(false)
  const action = useAction(refresh)
  return <>
    <section className="panel"><h2>Directorios públicos</h2><p className="muted">Buscá empresas en el directorio y confirmá ubicación, canal comercial y función digital en una fuente publicable.</p>
      <div className="discovery-grid">{directories.map(([region, label, url]) =>
        <a className="discovery-source button" href={url} target="_blank" rel="noopener noreferrer" key={label}>{label}<small>{region}</small></a>)}</div>
    </section>
    <section className="panel"><h2>Importar investigación</h2>
      <form className="toolbar" onSubmit={(event) => {
        event.preventDefault()
        const file = new FormData(event.currentTarget).get('records')
        setIncoming(undefined)
        void action.run(async () => {
          if (!(file instanceof File) || !file.size || file.size > 500000) throw new Error('Seleccioná un JSON de hasta 500 KB.')
          let data: unknown
          try { data = JSON.parse(await file.text()) } catch { throw new Error('El archivo no es JSON válido.') }
          const preview = await api<Preview[]>('/discovery/preview', 'POST', data)
          setIncoming({ file: data, preview })
        }, 'Vista previa preparada.')
      }}>
        <label className="field">Archivo de investigación JSON<input type="file" name="records" accept=".json,application/json" required /></label>
        <button disabled={action.busy}>Previsualizar investigación</button>
      </form>
      <Feedback state={action} />
      {incoming && <>
        <ul className="records">{incoming.preview.map((row, index) => <li key={index}>
          <strong>{row.name}</strong><small>{row.city} · {row.type}{row.duplicate ? ' · Ficha existente, se conserva' : ''}</small>
          <p>{row.statement}</p><p className="muted">{row.opportunity}</p>
          <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">Abrir fuente</a>
        </li>)}</ul>
        <Review label="Incorporar fichas verificadas" busy={action.busy} acknowledgement="Verifiqué fuentes, canales públicos y atribución." onReview={(payload) => void action.run(async () => {
          await api('/discovery/import', 'POST', { file: incoming.file, ...payload })
          setIncoming(undefined)
        }, 'Investigación incorporada. Las fichas existentes se conservaron.')} />
      </>}
    </section>
    <section className="panel"><h2>Trasladar a Reac Leads</h2>
      <p className="muted">Previsualizá la adaptación de rubros, exclusiones y borradores aprobados antes de descargar el CSV.</p>
      <button onClick={() => setTransfer(!transfer)}>{transfer ? 'Cerrar vista previa' : 'Previsualizar para Reac Leads'}</button>
      {transfer && <CrmPreview revision={revision} />}
    </section>
  </>
}
function CrmPreview({ revision }: { revision: number }) {
  const result = useResource<Transfer[]>('/crm/preview', revision)
  return <Resource result={result}>{(items) => items.length ? <>
    <ul className="records">{items.map((item) => <li key={item.id}><strong>{item.name}</strong><small>{item.crmIndustry === item.industry ? item.industry : item.industry + ' → ' + item.crmIndustry} · {item.blocked ? 'Excluida' : item.approved ? 'Borrador aprobado incluido' : 'Sin borrador aprobado'}</small></li>)}</ul>
    <DownloadButton primary path="/prospects/export?mode=handoff" filename="reac-leads-v1.csv">Descargar CSV para Reac Leads</DownloadButton>
  </> : <Empty>La cartera todavía está vacía.</Empty>}</Resource>
}
