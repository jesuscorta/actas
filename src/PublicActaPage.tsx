import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : ''

type PublicNote = {
  id: string
  title: string
  client: string
  date: string
  meetingType?: string
  preNotes?: string
  content: string
  nextSteps?: string
  nextTasks?: { id: string; text: string; done: boolean }[]
  updatedAt?: string
}

const formatDate = (value: string) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(value),
  )
}

function PublicActaPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [note, setNote] = useState<PublicNote | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  useEffect(() => {
    const load = async () => {
      if (!id || !token || !API_BASE) {
        setStatus('error')
        return
      }
      try {
        const res = await fetch(`${API_BASE}/api/public/acta/${id}?token=${encodeURIComponent(token)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { note: PublicNote }
        setNote(data.note)
        setStatus('ready')
      } catch (error) {
        console.error('No se pudo cargar acta pública', error)
        setStatus('error')
      }
    }
    void load()
  }, [id, token])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Cargando acta compartida…</p>
        </div>
      </div>
    )
  }

  if (status === 'error' || !note) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-red-600">No se pudo cargar esta acta.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-700">Acta compartida</p>
            <h1 className="text-2xl font-bold text-slate-950">{note.title || 'Sin título'}</h1>
            <p className="text-sm text-slate-600">
              {note.client || 'Sin cliente'} • {formatDate(note.date)} •{' '}
              {note.meetingType === 'interna' ? 'Interna' : 'Con cliente'}
            </p>
          </div>
          {note.updatedAt && (
            <p className="text-xs text-slate-500">Última edición: {formatDate(note.updatedAt)}</p>
          )}
        </div>

        {note.preNotes && (
          <section className="space-y-1">
            <h2 className="text-sm font-semibold uppercase text-slate-600">Notas previas</h2>
            <div
              className="prose prose-slate max-w-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              dangerouslySetInnerHTML={{ __html: note.preNotes }}
            />
          </section>
        )}

        <section className="space-y-1">
          <h2 className="text-sm font-semibold uppercase text-slate-600">Acta</h2>
          <div
            className="prose prose-slate max-w-none rounded-xl border border-slate-200 bg-white px-4 py-3"
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
        </section>

        {note.nextSteps && (
          <section className="space-y-1">
            <h2 className="text-sm font-semibold uppercase text-slate-600">Próximos pasos</h2>
            <div
              className="prose prose-slate max-w-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              dangerouslySetInnerHTML={{ __html: note.nextSteps }}
            />
          </section>
        )}

        {note.nextTasks?.length ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase text-slate-600">Checklist</h2>
            <ul className="space-y-1">
              {note.nextTasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                      task.done ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-300'
                    }`}
                  >
                    {task.done ? '✓' : ''}
                  </span>
                  <span className={task.done ? 'line-through text-slate-400' : ''}>{task.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}

export default PublicActaPage
