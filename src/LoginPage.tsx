import { useState, type FormEvent } from 'react'
import { useAuth } from './auth'

function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    const result = await signIn(email.trim().toLowerCase(), password)
    setLoading(false)
    if (!result.ok) {
      setError(result.error || 'No se pudo iniciar sesión')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-10 text-slate-900">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-xl backdrop-blur">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-200">
                actas
              </p>
              <h1 className="text-2xl font-bold leading-snug">Acceso seguro a tu panel</h1>
              <p className="text-sm text-slate-200/90">
                Protegemos tus actas y notas con usuario y contraseña.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-3 text-xs text-slate-200/70">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              Acceso privado
            </div>
          </div>
          <div className="flex flex-col gap-6 px-6 py-8">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Entrar
              </p>
              <p className="text-sm text-slate-600">
                Introduce tu usuario y contraseña.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase text-slate-500">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="tu@email.com"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase text-slate-500">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
