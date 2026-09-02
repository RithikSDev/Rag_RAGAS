import { useEffect, useRef, useState } from 'react'
import { confirm } from '../lib/confirmStore'
import {
  createDatasetQuestion,
  deleteDatasetQuestion,
  getDataset,
  importDataset,
  updateDatasetQuestion,
} from '../lib/api'
import { notify } from '../lib/toastStore'

const EMPTY_FORM = { user_input: '', reference: '' }

function formatTimestamp(value) {
  return new Date(value).toLocaleString()
}

function DatasetView({ onDatasetChanged }) {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newForm, setNewForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const data = await getDataset()
      setQuestions(data.questions)
      onDatasetChanged?.(data.questions.length)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(event) {
    event.preventDefault()

    if (!newForm.user_input.trim() || !newForm.reference.trim() || creating) {
      return
    }

    setCreating(true)
    setError(null)

    try {
      await createDatasetQuestion(newForm)
      setNewForm(EMPTY_FORM)
      await load()
      notify('Question added to the dataset')
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  function startEdit(question) {
    setEditingId(question.id)
    setEditForm({ user_input: question.user_input, reference: question.reference })
  }

  async function handleSaveEdit(id) {
    setError(null)

    try {
      await updateDatasetQuestion(id, editForm)
      setEditingId(null)
      await load()
      notify('Question updated')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    const confirmed = await confirm({
      title: 'Delete this question?',
      message: 'It will be removed from the evaluation dataset. This cannot be undone.',
      confirmLabel: 'Delete',
    })

    if (!confirmed) return

    setError(null)

    try {
      await deleteDatasetQuestion(id)
      await load()
      notify('Question deleted')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    setError(null)
    setImportResult(null)

    try {
      const result = await importDataset(file)
      setImportResult(result)
      await load()
      notify(`Imported ${result.imported} question(s)`)
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Dataset</h1>
          <p>The question/reference pairs the pipeline is evaluated against.</p>
        </div>
        <label className="secondary-button upload-button">
          {importing ? 'Importing…' : 'Import CSV/JSON'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            onChange={handleImport}
            disabled={importing}
            hidden
          />
        </label>
      </div>

      {error && <div className="error">{error}</div>}

      {importResult && (
        <div className="import-result">
          Imported {importResult.imported} question(s).
        </div>
      )}

      <form className="dataset-add-form" onSubmit={handleCreate}>
        <textarea
          className="dataset-textarea"
          placeholder="New question…"
          value={newForm.user_input}
          onChange={(event) => setNewForm((prev) => ({ ...prev, user_input: event.target.value }))}
        />
        <textarea
          className="dataset-textarea"
          placeholder="Reference answer…"
          value={newForm.reference}
          onChange={(event) => setNewForm((prev) => ({ ...prev, reference: event.target.value }))}
        />
        <button
          type="submit"
          className="primary-button"
          disabled={creating || !newForm.user_input.trim() || !newForm.reference.trim()}
        >
          {creating ? 'Adding…' : 'Add question'}
        </button>
      </form>

      {!loading && questions.length === 0 && (
        <div className="empty-state">
          <p>No dataset questions yet.</p>
          <p className="empty-state-hint">Add one above, or import a CSV/JSON file.</p>
        </div>
      )}

      {questions.length > 0 && (
        <div className="dataset-list">
          {questions.map((question) => (
            <div className="dataset-card" key={question.id}>
              {editingId === question.id ? (
                <div className="dataset-edit-form">
                  <textarea
                    className="dataset-textarea"
                    value={editForm.user_input}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, user_input: event.target.value }))}
                  />
                  <textarea
                    className="dataset-textarea"
                    value={editForm.reference}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, reference: event.target.value }))}
                  />
                  <div className="dataset-card-actions">
                    <button type="button" className="primary-button" onClick={() => handleSaveEdit(question.id)}>
                      Save
                    </button>
                    <button type="button" className="secondary-button" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="dataset-card-body">
                    <p className="dataset-question-text">{question.user_input}</p>
                    <p className="dataset-reference-text">{question.reference}</p>
                    <div className="dataset-card-meta">
                      <span className="dataset-source-badge">{question.source}</span>
                      <span>{formatTimestamp(question.created_at)}</span>
                      <span>by {question.created_by}</span>
                    </div>
                  </div>
                  <div className="dataset-card-actions">
                    <button type="button" className="secondary-button" onClick={() => startEdit(question)}>
                      Edit
                    </button>
                    <button type="button" className="retry-button" onClick={() => handleDelete(question.id)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DatasetView
