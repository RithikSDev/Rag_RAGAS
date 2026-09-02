import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement scrollIntoView - stub it so components that call it
// (PlaygroundView, scrolling to the latest message) don't crash in tests.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom doesn't implement ResizeObserver, which Recharts' ResponsiveContainer
// (Retrieval Debugger, Compare) needs to measure its container.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom doesn't implement matchMedia, which NavRail uses to auto-collapse at
// narrow viewport widths. Always reports "not matching" - narrow-viewport
// behavior itself is exercised by resizing a real browser, not jsdom.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
