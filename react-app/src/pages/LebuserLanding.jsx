import { useEffect } from 'react';

/**
 * Testowa strona główna pralni w stylu Apple / Glassmorphism.
 * Treść oparta na informacjach ze strony profiwash.pl.
 * Renderowana pod osobnym przyciskiem "Lebuser" (tylko dla admina) — NIE jest
 * główną stroną aplikacji Lebuser.
 */

const services = [
  {
    icon: '🛏️',
    title: 'Pranie bielizny i tekstyliów',
    desc: 'Pranie wodne bielizny pościelowej, obrusów, firan, ręczników oraz tekstyliów domowych — z prasowaniem i wykończeniem.',
  },
  {
    icon: '🦺',
    title: 'Odzież robocza i ochronna',
    desc: 'Pranie i wykończenie fartuchów, uniformów i odzieży roboczej. Możliwe trwałe znakowanie nazwą lub logo firmy.',
  },
  {
    icon: '🧪',
    title: 'Pranie chemiczne',
    desc: 'Pranie chemiczne garniturów, garderoby wyjściowej, tkanin delikatnych, a także sukni ślubnych, futer, kołder i poduszek.',
  },
  {
    icon: '🧼',
    title: 'Dezynfekcja i odplamianie',
    desc: 'Pełna dezynfekcja materacy i kołder, usuwanie plam oraz dekatyzowanie i drobne naprawy krawieckie.',
  },
  {
    icon: '🧶',
    title: 'Czyszczenie dywanów',
    desc: 'Trzepanie i pranie dywanów wraz z praniem frędzli — z dbałością o strukturę i kolor.',
  },
  {
    icon: '🚚',
    title: 'Transport i doradztwo',
    desc: 'Odbiór i dostawa własnym taborem do przewozu wózków z bielizną oraz doradztwo w zakresie tekstyliów.',
  },
];

const audience = [
  'Hotele', 'Restauracje', 'Ośrodki wypoczynkowe', 'Placówki medyczne',
  'Wojsko i służby', 'Firmy sprzątające', 'Zakłady produkcyjne', 'Klienci indywidualni',
];

const locations = [
  { city: 'Gorzów Wielkopolski', addr: 'ul. Owcza 10, 66-400', phone: '+48 95 722 60 40' },
  { city: 'Dobiegniew', addr: 'Auto SPA Donata, ks. Ściegiennego 1', phone: '+48 516 171 353' },
  { city: 'Sieraków', addr: 'Pogotowie Krawieckie, Pl. Powstańców Wlkp. 10', phone: '+48 692 146 773' },
];

const stats = [
  { value: 'od 1951', label: 'lat doświadczenia' },
  { value: '65+', label: 'lat na rynku' },
  { value: '2000 m²', label: 'powierzchni zakładu' },
  { value: 'ISO', label: '9001 · 14001' },
];

