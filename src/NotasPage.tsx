import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

type QuickNote = {
  id: string
  title: string
  client: string
  date: string
  content: string
  createdAt: string
  updatedAt: string
}

type QuickNoteDraft = {
  id?: string
  title: string
  client: string
  date: string
  content: string
}

const NOTES_STORAGE_KEY = 'quick_notes'

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
  const [notes, setNotes] = useState<QuickNote[]>([])
  const [draft, setDraft] = useState<QuickNoteDraft>(emptyDraft())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState({ search: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTES_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as QuickNote[]
      if (Array.isArray(parsed)) {
        const sorted = sortQuickNotes(parsed)
        setNotes(sorted)
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
      }
    } catch (error) {
      console.error('No se pudieron cargar notas rápidas', error)
    }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({
        placeholder: 'Escribe tu nota rápida aquí…',
      }),
    ],
    content: draft.content,
    editorProps: {
      attributes: {
        class:
          'tiptap prose prose-slate max-w-none rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-inner focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      setDraft((prev) => ({ ...prev, content: editor.getHTML() }))
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
      if (!term) return true
      return (
        note.title.toLowerCase().includes(term) ||
        note.client.toLowerCase().includes(term) ||
        stripHtml(note.content).toLowerCase().includes(term)
      )
    })
  }, [notes, filters])

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) || null,
    [notes, selectedId],
  )

  const handleDraftChange = (patch: Partial<QuickNoteDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  const handleNewNote = () => {
    setSelectedId(null)
    setDraft(emptyDraft())
    setMessage(null)
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
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(sorted))
    setSaving(false)
    setMessage('Nota guardada')
    setTimeout(() => setMessage(null), 1200)
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
              onClick={() => {
                void saveDraft()
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <Link
              to="/actas"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
            >
              Ir a actas
            </Link>
            {message && <span className="text-xs font-semibold text-emerald-700">{message}</span>}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-2.5">
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilters({ search: e.target.value })}
                placeholder="Buscar por título, cliente o texto…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-slate-500">Últimas notas</p>
                <span className="text-[11px] font-medium text-slate-400">5 más recientes</span>
              </div>
              {!filteredNotes.length && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No hay notas aún. Crea la primera.
                </p>
              )}
              {filteredNotes.slice(0, 5).map((note) => (
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
          </aside>

          <main className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {saving ? 'Guardando…' : 'Listo'}
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              {message && <span className="text-xs font-medium text-emerald-700">{message}</span>}
              {selectedNote && (
                <span className="text-xs text-slate-500">
                  Última edición: {formatDate(selectedNote.updatedAt)}
                </span>
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
                <label className="text-xs font-semibold uppercase text-slate-500">Cliente</label>
                <input
                  type="text"
                  value={draft.client}
                  onChange={(e) => handleDraftChange({ client: e.target.value })}
                  placeholder="Cliente opcional"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
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
                <span className="text-[11px] font-medium text-slate-400">Texto enriquecido</span>
              </div>
              <EditorContent editor={editor} />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default NotasPage
