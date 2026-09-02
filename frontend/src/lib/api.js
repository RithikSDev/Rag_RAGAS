const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_KEY = import.meta.env.VITE_API_KEY || ''

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}), 'X-API-Key': API_KEY }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })

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

export function askQuestion(question) {
  return request('/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
}

export function getRagasScores() {
  return request('/ragas')
}

export function runEvaluation() {
  return request('/evaluate', { method: 'POST' })
}

export function getDocuments() {
  return request('/documents')
}

export function uploadDocument(file) {
  const formData = new FormData()
  formData.append('file', file)

  return request('/documents', { method: 'POST', body: formData })
}

export function getSettings() {
  return request('/settings')
}

export function updateSettings(settings) {
  return request('/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

export function getRagasRuns() {
  return request('/ragas/runs')
}

export function getThresholds() {
  return request('/settings/thresholds')
}

export function updateThresholds(thresholds) {
  return request('/settings/thresholds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thresholds }),
  })
}
