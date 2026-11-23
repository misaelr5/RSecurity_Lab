import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, saveOperatorToken } from './client.ts'
import { Feedback, Field, useAction, values } from './widgets.tsx'

type Status = { required: boolean; authenticated: boolean }

export function OperatorGate({ children }: { children: (signOut?: () => void) => ReactNode }) {
  const [status, setStatus] = useState<Status>()
  const [error, setError] = useState('')
  useEffect(() => {
    api<Status>('/operator/status').then(setStatus).catch((reason: Error) => setError(reason.message))
    const expire = () => setStatus({ required: true, authenticated: false })
    window.addEventListener('reac-session-expired', expire)
    return () => window.removeEventListener('reac-session-expired', expire)
  }, [])
  const action = useAction(() => setStatus({ required: true, authenticated: true }))
  if (error) return <main><p role="alert">{error}</p></main>
  if (!status) return <main><p role="status">Comprobando la sesión local…</p></main>
  if (status.required && !status.authenticated) return <main className="login-panel">
    <section className="panel">
      <h1>Reac Security Lab</h1><p className="muted">Acceso para el operador de esta computadora.</p>
      <form className="review" onSubmit={(event) => {
        const { key } = values(event)
        void action.run(async () => {
          const { sessionToken } = await api<{ sessionToken: string }>('/operator/login', 'POST', { key })
          saveOperatorToken(sessionToken)
        }, '')
      }}>
        <Field label="Clave local" name="key" type="password" required />
        <button className="primary" disabled={action.busy}>Iniciar sesión</button>
        <Feedback state={action} />
      </form>
    </section>
  </main>
  return children(status.required ? () => {
    void api('/operator/logout', 'POST').then(() => { saveOperatorToken(); setStatus({ required: true, authenticated: false }) }).catch((reason: Error) => setError(reason.message))
  } : undefined)
}