export default function LebuserLanding() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Profiwash — Profesjonalny serwis usług pralniczych';
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
      </div>

      <div className="lw-container">
        {/* Hero */}
        <header className="lw-hero lw-reveal">
          <span className="lw-pill">Profiwash · dawniej Pralex</span>
          <h1 className="lw-h1">Profesjonalny serwis usług pralniczych</h1>
          <p className="lw-lead">
            Dostosowujemy nasz serwis do Państwa potrzeb. Działalność pralniczą prowadzimy
            nieprzerwanie od 1951 roku — obsługujemy zachodnią Polskę (lubuskie i okolice)
            oraz Niemcy, z własnym taborem i nowoczesnym parkiem maszynowym.
          </p>
          <div className="lw-cta">
            <a className="lw-btn lw-btn-primary" href="tel:+48957226040">Zadzwoń: +48 95 722 60 40</a>
            <a className="lw-btn lw-btn-ghost" href="#uslugi">Zobacz usługi</a>
          </div>
        </header>

        {/* Statystyki */}
        <section className="lw-stats lw-reveal" style={{ animationDelay: '0.08s' }}>
          {stats.map((s) => (
            <div className="lw-card lw-stat" key={s.label}>
              <div className="lw-stat-value">{s.value}</div>
              <div className="lw-stat-label">{s.label}</div>
            </div>
          ))}
        </section>

        {/* Usługi */}
        <section id="uslugi" className="lw-section">
          <h2 className="lw-h2 lw-reveal">Nasze usługi</h2>
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

        {/* Dla kogo */}
        <section className="lw-section">
          <h2 className="lw-h2 lw-reveal">Dla kogo pracujemy</h2>
          <div className="lw-tags lw-reveal">
            {audience.map((a) => (
              <span className="lw-tag" key={a}>{a}</span>
            ))}
          </div>
        </section>

        {/* O nas */}
        <section className="lw-card lw-about lw-reveal">
          <h2 className="lw-h2" style={{ marginTop: 0 }}>Dlaczego my?</h2>
          <p>
            Od ponad 65 lat świadczymy kompleksowe usługi pralnicze dla hoteli, ośrodków
            wypoczynkowych oraz zakładów przemysłowych i spożywczych. Oddajemy bieliznę
            wyprasowaną i pachnącą świeżością.
          </p>
          <ul className="lw-list">
            <li>Doświadczona i wysoko wykwalifikowana kadra</li>
            <li>Środki piorące najwyższej jakości z automatycznym dozowaniem</li>
            <li>Pełna dezynfekcja, zgodność z normami ochrony środowiska</li>
            <li>Trwałe znakowanie tekstyliów nazwą lub logo firmy</li>
            <li>Rabaty dla stałych klientów i przyspieszone terminy realizacji</li>
            <li>Własny tabor do transportu wózków z bielizną</li>
          </ul>
        </section>

        {/* Kontakt */}
        <section className="lw-section">
          <h2 className="lw-h2 lw-reveal">Skontaktuj się z nami</h2>
          <div className="lw-grid lw-grid-3">
            {locations.map((loc, i) => (
              <article className="lw-card lw-loc lw-reveal" key={loc.city} style={{ animationDelay: `${0.05 * i}s` }}>
                <div className="lw-loc-city">📍 {loc.city}</div>
                <div className="lw-loc-addr">{loc.addr}</div>
                <a className="lw-loc-phone" href={`tel:${loc.phone.replace(/\s/g, '')}`}>{loc.phone}</a>
              </article>
            ))}
          </div>

          <div className="lw-card lw-contact lw-reveal" style={{ marginTop: 18 }}>
            <div>
              <div className="lw-loc-city" style={{ marginBottom: 6 }}>Centrala — Gorzów Wielkopolski</div>
              <div style={{ color: 'rgba(28,37,51,0.7)', fontSize: 15 }}>
                ul. Owcza 10, 66-400 · kontakt@profiwash.pl
              </div>
            </div>
            <div className="lw-contact-actions">
              <a className="lw-btn lw-btn-primary" href="tel:+48957226040">+48 95 722 60 40</a>
              <a className="lw-btn lw-btn-ghost" href="mailto:kontakt@profiwash.pl">Napisz e-mail</a>
            </div>
          </div>
        </section>

        <footer className="lw-footer">
          Profiwash · Profesjonalny serwis usług pralniczych — strona testowa (Lebuser)
        </footer>
      </div>
    </div>
  );
}

