import { useEffect, useCallback, useState } from 'react'
import { Discovery } from './discovery.tsx'
import { OperatorGate } from './operator.tsx'
import { createRoot } from 'react-dom/client'
import { regions } from '../../../packages/core/src/constants.ts'
import { PipelineOverview } from './public-work.tsx'
import { Prospects, ProspectDetail } from './portfolio.tsx'
import { Audits, AuditEvidence, Reports, Configuration } from './operations.tsx'
import { Empty, Resource, useResource } from './widgets.tsx'
import { when } from './client.ts'
import type { Dashboard } from './client.ts'
import './style.css'
import './pilot-design.css'

const navigation = [
  { id: 'dashboard', text: 'Dashboard', icon: '▦' },
  { id: 'prospects', text: 'Prospectos', icon: '◇' },
  { id: 'discovery', text: 'Descubrimiento', icon: '⌖' },
  { id: 'evidence', text: 'Evidencia pública', icon: '▤' },
  { id: 'audits', text: 'Auditorías', icon: '⬡' },
  { id: 'reports', text: 'Informes', icon: '▧' },
  { id: 'settings', text: 'Configuración', icon: '⚙' },
]
const readHash = () => window.location.hash.slice(1).split('/')
const open = (path: string) => { window.location.hash = path }

function App({ signOut }: { signOut?: () => void }) {
  const [route, setRoute] = useState(readHash)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    const onHash = () => { setRoute(readHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [view, first, second] = route
  const active = view === 'prospect' ? 'prospects' : view === 'audit' ? 'audits' : navigation.some((item) => item.id === view) ? view : 'dashboard'
  const title = navigation.find((item) => item.id === active)?.text
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#dashboard"><span className="brand-mark" aria-hidden="true">R</span><span>Reac Security Lab<small>Reac Studio</small></span></a>
      <nav aria-label="Principal">{navigation.map((item) => <a key={item.id} href={'#' + item.id} aria-current={active === item.id ? 'page' : undefined}><span aria-hidden="true">{item.icon}</span>{item.text}</a>)}</nav>
      <div className="connection"><i aria-hidden="true" />Espacio de trabajo local{signOut && <div><button onClick={signOut}>Cerrar sesión</button></div>}</div>
    </aside>
    <main>
      <header className="page-header"><div><h1>{title}</h1><p>{
        active === 'dashboard' ? 'Estado de la cartera y del laboratorio.' : active === 'prospects' ? 'Cartera comercial de Reac Studio.' :
        active === 'discovery' ? 'Fuentes públicas, incorporación de fichas y traslado al CRM.' : active === 'evidence' ? 'Fuentes registradas y observaciones revisables.' :
        active === 'audits' ? 'Laboratorio de configuración y alcance documentado.' :
        active === 'reports' ? 'Relevamientos y exportaciones para revisión.' : 'Almacenamiento, herramientas y respaldos.'
      }</p></div><span className="local-chip">127.0.0.1</span></header>
      <div className="page" key={route.join('/')}>
        {active === 'discovery' && <Discovery revision={revision} refresh={refresh} />}
        {active === 'dashboard' && <Overview revision={revision} />}
        {(active === 'prospects' || active === 'evidence') && (first
          ? <ProspectDetail id={first} revision={revision} refresh={refresh} open={open} onlyEvidence={active === 'evidence'} />
          : <Prospects revision={revision} refresh={refresh} open={open} sourcesOnly={active === 'evidence'} />)}
        {active === 'audits' && (first ? <AuditEvidence id={first} revision={revision} refresh={refresh} /> : <Audits revision={revision} refresh={refresh} />)}
        {active === 'reports' && <Reports kind={first} id={second} revision={revision} refresh={refresh} />}
        {active === 'settings' && <Configuration revision={revision} refresh={refresh} />}
      </div>
    </main>
  </div>
}
function Overview({ revision }: { revision: number }) {
  const result = useResource<Dashboard>('/dashboard', revision)
  return <Resource result={result}>{(data) => <>
    <section className="overview">
      <div className="overview-main"><h2>Cartera de prospectos</h2><p className="headline-number">{data.total}</p><a className="button primary" href="#prospects">Abrir cartera</a></div>
      <div className="region-list">{[...new Set([...regions, ...Object.keys(data.regions)])].map((region) => <div key={region}><span>{region}</span><meter aria-label={region} min={0} max={Math.max(data.total, 1)} value={data.regions[region] ?? 0} /><b>{data.regions[region] ?? 0}</b></div>)}</div>
    </section>
    <section aria-label="Indicadores" className="metrics">
      {[
        { label: 'Observaciones revisadas', value: data.verified, href: '#evidence' },
        { label: 'Borradores pendientes', value: data.pending, href: '#prospects' },
        { label: 'Autorizaciones vigentes', value: data.authorized, href: '#audits' },
        { label: 'Pruebas locales completadas', value: data.lab, href: '#audits' },
      ].map((item) => <a href={item.href} key={item.label}><span>{item.label}</span><strong>{item.value}</strong></a>)}
    </section>
    <PipelineOverview revision={revision} />
    <section className="panel activity"><h2>Actividad reciente</h2>
      {data.activity.length ? <ul className="records">{data.activity.map((item) => <li key={item.id}><strong>{item.action}</strong><time dateTime={item.createdAt}>{when(item.createdAt)}</time></li>)}</ul>
        : <Empty>La actividad aparece al importar una ficha, revisar un borrador o ejecutar el fixture.</Empty>}
    </section>
  </>}</Resource>
}
createRoot(document.getElementById('root')!).render(<OperatorGate>{(signOut) => <App signOut={signOut} />}</OperatorGate>)
