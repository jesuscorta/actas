import { Link } from 'react-router-dom'

function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Inicio</p>
          <h1 className="text-2xl font-bold text-slate-950">Panel de trabajo</h1>
          <p className="text-sm text-slate-600">
            Accede rápido a las actas y a las notas rápidas de clientes.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            to="/actas"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary-50/60 via-white to-slate-50 opacity-80" />
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-700 shadow-inner ring-1 ring-primary-200/60">
                  🗂️
                </span>
                <div>
                  <p className="text-sm font-semibold uppercase text-primary-700">Actas</p>
                  <h2 className="text-lg font-bold text-slate-950">Panel de reuniones</h2>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Crea, edita y exporta actas de reuniones con formato enriquecido, checklist y
                menciones.
              </p>
              <div className="mt-auto text-sm font-semibold text-primary-700">
                Ir a actas →
              </div>
            </div>
          </Link>

          <Link
            to="/notas"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/70 via-white to-slate-50 opacity-80" />
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-inner ring-1 ring-emerald-200/60">
                  📝
                </span>
                <div>
                  <p className="text-sm font-semibold uppercase text-emerald-700">Notas</p>
                  <h2 className="text-lg font-bold text-slate-950">Notas rápidas por cliente</h2>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Guarda notas rápidas por cliente con texto enriquecido y accede a las últimas de un
                vistazo.
              </p>
              <div className="mt-auto text-sm font-semibold text-emerald-700">
                Ir a notas →
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default HomePage
