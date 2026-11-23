import { useState } from 'react'
import { api, when } from './client.ts'
import type { Page } from './client.ts'
import { researchStatus } from './research-fields.tsx'
import { Empty, Feedback, Field, Resource, useAction, useResource, values } from './widgets.tsx'

const categories = {
  all: 'Todas', verified: 'Verificadas automáticamente', pending: 'Pendientes de verificación', duplicate: 'Posibles duplicados',
  incomplete: 'Información incompleta', excluded: 'Excluidas y rechazadas', error: 'Errores de proveedor',
} as const
type Category = keyof typeof categories
type CandidateRecord = { name: string; city: string; region?: string; website?: string; industry?: string; email?: string; phone?: string; confidence?: string;
  evidence?: { url?: string; consultedAt?: string; statement?: string } }
type Candidate = { id: string; jobId: string; record: CandidateRecord; outcome: string; reason: string; missing: string[]; category: Category;
  organizationId?: string; reviewer?: string; reviewedAt?: string; matches?: { id: string; name: string; city?: string }[] }
type ProviderError = { id?: string; jobId?: string; provider?: string; reason?: string; state?: string; createdAt?: string }
type Decision = { id: string; action: 'approve' | 'reject' | 'exclude' | 'link' | 'edit' | 'enrich'; organizationId?: string; record?: CandidateRecord; reason?: string }
type Queue = { candidates: Candidate[]; errors: ProviderError[] }
const actionable = (item: Candidate) => ['pending', 'duplicate', 'incomplete'].includes(item.category)
const labels: Record<string, string> = { name: 'Nombre', city: 'Localidad', region: 'Región', website: 'Web', industry: 'Rubro', email: 'Correo', phone: 'Teléfono', evidence: 'Fuente' }
const reviewUrl = '/research/review'

function externalLink(url?: string) {
  if (!url) return undefined
  try { return ['http:', 'https:'].includes(new URL(url).protocol) ? url : undefined }
  catch { return undefined }
}

