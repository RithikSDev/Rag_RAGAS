import { useEffect, useState } from 'react'
import { dismiss, subscribe } from '../lib/toastStore'

function ToastStack() {
  const [toasts, setToasts] = useState([])

  useEffect(() => subscribe(setToasts), [])

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.type}`} key={toast.id}>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastStack
