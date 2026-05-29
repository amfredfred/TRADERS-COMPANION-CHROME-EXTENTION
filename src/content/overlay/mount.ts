import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import type { PlatformName } from '../adapters/types'

// CSS is imported as a raw string so we can inject it into the shadow root.
// This scopes all Tailwind styles to the TC overlay and prevents any style
// bleed that could disrupt the trading platform beneath.
import styles from '../../index.css?inline'

let root: Root | null = null
let host: HTMLDivElement | null = null

export function mountOverlay(platformName: PlatformName): { unmount: () => void } {
  if (host) return { unmount: () => unmount() } // already mounted

  host = document.createElement('div')
  host.id = 'tc-extension-host'
  // Zero-size host — the shadow root renders fixed/absolute children
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;'

  const shadow = host.attachShadow({ mode: 'open' })

  // Inject compiled Tailwind CSS into the shadow root
  const style = document.createElement('style')
  style.textContent = styles
  shadow.appendChild(style)

  // React container inside shadow root
  const container = document.createElement('div')
  container.id = 'tc-react-root'
  container.style.cssText = 'font-family:system-ui,sans-serif;'
  shadow.appendChild(container)

  document.documentElement.appendChild(host)

  root = createRoot(container)
  root.render(React.createElement(App, { platformName }))

  return { unmount }
}

function unmount() {
  root?.unmount()
  root = null
  host?.remove()
  host = null
}
