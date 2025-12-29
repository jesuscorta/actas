import { GoogleLoginButton, useAuth } from './auth'

function LoginPage() {
  const { setCredential } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-10 text-slate-900">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-xl backdrop-blur">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-200">
                actas
              </p>
              <h1 className="text-2xl font-bold leading-snug">
                Acceso seguro con tu cuenta de Google
              </h1>
              <p className="text-sm text-slate-200/90">
                Protegemos tus actas y notas. Solo usuarios autorizados pueden entrar.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-3 text-xs text-slate-200/70">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              Google Identity Services
            </div>
          </div>
          <div className="flex flex-col gap-6 px-6 py-8">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Entrar
              </p>
              <p className="text-sm text-slate-600">
                Usa tu cuenta autorizada. Revisamos el dominio y correo permitido.
              </p>
            </div>
            <GoogleLoginButton onCredential={setCredential} />
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Si no ves el botón, revisa que esté configurado `VITE_GOOGLE_CLIENT_ID` en el entorno.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
