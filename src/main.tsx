import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { completeLogin } from './lib/spotify-auth'
import './theme.css'

const root = createRoot(document.getElementById('root')!)

/**
 * The OAuth redirect lands on /callback with ?code=… . Exchange it, then put
 * the user back on a clean URL so the code never lingers in history.
 */
async function boot() {
  if (window.location.pathname === '/callback') {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    const code = params.get('code')

    if (code) {
      try {
        await completeLogin(code)
      } catch (err) {
        console.error('Spotify sign-in failed:', err)
      }
    } else if (error) {
      console.error('Spotify sign-in was declined:', error)
    }

    window.history.replaceState({}, '', '/')
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
