import { useEffect, useState } from 'react'
import NavRail from './components/NavRail'
import ChatView from './views/ChatView'
import DocumentsView from './views/DocumentsView'
import EvaluationView from './views/EvaluationView'
import SettingsView from './views/SettingsView'
import { getDocuments } from './lib/api'
import './App.css'

function App() {
  const [view, setView] = useState('chat')
  const [documentCount, setDocumentCount] = useState(0)

  useEffect(() => {
    getDocuments()
      .then((data) => setDocumentCount(data.documents.length))
      .catch(() => {})
  }, [])

  return (
    <div className="layout">
      <NavRail active={view} onSelect={setView} documentCount={documentCount} />

      <div className="content">
        {view === 'chat' && <ChatView />}
        {view === 'evaluation' && <EvaluationView />}
        {view === 'documents' && <DocumentsView onDocumentsChanged={setDocumentCount} />}
        {view === 'settings' && <SettingsView onDocumentsChanged={setDocumentCount} />}
      </div>
    </div>
  )
}

export default App
