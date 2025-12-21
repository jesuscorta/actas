import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import localforage from 'localforage'
import { nanoid } from 'nanoid'
import Papa from 'papaparse'
import TurndownService from 'turndown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Mention from '@tiptap/extension-mention'
import { mergeAttributes } from '@tiptap/core'
import './index.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : ''

type Note = {
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

type NoteDraft = {
  id?: string
  title: string
  client: string
  date: string
  meetingType: 'cliente' | 'interna'
  preNotes: string
  content: string
  nextSteps: string
  nextTasks: { id: string; text: string; done: boolean }[]
}

type Filters = {
  search: string
  client: string
  date: string
}

const DEFAULT_CLIENTS = [
  'Altessia',
  'Grupo Emeis',
  'isEazy',
  'Smoking',
  'BeeDigital',
  'Aresbank',
  'Halehou/Hipotecas Digitales',
  'IML',
  'Japemasa',
  'SIDN',
  'Deoleo',
  'Ecoembes',
  'iAhorro',
  'Realia',
  'Sportium',
  'The Valley',
  'Thielmann',
  'UGR',
  'Aedas',
  'Clece',
  'Faes Farma',
  'Fotocasa / Datavenues',
  'Hawha Energy (Imagina Energía y Quantica Renovables)',
  'Noelia Romero',
  'slot.com',
  'Vestige Colection',
  'Ortodoncis',
  'Kaname',
  'Pastor y Galvez',
  'PRIM',
  'Grupo Alhambra IT',
  'Papelmatic',
  'Dékuple',
  'Limepay',
  'Affidea',
  'Manuel Yebra',
  'Entradas Master',
  'Fluidra',
  'Colegios RC',
  'Consell de Mallorca',
  'Grupo Eulen',
  'Ohai Resorts',
  'UNIR - Contraste',
  'BCO Congresos',
  'Grupo Azkoyen',
  'ICDE',
  'Vector Solar',
  '3 Claveles',
  'Estabanell',
  'Hidráulicas Jaén',
  'IBP Tenis',
  'Patineteros',
  'Repsol',
  'Asisa',
  'De Hualdo',
  'Comparar y ahorrar',
  'Billin',
  'Grupo Apolo (Mariscos Apolo y Cocelang)',
  'Simetría Group',
  'Andamur',
  'CTT Express',
  'Diglo',
  'Divina Seguros',
  'Grupo Vértice',
  'Legend eBikes',
  'Sanferbike',
  'Sublima',
  'Tega',
  'Unilabs',
  'WTW (Willis Tower Watson)',
  'Nautichandler',
  'Mercurius Health',
  'Nearby Computing',
  'Cadpet',
]

const storage = localforage.createInstance({
  name: 'actas',
  storeName: 'actas_store',
})

const turndown = new TurndownService()
const BACKUP_HANDLE_KEY = 'backupDirHandle'

const today = () => new Date().toISOString().slice(0, 10)

const emptyDraft = (): NoteDraft => ({
  title: '',
  client: '',
  date: today(),
  meetingType: 'interna',
  preNotes: '',
  content: '',
  nextSteps: '',
  nextTasks: [],
})

const sortClients = (clients: string[]) =>
  [...new Set(clients.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' }),
  )

const sortNotes = (list: Note[]) =>
  [...list].sort((a, b) => {
    const byDate = new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
    if (byDate !== 0) return byDate
    return new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime()
  })

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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const NoteMention = Mention.extend({
  renderHTML({ node, HTMLAttributes }: { node: any; HTMLAttributes: Record<string, any> }) {
    const label = node?.attrs?.label ? `@${node.attrs.label}` : `@${node?.attrs?.id || 'acta'}`
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-note-id': node.attrs.id,
        'data-note-label': node.attrs.label,
        href: `#${node.attrs.id}`,
      }),
      [
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          class: 'h-3.5 w-3.5',
          'aria-hidden': 'true',
        },
        ['path', { d: 'M15 7h3a4 4 0 0 1 0 8h-3' }],
        ['path', { d: 'M9 17H6a4 4 0 0 1 0-8h3' }],
        ['line', { x1: '8', y1: '12', x2: '16', y2: '12' }],
      ],
      ['span', { class: 'text-sm font-semibold' }, label],
    ]
  },
})

