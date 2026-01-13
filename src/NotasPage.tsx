import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { nanoid } from 'nanoid'
import localforage from 'localforage'
import Papa from 'papaparse'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import LinkExtension from '@tiptap/extension-link'
import { DEFAULT_CLIENTS } from './constants/clients'
import { useAuth } from './auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : ''
const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined)?.trim() || ''

type QuickNote = {
  id: string
  title: string
  client: string
  date: string
  content: string
  createdAt: string
  updatedAt: string
}

type MeetingNote = Record<string, any>

type Task = {
  id: string
  title: string
  client: string
  createdAt: string
  bucket?: 'today' | 'week' | 'none'
  order?: number
  done: boolean
}

type QuickNoteDraft = {
  id?: string
  title: string
  client: string
  date: string
  content: string
}
const storage = localforage.createInstance({
  name: 'actas',
  storeName: 'actas_store',
})

const today = () => new Date().toISOString().slice(0, 10)

const stripHtml = (html: string) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html || '', 'text/html')
  return doc.body.textContent || ''
}

const formatDate = (value: string) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(value),
  )
}

const emptyDraft = (): QuickNoteDraft => ({
  title: '',
  client: '',
  date: today(),
  content: '',
})

const sortQuickNotes = (list: QuickNote[]) =>
  [...list].sort(
    (a, b) =>
      new Date(b.date || b.updatedAt).getTime() - new Date(a.date || a.updatedAt).getTime(),
  )

