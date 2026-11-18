import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// RTL auto-cleanup only hooks into the test framework when globals are on;
// register it explicitly so each test starts with a fresh DOM.
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
