import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';

// Strona Lebuser ładowana leniwie — admin-only, nie obciąża głównego bundla.
const LebuserLanding = lazy(() => import('./pages/LebuserLanding'));

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const AdminRoute = ({ children }) => {
  const { user, isAdmin } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const PublicRoute = ({ children }) => {
  const { user } = useAuth();
  if (user) {
    return <Navigate to="/" replace />;
  }
  return children;
};

function useModalScrollLock() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    let locked = false;
    let scrollY = 0;
    let raf = null;
    const body = document.body;
    const root = document.documentElement;

    const hasVisibleModal = () => [...document.querySelectorAll('.ap-overlay, .overlay')]
      .some(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      });

    const lock = () => {
      if (locked) return;
      locked = true;
      scrollY = window.scrollY || root.scrollTop || 0;
      body.classList.add('modal-open');
      root.classList.add('modal-open');
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
    };

    const unlock = () => {
      if (!locked) return;
      locked = false;
      body.classList.remove('modal-open');
      root.classList.remove('modal-open');
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      window.scrollTo(0, scrollY);
    };

    const syncLock = () => {
      raf = null;
      if (hasVisibleModal()) lock();
      else unlock();
    };

    const scheduleSync = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(syncLock);
    };

    const observer = new MutationObserver(scheduleSync);
    observer.observe(body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    syncLock();

    return () => {
      observer.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
      unlock();
    };
  }, []);
}

function App() {
  useModalScrollLock();

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          } />
          <Route path="/register" element={<Navigate to="/login" replace />} />
          <Route path="/lebuser" element={
            <AdminRoute>
              <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
                <LebuserLanding />
              </Suspense>
            </AdminRoute>
          } />
          <Route path="/*" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
