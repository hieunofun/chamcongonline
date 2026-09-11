import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { mapUserToApp } from '../utils/helpers'

const AuthContext = createContext(null)

const loadProfile = async (authUser) => {
  if (!authUser?.id) return null
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .single()
  if (error) throw error
  return { ...mapUserToApp(data), id: data.id, authUserId: authUser.id, email: data.email || authUser.email || '' }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const syncSession = async (session) => {
      try {
        const profile = await loadProfile(session?.user)
        if (active) setUser(profile)
      } catch (error) {
        console.error('Không tải được hồ sơ đăng nhập:', error)
        if (active) setUser(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    supabase.auth.getSession().then(({ data }) => syncSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => syncSession(session), 0)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const profile = await loadProfile(data.user)
    setUser(profile)
    return profile
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout, loading }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
