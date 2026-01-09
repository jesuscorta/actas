import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import localforage from 'localforage'
import { useAuth } from './auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : ''
const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined)?.trim() || ''

type NextTask = {
  id: string
  text: string
  done: boolean
}

type ActaNote = {
  id: string
  title: string
  client: string
  date: string
  nextTasks: NextTask[]
  createdAt: string
  updatedAt: string
}

const storage = localforage.createInstance({
  name: 'actas',
  storeName: 'actas_store',
})

const sortNotes = (list: ActaNote[]) =>
  [...list].sort((a, b) => {
    const byDate = new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
    if (byDate !== 0) return byDate
    return new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime()
  })

const formatDate = (value: string) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(value),
  )
}

function HomePage() {
  const { authHeaders, user } = useAuth()
  const [actas, setActas] = useState<ActaNote[]>([])
  const [loading, setLoading] = useState(true)
  const storageKey = useCallback(
    (name: string) => `${name}:${(user?.email || 'local').toLowerCase()}`,
    [user?.email],
  )

  const loadFromStorage = useCallback(async () => {
    const storedActas = (await storage.getItem<ActaNote[]>(storageKey('notes'))) || []
    setActas(sortNotes(storedActas))
    setLoading(false)
  }, [storageKey])

  const loadFromApi = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/state`, {
        headers: {
          ...authHeaders(),
          ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
        },
      })
      if (!res.ok) {
        throw new Error(`API failed: ${res.status}`)
      }
      const data = (await res.json()) as { notes?: ActaNote[] }
      const storedActas = Array.isArray(data.notes) ? data.notes : []
      const sorted = sortNotes(storedActas)
      setActas(sorted)
      await storage.setItem(storageKey('notes'), sorted)
      setLoading(false)
    } catch (error) {
      console.error('Home load error', error)
      await loadFromStorage()
    }
  }, [authHeaders, loadFromStorage, storageKey])

  useEffect(() => {
    if (API_BASE) {
      void loadFromApi()
    } else {
      void loadFromStorage()
    }
  }, [loadFromApi, loadFromStorage])

  useEffect(() => {
    const handleRefresh = () => {
      if (API_BASE) {
        void loadFromApi()
      } else {
        void loadFromStorage()
      }
    }
    window.addEventListener('actas:data-imported', handleRefresh)
    return () => window.removeEventListener('actas:data-imported', handleRefresh)
  }, [loadFromApi, loadFromStorage])

  const pendingGroups = useMemo(() => {
    return actas
      .map((note) => {
        const pending = (note.nextTasks || []).filter((task) => !task.done && task.text?.trim())
        return pending.length ? { note, pending } : null
      })
      .filter(Boolean) as { note: ActaNote; pending: NextTask[] }[]
  }, [actas])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="grid w-full gap-4 md:grid-cols-2">
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

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold uppercase text-slate-500">Pendientes</p>
              <h2 className="text-lg font-bold text-slate-900">Tareas de actas</h2>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {pendingGroups.reduce((acc, group) => acc + group.pending.length, 0)} tareas
            </span>
          </div>

          {loading && <p className="mt-3 text-sm text-slate-500">Cargando tareas...</p>}
          {!loading && pendingGroups.length === 0 && (
            <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No hay tareas pendientes en las actas.
            </p>
          )}
          {!loading && pendingGroups.length > 0 && (
            <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {pendingGroups.map(({ note, pending }) => (
                <Link
                  key={note.id}
                  to={`/actas#${note.id}`}
                  className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 transition hover:border-primary-200 hover:bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-primary-700">
                      {note.title || 'Acta sin título'}
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(note.date)}</span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {note.client || 'Sin cliente'}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {pending.map((task) => (
                      <li key={task.id} className="flex items-start gap-2">
                        <span className="mt-1 h-2 w-2 rounded-full bg-primary-300" />
                        <span>{task.text}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 text-xs font-semibold text-primary-700">
                    Ver acta →
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default HomePage
