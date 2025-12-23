import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ActasPage from './App'
import HomePage from './HomePage'
import NotasPage from './NotasPage'

function Header() {
  const { pathname } = useLocation()
  if (pathname === '/') return null
  const isActive = (path: string) => pathname.startsWith(path)
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
      </div>
    </header>
  )
}

function RouterApp() {
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
