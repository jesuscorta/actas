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

type Task = {
  id: string
  title: string
  client: string
  createdAt: string
  bucket?: 'today' | 'week' | 'none'
  order?: number
  done: boolean
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

const sortTasks = (list: Task[]) =>
  [...list].sort((a, b) => {
    const aOrder = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY
    const bOrder = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY
    if (aOrder !== bOrder) return aOrder - bOrder
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const storageKey = useCallback(
    (name: string) => `${name}:${(user?.email || 'local').toLowerCase()}`,
    [user?.email],
  )

  const loadFromStorage = useCallback(async () => {
    const storedActas = (await storage.getItem<ActaNote[]>(storageKey('notes'))) || []
    const storedTasks = (await storage.getItem<Task[]>(storageKey('tasks'))) || []
    setActas(sortNotes(storedActas))
    setTasks(sortTasks(storedTasks))
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
      const data = (await res.json()) as { notes?: ActaNote[]; tasks?: Task[] }
      const storedActas = Array.isArray(data.notes) ? data.notes : []
      const storedTasks = Array.isArray(data.tasks) ? data.tasks : []
      const sorted = sortNotes(storedActas)
      setActas(sorted)
      setTasks(sortTasks(storedTasks))
      await storage.setItem(storageKey('notes'), sorted)
      await storage.setItem(storageKey('tasks'), storedTasks)
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

  const todayTasks = useMemo(() => {
    return sortTasks(tasks.filter((task) => !task.done && (task.bucket || 'none') === 'today'))
  }, [tasks])

  const tomorrowTasks = useMemo(() => {
    return sortTasks(tasks.filter((task) => !task.done && (task.bucket || 'none') === 'week'))
  }, [tasks])

  const noDateTasks = useMemo(() => {
    return sortTasks(tasks.filter((task) => !task.done && (task.bucket || 'none') === 'none'))
  }, [tasks])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="grid w-full gap-4 md:grid-cols-3">
          <Link
            to="/actas"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary-50/60 via-white to-slate-50 opacity-80" />
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-700 shadow-inner ring-1 ring-primary-200/60">
                  <svg
                    aria-hidden
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                    <path d="M3 9h18" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold uppercase text-primary-700">ACTAS</p>
                  <h2 className="text-lg font-bold text-slate-950">Panel de reuniones</h2>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Crea, edita y exporta actas con formato enriquecido, checklist y menciones.
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
                  <svg
                    aria-hidden
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold uppercase text-emerald-700">NOTAS</p>
                  <h2 className="text-lg font-bold text-slate-950">Notas rápidas</h2>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Guarda notas rápidas por cliente con texto enriquecido.
              </p>
              <div className="mt-auto text-sm font-semibold text-emerald-700">
                Ir a notas →
              </div>
            </div>
          </Link>

          <Link
            to="/tareas"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50/70 via-white to-slate-50 opacity-80" />
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-inner ring-1 ring-amber-200/60">
                  <svg
                    aria-hidden
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <polyline points="9 12 12 15 16 10" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold uppercase text-amber-700">TAREAS</p>
                  <h2 className="text-lg font-bold text-slate-950">Gestor de tareas</h2>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Organiza tareas por columnas con drag &amp; drop y clientes asociados.
              </p>
              <div className="mt-auto text-sm font-semibold text-amber-700">
                Ir a tareas →
              </div>
            </div>
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold uppercase text-slate-500">Actas</p>
                <h2 className="text-lg font-bold text-slate-900">Acciones pendientes</h2>
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
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold uppercase text-slate-500">Tareas</p>
                <h2 className="text-lg font-bold text-slate-900">Hoy, mañana y sin fechar</h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {todayTasks.length + tomorrowTasks.length + noDateTasks.length} tareas
              </span>
            </div>

            {loading && <p className="mt-3 text-sm text-slate-500">Cargando tareas...</p>}
            {!loading && todayTasks.length === 0 && tomorrowTasks.length === 0 && noDateTasks.length === 0 && (
              <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                No hay tareas para hoy o mañana.
              </p>
            )}
            {!loading && (todayTasks.length > 0 || tomorrowTasks.length > 0 || noDateTasks.length > 0) && (
              <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-amber-700">Hoy</p>
                    <span className="text-xs text-amber-700">{todayTasks.length}</span>
                  </div>
                  {todayTasks.length === 0 && (
                    <p className="text-xs text-amber-700/70">Sin tareas para hoy.</p>
                  )}
                  <div className="space-y-2">
                    {todayTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <div className="font-semibold text-slate-800">{task.title}</div>
                        <div className="text-xs text-slate-500">{task.client || 'Sin cliente'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-emerald-700">Mañana</p>
                    <span className="text-xs text-emerald-700">{tomorrowTasks.length}</span>
                  </div>
                  {tomorrowTasks.length === 0 && (
                    <p className="text-xs text-emerald-700/70">Sin tareas para mañana.</p>
                  )}
                  <div className="space-y-2">
                    {tomorrowTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <div className="font-semibold text-slate-800">{task.title}</div>
                        <div className="text-xs text-slate-500">{task.client || 'Sin cliente'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-slate-600">Sin fecha</p>
                    <span className="text-xs text-slate-600">{noDateTasks.length}</span>
                  </div>
                  {noDateTasks.length === 0 && (
                    <p className="text-xs text-slate-500">Sin tareas sin fecha.</p>
                  )}
                  <div className="space-y-2">
                    {noDateTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <div className="font-semibold text-slate-800">{task.title}</div>
                        <div className="text-xs text-slate-500">{task.client || 'Sin cliente'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default HomePage
