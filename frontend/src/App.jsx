import { useEffect, useState } from 'react'
import ConfirmDialog from './components/ConfirmDialog'
import NavRail from './components/NavRail'
import ToastStack from './components/ToastStack'
import TopHeader from './components/TopHeader'
import CompareView from './views/CompareView'
import DatasetView from './views/DatasetView'
import EvaluationView from './views/EvaluationView'
import ExperimentsView from './views/ExperimentsView'
import KnowledgeBaseView from './views/KnowledgeBaseView'
import LoginView from './views/LoginView'
import OverviewView from './views/OverviewView'
import PlaygroundView from './views/PlaygroundView'
import RetrievalDebuggerView from './views/RetrievalDebuggerView'
import SettingsView from './views/SettingsView'
import { clearToken, getCurrentUser, getDataset, getDocuments, getToken, logout } from './lib/api'
import './App.css'

const TITLES = {
  overview: 'Overview',
  'knowledge-base': 'Knowledge Base',
  playground: 'RAG Playground',
  evaluation: 'Evaluation',
  'retrieval-debugger': 'Retrieval Debugger',
  experiments: 'Experiments',
  dataset: 'Dataset',
  compare: 'Compare',
  settings: 'Settings',
}

function App() {
  const [view, setView] = useState('overview')
  const [documentCount, setDocumentCount] = useState(0)
  const [datasetCount, setDatasetCount] = useState(0)
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      setAuthChecked(true)
      return
    }

    getCurrentUser()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    function handleSessionExpired() {
      setUser(null)
    }

    window.addEventListener('ragas-lab:session-expired', handleSessionExpired)
    return () => window.removeEventListener('ragas-lab:session-expired', handleSessionExpired)
  }, [])

  useEffect(() => {
    if (!user) return

    getDocuments()
      .then((data) => setDocumentCount(data.documents.length))
      .catch(() => {})

    getDataset()
      .then((data) => setDatasetCount(data.questions.length))
      .catch(() => {})
  }, [user])

  function handleLogout() {
    logout()
    setUser(null)
    setView('overview')
  }

  if (!authChecked) {
    return null
  }

  if (!user) {
    return <LoginView onLoggedIn={setUser} />
  }

  return (
    <div className="layout">
      <NavRail active={view} onSelect={setView} documentCount={documentCount} />

      <div className="content">
        <TopHeader
          title={TITLES[view] ?? 'RAGAS LAB'}
          documentCount={documentCount}
          datasetCount={datasetCount}
          user={user}
          onLogout={handleLogout}
        />

        <div className="content-body" key={view}>
          {view === 'overview' && <OverviewView onNavigate={setView} />}
          {view === 'knowledge-base' && <KnowledgeBaseView onDocumentsChanged={setDocumentCount} />}
          {view === 'playground' && <PlaygroundView />}
          {view === 'evaluation' && <EvaluationView onNavigate={setView} />}
          {view === 'retrieval-debugger' && <RetrievalDebuggerView />}
          {view === 'experiments' && <ExperimentsView onNavigate={setView} />}
          {view === 'dataset' && <DatasetView onDatasetChanged={setDatasetCount} />}
          {view === 'compare' && <CompareView />}
          {view === 'settings' && <SettingsView onDocumentsChanged={setDocumentCount} currentUser={user} />}
        </div>
      </div>

      <ToastStack />
      <ConfirmDialog />
    </div>
  )
}

export default App
