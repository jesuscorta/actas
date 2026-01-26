import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type UserProfile = {
  email: string
  name: string
  exp?: number
}

type AuthContextValue = {
  user: UserProfile | null
  token: string | null
  loading: boolean
  requiresAuth: boolean
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => void
  authHeaders: () => Record<string, string>
}

const STORAGE_KEY = 'actas.auth.token'
const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : ''
const requiresAuth = Boolean(API_BASE)

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const decodeJwt = (token: string): UserProfile | null => {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const pad = normalized.length % 4 ? normalized + '='.repeat(4 - (normalized.length % 4)) : normalized
    const bytes = Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    const json = JSON.parse(decoded) as Record<string, any>
    if (!json.email) return null
    const name = String(json.email).split('@')[0] || 'Usuario'
    return {
      email: json.email,
      name,
      exp: json.exp,
    }
  } catch (error) {
    console.error('Failed to decode JWT', error)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!requiresAuth) {
      setLoading(false)
      return
    }
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const profile = decodeJwt(stored)
      const now = Math.floor(Date.now() / 1000)
      if (profile?.exp && profile.exp > now) {
        setUser(profile)
        setToken(stored)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!API_BASE) {
      return { ok: false, error: 'API no configurada' }
    }
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        return { ok: false, error: 'Credenciales inválidas' }
      }
      const data = (await res.json()) as { token?: string; user?: { email: string } }
      if (!data.token) {
        return { ok: false, error: 'Respuesta inválida del servidor' }
      }
      const profile = decodeJwt(data.token)
      if (!profile) {
        return { ok: false, error: 'Token inválido' }
      }
      setUser(profile)
      setToken(data.token)
      localStorage.setItem(STORAGE_KEY, data.token)
      return { ok: true }
    } catch (error) {
      console.error('Login error', error)
      return { ok: false, error: 'No se pudo iniciar sesión' }
    }
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const authHeaders = useCallback(() => {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }, [token])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      requiresAuth,
      signIn,
      signOut,
      authHeaders,
    }),
    [authHeaders, loading, signIn, signOut, token, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
