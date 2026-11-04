import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { CurrentUserResponse } from '../../types/api'
import { fetchCurrentUser, login as loginRequest } from '../../shared/api/auth'
import {
  getStoredToken,
  setStoredToken,
} from '../../shared/api/client'

interface AuthState {
  user: CurrentUserResponse | null
  loading: boolean
  isAuthenticated: boolean
  isAdministrator: boolean
  /** Publicar o cancelar turnos (profesor o administrador). */
  canManageAvailability: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUserResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const token = getStoredToken()
    if (!token) {
      setUser(null)
      return
    }
    const me = await fetchCurrentUser()
    setUser(me)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (getStoredToken()) {
          await refreshUser()
        }
      } catch {
        setStoredToken(null)
        setUser(null)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const token = await loginRequest(email, password)
    setStoredToken(token.accessToken)
    setUser({
      userId: token.userId,
      email: token.email,
      roles: token.roles,
    })
  }, [])

  const logout = useCallback(() => {
    setStoredToken(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      isAdministrator: user?.roles.includes('ADMINISTRATOR') ?? false,
      canManageAvailability:
        (user?.roles.includes('PROFESSOR') || user?.roles.includes('ADMINISTRATOR')) ?? false,
      login,
      logout,
      refreshUser,
    }),
    [user, loading, login, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
