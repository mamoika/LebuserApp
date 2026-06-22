import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import logoImg from '../assets/logo-icon.png';

/**
 * Testowa strona główna w stylu Apple / Glassmorphism — marka LEBUSER.
 * Firma: Lebuser, siedziba ul. Owcza 10, Gorzów Wielkopolski.
 * Treść oparta na profilu lebuser.de (Textilservice od 1876):
 * leasing tekstyliów, wynajem bielizny, odzież robocza, tekstylia dla gastronomii.
 * Renderowana pod osobnym przyciskiem "Lebuser" (tylko dla admina) — NIE jest
 * główną stroną aplikacji.
 */

const services = [
  {
    icon: '♻️',
    title: 'Leasing tekstyliów',
    desc: 'Certyfikowane tekstylia w obiegu zamkniętym. Płacisz tylko za to, co wynajęte i wyprane — bez inwestycji w zapasy.',
  },
  {
    icon: '🛏️',
    title: 'Wynajem bielizny',
    desc: 'Pościel, ręczniki i obrusy dostarczane regularnie, czyste i gotowe do użycia. Brudne wymieniamy na świeże.',
  },
  {
    icon: '🍽️',
    title: 'Tekstylia dla gastronomii',
    desc: 'Obrusy, serwety i bielizna stołowa dla restauracji i hoteli — spójny, profesjonalny wygląd Twojego lokalu.',
  },
  {
    icon: '🦺',
    title: 'Odzież robocza',
    desc: 'Wynajem i serwis odzieży roboczej oraz ochronnej dla całego zespołu, z regularnym praniem i wymianą.',
  },
  {
    icon: '🧼',
    title: 'Pranie i serwis',
    desc: 'Kompleksowe czyszczenie produktów tekstylnych. Odbieramy, pierzemy i odwozimy — Ty zajmujesz się biznesem.',
  },
  {
    icon: '🌱',
    title: 'Ekologia i oszczędność',
    desc: 'Tekstylia wielorazowe zamiast jednorazowych: lepszy łańcuch dostaw, mniejszy ślad środowiskowy i realne oszczędności.',
  },
];

const benefits = [
  'Wspieramy rozwój Twojego biznesu',
  'Optymalizujemy procesy obsługi tekstyliów',
  'Budujemy trwałe, długofalowe relacje',
  'Płacisz tylko za wynajęte i wyprane sztuki',
  'Dbamy o środowisko dzięki obiegowi zamkniętemu',
  'Generujemy realne oszczędności finansowe',
];

const audience = [
  'Hotele', 'Restauracje', 'Kawiarnie', 'Ośrodki wypoczynkowe',
  'Placówki medyczne', 'Zakłady produkcyjne', 'Firmy sprzątające', 'Catering',
];

const stats = [
  { value: 'od 1876', label: 'tradycja Textilservice' },
  { value: 'Gorzów', label: 'Wielkopolski · siedziba' },
  { value: '100%', label: 'obieg zamknięty' },
  { value: 'pay-per-use', label: 'płacisz za użycie' },
];

