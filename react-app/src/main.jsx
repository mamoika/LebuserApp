import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import i18n from './i18n'
import { initSentry, captureError } from './lib/sentry'
import { setupChunkReload } from './lib/chunkReload'

// Inicjalizacja monitoringu błędów. No-op bez VITE_SENTRY_DSN.
initSentry()
// Po deployu stare lazy-chunki znikają z CDN — cichy auto-reload zamiast crasha.
setupChunkReload()

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // React połyka błędy renderu z window.onerror — zgłaszamy je ręcznie.
    captureError(error, { componentStack: info?.componentStack });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding: '20px', color: 'red', background: '#fff', minHeight: '100vh', fontFamily: 'sans-serif'}}>
          <h2>{i18n.t('auth.errorAppCrashed')}</h2>
          <pre style={{whiteSpace: 'pre-wrap', fontSize: '13px'}}>{this.state.error.toString()}</pre>
          <pre style={{whiteSpace: 'pre-wrap', fontSize: '11px', color: '#666'}}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
