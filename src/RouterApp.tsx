import { useCallback, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import localforage from 'localforage'
import { nanoid } from 'nanoid'
import Papa from 'papaparse'
import ActasPage from './App'
import HomePage from './HomePage'
import NotasPage from './NotasPage'
import { useAuth } from './auth'
import LoginPage from './LoginPage'
import { DEFAULT_CLIENTS } from './constants/clients'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : ''
const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined)?.trim() || ''

type ActaNote = {
  id: string
  title: string
  client: string
  date: string
  meetingType: 'cliente' | 'interna'
  preNotes: string
  content: string
  nextSteps: string
  nextTasks: { id: string; text: string; done: boolean }[]
  createdAt: string
  updatedAt: string
}

type QuickNote = {
  id: string
  title: string
  client: string
  date: string
  content: string
  createdAt: string
  updatedAt: string
}

const storage = localforage.createInstance({
  name: 'actas',
  storeName: 'actas_store',
})

const today = () => new Date().toISOString().slice(0, 10)

const sortActas = (list: ActaNote[]) =>
  [...list].sort((a, b) => {
    const byDate = new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
    if (byDate !== 0) return byDate
    return new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime()
  })

const sortQuickNotes = (list: QuickNote[]) =>
  [...list].sort(
    (a, b) =>
      new Date(b.date || b.updatedAt).getTime() - new Date(a.date || a.updatedAt).getTime(),
  )

const isActasCsv = (fields: string[], rows: Record<string, string>[]) => {
  const fieldSet = new Set(fields.map((f) => f.toLowerCase()))
  if (
    fieldSet.has('meeting_type') ||
    fieldSet.has('pre_notes_html') ||
    fieldSet.has('next_steps_html') ||
    fieldSet.has('next_tasks_json')
  ) {
    return true
  }
  return rows.some(
    (row) =>
      row.meeting_type ||
      row.pre_notes_html ||
      row.next_steps_html ||
      row.next_tasks_json,
  )
}

