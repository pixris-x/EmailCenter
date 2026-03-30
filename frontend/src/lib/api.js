import axios from 'axios'

const TOKEN_STORAGE_KEY = 'email_center_access_token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY)
      window.localStorage.removeItem('email_center_user')
    }
    return Promise.reject(error)
  },
)

export { TOKEN_STORAGE_KEY }
export default api