const css = `
.lw-root {
  position: relative;
  min-height: 100%;
  margin: -16px;
  padding: clamp(24px, 5vw, 64px) clamp(16px, 4vw, 48px) 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
  color: #1c2533;
  overflow: hidden;
  background:
    radial-gradient(120% 120% at 0% 0%, #eaf2ff 0%, transparent 55%),
    radial-gradient(120% 120% at 100% 0%, #e7fbf4 0%, transparent 55%),
    linear-gradient(160deg, #f4f7fc 0%, #eef1f8 100%);
}
.lw-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.lw-blob {
  position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.55;
  animation: lw-float 18s ease-in-out infinite;
}
.lw-blob-1 { width: 360px; height: 360px; top: -80px; left: -60px; background: #8ab8ff; }
.lw-blob-2 { width: 420px; height: 420px; top: 120px; right: -100px; background: #7af0c6; animation-delay: -6s; }
.lw-blob-3 { width: 300px; height: 300px; bottom: -80px; left: 35%; background: #c4a9ff; animation-delay: -12s; }
@keyframes lw-float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(20px, -30px) scale(1.08); }
}

.lw-container { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto; }

.lw-card {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(22px) saturate(180%);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 24px;
  box-shadow: 0 12px 40px rgba(31, 45, 80, 0.12), inset 0 1px 0 rgba(255,255,255,0.6);
}

.lw-hero { text-align: center; padding: 8px 0 40px; }
.lw-pill {
  display: inline-block; padding: 7px 16px; border-radius: 999px;
  background: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.8);
  backdrop-filter: blur(12px); font-size: 13px; font-weight: 600;
  color: #2f6df0; letter-spacing: 0.2px; margin-bottom: 22px;
  box-shadow: 0 6px 18px rgba(47,109,240,0.12);
}
.lw-h1 {
  font-size: clamp(34px, 6vw, 60px); line-height: 1.05; letter-spacing: -0.02em;
  font-weight: 800; margin: 0 0 18px;
  background: linear-gradient(120deg, #11203d 0%, #2f6df0 70%, #11b890 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.lw-lead {
  max-width: 640px; margin: 0 auto 28px; font-size: clamp(16px, 2.2vw, 19px);
  line-height: 1.55; color: rgba(28,37,51,0.72);
}
.lw-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

.lw-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 14px 26px; border-radius: 16px; font-size: 15px; font-weight: 600;
  text-decoration: none; cursor: pointer; transition: transform 0.18s ease, box-shadow 0.18s ease;
  border: 1px solid transparent;
}
.lw-btn:hover { transform: translateY(-2px); }
.lw-btn-primary {
  color: #fff; background: linear-gradient(135deg, #2f6df0, #1aa9e6);
  box-shadow: 0 10px 26px rgba(47,109,240,0.35);
}
.lw-btn-ghost {
  color: #1c2533; background: rgba(255,255,255,0.6);
  border-color: rgba(255,255,255,0.85); backdrop-filter: blur(12px);
}

.lw-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 56px;
}
.lw-stat { padding: 22px 16px; text-align: center; }
.lw-stat-value { font-size: clamp(22px, 3vw, 30px); font-weight: 800; color: #1c2533; letter-spacing: -0.01em; }
.lw-stat-label { font-size: 13px; color: rgba(28,37,51,0.6); margin-top: 4px; }

.lw-section { margin-bottom: 56px; }
.lw-h2 { font-size: clamp(24px, 3.5vw, 34px); font-weight: 800; letter-spacing: -0.01em; margin: 0 0 24px; text-align: center; }
.lw-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.lw-service { padding: 26px 24px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.lw-service:hover { transform: translateY(-4px); box-shadow: 0 18px 50px rgba(31,45,80,0.16); }
.lw-service-icon {
  width: 54px; height: 54px; border-radius: 16px; display: flex; align-items: center;
  justify-content: center; font-size: 26px; margin-bottom: 16px;
  background: linear-gradient(135deg, rgba(47,109,240,0.14), rgba(17,184,144,0.14));
  border: 1px solid rgba(255,255,255,0.7);
}
.lw-service-title { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
.lw-service-desc { font-size: 14.5px; line-height: 1.55; color: rgba(28,37,51,0.68); margin: 0; }

.lw-about { padding: 34px 32px; margin-bottom: 24px; }
.lw-about p { font-size: 16px; line-height: 1.6; color: rgba(28,37,51,0.75); }
.lw-list { margin: 16px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.lw-list li { position: relative; padding-left: 28px; font-size: 15px; color: rgba(28,37,51,0.8); }
.lw-list li::before {
  content: '✓'; position: absolute; left: 0; top: 0; color: #11b890; font-weight: 800;
}

.lw-tags { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-width: 760px; margin: 0 auto; }
.lw-tag {
  padding: 9px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; color: #1c2533;
  background: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.8);
  backdrop-filter: blur(12px); box-shadow: 0 6px 16px rgba(31,45,80,0.08);
}

.lw-grid-3 { grid-template-columns: repeat(3, 1fr); }
.lw-loc { padding: 22px 22px; }
.lw-loc-city { font-size: 16px; font-weight: 700; color: #1c2533; }
.lw-loc-addr { font-size: 14px; color: rgba(28,37,51,0.68); margin: 6px 0 12px; line-height: 1.5; }
.lw-loc-phone { font-size: 15px; font-weight: 700; color: #2f6df0; text-decoration: none; }
.lw-loc-phone:hover { text-decoration: underline; }

.lw-contact {
  padding: 30px 32px; margin-bottom: 32px; display: flex; align-items: center;
  justify-content: space-between; gap: 20px; flex-wrap: wrap;
}
.lw-contact-actions { display: flex; gap: 12px; flex-wrap: wrap; }

.lw-footer { text-align: center; font-size: 13px; color: rgba(28,37,51,0.5); padding-top: 8px; }

.lw-reveal { animation: lw-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes lw-rise {
  from { opacity: 0; transform: translateY(22px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 860px) {
  .lw-stats { grid-template-columns: repeat(2, 1fr); }
  .lw-grid, .lw-grid-3 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .lw-grid, .lw-grid-3 { grid-template-columns: 1fr; }
  .lw-contact { flex-direction: column; align-items: stretch; text-align: center; }
  .lw-contact-actions { justify-content: center; }
}

@media (prefers-reduced-motion: reduce) {
  .lw-reveal, .lw-blob { animation: none; }
}
`;
