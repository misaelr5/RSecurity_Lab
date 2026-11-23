import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api, download } from './client.ts'

export function useResource<T>(path: string, revision: number) {
  const [result, setResult] = useState<{ path: string; value?: T; error?: string }>()
  useEffect(() => {
    let alive = true
    api<T>(path).then(
      (value) => { if (alive) setResult({ path, value }) },
      (error: Error) => { if (alive) setResult({ path, error: error.message }) },
    )
    return () => { alive = false }
  }, [revision, path])
  return result?.path === path ? result : { path }
}
export function Resource<T>({ result, children }: { result: { value?: T; error?: string }; children: (value: T) => ReactNode }) {
  if (result.error) return <p className="error" role="alert">{result.error}</p>
  if (result.value === undefined) return <p className="muted" role="status">Cargando…</p>
  return children(result.value)
}
export function useAction(onSuccess: () => void) {
  const [state, setState] = useState({ busy: false, error: '', notice: '' })
  async function run(task: () => Promise<unknown>, notice: string) {
    setState({ busy: true, error: '', notice: '' })
    try {
      await task()
      setState({ busy: false, error: '', notice })
      onSuccess()
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : 'La operación no se pudo completar.', notice: '' })
    }
  }
  return { ...state, run }
}
export function Feedback({ state }: { state: { error: string; notice: string } }) {
  return <>{state.error && <p className="error" role="alert">{state.error}</p>}{state.notice && <p className="notice" role="status">{state.notice}</p>}</>
}
export function Field({ label, name, value, type = 'text', required, options, area }: {
  label: string; name: string; value?: string; type?: string; required?: boolean; options?: readonly string[]; area?: boolean;
}) {
  return <label className={area ? 'field wide' : 'field'}>{label}
    {options ? <select name={name} defaultValue={value} required={required}>{options.map((item) => <option key={item}>{item}</option>)}</select>
      : area ? <textarea name={name} defaultValue={value} required={required} rows={3} />
        : <input name={name} type={type} defaultValue={value} required={required} autoComplete="off" />}
  </label>
}
export function values(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  return Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)]))
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty muted">{children}</p>
}
export function Review({ label, busy, onReview, acknowledgement = 'Confirmo que revisé el contenido.' }: {
  label: string; busy: boolean; onReview: (payload: { reviewer: string; acknowledge: true }) => void; acknowledgement?: string;
}) {
  return <form className="review" onSubmit={(event) => {
    const data = values(event)
    onReview({ reviewer: data.reviewer, acknowledge: true })
  }}>
    <Field label="Responsable de la revisión" name="reviewer" required />
    <label className="check"><input type="checkbox" name="confirm" required />{acknowledgement}</label>
    <button disabled={busy}>{label}</button>
  </form>
}

export function DownloadButton({ path, filename, children, primary }: { path: string; filename: string; children: ReactNode; primary?: boolean }) {
  const action = useAction(() => {})
  return <>
    <button className={primary ? 'primary' : undefined} disabled={action.busy} onClick={() => void action.run(() => download(path, filename), '')}>{children}</button>
    {action.error && <span role="alert" className="error">{action.error}</span>}
  </>
}