const Arrow = () => (
  <svg className="lw-arrow" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function LebuserLanding() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'LEBUSER · Textilservice od 1876';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="lw-root">
      <style>{css}</style>

      {/* Tła / blobs */}
      <div className="lw-bg" aria-hidden="true">
        <span className="lw-blob lw-blob-1" />
        <span className="lw-blob lw-blob-2" />
        <span className="lw-blob lw-blob-3" />
        <span className="lw-grid-overlay" />
      </div>

      {/* Powrót do aplikacji */}
      <Link to="/" className="lw-back">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H4M7.5 4l-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Powrót do aplikacji
      </Link>

      <div className="lw-container">
        {/* Hero */}
        <header className="lw-hero">
          <img src={logoImg} alt="LEBUSER Textilservice" className="lw-logo lw-reveal" />
          <span className="lw-pill lw-reveal" style={{ animationDelay: '0.04s' }}>
            Textilservice od 1876 · Gorzów Wielkopolski
          </span>
          <h1 className="lw-h1 lw-reveal" style={{ animationDelay: '0.08s' }}>
            Leasing tekstyliów dla<br />gastronomii i hoteli
          </h1>
          <p className="lw-lead lw-reveal" style={{ animationDelay: '0.12s' }}>
            Wynajem, pranie i dostawa tekstyliów w jednym serwisie. Wspieramy rozwój
            Twojego biznesu i optymalizujemy procesy — a Ty płacisz tylko za tekstylia,
            które wynajmujesz i pierzesz.
          </p>
          <div className="lw-cta lw-reveal" style={{ animationDelay: '0.16s' }}>
            <a className="lw-btn lw-btn-primary" href="mailto:info@lebuser.de">
              Zapytaj o ofertę <Arrow />
            </a>
            <a className="lw-btn lw-btn-ghost" href="#uslugi">Zobacz usługi</a>
          </div>

          {/* Fale — motyw z logo */}
          <svg className="lw-waves" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
            <path className="lw-w1" d="M0,42 C200,92 400,2 600,42 C800,82 1000,12 1200,52 L1200,120 L0,120 Z" />
            <path className="lw-w2" d="M0,72 C200,32 400,102 600,62 C800,22 1000,92 1200,57 L1200,120 L0,120 Z" />
          </svg>
        </header>

        {/* Statystyki */}
        <section className="lw-stats lw-reveal">
          {stats.map((s) => (
            <div className="lw-card lw-stat" key={s.label}>
              <div className="lw-stat-value">{s.value}</div>
              <div className="lw-stat-label">{s.label}</div>
            </div>
          ))}
        </section>

        {/* Usługi */}
        <section id="uslugi" className="lw-section">
          <div className="lw-head lw-reveal">
            <span className="lw-eyebrow">USŁUGI</span>
            <h2 className="lw-h2">Tekstylia w jednym serwisie</h2>
            <p className="lw-sub">Od leasingu i wynajmu po pranie, dostawę i wymianę — wszystko po naszej stronie.</p>
          </div>
          <div className="lw-grid">
            {services.map((srv, i) => (
              <article
                className="lw-card lw-service lw-reveal"
                key={srv.title}
                style={{ animationDelay: `${0.05 * i}s` }}
              >
                <div className="lw-service-icon">{srv.icon}</div>
                <h3 className="lw-service-title">{srv.title}</h3>
                <p className="lw-service-desc">{srv.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Branże */}
        <section className="lw-section">
          <div className="lw-head lw-reveal">
            <span className="lw-eyebrow">DLA KOGO</span>
            <h2 className="lw-h2">Branże, które obsługujemy</h2>
          </div>
          <div className="lw-tags lw-reveal">
            {audience.map((a) => <span className="lw-tag" key={a}>{a}</span>)}
          </div>
        </section>

        {/* Dlaczego my */}
        <section className="lw-card lw-about lw-reveal">
          <span className="lw-eyebrow">DLACZEGO LEBUSER</span>
          <h2 className="lw-h2" style={{ textAlign: 'left', margin: '8px 0 14px' }}>
            Tradycja od 1876 w nowoczesnym wydaniu
          </h2>
          <p>
            Łączymy ponad stuletnie doświadczenie Textilservice z nowoczesnym, wielorazowym
            modelem obsługi tekstyliów. Zamiast kupować i magazynować — wynajmujesz, a my
            dbamy o pranie, dostawę i wymianę.
          </p>
          <ul className="lw-list">
            {benefits.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </section>

        {/* Kontakt */}
        <section className="lw-card lw-contact lw-reveal">
          <div className="lw-contact-info">
            <span className="lw-eyebrow">KONTAKT</span>
            <h2 className="lw-h2" style={{ textAlign: 'left', margin: '8px 0 16px' }}>
              Porozmawiajmy o Twoich tekstyliach
            </h2>
            <ul className="lw-contact-list">
              <li><span className="lw-ci">📍</span> ul. Owcza 10, 66-400 Gorzów Wielkopolski</li>
              <li><span className="lw-ci">📞</span> <a href="tel:+48957226040">+48 95 722 60 40</a></li>
              <li><span className="lw-ci">✉️</span> <a href="mailto:info@lebuser.de">info@lebuser.de</a></li>
            </ul>
          </div>
          <div className="lw-contact-actions">
            <a className="lw-btn lw-btn-primary" href="mailto:info@lebuser.de">Napisz do nas <Arrow /></a>
            <a className="lw-btn lw-btn-ghost" href="tel:+48957226040">Zadzwoń</a>
          </div>
        </section>

        <footer className="lw-footer">
          LEBUSER · Textilservice od 1876 · ul. Owcza 10, Gorzów Wielkopolski — strona testowa
        </footer>
      </div>
    </div>
  );
}

const css = `
.lw-root {
  --lb-deep: #063b52;
  --lb-primary: #0a5e84;
  --lb-mid: #1488ab;
  --lb-aqua: #36b6c4;
  --lb-ink: #0a2c3b;
  --lb-card-shadow: 0 1px 2px rgba(6,59,82,0.06), 0 12px 32px rgba(6,59,82,0.10);
  --lb-card-shadow-hi: 0 1px 2px rgba(6,59,82,0.08), 0 26px 60px rgba(6,59,82,0.20);

  position: relative;
  min-height: 100vh;
  margin: 0;
  padding: clamp(64px, 8vw, 96px) clamp(16px, 4vw, 48px) 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
  color: var(--lb-ink);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(110% 110% at 0% -10%, #e2f3f8 0%, transparent 50%),
    radial-gradient(110% 110% at 100% 0%, #dbeff7 0%, transparent 52%),
    linear-gradient(168deg, #f1f8fb 0%, #e4eff4 60%, #dfeaf1 100%);
}
.lw-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.lw-blob {
  position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.48;
  animation: lw-float 20s ease-in-out infinite;
}
.lw-blob-1 { width: 400px; height: 400px; top: -100px; left: -80px; background: #5fb6d6; }
.lw-blob-2 { width: 460px; height: 460px; top: 90px; right: -120px; background: #4fd0cf; animation-delay: -7s; }
.lw-blob-3 { width: 340px; height: 340px; bottom: -100px; left: 30%; background: #86c9e8; animation-delay: -13s; }
.lw-grid-overlay {
  position: absolute; inset: 0; opacity: 0.4;
  background-image:
    linear-gradient(rgba(10,94,132,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(10,94,132,0.04) 1px, transparent 1px);
  background-size: 44px 44px;
  -webkit-mask-image: radial-gradient(120% 80% at 50% 0%, #000 0%, transparent 70%);
  mask-image: radial-gradient(120% 80% at 50% 0%, #000 0%, transparent 70%);
}
@keyframes lw-float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(24px, -30px) scale(1.08); }
}

.lw-container { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto; }

/* Powrót do aplikacji */
.lw-back {
  position: fixed; top: 20px; left: 20px; z-index: 20;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: 999px; font-size: 14px; font-weight: 650;
  color: var(--lb-primary); text-decoration: none;
  background: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.9);
  backdrop-filter: blur(14px) saturate(180%); -webkit-backdrop-filter: blur(14px) saturate(180%);
  box-shadow: 0 8px 22px rgba(6,59,82,0.14);
  transition: transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s ease, background 0.2s ease;
}
.lw-back svg { width: 16px; height: 16px; transition: transform 0.2s ease; }
.lw-back:hover { transform: translateY(-2px); background: rgba(255,255,255,0.9); box-shadow: 0 12px 28px rgba(6,59,82,0.2); }
.lw-back:hover svg { transform: translateX(-3px); }

.lw-card {
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(24px) saturate(185%);
  -webkit-backdrop-filter: blur(24px) saturate(185%);
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: 26px;
  box-shadow: var(--lb-card-shadow), inset 0 1px 0 rgba(255,255,255,0.65);
}

/* HERO */
.lw-hero { position: relative; text-align: center; padding: 12px 0 72px; }
.lw-logo { height: clamp(40px, 6vw, 56px); width: auto; margin: 0 auto 22px; display: block; }
.lw-pill {
  display: inline-block; padding: 7px 16px; border-radius: 999px;
  background: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.9);
  backdrop-filter: blur(12px); font-size: 12.5px; font-weight: 700;
  color: var(--lb-primary); letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 22px;
  box-shadow: 0 6px 18px rgba(10,94,132,0.12);
}
.lw-h1 {
  font-size: clamp(36px, 6.2vw, 62px); line-height: 1.04; letter-spacing: -0.025em;
  font-weight: 800; margin: 0 0 18px;
  background: linear-gradient(118deg, var(--lb-deep) 0%, var(--lb-primary) 52%, var(--lb-aqua) 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.lw-lead {
  max-width: 640px; margin: 0 auto 30px; font-size: clamp(16px, 2.1vw, 19px);
  line-height: 1.58; color: rgba(10,44,59,0.74);
}
.lw-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

.lw-waves {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: -1px;
  width: 100vw; height: 120px; display: block; pointer-events: none;
  -webkit-mask-image: linear-gradient(to bottom, #000 25%, transparent 96%);
  mask-image: linear-gradient(to bottom, #000 25%, transparent 96%);
}
.lw-waves .lw-w1 { fill: var(--lb-aqua); opacity: 0.22; }
.lw-waves .lw-w2 { fill: var(--lb-primary); opacity: 0.34; }

/* BUTTONS */
.lw-btn {
  display: inline-flex; align-items: center; gap: 8px; justify-content: center;
  padding: 13px 24px; border-radius: 14px; font-size: 15px; font-weight: 650;
  text-decoration: none; cursor: pointer; border: 1px solid transparent;
  transition: transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s ease, background 0.2s ease;
}
.lw-arrow { width: 16px; height: 16px; transition: transform 0.2s ease; }
.lw-btn:hover { transform: translateY(-2px); }
.lw-btn:hover .lw-arrow { transform: translateX(3px); }
.lw-btn-primary {
  color: #fff; background: linear-gradient(135deg, var(--lb-primary), var(--lb-aqua));
  box-shadow: 0 10px 24px rgba(10,94,132,0.36);
}
.lw-btn-primary:hover { box-shadow: 0 14px 30px rgba(10,94,132,0.44); }
.lw-btn-ghost {
  color: var(--lb-primary); background: rgba(255,255,255,0.66);
  border-color: rgba(255,255,255,0.9); backdrop-filter: blur(12px);
}
.lw-btn-ghost:hover { background: rgba(255,255,255,0.85); }

/* STATS */
.lw-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 64px;
}
.lw-stat { position: relative; padding: 24px 16px; text-align: center; overflow: hidden; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.lw-stat::before {
  content: ''; position: absolute; top: 0; left: 22%; right: 22%; height: 3px; border-radius: 0 0 4px 4px;
  background: linear-gradient(90deg, var(--lb-primary), var(--lb-aqua));
}
.lw-stat:hover { transform: translateY(-3px); box-shadow: var(--lb-card-shadow-hi); }
.lw-stat-value { font-size: clamp(20px, 2.8vw, 28px); font-weight: 800; color: var(--lb-deep); letter-spacing: -0.01em; }
.lw-stat-label { font-size: 12.5px; color: rgba(10,44,59,0.6); margin-top: 5px; }

/* SECTION HEAD */
.lw-section { margin-bottom: 64px; }
.lw-head { text-align: center; max-width: 620px; margin: 0 auto 30px; }
.lw-eyebrow {
  display: inline-block; font-size: 12px; font-weight: 800; letter-spacing: 1.6px;
  color: var(--lb-mid); margin-bottom: 10px;
}
.lw-h2 { font-size: clamp(25px, 3.6vw, 36px); font-weight: 800; letter-spacing: -0.02em; margin: 0; color: var(--lb-ink); }
.lw-sub { margin: 12px 0 0; font-size: 16px; line-height: 1.55; color: rgba(10,44,59,0.66); }

/* SERVICES */
.lw-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.lw-service { position: relative; padding: 28px 24px; transition: transform 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s ease, border-color 0.22s ease; }
.lw-service:hover { transform: translateY(-5px); box-shadow: var(--lb-card-shadow-hi); border-color: rgba(54,182,196,0.55); }
.lw-service-icon {
  width: 56px; height: 56px; border-radius: 17px; display: flex; align-items: center;
  justify-content: center; font-size: 27px; margin-bottom: 16px;
  background: linear-gradient(135deg, rgba(10,94,132,0.16), rgba(54,182,196,0.18));
  border: 1px solid rgba(255,255,255,0.8);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
}
.lw-service-title { font-size: 18px; font-weight: 700; margin: 0 0 8px; color: var(--lb-ink); }
.lw-service-desc { font-size: 14.5px; line-height: 1.56; color: rgba(10,44,59,0.68); margin: 0; }

/* TAGS */
.lw-tags { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-width: 760px; margin: 0 auto; }
.lw-tag {
  padding: 10px 18px; border-radius: 999px; font-size: 14px; font-weight: 650; color: var(--lb-ink);
  background: rgba(255,255,255,0.64); border: 1px solid rgba(255,255,255,0.85);
  backdrop-filter: blur(12px); box-shadow: 0 6px 16px rgba(6,59,82,0.07);
  transition: transform 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
}
.lw-tag:hover { transform: translateY(-2px); color: var(--lb-primary); box-shadow: 0 10px 22px rgba(6,59,82,0.12); }

/* ABOUT */
.lw-about { padding: 38px 36px; margin-bottom: 24px; }
.lw-about p { font-size: 16px; line-height: 1.62; color: rgba(10,44,59,0.76); margin: 0; max-width: 760px; }
.lw-list { margin: 22px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 28px; }
.lw-list li { position: relative; padding-left: 30px; font-size: 15px; color: rgba(10,44,59,0.84); line-height: 1.45; }
.lw-list li::before {
  content: '✓'; position: absolute; left: 0; top: -1px; width: 20px; height: 20px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, var(--lb-primary), var(--lb-aqua));
}

/* CONTACT */
.lw-contact {
  padding: 36px 36px; margin-bottom: 32px; display: flex; align-items: center;
  justify-content: space-between; gap: 28px; flex-wrap: wrap;
}
.lw-contact-info { flex: 1 1 320px; }
.lw-contact-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.lw-contact-list li { display: flex; align-items: center; gap: 12px; font-size: 15.5px; color: rgba(10,44,59,0.82); }
.lw-contact-list a { color: var(--lb-primary); text-decoration: none; font-weight: 650; }
.lw-contact-list a:hover { text-decoration: underline; }
.lw-ci {
  width: 34px; height: 34px; flex-shrink: 0; border-radius: 11px; display: flex; align-items: center;
  justify-content: center; font-size: 16px;
  background: linear-gradient(135deg, rgba(10,94,132,0.14), rgba(54,182,196,0.16));
  border: 1px solid rgba(255,255,255,0.8);
}
.lw-contact-actions { display: flex; flex-direction: column; gap: 12px; }

.lw-footer { text-align: center; font-size: 13px; color: rgba(10,44,59,0.5); padding-top: 8px; }

/* REVEAL */
.lw-reveal { animation: lw-rise 0.75s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes lw-rise {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 860px) {
  .lw-stats { grid-template-columns: repeat(2, 1fr); }
  .lw-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .lw-grid { grid-template-columns: 1fr; }
  .lw-list { grid-template-columns: 1fr; }
  .lw-contact { flex-direction: column; align-items: stretch; }
  .lw-contact-actions { flex-direction: row; }
  .lw-contact-actions .lw-btn { flex: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .lw-reveal, .lw-blob { animation: none; }
}
`;
