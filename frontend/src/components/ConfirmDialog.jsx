import { useEffect, useRef, useState } from 'react'
import { subscribe } from '../lib/confirmStore'

function ConfirmDialog() {
  const [request, setRequest] = useState(null)
  const confirmButtonRef = useRef(null)

  useEffect(() => subscribe(setRequest), [])

  useEffect(() => {
    if (!request) return

    confirmButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        request.respond(false)
      } else if (event.key === 'Tab') {
        // Simple two-control focus trap - Cancel and Confirm are the only
        // focusable elements in the dialog.
        event.preventDefault()
        const focusables = [document.querySelector('.confirm-cancel'), confirmButtonRef.current]
        const currentIndex = focusables.indexOf(document.activeElement)
        const next = event.shiftKey
          ? focusables[(currentIndex - 1 + focusables.length) % focusables.length]
          : focusables[(currentIndex + 1) % focusables.length]
        next?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [request])

  if (!request) {
    return null
  }

  return (
    <div className="confirm-backdrop" onClick={() => request.respond(false)}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-dialog-title">{request.title}</h3>
        <p>{request.message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="secondary-button confirm-cancel" onClick={() => request.respond(false)}>
            {request.cancelLabel}
          </button>
          <button
            type="button"
            className="retry-button confirm-confirm"
            ref={confirmButtonRef}
            onClick={() => request.respond(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
