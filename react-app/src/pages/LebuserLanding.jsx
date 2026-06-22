import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoImg from '../assets/logo-icon.png';

/**
 * Testowa strona główna w stylu Apple / Glassmorphism — marka LEBUSER.
 * Firma: Lebuser, siedziba ul. Owcza 10, Gorzów Wielkopolski.
 * Dwujęzyczna (PL / DE) — język sterowany globalnym i18n aplikacji.
 * Renderowana pod osobnym przyciskiem "Lebuser" (tylko dla admina) — NIE jest
 * główną stroną aplikacji.
 */

const EMAIL = 'info@lebuser.pl';
const PHONE = '+48 95 722 60 40';
const PHONE_HREF = '+48957226040';

// Dane rejestrowe (KRS 0000648492)
const LEGAL_NAME = 'Lebuser Textilservice Sp. z o.o.';
const LEGAL_ADDR = 'ul. Owcza 10, 66-400 Gorzów Wielkopolski';
const REG = { nip: '9271945131', regon: '365910038', krs: '0000648492' };

const content = {
  pl: {
    back: 'Powrót do aplikacji',
    pill: 'Textilservice od 1876 · Gorzów Wielkopolski',
    h1: ['Leasing tekstyliów dla', 'gastronomii i hoteli'],
    lead: 'Wynajem, pranie i dostawa tekstyliów w jednym serwisie. Wspieramy rozwój Twojego biznesu i optymalizujemy procesy — a Ty płacisz tylko za tekstylia, które wynajmujesz i pierzesz.',
    ctaOffer: 'Zapytaj o ofertę',
    ctaServices: 'Zobacz usługi',
    stats: [
      { value: 'od 1876', label: 'tradycja Textilservice' },
      { value: 'Gorzów Wlkp.', label: 'siedziba firmy' },
      { value: '100%', label: 'obieg zamknięty' },
      { value: 'pay-per-use', label: 'płacisz za użycie' },
    ],
    servicesHead: { eyebrow: 'USŁUGI', title: 'Tekstylia w jednym serwisie', sub: 'Od leasingu i wynajmu po pranie, dostawę i wymianę — wszystko po naszej stronie.' },
    services: [
      { icon: '♻️', title: 'Leasing tekstyliów', desc: 'Certyfikowane tekstylia w obiegu zamkniętym. Płacisz tylko za to, co wynajęte i wyprane — bez inwestycji w zapasy.' },
      { icon: '🛏️', title: 'Wynajem bielizny', desc: 'Pościel, ręczniki i obrusy dostarczane regularnie, czyste i gotowe do użycia. Brudne wymieniamy na świeże.' },
      { icon: '🍽️', title: 'Tekstylia dla gastronomii', desc: 'Obrusy, serwety i bielizna stołowa dla restauracji i hoteli — spójny, profesjonalny wygląd Twojego lokalu.' },
      { icon: '🦺', title: 'Odzież robocza', desc: 'Wynajem i serwis odzieży roboczej oraz ochronnej dla całego zespołu, z regularnym praniem i wymianą.' },
      { icon: '🧼', title: 'Pranie i serwis', desc: 'Kompleksowe czyszczenie produktów tekstylnych. Odbieramy, pierzemy i odwozimy — Ty zajmujesz się biznesem.' },
      { icon: '🌱', title: 'Ekologia i oszczędność', desc: 'Tekstylia wielorazowe zamiast jednorazowych: lepszy łańcuch dostaw, mniejszy ślad środowiskowy i realne oszczędności.' },
    ],
    offerHead: { eyebrow: 'OFERTA', title: 'Pełen zakres usług pralniczych', sub: 'Pierzemy i serwisujemy tekstylia rozliczane na sztukę, kilogram, metr lub wsad.' },
    offer: [
      { group: 'Bielizna pościelowa i stołowa', items: [
        ['Pościel z wykończeniem', 'kg'],
        ['Poszwy i poszewki', 'szt.'],
        ['Prześcieradła i pokrowce na materace', 'szt.'],
        ['Obrusy (do 150 i do 300 cm)', 'szt.'],
        ['Serwety, ścierki, ręczniki frotté', 'szt.'],
      ] },
      { group: 'Firany, zasłony i dekoracje', items: [
        ['Firany gładkie', 'm²'],
        ['Zasłony i flagi', 'm²'],
        ['Falbany, lambrekiny, drapowania', 'mb'],
        ['Pokrowce na krzesła (proste i ozdobne)', 'szt.'],
      ] },
      { group: 'Odzież robocza i fasonowa', items: [
        ['Koszule, bluzki, piżamy, szlafroki', 'szt.'],
        ['Fartuchy kucharskie i kelnerskie', 'szt.'],
        ['Fartuchy medyczne i płócienne', 'szt.'],
        ['Peleryny fryzjerskie, czepki', 'szt.'],
        ['Odzież sportowa', 'szt.'],
      ] },
      { group: 'Pranie chemiczne i dodatki', items: [
        ['Garnitury, sukienki, płaszcze, kurtki', 'szt.'],
        ['Dzianiny i odzież dziecięca', 'szt.'],
        ['Dywany i tapicerka', 'm²'],
        ['Produkty puchowe (kołdry, poduszki)', 'szt.'],
        ['Prasowanie odzieży / pranie na wsad', 'kg'],
      ] },
    ],
    audienceHead: { eyebrow: 'DLA KOGO', title: 'Branże, które obsługujemy' },
    audience: ['Hotele', 'Restauracje', 'Kawiarnie', 'Ośrodki wypoczynkowe', 'Placówki medyczne', 'Zakłady produkcyjne', 'Firmy sprzątające', 'Catering'],
    refHead: { eyebrow: 'REFERENCJE', title: 'Zaufali nam', sub: 'Hotele, ośrodki i firmy, które na co dzień korzystają z naszych usług.' },
    references: [
      { name: 'Qubus Hotel', type: 'Hotel' },
      { name: 'Hotel ALMA', type: 'Hotel' },
      { name: 'Hotel Woiński SPA', type: 'Hotel & SPA' },
      { name: 'Pałac Mierzęcin', type: 'Hotel & Winnica' },
      { name: 'PKS Gorzów', type: 'Transport' },
      { name: 'Leśniczówka Przyłęsko', type: 'Ośrodek' },
    ],
    refTrust: ['Terminowość dostaw', 'Powtarzalna jakość', 'Szybkie reklamacje', 'Doradztwo tekstylne', 'Obsługa pilnych zleceń'],
    aboutEyebrow: 'DLACZEGO LEBUSER',
    aboutTitle: 'Tradycja od 1876 w nowoczesnym wydaniu',
    aboutText: 'Łączymy ponad stuletnie doświadczenie Textilservice z nowoczesnym, wielorazowym modelem obsługi tekstyliów. Zamiast kupować i magazynować — wynajmujesz, a my dbamy o pranie, dostawę i wymianę.',
    benefits: [
      'Wspieramy rozwój Twojego biznesu',
      'Optymalizujemy procesy obsługi tekstyliów',
      'Budujemy trwałe, długofalowe relacje',
      'Płacisz tylko za wynajęte i wyprane sztuki',
      'Dbamy o środowisko dzięki obiegowi zamkniętemu',
      'Generujemy realne oszczędności finansowe',
    ],
    contactEyebrow: 'KONTAKT',
    contactTitle: 'Porozmawiajmy o Twoich tekstyliach',
    contactAddress: 'ul. Owcza 10, 66-400 Gorzów Wielkopolski',
    ctaWrite: 'Napisz do nas',
    ctaCall: 'Zadzwoń',
    privacy: 'Polityka prywatności',
    footerNote: 'strona testowa',
  },
  de: {
    back: 'Zurück zur App',
    pill: 'Textilservice seit 1876 · Gorzów Wielkopolski',
    h1: ['Textilleasing für', 'Gastronomie und Hotels'],
    lead: 'Vermietung, Wäscherei und Lieferung von Textilien aus einer Hand. Wir unterstützen das Wachstum Ihres Unternehmens und optimieren Prozesse — und Sie zahlen nur für die Textilien, die Sie mieten und waschen lassen.',
    ctaOffer: 'Angebot anfragen',
    ctaServices: 'Leistungen ansehen',
    stats: [
      { value: 'seit 1876', label: 'Tradition Textilservice' },
      { value: 'Gorzów Wlkp.', label: 'Firmensitz' },
      { value: '100%', label: 'geschlossener Kreislauf' },
      { value: 'pay-per-use', label: 'Sie zahlen pro Nutzung' },
    ],
    servicesHead: { eyebrow: 'LEISTUNGEN', title: 'Textilien aus einer Hand', sub: 'Von Leasing und Vermietung über Wäscherei und Lieferung bis zum Austausch — alles bei uns.' },
    services: [
      { icon: '♻️', title: 'Textilleasing', desc: 'Zertifizierte Textilien im geschlossenen Kreislauf. Sie zahlen nur für gemietete und gewaschene Stücke — ohne Investition in Bestände.' },
      { icon: '🛏️', title: 'Wäschevermietung', desc: 'Bettwäsche, Handtücher und Tischwäsche, regelmäßig sauber und einsatzbereit geliefert. Schmutziges tauschen wir gegen Frisches.' },
      { icon: '🍽️', title: 'Textilien für die Gastronomie', desc: 'Tischdecken, Servietten und Tischwäsche für Restaurants und Hotels — ein einheitliches, professionelles Erscheinungsbild Ihres Betriebs.' },
      { icon: '🦺', title: 'Arbeitskleidung', desc: 'Vermietung und Service von Arbeits- und Schutzkleidung für das ganze Team, mit regelmäßiger Wäsche und Austausch.' },
      { icon: '🧼', title: 'Wäscherei und Service', desc: 'Umfassende Reinigung von Textilprodukten. Wir holen ab, waschen und liefern zurück — Sie kümmern sich um Ihr Geschäft.' },
      { icon: '🌱', title: 'Ökologie und Ersparnis', desc: 'Mehrwegtextilien statt Einweg: bessere Lieferkette, kleinerer ökologischer Fußabdruck und echte Einsparungen.' },
    ],
    offerHead: { eyebrow: 'ANGEBOT', title: 'Komplettes Wäschereiangebot', sub: 'Wir waschen und pflegen Textilien — abgerechnet pro Stück, Kilogramm, Meter oder Ladung.' },
    offer: [
      { group: 'Bett- und Tischwäsche', items: [
        ['Bettwäsche mit Finish', 'kg'],
        ['Bezüge und Kissenbezüge', 'Stk.'],
        ['Laken und Matratzenbezüge', 'Stk.'],
        ['Tischdecken (bis 150 und bis 300 cm)', 'Stk.'],
        ['Servietten, Tücher, Frottee-Handtücher', 'Stk.'],
      ] },
      { group: 'Gardinen, Vorhänge und Dekoration', items: [
        ['Glatte Gardinen', 'm²'],
        ['Vorhänge und Fahnen', 'm²'],
        ['Volants, Lambrequins, Drapierungen', 'lfm'],
        ['Stuhlhussen (einfach und dekorativ)', 'Stk.'],
      ] },
      { group: 'Arbeits- und Berufskleidung', items: [
        ['Hemden, Blusen, Pyjamas, Bademäntel', 'Stk.'],
        ['Koch- und Kellnerschürzen', 'Stk.'],
        ['Medizinische und Leinenkittel', 'Stk.'],
        ['Friseurumhänge, Hauben', 'Stk.'],
        ['Sportbekleidung', 'Stk.'],
      ] },
      { group: 'Chemische Reinigung und Extras', items: [
        ['Anzüge, Kleider, Mäntel, Jacken', 'Stk.'],
        ['Strickwaren und Kinderkleidung', 'Stk.'],
        ['Teppiche und Polster', 'm²'],
        ['Daunenprodukte (Decken, Kissen)', 'Stk.'],
        ['Bügeln / Wäsche pro Ladung', 'kg'],
      ] },
    ],
    audienceHead: { eyebrow: 'FÜR WEN', title: 'Branchen, die wir betreuen' },
    audience: ['Hotels', 'Restaurants', 'Cafés', 'Erholungszentren', 'Medizinische Einrichtungen', 'Produktionsbetriebe', 'Reinigungsfirmen', 'Catering'],
    refHead: { eyebrow: 'REFERENZEN', title: 'Sie vertrauen uns', sub: 'Hotels, Zentren und Firmen, die täglich unsere Leistungen nutzen.' },
    references: [
      { name: 'Qubus Hotel', type: 'Hotel' },
      { name: 'Hotel ALMA', type: 'Hotel' },
      { name: 'Hotel Woiński SPA', type: 'Hotel & SPA' },
      { name: 'Pałac Mierzęcin', type: 'Hotel & Weingut' },
      { name: 'PKS Gorzów', type: 'Transport' },
      { name: 'Leśniczówka Przyłęsko', type: 'Erholungszentrum' },
    ],
    refTrust: ['Termintreue Lieferung', 'Gleichbleibende Qualität', 'Schnelle Reklamationen', 'Textilberatung', 'Eilaufträge möglich'],
    aboutEyebrow: 'WARUM LEBUSER',
    aboutTitle: 'Tradition seit 1876 in moderner Form',
    aboutText: 'Wir verbinden über hundertjährige Textilservice-Erfahrung mit einem modernen Mehrwegmodell der Textilbewirtschaftung. Statt zu kaufen und zu lagern — Sie mieten, und wir kümmern uns um Wäsche, Lieferung und Austausch.',
    benefits: [
      'Wir fördern das Wachstum Ihres Unternehmens',
      'Wir optimieren Ihre Textilprozesse',
      'Wir bauen dauerhafte, langfristige Beziehungen',
      'Sie zahlen nur für gemietete und gewaschene Stücke',
      'Wir schonen die Umwelt durch geschlossenen Kreislauf',
      'Wir erzeugen echte finanzielle Einsparungen',
    ],
    contactEyebrow: 'KONTAKT',
    contactTitle: 'Sprechen wir über Ihre Textilien',
    contactAddress: 'ul. Owcza 10, 66-400 Gorzów Wielkopolski',
    ctaWrite: 'Schreiben Sie uns',
    ctaCall: 'Anrufen',
    privacy: 'Datenschutz',
    imprint: 'Impressum',
    footerNote: 'Testseite',
  },
};

