import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : ''

type PublicQuickNote = {
  id: string
  title: string
  client: string
  date: string
  content: string
  updatedAt?: string
}

const formatDate = (value: string) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(value),
  )
}

function PublicNotaPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [note, setNote] = useState<PublicQuickNote | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  useEffect(() => {
    const load = async () => {
      if (!id || !token || !API_BASE) {
        setStatus('error')
        return
      }
      try {
        const res = await fetch(`${API_BASE}/api/public/nota/${id}?token=${encodeURIComponent(token)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { note: PublicQuickNote }
        setNote(data.note)
        setStatus('ready')
      } catch (error) {
        console.error('No se pudo cargar nota pública', error)
        setStatus('error')
      }
    }
    void load()
  }, [id, token])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Cargando nota compartida…</p>
        </div>
      </div>
    )
  }

  if (status === 'error' || !note) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-red-600">No se pudo cargar esta nota.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-700">Nota compartida</p>
            <h1 className="text-2xl font-bold text-slate-950">{note.title || 'Sin título'}</h1>
            <p className="text-sm text-slate-600">
              {note.client || 'Sin cliente'} • {formatDate(note.date)}
            </p>
          </div>
          {note.updatedAt && (
            <p className="text-xs text-slate-500">Última edición: {formatDate(note.updatedAt)}</p>
          )}
        </div>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold uppercase text-slate-600">Contenido</h2>
          <div
            className="prose prose-slate max-w-none rounded-xl border border-slate-200 bg-white px-4 py-3"
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
        </section>
      </div>
    </div>
  )
}

export default PublicNotaPage
