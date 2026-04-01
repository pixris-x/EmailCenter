import { defineStore } from 'pinia'
import api, { TOKEN_STORAGE_KEY } from '../lib/api'

const USER_STORAGE_KEY = 'email_center_user'

function readStoredUser() {
  const raw = window.localStorage.getItem(USER_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function createEmptyUser() {
  return {
    displayName: '',
    roleCode: '',
    roleName: '',
    email: '',
    permissions: [],
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: window.localStorage.getItem(TOKEN_STORAGE_KEY) || '',
    user: readStoredUser() || createEmptyUser(),
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token),
    hasPermission: (state) => (permissionCode) => {
      const permissions = state.user?.permissions || []
      return permissions.includes('*') || permissions.includes(permissionCode)
    },
  },
  actions: {
    async signIn(credentials) {
      const { data } = await api.post('/auth/login', credentials)
      this.token = data.accessToken
      this.user = data.user
      window.localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken)
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user))
    },
    async restoreSession() {
      if (!this.token) {
        return
      }

      try {
        const { data } = await api.get('/auth/me')
        this.user = data.user
        window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user))
      } catch {
        this.signOut()
      }
    },
    signOut() {
      this.token = ''
      this.user = createEmptyUser()
      window.localStorage.removeItem(TOKEN_STORAGE_KEY)
      window.localStorage.removeItem(USER_STORAGE_KEY)
    },
  },
})