const Arrow = () => (
  <svg className="lw-arrow" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function LebuserLanding() {
  const { i18n } = useTranslation();
  const lang = i18n.language && i18n.language.toLowerCase().startsWith('de') ? 'de' : 'pl';
  const c = content[lang];

  useEffect(() => {
    const prev = document.title;
    document.title = 'LEBUSER · Textilservice od 1876';
    return () => { document.title = prev; };
  }, []);

  // Dostępność: atrybut języka dokumentu zgodny z treścią (WCAG / EAA).
  useEffect(() => {
    const prev = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = prev; };
  }, [lang]);

  const setLang = (l) => { if (l !== lang) i18n.changeLanguage(l); };

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
        {c.back}
      </Link>

      {/* Przełącznik języka */}
      <div className="lw-lang" role="group" aria-label="Language">
        <button type="button" className={lang === 'pl' ? 'is-active' : ''} onClick={() => setLang('pl')}>PL</button>
        <button type="button" className={lang === 'de' ? 'is-active' : ''} onClick={() => setLang('de')}>DE</button>
      </div>

      <div className="lw-container">
        {/* Hero */}
        <header className="lw-hero">
          <img src={logoImg} alt="LEBUSER Textilservice" className="lw-logo lw-reveal" />
          <span className="lw-pill lw-reveal" style={{ animationDelay: '0.04s' }}>
            {c.pill}
          </span>
          <h1 className="lw-h1 lw-reveal" style={{ animationDelay: '0.08s' }}>
            {c.h1[0]}<br />{c.h1[1]}
          </h1>
          <p className="lw-lead lw-reveal" style={{ animationDelay: '0.12s' }}>
            {c.lead}
          </p>
          <div className="lw-cta lw-reveal" style={{ animationDelay: '0.16s' }}>
            <a className="lw-btn lw-btn-primary" href={`mailto:${EMAIL}`}>
              {c.ctaOffer} <Arrow />
            </a>
            <a className="lw-btn lw-btn-ghost" href="#uslugi">{c.ctaServices}</a>
          </div>

          {/* Fale — motyw z logo */}
          <svg className="lw-waves" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
            <path className="lw-w1" d="M0,42 C200,92 400,2 600,42 C800,82 1000,12 1200,52 L1200,120 L0,120 Z" />
            <path className="lw-w2" d="M0,72 C200,32 400,102 600,62 C800,22 1000,92 1200,57 L1200,120 L0,120 Z" />
          </svg>
        </header>

        {/* Statystyki */}
        <section className="lw-stats lw-reveal">
          {c.stats.map((s) => (
            <div className="lw-card lw-stat" key={s.label}>
              <div className="lw-stat-value">{s.value}</div>
              <div className="lw-stat-label">{s.label}</div>
            </div>
          ))}
        </section>

        {/* Usługi */}
        <section id="uslugi" className="lw-section">
          <div className="lw-head lw-reveal">
            <span className="lw-eyebrow">{c.servicesHead.eyebrow}</span>
            <h2 className="lw-h2">{c.servicesHead.title}</h2>
            <p className="lw-sub">{c.servicesHead.sub}</p>
          </div>
          <div className="lw-grid">
            {c.services.map((srv, i) => (
              <article
                className="lw-card lw-service lw-reveal"
                key={srv.title}
                style={{ animationDelay: `${0.05 * i}s` }}
              >
                <div className="lw-service-icon" aria-hidden="true">{srv.icon}</div>
                <h3 className="lw-service-title">{srv.title}</h3>
                <p className="lw-service-desc">{srv.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Oferta */}
        <section className="lw-section">
          <div className="lw-head lw-reveal">
            <span className="lw-eyebrow">{c.offerHead.eyebrow}</span>
            <h2 className="lw-h2">{c.offerHead.title}</h2>
            <p className="lw-sub">{c.offerHead.sub}</p>
          </div>
          <div className="lw-offer-grid">
            {c.offer.map((g, i) => (
              <article className="lw-card lw-offer-card lw-reveal" key={g.group} style={{ animationDelay: `${0.05 * i}s` }}>
                <h3 className="lw-offer-title">{g.group}</h3>
                <ul className="lw-offer-list">
                  {g.items.map(([name, unit]) => (
                    <li key={name}><span>{name}</span><span className="lw-unit">{unit}</span></li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* Branże */}
        <section className="lw-section">
          <div className="lw-head lw-reveal">
            <span className="lw-eyebrow">{c.audienceHead.eyebrow}</span>
            <h2 className="lw-h2">{c.audienceHead.title}</h2>
          </div>
          <div className="lw-tags lw-reveal">
            {c.audience.map((a) => <span className="lw-tag" key={a}>{a}</span>)}
          </div>
        </section>

        {/* Referencje */}
        <section className="lw-section">
          <div className="lw-head lw-reveal">
            <span className="lw-eyebrow">{c.refHead.eyebrow}</span>
            <h2 className="lw-h2">{c.refHead.title}</h2>
            <p className="lw-sub">{c.refHead.sub}</p>
          </div>
          <div className="lw-ref-grid">
            {c.references.map((r, i) => (
              <article className="lw-card lw-ref lw-reveal" key={r.name} style={{ animationDelay: `${0.04 * i}s` }}>
                <div className="lw-ref-name">{r.name}</div>
                <div className="lw-ref-type">{r.type}</div>
              </article>
            ))}
          </div>
          <div className="lw-tags lw-reveal">
            {c.refTrust.map((t) => <span className="lw-tag" key={t}><span aria-hidden="true">✓ </span>{t}</span>)}
          </div>
        </section>

        {/* Dlaczego my */}
        <section className="lw-card lw-about lw-reveal">
          <span className="lw-eyebrow">{c.aboutEyebrow}</span>
          <h2 className="lw-h2" style={{ textAlign: 'left', margin: '8px 0 14px' }}>
            {c.aboutTitle}
          </h2>
          <p>{c.aboutText}</p>
          <ul className="lw-list">
            {c.benefits.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </section>

        {/* Kontakt */}
        <section className="lw-card lw-contact lw-reveal">
          <div className="lw-contact-info">
            <span className="lw-eyebrow">{c.contactEyebrow}</span>
            <h2 className="lw-h2" style={{ textAlign: 'left', margin: '8px 0 16px' }}>
              {c.contactTitle}
            </h2>
            <ul className="lw-contact-list">
              <li><span className="lw-ci" aria-hidden="true">📍</span> {c.contactAddress}</li>
              <li><span className="lw-ci" aria-hidden="true">📞</span> <a href={`tel:${PHONE_HREF}`}>{PHONE}</a></li>
              <li><span className="lw-ci" aria-hidden="true">✉️</span> <a href={`mailto:${EMAIL}`}>{EMAIL}</a></li>
            </ul>
          </div>
          <div className="lw-contact-actions">
            <a className="lw-btn lw-btn-primary" href={`mailto:${EMAIL}`}>{c.ctaWrite} <Arrow /></a>
            <a className="lw-btn lw-btn-ghost" href={`tel:${PHONE_HREF}`}>{c.ctaCall}</a>
          </div>
        </section>

        <footer className="lw-footer">
          <div className="lw-footer-legal">{LEGAL_NAME} · {LEGAL_ADDR}</div>
          <div className="lw-footer-reg">NIP {REG.nip} · REGON {REG.regon} · KRS {REG.krs}</div>
          <div className="lw-footer-links">
            <a href="#" onClick={(e) => e.preventDefault()}>{c.privacy}</a>
            {lang === 'de' && (
              <>
                <span aria-hidden="true">·</span>
                <a href="#" onClick={(e) => e.preventDefault()}>{c.imprint}</a>
              </>
            )}
          </div>
          <div className="lw-footer-copy">© {new Date().getFullYear()} {LEGAL_NAME} — {c.footerNote}</div>
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

/* Przełącznik języka */
.lw-lang {
  position: fixed; top: 20px; right: 20px; z-index: 20;
  display: inline-flex; align-items: center; gap: 2px; padding: 4px;
  border-radius: 999px;
  background: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.9);
  backdrop-filter: blur(14px) saturate(180%); -webkit-backdrop-filter: blur(14px) saturate(180%);
  box-shadow: 0 8px 22px rgba(6,59,82,0.14);
}
.lw-lang button {
  border: none; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 750;
  padding: 7px 14px; border-radius: 999px; color: var(--lb-primary); background: transparent;
  transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}
.lw-lang button.is-active {
  color: #fff; background: linear-gradient(135deg, var(--lb-primary), var(--lb-aqua));
  box-shadow: 0 4px 12px rgba(10,94,132,0.3);
}

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
  line-height: 1.58; color: rgba(10,44,59,0.82);
}
.lw-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

/* Dostępność: widoczny focus dla nawigacji klawiaturą (WCAG / EAA) */
.lw-root a:focus-visible,
.lw-root button:focus-visible {
  outline: 3px solid var(--lb-primary);
  outline-offset: 3px;
  border-radius: 12px;
}

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
  display: inline-flex; align-items: center; gap: 9px; justify-content: center;
  padding: 14px 26px; border-radius: 16px; font-size: 15px; font-weight: 650;
  text-decoration: none; cursor: pointer; border: 1px solid transparent;
  transition: transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s ease, background 0.2s ease;
}
.lw-arrow { width: 16px; height: 16px; transition: transform 0.2s ease; }
.lw-btn:hover { transform: translateY(-2px); }
.lw-btn:hover .lw-arrow { transform: translateX(3px); }
.lw-btn-primary {
  color: #fff;
  background: linear-gradient(180deg, #2a9cc0 0%, var(--lb-primary) 56%, #084d6e 100%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.30),
    0 2px 4px rgba(6,59,82,0.18),
    0 10px 22px rgba(10,94,132,0.30);
}
.lw-btn-primary:hover {
  background: linear-gradient(180deg, #34a9cd 0%, #0c688f 56%, #0a5e84 100%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.34),
    0 4px 8px rgba(6,59,82,0.20),
    0 14px 28px rgba(10,94,132,0.40);
}
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
.lw-stat-value { font-size: clamp(19px, 2.6vw, 27px); font-weight: 800; color: var(--lb-deep); letter-spacing: -0.01em; }
.lw-stat-label { font-size: 12.5px; color: rgba(10,44,59,0.74); margin-top: 5px; }

/* SECTION HEAD */
.lw-section { margin-bottom: 64px; }
.lw-head { text-align: center; max-width: 620px; margin: 0 auto 30px; }
.lw-eyebrow {
  display: inline-block; font-size: 12px; font-weight: 800; letter-spacing: 1.6px;
  color: var(--lb-primary); margin-bottom: 10px;
}
.lw-h2 { font-size: clamp(25px, 3.6vw, 36px); font-weight: 800; letter-spacing: -0.02em; margin: 0; color: var(--lb-ink); }
.lw-sub { margin: 12px 0 0; font-size: 16px; line-height: 1.55; color: rgba(10,44,59,0.78); }

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
.lw-service-desc { font-size: 14.5px; line-height: 1.56; color: rgba(10,44,59,0.8); margin: 0; }

/* OFERTA */
.lw-offer-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
.lw-offer-card { padding: 26px 28px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.lw-offer-card:hover { transform: translateY(-3px); box-shadow: var(--lb-card-shadow-hi); }
.lw-offer-title { font-size: 16px; font-weight: 750; color: var(--lb-primary); margin: 0 0 14px; letter-spacing: -0.01em; }
.lw-offer-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 11px; }
.lw-offer-list li {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  font-size: 14.5px; color: rgba(10,44,59,0.8);
  border-bottom: 1px solid rgba(10,94,132,0.08); padding-bottom: 11px;
}
.lw-offer-list li:last-child { border-bottom: none; padding-bottom: 0; }
.lw-unit {
  flex-shrink: 0; font-size: 11px; font-weight: 750; letter-spacing: 0.3px; text-transform: uppercase;
  color: var(--lb-primary); background: rgba(10,94,132,0.12); border-radius: 999px; padding: 3px 10px;
}

/* REFERENCJE */
.lw-ref-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 22px; }
.lw-ref { padding: 24px 20px; text-align: center; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.lw-ref:hover { transform: translateY(-3px); box-shadow: var(--lb-card-shadow-hi); }
.lw-ref-name { font-size: 16px; font-weight: 750; color: var(--lb-ink); letter-spacing: -0.01em; }
.lw-ref-type { font-size: 12.5px; color: rgba(10,44,59,0.74); margin-top: 4px; }

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
.lw-about p { font-size: 16px; line-height: 1.62; color: rgba(10,44,59,0.84); margin: 0; max-width: 760px; }
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

.lw-footer { text-align: center; padding-top: 8px; display: grid; gap: 6px; }
.lw-footer-legal { font-size: 13.5px; font-weight: 650; color: rgba(10,44,59,0.8); }
.lw-footer-reg { font-size: 12.5px; color: rgba(10,44,59,0.68); }
.lw-footer-links { display: flex; gap: 10px; justify-content: center; align-items: center; font-size: 13px; }
.lw-footer-links a { color: var(--lb-primary); text-decoration: none; font-weight: 650; }
.lw-footer-links a:hover { text-decoration: underline; }
.lw-footer-links span { color: rgba(10,44,59,0.4); }
.lw-footer-copy { font-size: 12px; color: rgba(10,44,59,0.62); margin-top: 4px; }

/* REVEAL */
.lw-reveal { animation: lw-rise 0.75s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes lw-rise {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 860px) {
  .lw-stats { grid-template-columns: repeat(2, 1fr); }
  .lw-grid { grid-template-columns: repeat(2, 1fr); }
  .lw-offer-grid { grid-template-columns: 1fr; }
  .lw-ref-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .lw-grid { grid-template-columns: 1fr; }
  .lw-list { grid-template-columns: 1fr; }
  .lw-ref-grid { grid-template-columns: 1fr; }
  .lw-contact { flex-direction: column; align-items: stretch; }
  .lw-contact-actions { flex-direction: row; }
  .lw-contact-actions .lw-btn { flex: 1; }
  .lw-back { font-size: 13px; padding: 9px 13px; }
}

@media (prefers-reduced-motion: reduce) {
  .lw-reveal, .lw-blob { animation: none; }
}
`;
