import { lazy, Suspense, useEffect, useCallback, useState } from 'react'
import { Discovery } from './discovery.tsx'
import { ResearchWork } from './research-work.tsx'
import { SavedResearch } from './saved-research.tsx'
import { ResearchReview } from './research-review.tsx'
import { Campaigns } from './campaigns.tsx'
import { Enrichment } from './enrichment.tsx'
import { CommercialRegister } from './commercial-register.tsx'
import { CommercialMetrics } from './commercial-metrics.tsx'
import { DashboardPreview, PreviewThemeSelect, useDashboardTheme } from './dashboard-preview.tsx'
import { OperatorGate } from './operator.tsx'
import { createRoot } from 'react-dom/client'
import { Prospects, ProspectDetail } from './portfolio.tsx'
import { Audits, AuditEvidence, Reports, Configuration } from './operations.tsx'
import './style.css'
import './pilot-design.css'
import './operational-theme.css'
import './commercial-workflow.css'

const CommercialMap = lazy(() => import('./commercial-map.tsx').then(({ CommercialMap }) => ({ default: CommercialMap })))

const navigationGroups = [
  { label: 'Cartera', items: [['dashboard', 'Dashboard'], ['prospects', 'Prospectos'], ['map', 'Mapa de prospectos'], ['campaigns', 'Campañas comerciales'], ['companies', 'Empresas prospectadas']] },
  { label: 'Investigación', items: [['research', 'Prospección con IA'], ['review', 'Revisión de prospectos'], ['saved', 'Búsquedas guardadas'], ['enrichment', 'Enriquecimiento'], ['discovery', 'Descubrimiento'], ['evidence', 'Evidencia pública']] },
  { label: 'Operación', items: [['audits', 'Auditorías'], ['reports', 'Informes'], ['exports', 'Exportaciones'], ['settings', 'Configuración']] },
]
const navigation = navigationGroups.flatMap(({ items }) => items)
const workspaceDescriptions: Record<string, string> = {
  prospects: 'Cartera comercial de Reac Studio.',
  discovery: 'Fuentes públicas, incorporación de fichas y traslado al CRM.', evidence: 'Fuentes registradas y observaciones revisables.',
  audits: 'Laboratorio de configuración y alcance documentado.', reports: 'Relevamientos y exportaciones para revisión.',
  settings: 'Almacenamiento, herramientas y respaldos.', research: 'Consultas, resultados y revisión de lotes.',
  companies: 'Empresas investigadas, registros de contacto y seguimientos.', map: 'Ubicaciones documentadas de la cartera.',
  exports: 'Descargas de la cartera comercial y sus fuentes.', saved: 'Configuraciones y resultados de ejecuciones anteriores.',
  review: 'Evidencia, coincidencias y decisiones pendientes.', enrichment: 'Propuestas de actualización con fuentes oficiales.',
  campaigns: 'Agrupá empresas y medí los hitos registrados en cada campaña.',
}
const readHash = () => window.location.hash.slice(1).split('/')
const open = (path: string) => { window.location.hash = path }

function App({ signOut }: { signOut?: () => void }) {
  const [route, setRoute] = useState(readHash)
  const [revision, setRevision] = useState(0)
  const appearance = useDashboardTheme()
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    const onHash = () => { setRoute(readHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = appearance.resolvedTheme
    return () => { delete document.documentElement.dataset.theme }
  }, [appearance.resolvedTheme])
  const [view, first, second, detailId] = route
  if (view === 'preview') return <DashboardPreview appearance={appearance} />
  const active = view === 'prospect' ? 'prospects' : view === 'audit' ? 'audits' : ['reprospect', 'update-prospects'].includes(view) ? 'research'
    : navigation.some(([id]) => id === view) ? view : 'dashboard'
  const title = navigation.find(([id]) => id === active)?.[1]
  return <div className="shell workspace-shell" data-view={active}>
    <a className="workspace-skip" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Saltar al contenido</a>
    <aside className="sidebar">
      <a className="brand" href="#dashboard"><span className="brand-mark" aria-hidden="true">R</span><span>Reac Security Lab<small>Reac Studio</small></span></a>
      <nav aria-label="Principal">{navigationGroups.map(({ label, items }) => <div className="nav-group" key={label}>
        <p>{label}</p>{items.map(([id, text]) => <a key={id} href={'#' + id} aria-current={active === id ? 'page' : undefined}>{text}</a>)}
      </div>)}</nav>
      <div className="connection"><i aria-hidden="true" />Espacio de trabajo local{signOut && <div><button onClick={signOut}>Cerrar sesión</button></div>}</div>
    </aside>
    <main id="main-content" tabIndex={-1}>
      <header className="page-header"><div><h1>{title}</h1>{workspaceDescriptions[active] && <p>{workspaceDescriptions[active]}</p>}</div>
        <PreviewThemeSelect theme={appearance.theme} onChange={appearance.changeTheme} label="Tema de la aplicación" />
      </header>
      <div className="page" key={route.join('/')}>
        {active === 'discovery' && <Discovery revision={revision} refresh={refresh} />}
        {active === 'dashboard' && <CommercialMetrics revision={revision} />}
        {active === 'research' && <ResearchWork revision={revision} refresh={refresh} jobId={view === 'research' ? first : undefined} reprospect={view === 'reprospect'} campaignId={view === 'reprospect' ? first : undefined} initialMode={view === 'update-prospects' ? 'update' : 'discover'} />}
        {active === 'saved' && <SavedResearch revision={revision} refresh={refresh} />}
        {active === 'review' && <ResearchReview revision={revision} refresh={refresh} candidateId={first} />}
        {active === 'campaigns' && <Campaigns id={first} revision={revision} refresh={refresh} />}
        {active === 'enrichment' && <Enrichment id={first} revision={revision} refresh={refresh} />}
        {active === 'map' && <Suspense fallback={<p className="muted" role="status">Cargando mapa…</p>}>
          <CommercialMap revision={revision} refresh={refresh} campaignId={first === 'prospect' ? undefined : first} prospectId={first === 'prospect' ? second : undefined} />
        </Suspense>}
        {(active === 'companies' || active === 'exports') && <CommercialRegister revision={revision} refresh={refresh} exportOnly={active === 'exports'} />}
        {(active === 'prospects' || active === 'evidence') && (first
          ? <ProspectDetail id={first} revision={revision} refresh={refresh} open={open} onlyEvidence={active === 'evidence'} focusDrafts={second === 'drafts'} draftId={second === 'drafts' ? detailId : undefined} />
          : <Prospects revision={revision} refresh={refresh} open={open} sourcesOnly={active === 'evidence'} />)}
        {active === 'audits' && (first ? <AuditEvidence id={first} revision={revision} refresh={refresh} /> : <Audits revision={revision} refresh={refresh} />)}
        {active === 'reports' && <Reports kind={first} id={second} revision={revision} refresh={refresh} />}
        {active === 'settings' && <Configuration revision={revision} refresh={refresh} />}
      </div>
    </main>
  </div>
}
createRoot(document.getElementById('root')!).render(<OperatorGate>{(signOut) => <App signOut={signOut} />}</OperatorGate>)
