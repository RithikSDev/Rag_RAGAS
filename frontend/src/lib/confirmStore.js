const listeners = new Set()
let pending = null

function emit() {
  for (const listener of listeners) {
    listener(pending)
  }
}

export function subscribe(listener) {
  listeners.add(listener)
  listener(pending)
  return () => listeners.delete(listener)
}

export function confirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    pending = {
      title,
      message,
      confirmLabel,
      cancelLabel,
      respond: (value) => {
        pending = null
        emit()
        resolve(value)
      },
    }
    emit()
  })
}

// Test-only: clears a lingering pending request so state doesn't leak
// between tests (the store is a module-level singleton, shared per file).
export function _resetForTests() {
  pending = null
  emit()
}