export function ResearchReview({ revision, refresh }: { revision: number; refresh: () => void }) {
  const [category, setCategory] = useState<Category>('all')
  const [selected, setSelected] = useState<string[]>([])
  const result = useResource<Queue>(reviewUrl + '?category=' + category, revision)
  const action = useAction(refresh)
  function decide(decisions: Decision[], reviewer: string, after?: () => void) {
    void action.run(async () => {
      await api(reviewUrl, 'POST', { decisions, reviewer, confirm: true })
      after?.()
    }, decisions.length === 1 ? 'Revisión registrada.' : 'Revisiones registradas.')
  }
  return <section className="panel">
    <div className="v4-section-heading"><div><h2>Bandeja de revisión</h2><p className="muted">Revisá la fuente y la identidad antes de decidir.</p></div>
      <label className="field">Clasificación<select value={category} onChange={(event) => { setCategory(event.target.value as Category); setSelected([]) }}>
        {Object.entries(categories).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select></label></div>
    <Feedback state={action} />
    <Resource result={result}>{({ candidates, errors }) => <>
      {!!selected.length && <form className="fields v4-fields v4-batch inset" onSubmit={(event) => {
        const data = values(event)
        decide(selected.map((id) => ({ id, action: 'reject', reason: data.reason })), data.reviewer, () => setSelected([]))
      }}>
        <strong className="wide">{selected.length} seleccionadas</strong>
        <Field label="Responsable de la revisión conjunta" name="reviewer" required />
        <Field label="Motivo de rechazo conjunto" name="reason" required />
        <label className="check wide"><input type="checkbox" required />Confirmo el rechazo de las candidatas seleccionadas.</label>
        <div className="toolbar wide"><button disabled={action.busy}>Rechazar seleccionadas</button><button type="button" onClick={() => setSelected([])}>Limpiar selección</button></div>
      </form>}
      {candidates.length ? <ul className="records v4-review-items">{candidates.map((item) => <li key={item.id}>
        <CandidateDetails item={item} />
        {actionable(item) && <>
          <label className="check inset"><input type="checkbox" checked={selected.includes(item.id)} disabled={selected.length >= 25 && !selected.includes(item.id)}
            onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />Seleccionar {item.record.name || 'candidata'} para rechazo conjunto</label>
          <details><summary>Revisar candidata</summary>
            <DecisionForm item={item} busy={action.busy} revision={revision} decide={(decision, reviewer) => decide([decision], reviewer, () => setSelected((ids) => ids.filter((id) => id !== item.id)))} />
          </details>
        </>}
      </li>)}</ul> : !errors.length && <Empty>No hay candidatas con esta clasificación.</Empty>}
      {!!errors.length && <section className="inset"><h3>Errores registrados</h3><ul className="records">{errors.map((error, idx) => <li key={error.id ?? error.jobId ?? idx}>
        <strong>{error.provider || 'Proveedor de investigación'}</strong>
        <p>{error.reason || 'La ejecución requiere revisión.'}</p>
        {(error.jobId || error.id) && <a href={'#research/' + (error.jobId ?? error.id)}>Ver ejecución</a>}
      </li>)}</ul></section>}
    </>}</Resource>
  </section>
}

function CandidateDetails({ item }: { item: Candidate }) {
  const record = item.record
  const website = externalLink(record.website)
  const source = externalLink(record.evidence?.url)
  return <>
    <div className="v4-section-heading"><div><h3>{record.name || 'Empresa sin nombre confirmado'}</h3><small>
      {[record.city, record.region && record.region !== record.city ? record.region : '', record.confidence ? 'Confianza ' + record.confidence.toLowerCase() : '', record.evidence?.consultedAt].filter(Boolean).join(' · ')}
    </small></div><span className="tag">{item.outcome === 'ACTUALIZAR' ? 'Actualización propuesta' : researchStatus(item.outcome)}</span></div>
    <p>{item.reason}</p>{record.evidence?.statement && <p className="muted">{record.evidence.statement}</p>}
    {!!item.missing?.length && <small>Datos faltantes · {item.missing.map((field) => labels[field] ?? field).join(', ')}</small>}
    {item.reviewedAt && <small>Revisó {item.reviewer || 'el operador'} · {when(item.reviewedAt)}</small>}
    <div className="toolbar inset">
      {website && <a href={website} target="_blank" rel="noopener noreferrer">Sitio publicado</a>}
      {source && <a href={source} target="_blank" rel="noopener noreferrer">Ver fuente</a>}
      <a href={'#research/' + item.jobId}>Ver lote</a>
      {item.organizationId && <a href={'#prospect/' + item.organizationId}>Abrir ficha</a>}
      {item.organizationId && <a href={'#enrichment/' + item.organizationId}>Solicitar enriquecimiento</a>}
    </div>
  </>
}

function DecisionForm({ item, busy, revision, decide }: { item: Candidate; busy: boolean; revision: number; decide: (decision: Decision, reviewer: string) => void }) {
  const [decision, setDecision] = useState<Decision['action']>(item.outcome === 'ACTUALIZAR' ? 'enrich' : item.category === 'duplicate' ? 'link' : 'approve')
  const [company, setCompany] = useState(item.record.name)
  return <form className="fields v4-fields" onSubmit={(event) => {
    const data = values(event)
    const record = decision === 'edit' ? { ...item.record, name: data.name, city: data.city, region: data.region, industry: data.industry,
      website: data.website, email: data.email, phone: data.phone } : undefined
    decide({ id: item.id, action: decision, organizationId: data.organizationId || undefined, record, reason: data.reason || undefined }, data.reviewer)
  }}>
    <label className="field">Decisión<select value={decision} onChange={(event) => setDecision(event.target.value as Decision['action'])}>
      {item.outcome === 'ACTUALIZAR' ? <option value="enrich">Preparar actualización para revisar</option>
        : item.category !== 'duplicate' && <option value="approve">Aprobar ficha</option>}
      <option value="edit">Editar candidata</option>{item.category === 'duplicate' && <option value="link">Vincular con ficha existente</option>}
      <option value="exclude">Marcar como excluida</option><option value="reject">Rechazar candidata</option>
    </select></label>
    <Field label="Responsable de la revisión" name="reviewer" required />
    {decision === 'link' && <>
      <label className="field">Buscar ficha para vincular<input value={company} maxLength={120} onChange={(event) => setCompany(event.target.value)} /></label>
      <CompanyOptions item={item} query={company} revision={revision} />
    </>}
    {decision === 'edit' && (['name', 'city', 'region', 'industry', 'website', 'email', 'phone'] as const).map((field) =>
      <Field key={field} label={labels[field]} name={field} value={item.record[field]} />)}
    <Field label="Motivo" name="reason" area required={decision === 'reject' || decision === 'exclude'} />
    <label className="check wide"><input type="checkbox" required />Confirmo la decisión y revisé la fuente cuando corresponde.</label>
    <div className="wide"><button disabled={busy}>Registrar decisión</button></div>
  </form>
}

function CompanyOptions({ item, query, revision }: { item: Candidate; query: string; revision: number }) {
  const result = useResource<Page>('/prospects?archived=include&q=' + encodeURIComponent(query), revision)
  const options = new Map<string, string>()
  for (const match of item.matches ?? []) options.set(match.id, [match.name, match.city].filter(Boolean).join(' · '))
  for (const match of result.value?.items ?? []) options.set(match.id, [match.name, match.city].filter(Boolean).join(' · '))
  return <label className="field">Ficha existente<select name="organizationId" required defaultValue={item.organizationId ?? ''}>
    <option value="">Elegir una ficha</option>{[...options].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
  </select>{result.error && <small role="alert">{result.error}</small>}</label>
}
