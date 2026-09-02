import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  clearToken,
  getCurrentUser,
  getDataset,
  getDocuments,
  getHealth,
  getMetricsSummary,
  getRagasRuns,
  getRagasScores,
  getSettings,
  getToken,
  login,
  setToken,
} from './lib/api'

vi.mock('./lib/api')

const ADMIN_USER = { id: 'u1', username: 'admin', role: 'admin' }

function mockOverviewData() {
  getHealth.mockResolvedValue({ status: 'ok' })
  getMetricsSummary.mockResolvedValue({
    documents: 0,
    chunks: 0,
    eval_questions: 0,
    avg_retrieval_ms: null,
    avg_generation_ms: null,
  })
  getSettings.mockResolvedValue({
    chunk_size: 500,
    chunk_overlap: 50,
    chunking_strategy: 'fixed',
    semantic_threshold: 0.75,
    top_k: 5,
  })
  getDocuments.mockResolvedValue({ documents: [] })
  getDataset.mockResolvedValue({ questions: [] })
  getRagasScores.mockResolvedValue({ metrics: [], average: {}, results: [] })
  getRagasRuns.mockResolvedValue({ runs: [] })
}

describe('App auth gating', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockOverviewData()
  })

  it('shows the login screen when there is no stored session', async () => {
    getToken.mockReturnValue(null)

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the main layout directly when a valid session token exists', async () => {
    getToken.mockReturnValue('a-valid-token')
    getCurrentUser.mockResolvedValue(ADMIN_USER)

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    // "admin" is ambiguous on its own - it's both the username and the role
    // badge text (ADMIN_USER's role is also "admin") - scope to the username span.
    expect(document.querySelector('.top-header-username')).toHaveTextContent('admin')
  })

  it('falls back to the login screen when the stored token is rejected', async () => {
    getToken.mockReturnValue('a-stale-token')
    getCurrentUser.mockRejectedValue(new Error('Invalid session token'))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(clearToken).toHaveBeenCalled()
  })

  it('logging in successfully shows the main layout', async () => {
    const user = userEvent.setup()
    getToken.mockReturnValue(null)
    login.mockResolvedValue({ access_token: 'fresh-token', user: ADMIN_USER })

    render(<App />)
    await screen.findByRole('heading', { name: 'Sign in' })

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(setToken).toHaveBeenCalledWith('fresh-token')
  })

  it('logging out clears the session and returns to the login screen', async () => {
    const user = userEvent.setup()
    getToken.mockReturnValue('a-valid-token')
    getCurrentUser.mockResolvedValue(ADMIN_USER)

    render(<App />)
    await screen.findByRole('heading', { name: 'Overview' })

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('a session-expired event drops back to the login screen', async () => {
    getToken.mockReturnValue('a-valid-token')
    getCurrentUser.mockResolvedValue(ADMIN_USER)

    render(<App />)
    await screen.findByRole('heading', { name: 'Overview' })

    act(() => {
      window.dispatchEvent(new Event('ragas-lab:session-expired'))
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
  })
})