function NotasPage() {
  const { authHeaders, user } = useAuth()
  const [notes, setNotes] = useState<QuickNote[]>([])
  const [draft, setDraft] = useState<QuickNoteDraft>(emptyDraft())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState({ search: '', client: 'all' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [undoNote, setUndoNote] = useState<QuickNote | null>(null)
  const undoTimeoutRef = useRef<number | null>(null)
  const [clients, setClients] = useState<string[]>(DEFAULT_CLIENTS)
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)
  const [showClientManager, setShowClientManager] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [actasMirror, setActasMirror] = useState<MeetingNote[]>([])
  const [tasksMirror, setTasksMirror] = useState<Task[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const storageKey = useCallback(
    (name: string) => `${name}:${(user?.email || 'local').toLowerCase()}`,
    [user?.email],
  )
  const filteredClients = useMemo(() => {
    const q = draft.client.trim().toLowerCase()
    const base = q ? clients.filter((c) => c.toLowerCase().includes(q)) : clients
    return base.slice(0, 12)
  }, [clients, draft.client])

  const loadFromStorage = useCallback(async () => {
    const storedQuickNotes =
      (await storage.getItem<QuickNote[]>(storageKey('quickNotes'))) || []
    const storedClients = (await storage.getItem<string[]>(storageKey('clients'))) || []
    const storedActas = (await storage.getItem<MeetingNote[]>(storageKey('notes'))) || []
    const storedTasks = (await storage.getItem<Task[]>(storageKey('tasks'))) || []
    const combinedClients = Array.from(
      new Set([
        ...DEFAULT_CLIENTS,
        ...storedClients,
        ...storedQuickNotes.map((n) => n.client),
        ...storedTasks.map((task) => task.client),
      ]),
    ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

    const sorted = sortQuickNotes(storedQuickNotes)
    setNotes(sorted)
    setClients(combinedClients)
    setActasMirror(storedActas)
    setTasksMirror(storedTasks)
    if (sorted[0]) {
      setSelectedId(sorted[0].id)
      setDraft({
        id: sorted[0].id,
        title: sorted[0].title,
        client: sorted[0].client,
        date: sorted[0].date,
        content: sorted[0].content,
      })
    }
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
      const data = (await res.json()) as {
        notes?: MeetingNote[]
        clients?: string[]
        quickNotes?: QuickNote[]
        tasks?: Task[]
      }
      const storedQuickNotes = Array.isArray(data.quickNotes) ? data.quickNotes : []
      const storedClients = Array.isArray(data.clients) ? data.clients : []
      const storedActas = Array.isArray(data.notes) ? data.notes : []
      const storedTasks = Array.isArray(data.tasks) ? data.tasks : []
      const combinedClients = Array.from(
        new Set([
          ...DEFAULT_CLIENTS,
          ...storedClients,
          ...storedQuickNotes.map((n) => n.client),
          ...storedTasks.map((task) => task.client),
        ]),
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      const sorted = sortQuickNotes(storedQuickNotes)
      setNotes(sorted)
      setClients(combinedClients)
      setActasMirror(storedActas)
      setTasksMirror(storedTasks)
      await storage.setItem(storageKey('quickNotes'), sorted)
      await storage.setItem(storageKey('clients'), combinedClients)
      await storage.setItem(storageKey('notes'), storedActas)
      await storage.setItem(storageKey('tasks'), storedTasks)
      if (sorted[0]) {
        setSelectedId(sorted[0].id)
        setDraft({
          id: sorted[0].id,
          title: sorted[0].title,
          client: sorted[0].client,
          date: sorted[0].date,
          content: sorted[0].content,
        })
      }
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

  useEffect(() => {
    const loadClients = async () => {
      try {
        const storedClients = (await storage.getItem<string[]>(storageKey('clients'))) || []
        const combined = [...DEFAULT_CLIENTS, ...storedClients].filter(Boolean)
        const unique = Array.from(new Set(combined)).sort((a, b) =>
          a.localeCompare(b, 'es', { sensitivity: 'base' }),
        )
        setClients(unique)
      } catch (error) {
        console.error('No se pudieron cargar clientes', error)
      }
    }
    void loadClients()
  }, [storageKey])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-emerald-700 underline underline-offset-2',
        },
      }),
      Placeholder.configure({
        placeholder: 'Escribe tu nota rápida aquí…',
      }),
    ],
    content: draft.content,
    editorProps: {
      attributes: {
        class:
          'tiptap prose prose-slate max-w-none h-[180px] resize-y overflow-auto rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-inner focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      setDraft((prev) => ({ ...prev, content: editor.getHTML() }))
      setSaving(true)
    },
  })

  useEffect(() => {
    if (editor && draft) {
      const html = draft.content || ''
      if (editor.getHTML() !== html) {
        editor.commands.setContent(html || '<p></p>', { emitUpdate: false })
      }
    }
  }, [editor, draft.id])

  const filteredNotes = useMemo(() => {
    const term = filters.search.toLowerCase()
    return notes.filter((note) => {
      if (filters.client !== 'all' && note.client !== filters.client) return false
      if (!term) return true
      return (
        note.title.toLowerCase().includes(term) ||
        note.client.toLowerCase().includes(term) ||
        stripHtml(note.content).toLowerCase().includes(term)
      )
    })
  }, [notes, filters])

  const clientsWithNotes = useMemo(() => {
    const unique = new Set(notes.map((note) => note.client).filter(Boolean))
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [notes])

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) || null,
    [notes, selectedId],
  )

  const syncState = async (
    quickNotesToSave: QuickNote[],
    clientsToSave: string[],
    actasToSave: MeetingNote[],
    tasksToSave: Task[],
  ) => {
    if (!API_BASE) return
    try {
      await fetch(`${API_BASE}/api/state`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
          ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
        },
        body: JSON.stringify({
          notes: actasToSave,
          clients: clientsToSave,
          quickNotes: quickNotesToSave,
          tasks: tasksToSave,
        }),
      })
    } catch (error) {
      console.error('Sync error', error)
    }
  }

  const handleDraftChange = (patch: Partial<QuickNoteDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setSaving(true)
  }

  const ensureClientExists = async (clientName: string) => {
    const cleaned = clientName.trim()
    if (!cleaned) return
    setClients((prev) => {
      if (prev.some((c) => c.toLowerCase() === cleaned.toLowerCase())) return prev
      const next = [...prev, cleaned].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      void storage.setItem(storageKey('clients'), next)
      void syncState(notes, next, actasMirror, tasksMirror)
      return next
    })
  }

  const handleNewNote = () => {
    setSelectedId(null)
    setDraft(emptyDraft())
    setMessage(null)
    setSaving(false)
  }

  const handleSelectNote = (note: QuickNote) => {
    setSelectedId(note.id)
    setDraft({
      id: note.id,
      title: note.title,
      client: note.client,
      date: note.date,
      content: note.content,
    })
    if (editor) {
      editor.commands.setContent(note.content || '<p></p>', { emitUpdate: false })
    }
  }

  const saveDraft = async () => {
    if (!draft) return
    const isEmpty =
      !draft.title.trim() &&
      !draft.client.trim() &&
      !stripHtml(draft.content || '').trim()
    if (isEmpty) {
      setSaving(false)
      setMessage('No se guardó: la nota está vacía')
      setTimeout(() => setMessage(null), 1500)
      return
    }

    setSaving(true)
    const timestamp = new Date().toISOString()
    let nextNotes: QuickNote[] = []

    if (draft.id) {
      nextNotes = notes.map((note) =>
        note.id === draft.id
          ? {
              ...note,
              title: draft.title,
              client: draft.client,
              date: draft.date,
              content: draft.content,
              updatedAt: timestamp,
            }
          : note,
      )
    } else {
      const id = nanoid()
      const newNote: QuickNote = {
        id,
        title: draft.title,
        client: draft.client,
        date: draft.date,
        content: draft.content,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      nextNotes = [newNote, ...notes]
      setSelectedId(id)
      setDraft((prev) => ({ ...prev, id }))
    }

    const sorted = sortQuickNotes(nextNotes)
    setNotes(sorted)
    await storage.setItem(storageKey('quickNotes'), sorted)
    await syncState(sorted, clients, actasMirror, tasksMirror)
    setSaving(false)
    setMessage('Nota guardada')
    setTimeout(() => setMessage(null), 1200)
  }

  useEffect(() => {
    if (!saving) return
    const timeout = setTimeout(() => {
      void saveDraft()
    }, 600)
    return () => clearTimeout(timeout)
  }, [saving, draft])

  const handleDeleteNote = async () => {
    if (!selectedId) return
    const deleted = notes.find((note) => note.id === selectedId) || null
    const remaining = notes.filter((note) => note.id !== selectedId)
    setNotes(remaining)
    await storage.setItem(storageKey('quickNotes'), remaining)
    await syncState(remaining, clients, actasMirror, tasksMirror)
    if (remaining.length) {
      const next = remaining[0]
      setSelectedId(next.id)
      setDraft({
        id: next.id,
        title: next.title,
        client: next.client,
        date: next.date,
        content: next.content,
      })
      if (editor) {
        editor.commands.setContent(next.content || '<p></p>', { emitUpdate: false })
      }
    } else {
      setSelectedId(null)
      setDraft(emptyDraft())
      if (editor) {
        editor.commands.setContent('<p></p>', { emitUpdate: false })
      }
    }
    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current)
    }
    if (deleted) {
      setUndoNote(deleted)
    }
    setMessage('Nota eliminada')
    undoTimeoutRef.current = window.setTimeout(() => {
      setUndoNote(null)
      setMessage(null)
    }, 5000)
  }

  const handleUndoDelete = async () => {
    if (!undoNote) return
    const restored = sortQuickNotes([undoNote, ...notes])
    setNotes(restored)
    await storage.setItem(storageKey('quickNotes'), restored)
    await syncState(restored, clients, actasMirror, tasksMirror)
    setUndoNote(null)
    setMessage('Nota restaurada')
    setTimeout(() => setMessage(null), 1200)
  }

  const handleClientUpdate = (index: number, value: string) => {
    const cleaned = value.trim()
    if (!cleaned) return
    setClients((prev) => {
      const next = [...prev]
      next[index] = cleaned
      const sorted = Array.from(new Set(next)).sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' }),
      )
      void storage.setItem(storageKey('clients'), sorted)
      void syncState(notes, sorted, actasMirror, tasksMirror)
      return sorted
    })
  }

  const handleClientDelete = (name: string) => {
    const nextClients = clients.filter((c) => c !== name)
    const updatedNotes = notes.map((note) =>
      note.client === name ? { ...note, client: '' } : note,
    )
    setClients(nextClients)
    setNotes(updatedNotes)
    void storage.setItem(storageKey('clients'), nextClients)
    void storage.setItem(storageKey('quickNotes'), updatedNotes)
    void syncState(updatedNotes, nextClients, actasMirror, tasksMirror)
  }

  const handleClientAdd = () => {
    if (!newClientName.trim()) return
    void ensureClientExists(newClientName.trim())
    setNewClientName('')
  }

  const handleExport = () => {
    const csv = Papa.unparse(
      notes.map((note) => ({
        id: note.id,
        title: note.title,
        client: note.client,
        date: note.date,
        content_html: note.content,
        created_at: note.createdAt,
        updated_at: note.updatedAt,
      })),
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `notas-${today()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setMessage('CSV exportado')
    setTimeout(() => setMessage(null), 1200)
  }

  const handleImport = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const importedRows = results.data.filter((row) => row.title || row.content_html)
        if (!importedRows.length) return

        const imported: QuickNote[] = importedRows.map((row) => ({
          id: row.id || nanoid(),
          title: row.title || 'Sin título',
          client: row.client || 'Sin cliente',
          date: row.date || today(),
          content: row.content_html || '',
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString(),
        }))

        const mergedNotes = sortQuickNotes([
          ...notes.filter((note) => !imported.some((i) => i.id === note.id)),
          ...imported,
        ])
        const updatedClients = Array.from(
          new Set([...clients, ...imported.map((note) => note.client)].filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

        setNotes(mergedNotes)
        setClients(updatedClients)
        await storage.setItem(storageKey('quickNotes'), mergedNotes)
        await storage.setItem(storageKey('clients'), updatedClients)
        await syncState(mergedNotes, updatedClients, actasMirror, tasksMirror)
        setMessage('Importación lista')
        setTimeout(() => setMessage(null), 1500)
      },
    })
  }

  const triggerImport = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-6 text-slate-900 sm:px-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Notas</p>
            <h1 className="text-xl font-bold text-slate-950">Notas rápidas por cliente</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleNewNote}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              + Nueva nota
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={triggerImport}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
            >
              Importar CSV
            </button>
            <button
              type="button"
              onClick={() => setShowClientManager(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
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
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8.4 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 3.6 9.4a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H22a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
              <span className="sr-only">Gestionar clientes</span>
            </button>
            {message && (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <span>{message}</span>
                {undoNote && (
                  <button
                    type="button"
                    onClick={handleUndoDelete}
                    className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    Deshacer
                  </button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  handleImport(file)
                  event.target.value = ''
                }
              }}
            />
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-2.5">
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Buscar por título, cliente o texto…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
              <select
                value={filters.client}
                onChange={(e) => setFilters((prev) => ({ ...prev, client: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                <option value="all">Todos los clientes</option>
                {clientsWithNotes.map((client) => (
                  <option key={client} value={client}>
                    {client}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-slate-500">Últimas notas</p>
                <span className="text-[11px] font-medium text-slate-400">
                  {filteredNotes.length} en total
                </span>
              </div>
              {!filteredNotes.length && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No hay notas aún. Crea la primera.
                </p>
              )}
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {filteredNotes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => handleSelectNote(note)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left shadow-sm transition ${
                      note.id === selectedId
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:border-emerald-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="inline-flex w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        {note.client || 'Sin cliente'}
                      </span>
                      <span className="text-xs text-slate-400">{formatDate(note.date)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pb-1">
                      <h3 className="line-clamp-1 text-sm font-semibold text-slate-900">
                        {note.title || 'Sin título'}
                      </h3>
                    </div>
                    <p className="line-clamp-2 text-xs text-slate-500">{stripHtml(note.content)}</p>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {saving ? 'Guardando…' : 'Listo'}
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              {message && (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                  <span>{message}</span>
                  {undoNote && (
                    <button
                      type="button"
                      onClick={handleUndoDelete}
                      className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                    >
                      Deshacer
                    </button>
                  )}
                </div>
              )}
              {selectedNote && (
                <span className="text-xs text-slate-500">
                  Última edición: {formatDate(selectedNote.updatedAt)}
                </span>
              )}
              {selectedId && (
                <button
                  type="button"
                  onClick={handleDeleteNote}
                  className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm transition hover:bg-red-50"
                  aria-label="Eliminar nota"
                  title="Eliminar nota"
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
                </button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Título</label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => handleDraftChange({ title: e.target.value })}
                  placeholder="Nota rápida"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Cliente (elige o escribe uno nuevo)
                </label>
                <div className="relative w-full">
                  <input
                    type="search"
                    value={draft.client}
                    onChange={(e) => handleDraftChange({ client: e.target.value })}
                    onFocus={() => setShowClientSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowClientSuggestions(false), 120)}
                    placeholder="Buscar o seleccionar cliente"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                  {showClientSuggestions && filteredClients.length > 0 && (
                    <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                      {filteredClients.map((client) => (
                        <button
                          key={client}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            handleDraftChange({ client })
                            setShowClientSuggestions(false)
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-800 hover:bg-emerald-50"
                        >
                          <span>{client}</span>
                        </button>
                      ))}
                      {filteredClients.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-500">Sin resultados</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Fecha</label>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => handleDraftChange({ date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Contenido</p>
                <span className="text-[11px] font-medium text-slate-400">Auto-guardado</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                <ToolbarButton
                  label="Negrita"
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                  active={editor?.isActive('bold') || false}
                >
                  <span className="text-sm font-semibold">B</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Cursiva"
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                  active={editor?.isActive('italic') || false}
                >
                  <span className="text-sm italic">I</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Subrayado"
                  onClick={() => editor?.chain().focus().toggleUnderline().run()}
                  active={editor?.isActive('underline') || false}
                >
                  <span className="text-sm underline">U</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Lista"
                  onClick={() => editor?.chain().focus().toggleBulletList().run()}
                  active={editor?.isActive('bulletList') || false}
                >
                  <span className="text-base leading-none">•</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Lista numerada"
                  onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                  active={editor?.isActive('orderedList') || false}
                >
                  <span className="text-xs font-semibold">1.</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Encabezado H3"
                  onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                  active={editor?.isActive('heading', { level: 3 }) || false}
                >
                  <span className="text-[11px] font-semibold">H3</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Enlace"
                  onClick={() => {
                    const previousUrl = editor?.getAttributes('link').href
                    const url = window.prompt('Pega el enlace', previousUrl || '')
                    if (url === null) return
                    if (url === '') {
                      editor?.chain().focus().unsetLink().run()
                      return
                    }
                    editor?.chain().focus().setLink({ href: url }).run()
                  }}
                  active={editor?.isActive('link') || false}
                >
                  <span className="text-sm">🔗</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Deshacer"
                  onClick={() => editor?.chain().focus().undo().run()}
                  active={false}
                >
                  <span className="text-base">↺</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Rehacer"
                  onClick={() => editor?.chain().focus().redo().run()}
                  active={false}
                >
                  <span className="text-base">↻</span>
                </ToolbarButton>
              </div>
              <EditorContent editor={editor} />
            </div>
          </main>
        </div>
      </div>
      <button
        type="button"
        onClick={handleNewNote}
        className="fixed bottom-5 right-5 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 sm:bottom-6 sm:right-6"
        aria-label="Nueva nota"
      >
        <span className="text-xl font-bold leading-none">＋</span>
      </button>
      {showClientManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Clientes</p>
                <h2 className="text-lg font-bold text-slate-900">Gestionar clientes</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowClientManager(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <span className="text-lg leading-none">✕</span>
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Nuevo cliente"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
              <button
                type="button"
                onClick={handleClientAdd}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
              >
                Añadir
              </button>
            </div>
            <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-slate-200">
              {clients.map((client, index) => (
                <div
                  key={client}
                  className="flex items-center gap-2 border-b border-slate-100 bg-white px-3 py-2 last:border-b-0"
                >
                  <input
                    type="text"
                    defaultValue={client}
                    onBlur={(e) => handleClientUpdate(index, e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleClientDelete(client)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition hover:bg-red-50"
                    aria-label={`Eliminar ${client}`}
                    title={`Eliminar ${client}`}
                  >
                    <span className="text-base leading-none">✕</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NotasPage

type ToolbarButtonProps = {
  label: string
  children: ReactNode
  onClick: () => void
  active: boolean
}

function ToolbarButton({ children, onClick, active, label }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition ${
        active
          ? 'bg-emerald-600 text-white shadow-sm'
          : 'border border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50'
      }`}
    >
      {children}
    </button>
  )
}
