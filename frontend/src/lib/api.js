const TOKEN_STORAGE_KEY = 'email_center_access_token'
const USER_STORAGE_KEY = 'email_center_user'
const DEFAULT_TIMEOUT = 15000
const DEFAULT_RETRY_COUNT = Number(import.meta.env.VITE_API_RETRY_COUNT || 1)
const DEFAULT_RETRY_DELAY_MS = Number(import.meta.env.VITE_API_RETRY_DELAY_MS || 400)
const API_LOG_ENABLED = String(import.meta.env.VITE_API_ENABLE_LOG || 'false').toLowerCase() === 'true'
const DEFAULT_RETRYABLE_METHODS = ['GET', 'DELETE']
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]

function resolveBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
}

function clearAuthStorage() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(USER_STORAGE_KEY)
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function shouldWriteApiLog() {
  return API_LOG_ENABLED
}

function writeApiLog(type, message, meta = {}) {
  if (!shouldWriteApiLog()) {
    return
  }

  const payload = {
    time: new Date().toISOString(),
    ...meta,
  }

  if (type === 'error') {
    console.error(`[api:${type}] ${message}`, payload)
    return
  }

  console.log(`[api:${type}] ${message}`, payload)
}

function buildUrl(path, params) {
  const baseUrl = resolveBaseUrl()
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${path || ''}`
  const url = new URL(`${baseUrl}${normalizedPath}`, window.location.origin)

  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return
      }

      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== undefined && item !== null && item !== '') {
            url.searchParams.append(key, String(item))
          }
        })
        return
      }

      url.searchParams.set(key, String(value))
    })
  }

  return url.toString()
}

async function parseResponseData(response) {
  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text || null
}

function createHttpError(response, data) {
  const message = data?.message || data?.error || `请求失败：${response.status}`
  const error = new Error(message)
  error.response = {
    status: response.status,
    data,
  }
  error.status = response.status
  error.data = data
  return error
}

function normalizeRetryCount(config) {
  if (config.retry === false) {
    return 0
  }

  if (typeof config.retryCount === 'number') {
    return Math.max(0, Math.floor(config.retryCount))
  }

  if (typeof config.retry === 'number') {
    return Math.max(0, Math.floor(config.retry))
  }

  return DEFAULT_RETRY_COUNT
}

function normalizeRetryDelay(config) {
  if (typeof config.retryDelayMs === 'number') {
    return Math.max(0, Math.floor(config.retryDelayMs))
  }

  return DEFAULT_RETRY_DELAY_MS
}

function isRetryableMethod(method, config) {
  if (config.retry === true) {
    return true
  }

  return DEFAULT_RETRYABLE_METHODS.includes(method)
}

function shouldRetry(method, config, error, attempt, retryCount) {
  if (attempt >= retryCount) {
    return false
  }

  if (!isRetryableMethod(method, config)) {
    return false
  }

  if (error.code === 'TIMEOUT') {
    return true
  }

  if (error.response?.status && RETRYABLE_STATUS_CODES.includes(error.response.status)) {
    return true
  }

  if (!error.response && (error instanceof TypeError || error.name === 'TypeError')) {
    return true
  }

  return false
}

async function request(method, path, bodyOrConfig, configOverride) {
  const isBodyMethod = !['GET', 'DELETE'].includes(method)
  const body = isBodyMethod ? bodyOrConfig : undefined
  const config = isBodyMethod ? (configOverride || {}) : (bodyOrConfig || {})
  const retryCount = normalizeRetryCount(config)
  const retryDelayMs = normalizeRetryDelay(config)
  const requestUrl = buildUrl(path, config.params)

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), config.timeout || DEFAULT_TIMEOUT)
    const headers = new Headers(config.headers || {})
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY)

    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const requestInit = {
      method,
      headers,
      signal: controller.signal,
    }

    if (isBodyMethod && body !== undefined) {
      if (body instanceof FormData) {
        requestInit.body = body
      } else {
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json')
        }
        requestInit.body = JSON.stringify(body)
      }
    }

    try {
      writeApiLog('request', `${method} ${path}`, {
        attempt: attempt + 1,
        retryCount,
      })

      const response = await fetch(requestUrl, requestInit)
      const data = await parseResponseData(response)

      if (!response.ok) {
        if (response.status === 401) {
          clearAuthStorage()
        }
        throw createHttpError(response, data)
      }

      writeApiLog('success', `${method} ${path}`, {
        status: response.status,
        attempt: attempt + 1,
      })

      return {
        data,
        status: response.status,
        headers: response.headers,
      }
    } catch (error) {
      let resolvedError = error
      if (error.name === 'AbortError') {
        resolvedError = new Error('请求超时，请稍后重试。')
        resolvedError.code = 'TIMEOUT'
      }

      if (resolvedError.response?.status === 401) {
        clearAuthStorage()
      }

      const retryable = shouldRetry(method, config, resolvedError, attempt, retryCount)
      writeApiLog(retryable ? 'retry' : 'error', `${method} ${path}`, {
        attempt: attempt + 1,
        retryCount,
        status: resolvedError.response?.status || null,
        message: resolvedError.message,
      })

      if (!retryable) {
        throw resolvedError
      }

      await sleep(retryDelayMs * (attempt + 1))
    } finally {
      window.clearTimeout(timeout)
    }
  }
}

const api = {
  get(path, config = {}) {
    return request('GET', path, config)
  },
  post(path, body, config = {}) {
    return request('POST', path, body, config)
  },
  put(path, body, config = {}) {
    return request('PUT', path, body, config)
  },
  delete(path, config = {}) {
    return request('DELETE', path, config)
  },
}

export { TOKEN_STORAGE_KEY }
export default api
