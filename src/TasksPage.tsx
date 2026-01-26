import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import localforage from 'localforage'
import { DEFAULT_CLIENTS } from './constants/clients'
import { useAuth } from './auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : ''

type Task = {
  id: string
  title: string
  client: string
  createdAt: string
  bucket?: 'today' | 'week' | 'none'
  order?: number
  done: boolean
}

type TaskDraft = {
  title: string
  client: string
}

type MeetingNote = Record<string, any>
type QuickNote = Record<string, any>

const storage = localforage.createInstance({
  name: 'actas',
  storeName: 'actas_store',
})

const sortTasks = (list: Task[]) =>
  [...list].sort((a, b) => {
    const aOrder = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY
    const bOrder = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY
    if (aOrder !== bOrder) return aOrder - bOrder
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

const emptyDraft = (): TaskDraft => ({
  title: '',
  client: '',
})

function TasksPage() {
  const { authHeaders, user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [createDraft, setCreateDraft] = useState<TaskDraft>(emptyDraft())
  const [filters, setFilters] = useState({ search: '', client: 'all' })
  const [clients, setClients] = useState<string[]>(DEFAULT_CLIENTS)
  const [actasMirror, setActasMirror] = useState<MeetingNote[]>([])
  const [quickNotesMirror, setQuickNotesMirror] = useState<QuickNote[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)
  const [activeClientIndex, setActiveClientIndex] = useState(0)
  const undoTimeoutRef = useRef<number | null>(null)
  const createClientInputRef = useRef<HTMLInputElement>(null)
  const [createClientMenu, setCreateClientMenu] = useState<{ x: number; y: number; width: number } | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<'today' | 'week' | 'none' | null>(null)
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editDraft, setEditDraft] = useState<TaskDraft>(emptyDraft())
  const [showEditClientSuggestions, setShowEditClientSuggestions] = useState(false)
  const [activeEditClientIndex, setActiveEditClientIndex] = useState(0)
  const [createBucket, setCreateBucket] = useState<'today' | 'week' | 'none' | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    task: Task
    x: number
    y: number
  } | null>(null)
  const [undoAction, setUndoAction] = useState<{
    type: 'delete' | 'toggle'
    task: Task
    previousDone?: boolean
  } | null>(null)

  const storageKey = useCallback(
    (name: string) => `${name}:${(user?.email || 'local').toLowerCase()}`,
    [user?.email],
  )

  const loadFromStorage = useCallback(async () => {
    const storedTasks = (await storage.getItem<Task[]>(storageKey('tasks'))) || []
    const storedClients = (await storage.getItem<string[]>(storageKey('clients'))) || []
    const storedActas = (await storage.getItem<MeetingNote[]>(storageKey('notes'))) || []
    const storedQuickNotes =
      (await storage.getItem<QuickNote[]>(storageKey('quickNotes'))) || []
    const combinedClients = Array.from(
      new Set([
        ...DEFAULT_CLIENTS,
        ...storedClients,
        ...storedTasks.map((task) => task.client),
      ]),
    ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

    setTasks(sortTasks(storedTasks))
    setClients(combinedClients)
    setActasMirror(storedActas)
    setQuickNotesMirror(storedQuickNotes)
    setLoading(false)
  }, [storageKey])

  const loadFromApi = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/state`, {
        headers: {
          ...authHeaders(),
        },
      })
      if (!res.ok) {
        throw new Error(`API failed: ${res.status}`)
      }
      const data = (await res.json()) as {
        tasks?: Task[]
        clients?: string[]
        notes?: MeetingNote[]
        quickNotes?: QuickNote[]
      }
      const storedTasks = Array.isArray(data.tasks) ? data.tasks : []
      const storedClients = Array.isArray(data.clients) ? data.clients : []
      const storedActas = Array.isArray(data.notes) ? data.notes : []
      const storedQuickNotes = Array.isArray(data.quickNotes) ? data.quickNotes : []
      const combinedClients = Array.from(
        new Set([
          ...DEFAULT_CLIENTS,
          ...storedClients,
          ...storedTasks.map((task) => task.client),
        ]),
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

      const sortedTasks = sortTasks(storedTasks)
      setTasks(sortedTasks)
      setClients(combinedClients)
      setActasMirror(storedActas)
      setQuickNotesMirror(storedQuickNotes)
      await storage.setItem(storageKey('tasks'), sortedTasks)
      await storage.setItem(storageKey('clients'), combinedClients)
      await storage.setItem(storageKey('notes'), storedActas)
      await storage.setItem(storageKey('quickNotes'), storedQuickNotes)
      setLoading(false)
    } catch (error) {
      console.error('API load error', error)
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
    window.addEventListener('actas:tasks-updated', handleRefresh)
    return () => {
      window.removeEventListener('actas:data-imported', handleRefresh)
      window.removeEventListener('actas:tasks-updated', handleRefresh)
    }
  }, [loadFromApi, loadFromStorage])

  const syncState = async (tasksToSave: Task[], clientsToSave: string[]) => {
    if (!API_BASE) return
    try {
      await fetch(`${API_BASE}/api/state`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          notes: actasMirror,
          clients: clientsToSave,
          quickNotes: quickNotesMirror,
          tasks: tasksToSave,
        }),
      })
    } catch (error) {
      console.error('Sync error', error)
    }
  }

  const updateTasks = async (nextTasks: Task[], clientsOverride?: string[]) => {
    const sorted = sortTasks(nextTasks)
    const nextClients = clientsOverride ?? clients
    setTasks(sorted)
    await storage.setItem(storageKey('tasks'), sorted)
    await syncState(sorted, nextClients)
    window.dispatchEvent(new Event('actas:tasks-updated'))
  }

  const ensureClientExists = (clientName: string, nextTasks?: Task[]) => {
    const cleaned = clientName.trim()
    if (!cleaned) return
    setClients((prev) => {
      if (prev.some((c) => c.toLowerCase() === cleaned.toLowerCase())) return prev
      const next = [...prev, cleaned].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      void storage.setItem(storageKey('clients'), next)
      void syncState(nextTasks ?? tasks, next)
      return next
    })
  }

  const filteredClients = useMemo(() => {
    const q = createDraft.client.trim().toLowerCase()
    const base = q ? clients.filter((c) => c.toLowerCase().includes(q)) : clients
    return base.slice(0, 12)
  }, [clients, createDraft.client])

  const filteredEditClients = useMemo(() => {
    const q = editDraft.client.trim().toLowerCase()
    const base = q ? clients.filter((c) => c.toLowerCase().includes(q)) : clients
    return base.slice(0, 12)
  }, [clients, editDraft.client])

  const handleAddTask = async () => {
    const title = createDraft.title.trim()
    if (!title) return
    const client = createDraft.client.trim() || 'Sin cliente'
    const now = new Date().toISOString()
    const bucket = createBucket ?? 'none'
    const maxOrder = Math.max(
      -1,
      ...tasks.filter((task) => (task.bucket || 'none') === bucket).map((task) => task.order ?? 0),
    )
    const newTask: Task = {
      id: nanoid(),
      title,
      client,
      createdAt: now,
      bucket,
      order: maxOrder + 1,
      done: false,
    }
    const next = [newTask, ...tasks]
    ensureClientExists(client, next)
    await updateTasks(next)
    setCreateDraft(emptyDraft())
    setCreateBucket(null)
    setShowClientSuggestions(false)
    setActiveClientIndex(0)
    setCreateClientMenu(null)
    setMessage('Tarea añadida')
    setTimeout(() => setMessage(null), 1200)
  }

  const registerUndo = (action: { type: 'delete' | 'toggle'; task: Task; previousDone?: boolean }) => {
    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current)
    }
    setUndoAction(action)
    setMessage(action.type === 'delete' ? 'Tarea eliminada' : 'Tarea actualizada')
    undoTimeoutRef.current = window.setTimeout(() => {
      setUndoAction(null)
      setMessage(null)
    }, 5000)
  }

  const handleUndo = () => {
    if (!undoAction) return
    const { type, task, previousDone } = undoAction
    if (type === 'delete') {
      void updateTasks([task, ...tasks])
    } else if (type === 'toggle') {
      const next = tasks.map((t) =>
        t.id === task.id ? { ...t, done: Boolean(previousDone) } : t,
      )
      void updateTasks(next)
    }
    setUndoAction(null)
    setMessage('Cambios deshechos')
    setTimeout(() => setMessage(null), 1200)
  }

  const handleToggleDone = (taskId: string) => {
    const current = tasks.find((task) => task.id === taskId)
    if (!current) return
    const next = tasks.map((task) =>
      task.id === taskId ? { ...task, done: !task.done } : task,
    )
    void updateTasks(next)
    registerUndo({ type: 'toggle', task: current, previousDone: current.done })
  }

  const handleUpdateTask = (taskId: string, patch: Partial<Task>) => {
    const next = tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
    void updateTasks(next)
  }

  const handleDeleteTask = (taskId: string) => {
    const current = tasks.find((task) => task.id === taskId)
    if (!current) return
    const next = tasks.filter((task) => task.id !== taskId)
    void updateTasks(next)
    registerUndo({ type: 'delete', task: current })
  }

  const openEditTask = (task: Task) => {
    setEditingTask(task)
    setEditDraft({ title: task.title, client: task.client })
    setShowEditClientSuggestions(false)
  }

  const openCreateTask = (bucket: 'today' | 'week' | 'none') => {
    setCreateBucket(bucket)
    setCreateDraft(emptyDraft())
    setShowClientSuggestions(false)
    setActiveClientIndex(0)
    setCreateClientMenu(null)
  }

  const closeEditTask = () => {
    setEditingTask(null)
  }

  const handleSaveEdit = () => {
    if (!editingTask) return
    const title = editDraft.title.trim()
    if (!title) return
    const client = editDraft.client.trim()
    handleUpdateTask(editingTask.id, { title, client })
    if (client) ensureClientExists(client)
    setEditingTask(null)
  }

  const openContextMenu = (event: React.MouseEvent<HTMLDivElement>, task: Task) => {
    event.preventDefault()
    setContextMenu({
      task,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  useEffect(() => {
    if (!showClientSuggestions || !createBucket) {
      setCreateClientMenu(null)
      return
    }
    const updatePosition = () => {
      if (!createClientInputRef.current) return
      const rect = createClientInputRef.current.getBoundingClientRect()
      setCreateClientMenu({
        x: rect.left,
        y: rect.bottom + 6,
        width: rect.width,
      })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [showClientSuggestions, createBucket])

  const filteredTasks = useMemo(() => {
    const term = filters.search.toLowerCase()
    return tasks.filter((task) => {
      if (filters.client !== 'all' && task.client !== filters.client) return false
      if (!term) return true
      return (
        task.title.toLowerCase().includes(term) ||
        task.client.toLowerCase().includes(term)
      )
    })
  }, [filters, tasks])

  const taskBuckets = useMemo(() => {
    const buckets: Record<'today' | 'week' | 'none', Task[]> = {
      today: [],
      week: [],
      none: [],
    }
    filteredTasks.forEach((task) => {
      const bucket = task.bucket || 'none'
      buckets[bucket].push(task)
    })
    return {
      today: sortTasks(buckets.today),
      week: sortTasks(buckets.week),
      none: sortTasks(buckets.none),
    }
  }, [filteredTasks])

  const columns = useMemo(
    () => [
      { id: 'today' as const, label: 'Hoy', color: 'bg-amber-50 border-amber-200 text-amber-800' },
      { id: 'week' as const, label: 'Esta semana', color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
      { id: 'none' as const, label: 'Sin fecha', color: 'bg-slate-50 border-slate-200 text-slate-700' },
    ],
    [],
  )

  const applyDrop = (bucket: 'today' | 'week' | 'none') => {
    if (!draggedTaskId) return
    const task = tasks.find((t) => t.id === draggedTaskId)
    if (!task) return
    const maxOrder = Math.max(
      -1,
      ...tasks.filter((t) => (t.bucket || 'none') === bucket && t.id !== task.id).map((t) => t.order ?? 0),
    )
    const next = tasks.map((t) =>
      t.id === task.id ? { ...t, bucket, order: maxOrder + 1 } : t,
    )
    void updateTasks(next)
  }

  const applyDropOnTask = (bucket: 'today' | 'week' | 'none', targetId: string) => {
    if (!draggedTaskId) return
    const target = tasks.find((t) => t.id === targetId)
    const dragged = tasks.find((t) => t.id === draggedTaskId)
    if (!target || !dragged) return
    const bucketTasks = sortTasks(
      tasks.filter((t) => (t.bucket || 'none') === bucket && t.id !== dragged.id),
    )
    const targetIndex = bucketTasks.findIndex((t) => t.id === target.id)
    const nextList = [...bucketTasks]
    if (targetIndex >= 0) {
      nextList.splice(targetIndex, 0, { ...dragged, bucket })
    } else {
      nextList.push({ ...dragged, bucket })
    }
    const orderMap = new Map(nextList.map((t, index) => [t.id, index]))
    const next = tasks.map((t) => {
      if ((t.bucket || 'none') !== bucket && t.id !== dragged.id) {
        return t
      }
      const order = orderMap.get(t.id)
      if (order === undefined) {
        return t.id === dragged.id ? { ...t, bucket } : t
      }
      return { ...t, bucket, order }
    })
    void updateTasks(next)
  }

  const clientsWithTasks = useMemo(() => {
    const unique = new Set(tasks.map((task) => task.client).filter(Boolean))
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [tasks])

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-6 text-slate-900 sm:px-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Tareas</p>
            <h1 className="text-xl font-bold text-slate-950">Gestor de tareas</h1>
          </div>
          {message && (
            <div className="flex items-center gap-2 text-xs font-semibold text-primary-700">
              <span>{message}</span>
              {undoAction && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="rounded-full border border-primary-200 bg-white px-2.5 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-50"
                >
                  Deshacer
                </button>
              )}
            </div>
          )}
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Buscar tarea o cliente…"
                className="w-56 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
              <select
                value={filters.client}
                onChange={(e) => setFilters((prev) => ({ ...prev, client: e.target.value }))}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                <option value="all">Todos los clientes</option>
                {clientsWithTasks.map((client) => (
                  <option key={client} value={client}>
                    {client}
                  </option>
                ))}
              </select>
              <span className="ml-auto text-xs font-semibold text-slate-500">
                {filteredTasks.length} tareas
              </span>
            </div>
            {loading && <p className="text-sm text-slate-500">Cargando tareas...</p>}
            {!loading &&
              taskBuckets.today.length === 0 &&
              taskBuckets.week.length === 0 &&
              taskBuckets.none.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                No hay tareas todavía. Crea la primera.
              </p>
            )}
            {!loading && (
              <div className="grid max-h-[560px] gap-4 overflow-y-auto px-2 py-2 md:grid-cols-3">
                {columns.map((column) => {
                  return (
                    <div
                      key={column.id}
                      className={`rounded-2xl border p-3 transition ${
                        column.color
                      } ${
                        dragOverColumn === column.id
                          ? 'ring-2 ring-slate-300 shadow-[0_0_0_6px_rgba(15,23,42,0.08)]'
                          : ''
                      }`}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDragOverColumn(column.id)
                      }}
                      onDragLeave={() => setDragOverColumn(null)}
                      onDrop={(event) => {
                        event.preventDefault()
                        applyDrop(column.id)
                        setDraggedTaskId(null)
                        setDragOverColumn(null)
                      }}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{column.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">
                            {taskBuckets[column.id].length}
                          </span>
                          <button
                            type="button"
                            onClick={() => openCreateTask(column.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100"
                            aria-label={`Añadir tarea en ${column.label}`}
                            title="Añadir tarea"
                          >
                            <span className="text-base leading-none">＋</span>
                          </button>
                        </div>
                      </div>
                      {taskBuckets[column.id].length === 0 && createBucket !== column.id && (
                        <button
                          type="button"
                          onClick={() => openCreateTask(column.id)}
                          className="flex w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-6 text-sm font-semibold text-slate-500 transition hover:border-primary-200 hover:bg-primary-50"
                        >
                          ＋
                        </button>
                      )}
                      <div className="space-y-3">
                        {taskBuckets[column.id].map((task) => (
                          <div
                            key={task.id}
                            draggable
                            onContextMenu={(event) => openContextMenu(event, task)}
                            onDragStart={(event) => {
                              setDraggedTaskId(task.id)
                              event.dataTransfer.effectAllowed = 'move'
                            }}
                            onDragOver={(event) => {
                              event.preventDefault()
                              setDragOverTaskId(task.id)
                            }}
                            onDragLeave={() => {
                              setDragOverTaskId((prev) => (prev === task.id ? null : prev))
                            }}
                            onDrop={(event) => {
                              event.preventDefault()
                              applyDropOnTask(column.id, task.id)
                              setDraggedTaskId(null)
                              setDragOverTaskId(null)
                            }}
                            onDragEnd={() => {
                              setDraggedTaskId(null)
                              setDragOverTaskId(null)
                            }}
                            className={`flex flex-wrap items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition ${
                              draggedTaskId === task.id ? 'shadow-lg ring-2 ring-primary-200 cursor-grabbing' : 'cursor-grab'
                            } ${dragOverTaskId === task.id ? 'ring-2 ring-primary-200' : ''}`}
                          >
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <div className="flex items-start gap-2">
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <div
                                    className={`px-1 text-sm font-medium ${
                                      task.done ? 'text-slate-400 line-through' : 'text-slate-800'
                                    }`}
                                  >
                                    {task.title}
                                  </div>
                                  <div className="px-1 text-xs text-slate-500">
                                    {task.client || 'Sin cliente'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleDone(task.id)}
                                  className={`flex h-8 w-8 items-center justify-center rounded-full border bg-white shadow-sm transition ${
                                    task.done
                                      ? 'border-emerald-300 text-emerald-600'
                                      : 'border-emerald-200 text-emerald-500 hover:bg-emerald-50'
                                  }`}
                                  aria-label="Completar tarea"
                                  title="Completar tarea"
                                >
                                  <svg
                                    aria-hidden
                                    className="h-4 w-4"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {createBucket === column.id && (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={createDraft.title}
                                onChange={(e) => setCreateDraft((prev) => ({ ...prev, title: e.target.value }))}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    handleAddTask()
                                  }
                                }}
                                placeholder="Título de la tarea"
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                              />
                              <div className="relative w-full">
                                <input
                                  ref={createClientInputRef}
                                  type="search"
                                  value={createDraft.client}
                                  onChange={(e) => setCreateDraft((prev) => ({ ...prev, client: e.target.value }))}
                                  onFocus={() => {
                                    setShowClientSuggestions(true)
                                    setActiveClientIndex(0)
                                  }}
                                  onBlur={() => setTimeout(() => setShowClientSuggestions(false), 120)}
                                  onKeyDown={(event) => {
                                    if (!showClientSuggestions || filteredClients.length === 0) {
                                      if (event.key === 'Enter') {
                                        event.preventDefault()
                                        handleAddTask()
                                      }
                                      return
                                    }
                                    if (event.key === 'ArrowDown') {
                                      event.preventDefault()
                                      setActiveClientIndex((prev) => (prev + 1) % filteredClients.length)
                                      return
                                    }
                                    if (event.key === 'ArrowUp') {
                                      event.preventDefault()
                                      setActiveClientIndex((prev) =>
                                        (prev - 1 + filteredClients.length) % filteredClients.length,
                                      )
                                      return
                                    }
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      const selected = filteredClients[activeClientIndex]
                                      if (selected) {
                                        setCreateDraft((prev) => ({ ...prev, client: selected }))
                                        setShowClientSuggestions(false)
                                      } else {
                                        handleAddTask()
                                      }
                                    }
                                  }}
                                  placeholder="Buscar o seleccionar cliente"
                                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                                />
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setCreateBucket(null)}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={handleAddTask}
                                  className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                >
                                  Crear
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Editar tarea</p>
                <h2 className="text-lg font-bold text-slate-900">Actualizar contenido</h2>
              </div>
              <button
                type="button"
                onClick={closeEditTask}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <span className="text-lg leading-none">✕</span>
              </button>
            </div>
            <div className="mt-3 space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Título</label>
                <input
                  type="text"
                  value={editDraft.title}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="Título de la tarea"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Cliente</label>
                <div className="relative w-full">
                  <input
                    type="search"
                    value={editDraft.client}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, client: e.target.value }))}
                    onFocus={() => {
                      setShowEditClientSuggestions(true)
                      setActiveEditClientIndex(0)
                    }}
                    onBlur={() => setTimeout(() => setShowEditClientSuggestions(false), 120)}
                    onKeyDown={(event) => {
                      if (!showEditClientSuggestions || filteredEditClients.length === 0) return
                      if (event.key === 'ArrowDown') {
                        event.preventDefault()
                        setActiveEditClientIndex((prev) => (prev + 1) % filteredEditClients.length)
                        return
                      }
                      if (event.key === 'ArrowUp') {
                        event.preventDefault()
                        setActiveEditClientIndex((prev) =>
                          (prev - 1 + filteredEditClients.length) % filteredEditClients.length,
                        )
                        return
                      }
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        const selected = filteredEditClients[activeEditClientIndex]
                        if (selected) {
                          setEditDraft((prev) => ({ ...prev, client: selected }))
                          setShowEditClientSuggestions(false)
                        }
                      }
                    }}
                    placeholder="Buscar o seleccionar cliente"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  {showEditClientSuggestions && filteredEditClients.length > 0 && (
                    <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                      {filteredEditClients.map((client, index) => (
                        <button
                          key={client}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setEditDraft((prev) => ({ ...prev, client }))
                            setShowEditClientSuggestions(false)
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                            index === activeEditClientIndex ? 'bg-primary-50 text-slate-900' : 'text-slate-800 hover:bg-primary-50'
                          }`}
                        >
                          <span>{client}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditTask}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={closeContextMenu}
          onContextMenu={(event) => {
            event.preventDefault()
            closeContextMenu()
          }}
        >
          <div
            className="absolute rounded-xl border border-slate-200 bg-white shadow-xl"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              type="button"
              onClick={() => {
                openEditTask(contextMenu.task)
                closeContextMenu()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <svg
                aria-hidden
                className="h-4 w-4"
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
              Editar
            </button>
            <button
              type="button"
              onClick={() => {
                handleDeleteTask(contextMenu.task.id)
                closeContextMenu()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <svg
                aria-hidden
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Eliminar
            </button>
          </div>
        </div>
      )}
      {showClientSuggestions && createClientMenu && createBucket && filteredClients.length > 0 &&
        createPortal(
          <div
            className="fixed z-50 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg"
            style={{ top: createClientMenu.y, left: createClientMenu.x, width: createClientMenu.width }}
          >
            {filteredClients.map((client, index) => (
              <button
                key={client}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setCreateDraft((prev) => ({ ...prev, client }))
                  setShowClientSuggestions(false)
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                  index === activeClientIndex ? 'bg-primary-50 text-slate-900' : 'text-slate-800 hover:bg-primary-50'
                }`}
              >
                <span>{client}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

export default TasksPage
