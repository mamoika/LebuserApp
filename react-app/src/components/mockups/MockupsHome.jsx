import { ArrowRight, ClipboardList, Route } from 'lucide-react';
import { Link } from 'react-router-dom';
import './mockups.css';

export default function MockupsHome() {
  return (
    <section className="mock-home" aria-labelledby="mock-home-title">
      <div className="mock-kicker">Nowy model kursów</div>
      <h1 id="mock-home-title">Dwa proste ekrany, jeden spójny kurs</h1>
      <p className="mock-home-lead">
        Makiety rozdzielają zarządzanie całym dniem od pracy kierowcy. Dane są przykładowe i nic nie jest zapisywane w bazie.
      </p>

      <div className="mock-home-grid">
        <Link to="/mock/dyspozytornia" className="mock-home-card">
          <span className="mock-home-icon" aria-hidden="true"><ClipboardList size={24} /></span>
          <span>
            <strong>Dyspozytornia administratora</strong>
            <small>Planowanie, postęp, problemy, rozliczenie i dziennik kursu.</small>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>

        <Link to="/mock/kierowca" className="mock-home-card">
          <span className="mock-home-icon is-green" aria-hidden="true"><Route size={24} /></span>
          <span>
            <strong>Karta kursu kierowcy</strong>
            <small>Następny klient, zadania, nawigacja i zakończenie przystanku.</small>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
