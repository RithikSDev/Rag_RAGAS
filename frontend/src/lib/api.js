const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'ragas-lab-token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // localStorage may be unavailable (private browsing, etc.) - login still
    // works for this session, it just won't survive a reload.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (response.status === 401 && token) {
    // The session we thought was valid was rejected (expired/revoked) -
    // clear it and let the app fall back to the login screen.
    clearToken()
    window.dispatchEvent(new Event('ragas-lab:session-expired'))
  }

  if (!response.ok) {
    let detail = ''

    try {
      detail = (await response.json())?.detail
    } catch {
      // response wasn't JSON — fall back to the plain status
    }

    throw new Error(detail || `Request failed (${response.status})`)
  }

  return response.json()
}

function asJson(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

// --- Auth ----------------------------------------------------------------

export function login(username, password) {
  return request('/auth/login', asJson('POST', { username, password }))
}

export function getCurrentUser() {
  return request('/auth/me')
}

export function logout() {
  clearToken()
}

export function getUsers() {
  return request('/auth/users')
}

export function createUser(payload) {
  return request('/auth/users', asJson('POST', payload))
}

export function updateUser(id, payload) {
  return request(`/auth/users/${id}`, asJson('PATCH', payload))
}

export function deleteUser(id) {
  return request(`/auth/users/${id}`, { method: 'DELETE' })
}

// --- RAG Playground -------------------------------------------------------

export function askQuestion(question) {
  return request('/ask', asJson('POST', { question }))
}

// --- Knowledge Base ---------------------------------------------------------

export function getDocuments() {
  return request('/documents')
}

export function uploadDocument(file) {
  const formData = new FormData()
  formData.append('file', file)

  return request('/documents', { method: 'POST', body: formData })
}

export function getDocumentChunks(documentId) {
  return request(`/documents/${documentId}/chunks`)
}

// --- Retrieval Debugger -----------------------------------------------------

export function debugRetrieval(payload) {
  return request('/retrieval/debug', asJson('POST', payload))
}

// --- Evaluation / Experiments / Compare --------------------------------------

export function getRagasScores() {
  return request('/ragas')
}

export function getRagasRuns() {
  return request('/ragas/runs')
}

export function getRagasRun(runId) {
  return request(`/ragas/runs/${runId}`)
}

export function labelRun(runId, { label, notes }) {
  return request(`/ragas/runs/${runId}`, { ...asJson('PATCH', { label, notes }) })
}

export function runEvaluation() {
  // Starts a background run - returns {run_id, status: "running"} immediately.
  // Callers poll getEvaluationProgress() until status !== "running", then
  // fetch the full result with getRagasRun(run_id).
  return request('/evaluate', { method: 'POST' })
}

export function getEvaluationProgress(runId) {
  return request(`/evaluate/${runId}/progress`)
}

// --- Dataset -----------------------------------------------------------------

export function getDataset() {
  return request('/dataset')
}

export function createDatasetQuestion(payload) {
  return request('/dataset', asJson('POST', payload))
}

export function updateDatasetQuestion(id, payload) {
  return request(`/dataset/${id}`, asJson('PUT', payload))
}

export function deleteDatasetQuestion(id) {
  return request(`/dataset/${id}`, { method: 'DELETE' })
}

export function importDataset(file) {
  const formData = new FormData()
  formData.append('file', file)

  return request('/dataset/import', { method: 'POST', body: formData })
}

// --- Settings ------------------------------------------------------------

export function getSettings() {
  return request('/settings')
}

export function updateSettings(settings) {
  return request('/settings', asJson('POST', settings))
}

export function getThresholds() {
  return request('/settings/thresholds')
}

export function updateThresholds(thresholds) {
  return request('/settings/thresholds', asJson('POST', { thresholds }))
}

// --- Overview / system status ------------------------------------------------

export function getHealth() {
  return request('/health')
}

export function getMetricsSummary() {
  return request('/metrics/summary')
}
