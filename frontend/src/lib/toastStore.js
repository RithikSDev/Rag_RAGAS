const listeners = new Set()
let toasts = []
let nextId = 1

function emit() {
  for (const listener of listeners) {
    listener(toasts)
  }
}

export function subscribe(listener) {
  listeners.add(listener)
  listener(toasts)
  return () => listeners.delete(listener)
}

export function dismiss(id) {
  toasts = toasts.filter((toast) => toast.id !== id)
  emit()
}

export function notify(message, type = 'success', duration = 4000) {
  const id = nextId++
  toasts = [...toasts, { id, message, type }]
  emit()

  setTimeout(() => dismiss(id), duration)

  return id
}

// Test-only: clears all pending toasts so state doesn't leak between tests
// (the store is a module-level singleton, shared across every test in a file).
export function _resetForTests() {
  toasts = []
  emit()
}
