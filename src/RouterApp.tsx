import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ActasPage from './App'
import HomePage from './HomePage'
import NotasPage from './NotasPage'
import { useAuth } from './auth'
import LoginPage from './LoginPage'

function Header() {
  const { pathname } = useLocation()
  const { user, signOut } = useAuth()
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