function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clients, setClients] = useState<string[]>(sortClients(DEFAULT_CLIENTS))
  const [filters, setFilters] = useState<Filters>({ search: '', client: 'all', date: '' })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<{ pre: boolean; acta: boolean }>({
    pre: false,
    acta: false,
  })
  const [newTaskText, setNewTaskText] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)
  const [backupDir, setBackupDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [backupSupported, setBackupSupported] = useState(false)
  const [showClientManager, setShowClientManager] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<Note[]>([])
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const normalizeNotes = useCallback((rawNotes: Note[]) => {
    return sortNotes(
      rawNotes.map((note) => ({
        ...note,
        meetingType: note.meetingType || 'cliente',
        preNotes: note.preNotes || '',
        nextSteps: note.nextSteps || '',
        nextTasks: Array.isArray(note.nextTasks)
          ? note.nextTasks
          : Array.isArray((note as any).nextTasks)
            ? ((note as any).nextTasks as any[]).map((t) => ({
                id: t.id || nanoid(),
                text: t.text || '',
                done: Boolean(t.done),
              }))
            : [],
      })),
    )
  }, [])

  const syncState = useCallback(async (notesToSave: Note[], clientsToSave: string[]) => {
    if (!API_BASE) return
    try {
      await fetch(`${API_BASE}/api/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesToSave, clients: clientsToSave }),
      })
    } catch (error) {
      console.error('Sync error', error)
    }
  }, [])

  const jumpToNote = useCallback(
    (noteId: string) => {
      const note = notesRef.current.find((n) => n.id === noteId)
      if (!note) return
      setSelectedId(note.id)
      setDraft({
        id: note.id,
        title: note.title,
        client: note.client,
        date: note.date,
        meetingType: note.meetingType || 'cliente',
        preNotes: note.preNotes || '',
        content: note.content,
        nextSteps: note.nextSteps || '',
        nextTasks: note.nextTasks || [],
      })
      setDirty(false)
    },
    [setDraft],
  )

  const informUpdatedDraft = useCallback((storedNotes: Note[]) => {
    if (storedNotes.length) {
      const first = storedNotes[0]
      setSelectedId(first.id)
      setDraft({
        id: first.id,
        title: first.title,
        client: first.client,
        date: first.date,
        meetingType: first.meetingType || 'cliente',
        preNotes: first.preNotes || '',
        content: first.content,
        nextSteps: first.nextSteps || '',
        nextTasks: first.nextTasks || [],
      })
    } else {
      setSelectedId(null)
      setDraft(emptyDraft())
    }
  }, [setDraft, setSelectedId])

  useEffect(() => {
    setBackupSupported(typeof window !== 'undefined' && 'showDirectoryPicker' in window)

    const loadFromStorage = async () => {
      const storedNotesRaw = (await storage.getItem<Note[]>('notes')) || []
      const storedNotes = normalizeNotes(storedNotesRaw)
      const storedClients = (await storage.getItem<string[]>('clients')) || []
      const combinedClients = sortClients([
        ...DEFAULT_CLIENTS,
        ...storedClients,
        ...storedNotes.map((note) => note.client),
      ])

      setClients(combinedClients)
      setNotes(storedNotes)
      informUpdatedDraft(storedNotes)
      setLoading(false)
    }

    const loadFromApi = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/state`)
        if (!res.ok) {
          throw new Error(`API failed: ${res.status}`)
        }
        const data = (await res.json()) as { notes?: Note[]; clients?: string[] }
        const storedNotes = normalizeNotes(Array.isArray(data.notes) ? data.notes : [])
        const storedClients = Array.isArray(data.clients) ? data.clients : []
        const combinedClients = sortClients([
          ...DEFAULT_CLIENTS,
          ...storedClients,
          ...storedNotes.map((note) => note.client),
        ])
        setClients(combinedClients)
        setNotes(storedNotes)
        await storage.setItem('notes', storedNotes)
        await storage.setItem('clients', combinedClients)
        informUpdatedDraft(storedNotes)
        setLoading(false)
      } catch (error) {
        console.error('API load error', error)
        await loadFromStorage()
      }
    }

    if (API_BASE) {
      void loadFromApi()
    } else {
      void loadFromStorage()
    }
  }, [informUpdatedDraft, normalizeNotes])

  useEffect(() => {
    if (!backupSupported) return
    const loadBackupHandle = async () => {
      try {
        const storedHandle = await storage.getItem<FileSystemDirectoryHandle>(BACKUP_HANDLE_KEY)
        if (!storedHandle) return
        if ('queryPermission' in storedHandle) {
          const perm = await (storedHandle as any).queryPermission?.({ mode: 'readwrite' })
          if (perm === 'granted') {
            setBackupDir(storedHandle)
            return
          }
          if (perm === 'prompt') {
            const req = await (storedHandle as any).requestPermission?.({ mode: 'readwrite' })
            if (req === 'granted') {
              setBackupDir(storedHandle)
              return
            }
          }
        }
        await storage.removeItem(BACKUP_HANDLE_KEY)
      } catch (error) {
        console.error('Error cargando backup handle', error)
      }
    }
    void loadBackupHandle()
  }, [backupSupported])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    if (filters.date) {
      const target = new Date(filters.date)
      if (!Number.isNaN(target.getTime())) {
        setCalendarMonth(new Date(target.getFullYear(), target.getMonth(), 1))
      }
    }
  }, [filters.date])

  const datesWithNotes = useMemo(() => new Set(notes.map((n) => n.date)), [notes])

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const start = new Date(year, month, 1)
    const endDay = new Date(year, month + 1, 0).getDate()
    const offset = (start.getDay() + 6) % 7 // lunes = 0
    const days = Array(offset).fill(null)
    for (let d = 1; d <= endDay; d++) {
      days.push(d)
    }
    return { year, month, days }
  }, [calendarMonth])

  const mentionSuggestion = useMemo(
    () => ({
      char: '@',
      items: ({ query }: { query: string }) => {
        const search = (query || '').toLowerCase()
        return sortNotes(notesRef.current)
          .map((note) => ({
            id: note.id,
            label: note.title || 'Sin título',
            client: note.client || 'Sin cliente',
            date: note.date || '',
          }))
          .filter((item) => {
            const label = item.label.toLowerCase()
            const client = item.client.toLowerCase()
            const formattedDate = formatDate(item.date).toLowerCase()
            return (
              !search ||
              label.includes(search) ||
              client.includes(search) ||
              formattedDate.includes(search)
            )
          })
          .slice(0, 30)
      },
      render: () => {
        let container: HTMLDivElement | null = null
        let searchValue = ''
        let inputEl: HTMLInputElement | null = null

        const destroy = () => {
          if (container) {
            container.remove()
            container = null
          }
        }

        const update = (props: any) => {
          if (!container) return
          const rect = props.clientRect?.()
          if (!rect) return

          container.style.position = 'absolute'
          container.style.left = `${rect.left}px`
          container.style.top = `${rect.bottom + 6}px`
          container.style.minWidth = `${Math.max(220, rect.width)}px`

          container.innerHTML = ''
          const searchWrapper = document.createElement('div')
          searchWrapper.className = 'px-3 pb-2'
          inputEl = document.createElement('input')
          inputEl.type = 'search'
          inputEl.placeholder = 'Buscar acta...'
          inputEl.value = searchValue
          inputEl.className =
            'w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100'
          inputEl.addEventListener('input', (event) => {
            const target = event.target as HTMLInputElement
            searchValue = target.value
            update(props)
          })
          searchWrapper.appendChild(inputEl)

          const list = document.createElement('div')
          list.className = 'max-h-64 overflow-auto py-1'

          const filteredItems = (props.items || []).filter((item: any) => {
            if (!searchValue) return true
            const term = searchValue.toLowerCase()
            return (
              item.label.toLowerCase().includes(term) ||
              item.client.toLowerCase().includes(term) ||
              formatDate(item.date).toLowerCase().includes(term)
            )
          })

          if (!filteredItems.length) {
            const empty = document.createElement('div')
            empty.className = 'px-3 py-2 text-xs text-slate-500'
            empty.textContent = 'Sin resultados'
            list.appendChild(empty)
          }

          filteredItems.forEach((item: any) => {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className =
              'flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-primary-50'
            btn.innerHTML = `
              <div class="flex-1">
                <div class="font-semibold">${escapeHtml(item.label)}</div>
                <div class="text-xs text-slate-500">${escapeHtml(item.client)} • ${escapeHtml(formatDate(item.date))}</div>
              </div>
            `
            btn.addEventListener('mousedown', (event) => {
              event.preventDefault()
              props.command({ id: item.id, label: item.label })
            })
            list.appendChild(btn)
          })

          container.appendChild(searchWrapper)
          container.appendChild(list)
          if (inputEl) {
            setTimeout(() => inputEl?.focus(), 0)
          }
        }

        return {
          onStart: (props: any) => {
            container = document.createElement('div')
            container.className =
              'z-50 rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-200/70'
            document.body.appendChild(container)
            searchValue = ''
            update(props)
          },
          onUpdate: (props: any) => {
            update(props)
          },
          onKeyDown: ({ event }: any) => {
            if (event.key === 'Escape') {
              destroy()
              return true
            }
            return false
          },
          onExit: () => {
            destroy()
          },
        }
      },
    }),
    [],
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      NoteMention.configure({
        suggestion: mentionSuggestion,
        HTMLAttributes: {
          class:
            'inline-flex items-center gap-1 text-primary-700 underline decoration-primary-300 underline-offset-2 transition hover:text-primary-800',
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-primary-600 underline underline-offset-2',
        },
      }),
      Placeholder.configure({
        placeholder: 'Acta, decisiones y próximos pasos...',
      }),
    ],
    content: draft.content,
    editorProps: {
      attributes: {
        class:
          'tiptap prose prose-slate max-w-none rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-inner focus:outline-none',
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement
        const mentionEl = target.closest('[data-note-id]') as HTMLElement | null
        const noteId = mentionEl?.dataset.noteId
        if (noteId) {
          jumpToNote(noteId)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      handleDraftChange({ content: editor.getHTML() })
    },
  })

  const preNotesEditor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      NoteMention.configure({
        suggestion: mentionSuggestion,
        HTMLAttributes: {
          class:
            'inline-flex items-center gap-1 text-primary-700 underline decoration-primary-300 underline-offset-2 transition hover:text-primary-800',
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-primary-600 underline underline-offset-2',
        },
      }),
      Placeholder.configure({
        placeholder: 'Preguntas, dudas o notas previas a la reunión...',
      }),
    ],
    content: draft.preNotes,
    editorProps: {
      attributes: {
        class:
          'tiptap prose prose-slate max-w-none rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-inner focus:outline-none',
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement
        const mentionEl = target.closest('[data-note-id]') as HTMLElement | null
        const noteId = mentionEl?.dataset.noteId
        if (noteId) {
          jumpToNote(noteId)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      handleDraftChange({ preNotes: editor.getHTML() })
    },
  })

  const nextStepsEditor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      NoteMention.configure({
        suggestion: mentionSuggestion,
        HTMLAttributes: {
          class:
            'inline-flex items-center gap-1 text-primary-700 underline decoration-primary-300 underline-offset-2 transition hover:text-primary-800',
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-primary-600 underline underline-offset-2',
        },
      }),
      Placeholder.configure({
        placeholder: 'Notas breves de próximos pasos…',
      }),
    ],
    content: draft.nextSteps,
    editorProps: {
      attributes: {
        class:
          'tiptap prose prose-slate max-w-none rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-inner focus:outline-none',
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement
        const mentionEl = target.closest('[data-note-id]') as HTMLElement | null
        const noteId = mentionEl?.dataset.noteId
        if (noteId) {
          jumpToNote(noteId)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      handleDraftChange({ nextSteps: editor.getHTML() })
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

  useEffect(() => {
    if (preNotesEditor && draft) {
      const html = draft.preNotes || ''
      if (preNotesEditor.getHTML() !== html) {
        preNotesEditor.commands.setContent(html || '<p></p>', { emitUpdate: false })
      }
    }
  }, [preNotesEditor, draft.id])

  useEffect(() => {
    if (nextStepsEditor && draft) {
      const html = draft.nextSteps || ''
      if (nextStepsEditor.getHTML() !== html) {
        nextStepsEditor.commands.setContent(html || '<p></p>', { emitUpdate: false })
      }
    }
  }, [nextStepsEditor, draft.id])

  const ensureClientExists = useCallback((clientName: string, setOnDraft = false) => {
    const cleaned = clientName.trim()
    if (!cleaned) return

    setClients((prev) => {
      if (prev.some((c) => c.toLowerCase() === cleaned.toLowerCase())) {
        return prev
      }
      const next = sortClients([...prev, cleaned])
      void storage.setItem('clients', next)
      void syncState(notesRef.current, next)
      return next
    })

    if (setOnDraft) {
      setDraft((prev) => ({ ...prev, client: cleaned }))
    }
  }, [])

  const handleDraftChange = (patch: Partial<NoteDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const writeBackup = useCallback(
    async (dir: FileSystemDirectoryHandle, notesToSave: Note[], clientsToSave: string[]) => {
      try {
        const handle = await dir.getFileHandle('actas-backup.json', { create: true })
        const writable = await handle.createWritable()
        const payload = {
          version: 1,
          exportedAt: new Date().toISOString(),
          notes: notesToSave,
          clients: clientsToSave,
        }
        await writable.write(JSON.stringify(payload, null, 2))
        await writable.close()
      } catch (error) {
        console.error('Backup error', error)
        setMessage('No se pudo guardar backup')
        setTimeout(() => setMessage(null), 1500)
      }
    },
    [],
  )

  const saveDraft = useCallback(async () => {
    if (!draft) return
    const isEmpty =
      !draft.title.trim() &&
      !draft.client.trim() &&
      !stripHtml(draft.content || '').trim() &&
      !stripHtml(draft.preNotes || '').trim() &&
      !stripHtml(draft.nextSteps || '').trim() &&
      draft.nextTasks.every((t) => !t.text.trim())
    if (isEmpty) {
      setDirty(false)
      setSaving(false)
      return
    }

    const timestamp = new Date().toISOString()
    setSaving(true)

    let nextNotes: Note[] = []

    if (draft.id) {
      nextNotes = notes.map((note) =>
        note.id === draft.id
          ? {
              ...note,
              title: draft.title,
              client: draft.client,
              date: draft.date,
              meetingType: draft.meetingType,
              preNotes: draft.preNotes,
              content: draft.content,
              nextSteps: draft.nextSteps,
              nextTasks: draft.nextTasks,
              updatedAt: timestamp,
            }
          : note,
      )
    } else {
      const id = nanoid()
      const newNote: Note = {
        id,
        title: draft.title,
        client: draft.client,
        date: draft.date,
        meetingType: draft.meetingType,
        preNotes: draft.preNotes,
        content: draft.content,
        nextSteps: draft.nextSteps,
        nextTasks: draft.nextTasks,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      nextNotes = [newNote, ...notes]
      setDraft((prev) => ({ ...prev, id }))
      setSelectedId(id)
    }

    nextNotes = sortNotes(nextNotes)
    setNotes(nextNotes)
    await storage.setItem('notes', nextNotes)
    await syncState(nextNotes, clients)
    if (backupDir) {
      await writeBackup(backupDir, nextNotes, clients)
    }
    setDirty(false)
    setSaving(false)
    setMessage('Guardado')
    setTimeout(() => setMessage(null), 1200)
  }, [draft, notes, ensureClientExists, backupDir, clients, writeBackup])

  useEffect(() => {
    if (!dirty) return
    const timeout = setTimeout(() => {
      void saveDraft()
    }, 600)
    return () => clearTimeout(timeout)
  }, [dirty, saveDraft])

  const handleSelectNote = (note: Note) => {
    jumpToNote(note.id)
  }

  const filteredNotes = useMemo(() => {
    const searchTerm = filters.search.toLowerCase()
    return notes.filter((note) => {
      const matchesClient = filters.client === 'all' || note.client === filters.client
      const matchesDate = !filters.date || note.date === filters.date
      const matchesSearch =
        !searchTerm ||
        note.title.toLowerCase().includes(searchTerm) ||
        note.client.toLowerCase().includes(searchTerm) ||
        note.meetingType.toLowerCase().includes(searchTerm) ||
        stripHtml(note.content).toLowerCase().includes(searchTerm) ||
        stripHtml(note.preNotes).toLowerCase().includes(searchTerm) ||
        stripHtml(note.nextSteps).toLowerCase().includes(searchTerm) ||
        note.nextTasks.some((t) => t.text.toLowerCase().includes(searchTerm))
      return matchesClient && matchesDate && matchesSearch
    })
  }, [notes, filters])

  const filteredClients = useMemo(() => {
    const q = draft.client.trim().toLowerCase()
    const base = q
      ? clients.filter((c) => c.toLowerCase().includes(q))
      : clients
    return base.slice(0, 12)
  }, [clients, draft.client])

  const handleNewNote = () => {
    if (dirty) {
      void saveDraft()
    }
    const fresh = emptyDraft()
    setDraft(fresh)
    setSelectedId(null)
    setDirty(false)
  }

  const handleCopy = async () => {
    const markdownActa = draft.content ? turndown.turndown(draft.content) : ''
    const markdownPrevias = draft.preNotes ? turndown.turndown(draft.preNotes) : ''
    const markdownNext = draft.nextSteps ? turndown.turndown(draft.nextSteps) : ''
    const checklist = draft.nextTasks
      .filter((t) => t.text.trim())
      .map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`)
      .join('\n')
    const text = `# ${draft.title || 'Acta sin título'}\nCliente: ${
      draft.client || 'Sin cliente'
    }\nTipo: ${draft.meetingType === 'interna' ? 'Interna' : 'Con cliente'}\nFecha: ${
      draft.date || today()
    }\n\n## Notas previas\n${markdownPrevias}\n\n## Acta\n${markdownActa}\n\n## Próximos pasos\n${markdownNext}\n${
      checklist ? `\nChecklist:\n${checklist}` : ''
    }`

    try {
      await navigator.clipboard.writeText(text)
      setMessage('Copiado al portapapeles')
      setTimeout(() => setMessage(null), 1500)
    } catch (error) {
      setMessage('No se pudo copiar')
      setTimeout(() => setMessage(null), 1500)
      console.error(error)
    }
  }

  const handleExport = () => {
    const csv = Papa.unparse(
      notes.map((note) => ({
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
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `actas-${today()}.csv`
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

        const imported: Note[] = importedRows.map((row) => ({
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
              const parsed = JSON.parse(row.next_tasks_json || '[]')
              if (Array.isArray(parsed)) {
                return parsed.map((t) => ({
                  id: t.id || nanoid(),
                  text: t.text || '',
                  done: Boolean(t.done),
                }))
              }
              return []
            } catch {
              return []
            }
          })(),
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString(),
        }))

        const mergedNotes = sortNotes([
          ...notes.filter((note) => !imported.some((i) => i.id === note.id)),
          ...imported,
        ])

        const updatedClients = sortClients([...clients, ...imported.map((note) => note.client)])

        setNotes(mergedNotes)
        setClients(updatedClients)
        await storage.setItem('notes', mergedNotes)
        await storage.setItem('clients', updatedClients)
        await syncState(mergedNotes, updatedClients)
        setMessage('Importación lista')
        setTimeout(() => setMessage(null), 1500)
      },
    })
  }

  const triggerImport = () => {
    fileInputRef.current?.click()
  }

  const handlePickBackupDir = async () => {
    if (!backupSupported || typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
      setMessage('Backup local requiere Chrome/Edge en escritorio')
      setTimeout(() => setMessage(null), 1800)
      return
    }
    try {
      const dirHandle = await (window as any).showDirectoryPicker()
      const perm = await dirHandle.requestPermission?.({ mode: 'readwrite' })
      if (perm !== 'granted') {
        setMessage('Permiso de escritura denegado')
        setTimeout(() => setMessage(null), 1800)
        return
      }
      setBackupDir(dirHandle)
      await storage.setItem(BACKUP_HANDLE_KEY, dirHandle)
      setMessage('Carpeta de backup configurada')
      setTimeout(() => setMessage(null), 1500)
    } catch (error) {
      console.error('No se pudo elegir carpeta', error)
    }
  }

  const handleManualBackup = async () => {
    if (!backupDir) {
      setMessage('Configura la carpeta de backup primero')
      setTimeout(() => setMessage(null), 1500)
      return
    }
    await writeBackup(backupDir, notes, clients)
    setMessage('Backup guardado en carpeta')
    setTimeout(() => setMessage(null), 1500)
  }

  const handleAddClient = () => {
    const name = newClientName.trim()
    if (!name) return
    ensureClientExists(name, true)
    setNewClientName('')
    setShowNewClient(false)
    setMessage('Cliente añadido')
    setTimeout(() => setMessage(null), 1200)
  }

  const selectedNote = useMemo(() => notes.find((n) => n.id === selectedId), [notes, selectedId])

  const handleAddTask = () => {
    const text = newTaskText.trim()
    if (!text) return
    const task = { id: nanoid(), text, done: false }
    setDraft((prev) => ({ ...prev, nextTasks: [...prev.nextTasks, task] }))
    setNewTaskText('')
    setDirty(true)
  }

  const handleToggleTask = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      nextTasks: prev.nextTasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }))
    setDirty(true)
  }

  const handleDeleteTask = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      nextTasks: prev.nextTasks.filter((t) => t.id !== id),
    }))
    setDirty(true)
  }

  const handleEditTask = (id: string, text: string) => {
    setDraft((prev) => ({
      ...prev,
      nextTasks: prev.nextTasks.map((t) => (t.id === id ? { ...t, text } : t)),
    }))
    setDirty(true)
  }

  const handleDeleteNote = async () => {
    if (!selectedId) return
    const confirmDelete = window.confirm('¿Eliminar esta acta? Esta acción no se puede deshacer.')
    if (!confirmDelete) return

    const remaining = notes.filter((note) => note.id !== selectedId)
    setNotes(remaining)
    await storage.setItem('notes', remaining)
    await syncState(remaining, clients)
    if (backupDir) {
      await writeBackup(backupDir, remaining, clients)
    }

    if (remaining.length > 0) {
      const next = remaining[0]
      setSelectedId(next.id)
      setDraft({
        id: next.id,
        title: next.title,
        client: next.client,
        date: next.date,
        meetingType: next.meetingType,
        preNotes: next.preNotes,
        content: next.content,
        nextSteps: next.nextSteps,
        nextTasks: next.nextTasks,
      })
    } else {
      setSelectedId(null)
      setDraft(emptyDraft())
    }
    setDirty(false)
    setMessage('Acta eliminada')
    setTimeout(() => setMessage(null), 1500)
  }

  const handleClientUpdate = (index: number, value: string) => {
    const cleaned = value.trim()
    if (!cleaned) return
    setClients((prev) => {
      const next = [...prev]
      next[index] = cleaned
      const sorted = sortClients(next)
      void storage.setItem('clients', sorted)
      void syncState(notesRef.current, sorted)
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
    void storage.setItem('clients', nextClients)
    void syncState(updatedNotes, nextClients)
  }

  const handleClientAdd = () => {
    if (!newClientName.trim()) return
    ensureClientExists(newClientName.trim(), false)
    setNewClientName('')
  }

  return (
    <div className="min-h-screen px-3 py-6 text-slate-900 sm:px-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Actas</p>
            <h1 className="text-xl font-bold text-slate-950">Panel rápido de reuniones</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleNewNote}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              + Nueva acta
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
            >
              Copiar al portapapeles
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={triggerImport}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
            >
              Importar CSV
            </button>
            <button
              type="button"
              onClick={handlePickBackupDir}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
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
                <path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                <path d="M3 6a2 2 0 0 1 2-2h3" />
              </svg>
              <span className="sr-only">Carpeta backup</span>
            </button>
            <button
              type="button"
              onClick={handleManualBackup}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
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
                <path d="M7 3h10l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
                <path d="M7 3v6h10V3" />
                <path d="M10 17h4" />
              </svg>
              <span className="sr-only">Backup manual</span>
            </button>
            <button
              type="button"
              onClick={() => setShowClientManager(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
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

        <div className="grid gap-4 lg:grid-cols-[340px,1fr]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-2.5">
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Buscar por título, cliente o texto…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
              <select
                value={filters.client}
                onChange={(e) => setFilters((prev) => ({ ...prev, client: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                <option value="all">Todos los clientes</option>
                {clients.map((client) => (
                  <option key={client} value={client}>
                    {client}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                {filters.date && (
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, date: '' }))}
                    className="ml-auto rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:bg-primary-50"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-700">
                    {new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(calendarMonth)}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                        )
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-primary-200 hover:bg-primary-50"
                      aria-label="Mes anterior"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                        )
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-primary-200 hover:bg-primary-50"
                      aria-label="Mes siguiente"
                    >
                      ›
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-400">
                  {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {calendarDays.days.map((day, idx) => {
                    if (!day) {
                      return <span key={`empty-${idx}`} />
                    }
                    const dateStr = `${calendarDays.year}-${String(calendarDays.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const hasNotes = datesWithNotes.has(dateStr)
                    const isSelected = filters.date === dateStr
                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => setFilters((prev) => ({ ...prev, date: dateStr }))}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm transition ${
                          isSelected
                            ? 'bg-primary-100 font-semibold text-primary-800 ring-1 ring-primary-200'
                            : 'bg-white text-slate-700 hover:bg-primary-50'
                        }`}
                      >
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                            hasNotes ? 'bg-primary-100 text-primary-800' : ''
                          }`}
                        >
                          {day}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-slate-500">Últimas actas</p>
                <span className="text-[11px] font-medium text-slate-400">5 más recientes</span>
              </div>
              {loading && <p className="text-sm text-slate-500">Cargando notas...</p>}
              {!loading && !filteredNotes.length && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No hay actas todavía. Crea una nueva para empezar.
                </p>
              )}
              {filteredNotes.slice(0, 5).map((note) => (
                <button
                  key={note.id}
                  onClick={() => handleSelectNote(note)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left shadow-sm transition ${
                    note.id === selectedId
                      ? 'border-primary-200 bg-primary-50'
                      : 'border-slate-200 bg-white hover:border-primary-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        note.meetingType === 'interna'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-primary-100 text-primary-700'
                      }`}
                    >
                      {note.meetingType === 'interna' ? 'Interna' : 'Cliente'}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(note.date)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pb-1">
                    <h3 className="line-clamp-1 text-sm font-semibold text-slate-900">
                      {note.title || 'Sin título'}
                    </h3>
                  </div>
                  <p className="text-xs font-medium text-primary-700">
                    {note.client || 'Sin cliente'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {stripHtml(note.content) || stripHtml(note.preNotes)}
                  </p>
                </button>
              ))}
            </div>
          </aside>

          <main className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {saving ? 'Guardando…' : dirty ? 'Cambios pendientes' : 'Guardado'}
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              {message && <span className="text-xs font-medium text-primary-700">{message}</span>}
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
                  aria-label="Eliminar acta"
                  title="Eliminar acta"
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
                  placeholder="Reunión con cliente"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <label className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
                  <input
                    type="checkbox"
                    checked={draft.meetingType === 'cliente'}
                    onChange={(e) =>
                      handleDraftChange({ meetingType: e.target.checked ? 'cliente' : 'interna' })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-200"
                  />
                  Reunión con cliente
                </label>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Fecha</label>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => handleDraftChange({ date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            <div className="mt-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Cliente (elige o escribe uno nuevo)
                </label>
                <div className="flex items-start gap-2">
                  <div className="relative w-full">
                    <input
                      type="search"
                      value={draft.client}
                      onChange={(e) => handleDraftChange({ client: e.target.value })}
                      onFocus={() => setShowClientSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowClientSuggestions(false), 120)}
                      placeholder="Buscar o seleccionar cliente"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    />
                    {showClientSuggestions && filteredClients.length > 0 && (
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                        {filteredClients.map((client) => (
                          <button
                            key={client}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              handleDraftChange({ client })
                              setShowClientSuggestions(false)
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-800 hover:bg-primary-50"
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
                  <button
                    type="button"
                    onClick={() => setShowNewClient((prev) => !prev)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
                    aria-label="Añadir nuevo cliente"
                    title="Añadir nuevo cliente"
                  >
                    <span className="text-lg leading-none">＋</span>
                  </button>
                </div>
                {showNewClient && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Nuevo cliente"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddClient}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
                      aria-label="Guardar cliente"
                      title="Guardar cliente"
                    >
                      <span className="text-base leading-none">✓</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Notas previas</p>
                <div className="flex items-center gap-2">
                  {!collapsed.pre && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                      <ToolbarButton
                        label="Negrita"
                        onClick={() => preNotesEditor?.chain().focus().toggleBold().run()}
                        active={preNotesEditor?.isActive('bold') || false}
                      >
                        <span className="text-sm font-semibold">B</span>
                      </ToolbarButton>
                      <ToolbarButton
                        label="Cursiva"
                        onClick={() => preNotesEditor?.chain().focus().toggleItalic().run()}
                        active={preNotesEditor?.isActive('italic') || false}
                      >
                        <span className="text-sm italic">I</span>
                      </ToolbarButton>
                      <ToolbarButton
                        label="Subrayado"
                        onClick={() => preNotesEditor?.chain().focus().toggleUnderline().run()}
                        active={preNotesEditor?.isActive('underline') || false}
                      >
                        <span className="text-sm underline">U</span>
                      </ToolbarButton>
                      <ToolbarButton
                        label="Lista"
                        onClick={() => preNotesEditor?.chain().focus().toggleBulletList().run()}
                        active={preNotesEditor?.isActive('bulletList') || false}
                      >
                        <span className="text-base leading-none">•</span>
                      </ToolbarButton>
                      <ToolbarButton
                        label="Lista numerada"
                        onClick={() => preNotesEditor?.chain().focus().toggleOrderedList().run()}
                        active={preNotesEditor?.isActive('orderedList') || false}
                      >
                        <span className="text-xs font-semibold">1.</span>
                      </ToolbarButton>
                      <ToolbarButton
                        label="Encabezado H3"
                        onClick={() => preNotesEditor?.chain().focus().toggleHeading({ level: 3 }).run()}
                        active={preNotesEditor?.isActive('heading', { level: 3 }) || false}
                      >
                        <span className="text-[11px] font-semibold">H3</span>
                      </ToolbarButton>
                      <ToolbarButton
                        label="Enlace"
                        onClick={() => {
                          const previousUrl = preNotesEditor?.getAttributes('link').href
                          const url = window.prompt('Pega el enlace', previousUrl || '')
                          if (url === null) return
                          if (url === '') {
                            preNotesEditor?.chain().focus().unsetLink().run()
                            return
                          }
                          preNotesEditor?.chain().focus().setLink({ href: url }).run()
                        }}
                        active={preNotesEditor?.isActive('link') || false}
                      >
                        <span className="text-sm">🔗</span>
                      </ToolbarButton>
                      <ToolbarButton
                        label="Deshacer"
                        onClick={() => preNotesEditor?.chain().focus().undo().run()}
                        active={false}
                      >
                        <span className="text-base">↺</span>
                      </ToolbarButton>
                      <ToolbarButton
                        label="Rehacer"
                        onClick={() => preNotesEditor?.chain().focus().redo().run()}
                        active={false}
                      >
                        <span className="text-base">↻</span>
                      </ToolbarButton>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Plegar o desplegar notas previas"
                    className="flex h-8 w-8 items-center justify-center bg-transparent text-slate-700 transition hover:text-primary-700"
                    onClick={() => setCollapsed((prev) => ({ ...prev, pre: !prev.pre }))}
                  >
                    <span className="text-lg leading-none">{collapsed.pre ? '⌄' : '⌃'}</span>
                  </button>
                </div>
              </div>
              {!collapsed.pre && <EditorContent editor={preNotesEditor} />}
              {collapsed.pre && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {stripHtml(draft.preNotes) || 'Sin notas previas'}
                </p>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Acta</p>
                <div className="flex items-center gap-2">
                  {!collapsed.acta && (
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
                        label="Encabezado H2"
                        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                        active={editor?.isActive('heading', { level: 2 }) || false}
                      >
                        <span className="text-[11px] font-semibold">H2</span>
                      </ToolbarButton>
                      <ToolbarButton
                        label="Encabezado H3"
                        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                        active={editor?.isActive('heading', { level: 3 }) || false}
                      >
                        <span className="text-[11px] font-semibold">H3</span>
                      </ToolbarButton>
                      <ToolbarButton
                        label="Separador"
                        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                        active={false}
                      >
                        <span className="text-sm font-semibold">-</span>
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
                  )}
                  <button
                    type="button"
                    aria-label="Plegar o desplegar acta"
                    className="flex h-8 w-8 items-center justify-center bg-transparent text-slate-700 transition hover:text-primary-700"
                    onClick={() => setCollapsed((prev) => ({ ...prev, acta: !prev.acta }))}
                  >
                    <span className="text-lg leading-none">{collapsed.acta ? '⌄' : '⌃'}</span>
                  </button>
                </div>
              </div>
              {!collapsed.acta && <EditorContent editor={editor} />}
              {collapsed.acta && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {stripHtml(draft.content) || 'Sin contenido de acta'}
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="col-span-full flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-slate-500">Próximos pasos</p>
                <span className="text-[11px] font-medium text-slate-400">Checklist y notas</span>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase text-slate-500">Checklist</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddTask()
                      }
                    }}
                    placeholder="Añadir tarea..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddTask}
                    className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    Añadir
                  </button>
                </div>
                <div className="space-y-2">
                  {draft.nextTasks.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      Aún no hay tareas. Añade las próximas acciones.
                    </p>
                  )}
                  {draft.nextTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                    >
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => handleToggleTask(task.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-200"
                      />
                      <input
                        type="text"
                        value={task.text}
                        onChange={(e) => handleEditTask(task.id, e.target.value)}
                        className={`flex-1 rounded-md border border-transparent px-1 py-0.5 text-sm transition focus:border-primary-200 focus:outline-none focus:ring-1 focus:ring-primary-100 ${
                          task.done ? 'text-slate-400 line-through' : 'text-slate-800'
                        }`}
                        placeholder="Tarea sin texto"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                        aria-label="Eliminar tarea"
                        title="Eliminar tarea"
                      >
                        <span className="text-base leading-none">✕</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-slate-500">Notas de próximos pasos</p>
                  <span className="text-[11px] font-medium text-slate-400">Breve contexto</span>
                </div>
                <EditorContent editor={nextStepsEditor} />
              </div>
            </div>
          </main>
        </div>
      </div>
      <button
        type="button"
        onClick={handleNewNote}
        className="fixed bottom-5 right-5 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-200 sm:bottom-6 sm:right-6"
        aria-label="Nueva acta"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
              <button
                type="button"
                onClick={handleClientAdd}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
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
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
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
          ? 'bg-slate-900 text-white shadow-sm'
          : 'border border-slate-200 bg-white text-slate-700 hover:border-primary-200 hover:bg-primary-50'
      }`}
    >
      {children}
    </button>
  )
}

export default App
