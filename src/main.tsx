import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

console.log('[Main] Starting application...')

try {
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Root element not found')
  }

  const root = ReactDOM.createRoot(rootElement)
  
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
  
  console.log('[Main] Application rendered')
} catch (error) {
  console.error('[Main] Failed to render application:', error)
  // Build the fallback UI with DOM APIs and textContent so that error
  // message/stack content can never be interpreted as HTML (avoids any
  // chance of HTML/script injection via a crafted error string).
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack || '' : String(error)

  document.body.replaceChildren()

  const wrapper = document.createElement('div')
  wrapper.style.cssText =
    'min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #050A1A; color: #F0F2F5; font-family: Inter, sans-serif; padding: 2rem;'

  const inner = document.createElement('div')
  inner.style.cssText = 'text-align: center; max-width: 600px;'

  const heading = document.createElement('h1')
  heading.style.cssText = 'color: #ff4444; margin-bottom: 1rem;'
  heading.textContent = 'Application Failed to Load'

  const messageEl = document.createElement('p')
  messageEl.style.cssText = 'color: #C5CAD3; margin-bottom: 1rem;'
  messageEl.textContent = message

  const stackEl = document.createElement('pre')
  stackEl.style.cssText =
    'background: #11151C; padding: 1rem; border-radius: 0.5rem; overflow: auto; text-align: left; font-size: 0.875rem;'
  stackEl.textContent = stack

  const button = document.createElement('button')
  button.style.cssText =
    'margin-top: 1rem; padding: 0.75rem 1.5rem; background: #DAA520; color: #050A1A; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer;'
  button.textContent = 'Refresh Page'
  button.addEventListener('click', () => window.location.reload())

  inner.append(heading, messageEl, stackEl, button)
  wrapper.append(inner)
  document.body.append(wrapper)
}
