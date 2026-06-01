import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Link, useNavigate } from 'react-router-dom';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    // 1. Rejestracja w auth
    const { data, error: signUpError } = await supabase.auth.signUp({ 
      email, 
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // 2. Aktualizacja wygenerowanego profilu kierowcy (zmieniamy name na to co wpisal uzytkownik)
    // Trigger stworzyl profil z domyslnym name = email_prefix.
    if (data.user) {
      const { error: updateError } = await supabase
        .from('drivers')
        .update({ name: name })
        .eq('auth_id', data.user.id);
        
      if (updateError) {
        console.error("Błąd aktualizacji imienia:", updateError);
      }
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '16px', textAlign: 'center', maxWidth: '400px' }}>
          <h2 style={{ color: 'var(--accent-green)', marginBottom: '15px' }}>Sukces!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Twoje konto zostało utworzone. Poczekaj, aż Administrator przypisze Ci trasy, a następnie się zaloguj.
          </p>
          <button onClick={() => navigate('/login')} style={{ background: 'var(--accent-blue)', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            Przejdź do logowania
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
      <div className="login-box" style={{ background: 'var(--bg-card)', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', color: 'var(--text-primary)', marginBottom: '20px' }}>Utwórz Konto</h2>
        
        {error && <div style={{ color: '#721c24', background: '#f8d7da', padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '14px' }}>{error}</div>}
        
        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>Imię i Nazwisko</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
              style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>Adres Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
              style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>Hasło (min. 6 znaków)</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
              minLength={6}
              style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            />
          </div>
          <button type="submit" disabled={loading} style={{ background: 'var(--accent-blue)', color: 'white', padding: '14px', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>
            {loading ? 'Tworzenie konta...' : 'Zarejestruj się'}
          </button>
        </form>
        
        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Masz już konto? <Link to="/login" style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 'bold' }}>Zaloguj się</Link>
        </div>
      </div>
    </div>
  );
}
