import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement scrollIntoView - stub it so components that call it
// (ChatView, scrolling to the latest message) don't crash in tests.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
