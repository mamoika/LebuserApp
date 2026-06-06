import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import i18n from './i18n'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
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
