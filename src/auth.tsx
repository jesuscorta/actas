import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type UserProfile = {
  email: string
  name: string
  picture?: string
  exp?: number
}

type AuthContextValue = {
  user: UserProfile | null
  idToken: string | null
  loading: boolean
  requiresAuth: boolean
  setCredential: (token: string) => void
  signOut: () => void
  authHeaders: () => Record<string, string>
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void
          renderButton: (parent: HTMLElement, options?: Record<string, any>) => void
          prompt: () => void
          cancel: () => void
          revoke: (email: string, done: () => void) => void
        }
      }
    }
  }
}

const STORAGE_KEY = 'actas.google.idToken'
const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || ''
const requiresAuth = Boolean(CLIENT_ID)

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
    return {
      email: json.email,
      name: json.name || json.email || 'Usuario',
      picture: json.picture,
      exp: json.exp,
    }
  } catch (error) {
    console.error('Failed to decode JWT', error)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [idToken, setIdToken] = useState<string | null>(null)
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
        setIdToken(stored)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const signOut = useCallback(() => {
    const email = user?.email
    setUser(null)
    setIdToken(null)
    localStorage.removeItem(STORAGE_KEY)
    if (email && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.revoke(email, () => {})
        window.google.accounts.id.cancel()
      } catch (error) {
        console.error('Error revoking Google session', error)
      }
    }
  }, [user?.email])

  const setCredential = useCallback((token: string) => {
    const profile = decodeJwt(token)
    const now = Math.floor(Date.now() / 1000)
    if (!profile?.email) {
      console.error('Token sin email')
      return
    }
    if (profile.exp && profile.exp < now) {
      console.error('Token expirado')
      return
    }
    setUser(profile)
    setIdToken(token)
    localStorage.setItem(STORAGE_KEY, token)
  }, [])

  const authHeaders = useCallback(() => {
    const headers: Record<string, string> = {}
    if (idToken) headers.Authorization = `Bearer ${idToken}`
    return headers
  }, [idToken])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      idToken,
      loading,
      requiresAuth,
      setCredential,
      signOut,
      authHeaders,
    }),
    [authHeaders, idToken, loading, setCredential, signOut, user],
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

const loadGsiScript = () =>
  new Promise<void>((resolve, reject) => {
    if (document.getElementById('gsi-script')) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.id = 'gsi-script'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'))
    document.head.appendChild(script)
  })

export function GoogleLoginButton({ onCredential }: { onCredential: (token: string) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false

    loadGsiScript()
      .then(() => {
        if (cancelled) return
        const google = window.google
        if (!google?.accounts?.id) return
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response: { credential: string }) => {
            if (response.credential) {
              onCredential(response.credential)
            }
          },
        })
        if (buttonRef.current) {
          buttonRef.current.innerHTML = ''
          google.accounts.id.renderButton(buttonRef.current, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            logo_alignment: 'left',
            width: 320,
          })
        }
        google.accounts.id.prompt()
      })
      .catch((error) => {
        console.error(error)
      })

    return () => {
      cancelled = true
      try {
        window.google?.accounts?.id?.cancel()
      } catch (error) {
        console.error('Error cancelling Google prompt', error)
      }
    }
  }, [onCredential])

  if (!CLIENT_ID) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
        Falta configurar VITE_GOOGLE_CLIENT_ID
      </p>
    )
  }

  return <div ref={buttonRef} className="flex justify-center" />
}