const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Header() {
  const { pathname } = useLocation()
  const { user, signOut, authHeaders } = useAuth()
  const [message, setMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isActive = (path: string) => pathname.startsWith(path)

  const storageKey = useCallback(
    (name: string) => `${name}:${(user?.email || 'local').toLowerCase()}`,
    [user?.email],
  )

  if (pathname === '/') return null

  const handleExportAll = async () => {
    const storedActas = (await storage.getItem<ActaNote[]>(storageKey('notes'))) || []
    const storedQuickNotes =
      (await storage.getItem<QuickNote[]>(storageKey('quickNotes'))) || []

    const actasCsv = Papa.unparse(
      storedActas.map((note) => ({
        id: note.id,
        title: note.title,
        client: note.client,
        date: note.date,
        meeting_type: note.meetingType,
        pre_notes_html: note.preNotes,
        content_html: note.content,
        next_steps_html: note.nextSteps,
        next_tasks_json: JSON.stringify(note.nextTasks || []),
        created_at: note.createdAt,
        updated_at: note.updatedAt,
      })),
    )

    const notasCsv = Papa.unparse(
      storedQuickNotes.map((note) => ({
        id: note.id,
        title: note.title,
        client: note.client,
        date: note.date,
        content_html: note.content,
        created_at: note.createdAt,
        updated_at: note.updatedAt,
      })),
    )

    downloadCsv(`actas-${today()}.csv`, actasCsv)
    downloadCsv(`notas-${today()}.csv`, notasCsv)
    setMessage('CSV exportados')
    setTimeout(() => setMessage(null), 1200)
  }

  const syncState = async (notesToSave: ActaNote[], clientsToSave: string[], quickNotesToSave: QuickNote[]) => {
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
          notes: notesToSave,
          clients: clientsToSave,
          quickNotes: quickNotesToSave,
        }),
      })
    } catch (error) {
      console.error('Sync error', error)
    }
  }

  const parseCsvFile = (file: File) =>
    new Promise<{ fields: string[]; rows: Record<string, string>[] }>((resolve) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve({
            fields: results.meta.fields || [],
            rows: results.data || [],
          })
        },
      })
    })

  const handleImportAll = async (files: File[]) => {
    if (!files.length) return
    const storedActas = (await storage.getItem<ActaNote[]>(storageKey('notes'))) || []
    const storedQuickNotes =
      (await storage.getItem<QuickNote[]>(storageKey('quickNotes'))) || []
    const storedClients = (await storage.getItem<string[]>(storageKey('clients'))) || []

    const parsed = await Promise.all(files.map((file) => parseCsvFile(file)))

    const importedActas: ActaNote[] = []
    const importedQuickNotes: QuickNote[] = []

    parsed.forEach(({ fields, rows }) => {
      if (!rows.length) return
      if (isActasCsv(fields, rows)) {
        rows
          .filter((row) => row.title || row.content_html)
          .forEach((row) => {
            importedActas.push({
              id: row.id || nanoid(),
              title: row.title || 'Sin título',
              client: row.client || 'Sin cliente',
              date: row.date || today(),
              meetingType:
                row.meeting_type === 'interna' || row.meeting_type === 'cliente'
                  ? (row.meeting_type as 'interna' | 'cliente')
                  : 'cliente',
              preNotes: row.pre_notes_html || '',
              content: row.content_html || '',
              nextSteps: row.next_steps_html || '',
              nextTasks: (() => {
                try {
                  const parsedTasks = JSON.parse(row.next_tasks_json || '[]')
                  if (Array.isArray(parsedTasks)) {
                    return parsedTasks.map((t) => ({
                      id: t.id || nanoid(),
                      text: t.text || '',
                      done: Boolean(t.done),
                    }))
                  }
                } catch {
                  return []
                }
                return []
              })(),
              createdAt: row.created_at || new Date().toISOString(),
              updatedAt: row.updated_at || new Date().toISOString(),
            })
          })
      } else {
        rows
          .filter((row) => row.title || row.content_html)
          .forEach((row) => {
            importedQuickNotes.push({
              id: row.id || nanoid(),
              title: row.title || 'Sin título',
              client: row.client || 'Sin cliente',
              date: row.date || today(),
              content: row.content_html || '',
              createdAt: row.created_at || new Date().toISOString(),
              updatedAt: row.updated_at || new Date().toISOString(),
            })
          })
      }
    })

    const mergedActas = sortActas([
      ...storedActas.filter((note) => !importedActas.some((i) => i.id === note.id)),
      ...importedActas,
    ])
    const mergedQuickNotes = sortQuickNotes([
      ...storedQuickNotes.filter((note) => !importedQuickNotes.some((i) => i.id === note.id)),
      ...importedQuickNotes,
    ])

    const updatedClients = Array.from(
      new Set([
        ...DEFAULT_CLIENTS,
        ...storedClients,
        ...mergedActas.map((note) => note.client),
        ...mergedQuickNotes.map((note) => note.client),
      ].filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

    await storage.setItem(storageKey('notes'), mergedActas)
    await storage.setItem(storageKey('quickNotes'), mergedQuickNotes)
    await storage.setItem(storageKey('clients'), updatedClients)
    await syncState(mergedActas, updatedClients, mergedQuickNotes)

    setMessage('Importación lista')
    setTimeout(() => setMessage(null), 1500)
    window.dispatchEvent(new Event('actas:data-imported'))
  }

  const triggerImport = () => {
    fileInputRef.current?.click()
  }

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link to="/" className="text-lg font-bold text-slate-900">
          Actas
        </Link>
        <nav className="flex items-center gap-3 text-sm font-medium text-slate-700">
          <Link
            to="/actas"
            className={`rounded-full px-3 py-1 transition ${
              isActive('/actas')
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-primary-50'
            }`}
          >
            Actas
          </Link>
          <Link
            to="/notas"
            className={`rounded-full px-3 py-1 transition ${
              isActive('/notas')
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-primary-50'
            }`}
          >
            Notas
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportAll}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 transition hover:border-primary-200 hover:bg-primary-50"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={triggerImport}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 transition hover:border-primary-200 hover:bg-primary-50"
          >
            Importar CSV
          </button>
          {message && <span className="text-xs font-semibold text-primary-700">{message}</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            multiple
            onChange={(event) => {
              const files = event.target.files ? Array.from(event.target.files) : []
              if (files.length) {
                void handleImportAll(files)
                event.target.value = ''
              }
            }}
          />
        </div>
        {user && (
          <>
            <div className="ml-auto hidden items-center gap-3 md:flex">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-300 text-sm font-bold text-slate-800">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold text-slate-900">{user.name}</span>
                  <span className="text-xs text-slate-500">{user.email}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
              >
                Salir
              </button>
            </div>

            <div className="ml-auto flex items-center gap-2 md:hidden">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-300 text-sm font-bold text-slate-800">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={signOut}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                aria-label="Salir"
              >
                Salir
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

function RouterApp() {
  const { user, loading, requiresAuth } = useAuth()

  if (requiresAuth && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
        Verificando sesión…
      </div>
    )
  }

  if (requiresAuth && !user) {
    return <LoginPage />
  }

  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/actas" element={<ActasPage />} />
        <Route path="/notas" element={<NotasPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default RouterApp
