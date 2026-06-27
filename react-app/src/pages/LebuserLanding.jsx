import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoImg from '../assets/logo-icon.png';

/**
 * Testowa strona główna w stylu Microsoft Edge Copilot — marka LEBUSER.
 * Jasne tło, płynący gradient (turkus→niebieski→fiolet→róż), sticky nav,
 * karty z miękkim cieniem, bento i gradientowy pasek CTA.
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

      {/* NAV */}
      <header className="lw-nav">
        <div className="lw-wrap lw-nav-inner">
          <Link to="/" className="lw-nav-logo" aria-label="LEBUSER">
            <img src={logoImg} alt="LEBUSER Textilservice" />
          </Link>
          <nav className="lw-nav-actions">
            <div className="lw-lang" role="group" aria-label="Language">
              <button type="button" className={lang === 'pl' ? 'is-active' : ''} onClick={() => setLang('pl')}>PL</button>
              <button type="button" className={lang === 'de' ? 'is-active' : ''} onClick={() => setLang('de')}>DE</button>
            </div>
            <Link to="/" className="lw-navlink">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H4M7.5 4l-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>{c.back}</span>
            </Link>
            <a className="lw-btn lw-btn-primary lw-btn-sm" href={`mailto:${EMAIL}`}>{c.ctaOffer}</a>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="lw-hero">
          <div className="lw-hero-glow" aria-hidden="true" />
          <div className="lw-wrap lw-hero-inner">
            <span className="lw-pill lw-reveal">
              <span className="lw-pill-dot" aria-hidden="true" />{c.pill}
            </span>
            <h1 className="lw-h1 lw-reveal" style={{ animationDelay: '0.06s' }}>
              {c.h1[0]}<br /><span className="lw-grad-text">{c.h1[1]}</span>
            </h1>
            <p className="lw-lead lw-reveal" style={{ animationDelay: '0.12s' }}>
              {c.lead}
            </p>
            <div className="lw-cta lw-reveal" style={{ animationDelay: '0.18s' }}>
              <a className="lw-btn lw-btn-primary" href={`mailto:${EMAIL}`}>
                {c.ctaOffer} <Arrow />
              </a>
              <a className="lw-btn lw-btn-ghost" href="#uslugi">{c.ctaServices}</a>
            </div>
          </div>

          {/* Showcase — statystyki na karcie nad gradientem */}
          <div className="lw-wrap">
            <div className="lw-showcase lw-reveal" style={{ animationDelay: '0.24s' }}>
              {c.stats.map((s) => (
                <div className="lw-stat" key={s.label}>
                  <div className="lw-stat-value">{s.value}</div>
                  <div className="lw-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* USŁUGI */}
        <section id="uslugi" className="lw-section">
          <div className="lw-wrap">
            <div className="lw-head lw-reveal">
              <span className="lw-eyebrow">{c.servicesHead.eyebrow}</span>
              <h2 className="lw-h2">{c.servicesHead.title}</h2>
              <p className="lw-sub">{c.servicesHead.sub}</p>
            </div>
            <div className="lw-bento">
              {c.services.map((srv, i) => (
                <article className="lw-card lw-service lw-reveal" key={srv.title} style={{ animationDelay: `${0.05 * i}s` }}>
                  <div className="lw-service-icon" aria-hidden="true">{srv.icon}</div>
                  <h3 className="lw-service-title">{srv.title}</h3>
                  <p className="lw-service-desc">{srv.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* OFERTA */}
        <section className="lw-section lw-section--soft">
          <div className="lw-wrap">
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
          </div>
        </section>

        {/* BRANŻE */}
        <section className="lw-section">
          <div className="lw-wrap">
            <div className="lw-head lw-reveal">
              <span className="lw-eyebrow">{c.audienceHead.eyebrow}</span>
              <h2 className="lw-h2">{c.audienceHead.title}</h2>
            </div>
            <div className="lw-tags lw-reveal">
              {c.audience.map((a) => <span className="lw-tag" key={a}>{a}</span>)}
            </div>
          </div>
        </section>

        {/* REFERENCJE */}
        <section className="lw-section lw-section--soft">
          <div className="lw-wrap">
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
            <div className="lw-tags lw-reveal" style={{ marginTop: '24px' }}>
              {c.refTrust.map((t) => <span className="lw-tag lw-tag--check" key={t}><span aria-hidden="true">✓</span>{t}</span>)}
            </div>
          </div>
        </section>

        {/* DLACZEGO LEBUSER */}
        <section className="lw-section">
          <div className="lw-wrap">
            <div className="lw-about lw-reveal">
              <div className="lw-about-text">
                <span className="lw-eyebrow">{c.aboutEyebrow}</span>
                <h2 className="lw-h2 lw-h2--left">{c.aboutTitle}</h2>
                <p className="lw-about-p">{c.aboutText}</p>
                <ul className="lw-list">
                  {c.benefits.map((b) => <li key={b}>{b}</li>)}
                </ul>
              </div>
              <aside className="lw-about-visual" aria-hidden="true">
                <span className="lw-about-glow" />
                <img src={logoImg} alt="" className="lw-about-logo" />
                <span className="lw-about-badge">od 1876</span>
              </aside>
            </div>
          </div>
        </section>

        {/* KONTAKT — pasek CTA */}
        <section className="lw-cta-band">
          <div className="lw-wrap">
            <div className="lw-cta-band-inner lw-reveal">
              <span className="lw-cta-band-glow" aria-hidden="true" />
              <div className="lw-cta-band-text">
                <span className="lw-eyebrow lw-eyebrow--on-dark">{c.contactEyebrow}</span>
                <h2 className="lw-cta-band-title">{c.contactTitle}</h2>
                <ul className="lw-contact-list">
                  <li><span className="lw-ci" aria-hidden="true">📍</span> {c.contactAddress}</li>
                  <li><span className="lw-ci" aria-hidden="true">📞</span> <a href={`tel:${PHONE_HREF}`}>{PHONE}</a></li>
                  <li><span className="lw-ci" aria-hidden="true">✉️</span> <a href={`mailto:${EMAIL}`}>{EMAIL}</a></li>
                </ul>
              </div>
              <div className="lw-cta-band-actions">
                <a className="lw-btn lw-btn-light" href={`mailto:${EMAIL}`}>{c.ctaWrite} <Arrow /></a>
                <a className="lw-btn lw-btn-outline-light" href={`tel:${PHONE_HREF}`}>{c.ctaCall}</a>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lw-footer">
          <div className="lw-wrap">
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
          </div>
        </footer>
      </main>
    </div>
  );
}

const css = `
.lw-root {
  --ink: #0a2c3b;
  --ink-2: #3c5764;
  --ink-3: #6a828d;
  --line: rgba(10,44,59,0.10);
  --bg: #ffffff;
  --soft: #eef5f8;
  --card: #ffffff;
  --brand-deep: #063b52;
  --brand: #0a5e84;
  --brand-2: #1488ab;
  --aqua: #36b6c4;
  --grad: linear-gradient(105deg, #063b52 0%, #0a5e84 38%, #1488ab 72%, #36b6c4 100%);
  --grad-soft: linear-gradient(135deg, rgba(10,94,132,0.14), rgba(20,136,171,0.14) 55%, rgba(54,182,196,0.16));
  --sh-sm: 0 1px 2px rgba(6,59,82,0.06), 0 6px 16px rgba(6,59,82,0.06);
  --sh-md: 0 2px 4px rgba(6,59,82,0.05), 0 18px 40px rgba(6,59,82,0.10);
  --sh-lg: 0 30px 80px rgba(6,59,82,0.20);

  position: relative;
  min-height: 100vh;
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: 'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.lw-root * { box-sizing: border-box; }
.lw-wrap { width: 100%; max-width: 1140px; margin: 0 auto; padding: 0 clamp(18px, 4vw, 40px); }

/* Dostępność: widoczny focus dla nawigacji klawiaturą (WCAG / EAA) */
.lw-root a:focus-visible,
.lw-root button:focus-visible {
  outline: 3px solid #0a5e84;
  outline-offset: 3px;
  border-radius: 12px;
}

/* NAV */
.lw-nav {
  position: sticky; top: 0; z-index: 30;
  background: rgba(255,255,255,0.78);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid var(--line);
}
.lw-nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; gap: 16px; }
.lw-nav-logo { display: inline-flex; align-items: center; }
.lw-nav-logo img { height: 24px; width: auto; display: block; }
.lw-nav-actions { display: flex; align-items: center; gap: 10px; }
.lw-navlink {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 12px; border-radius: 10px; font-size: 14px; font-weight: 600;
  color: var(--ink-2); text-decoration: none;
  transition: background 0.18s ease, color 0.18s ease;
}
.lw-navlink svg { width: 15px; height: 15px; }
.lw-navlink:hover { background: rgba(12,24,48,0.05); color: var(--ink); }

/* Przełącznik języka */
.lw-lang {
  display: inline-flex; align-items: center; gap: 2px; padding: 3px;
  border-radius: 999px; background: rgba(12,24,48,0.05); border: 1px solid var(--line);
}
.lw-lang button {
  border: none; cursor: pointer; font-family: inherit; font-size: 12.5px; font-weight: 700;
  padding: 6px 12px; border-radius: 999px; color: var(--ink-2); background: transparent;
  transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}
.lw-lang button.is-active {
  color: #fff; background: var(--grad); box-shadow: 0 4px 12px rgba(10,94,132,0.32);
}

/* BUTTONS */
.lw-btn {
  display: inline-flex; align-items: center; gap: 9px; justify-content: center;
  padding: 14px 24px; border-radius: 999px; font-size: 15px; font-weight: 650;
  font-family: inherit; text-decoration: none; cursor: pointer; border: 1px solid transparent;
  transition: transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s ease, background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.lw-arrow { width: 16px; height: 16px; transition: transform 0.2s ease; }
.lw-btn:hover { transform: translateY(-2px); }
.lw-btn:hover .lw-arrow { transform: translateX(3px); }
.lw-btn-sm { padding: 9px 18px; font-size: 14px; }
.lw-btn-primary { color: #fff; background: linear-gradient(180deg, #0e6c97 0%, #0a5680 100%); box-shadow: 0 6px 18px rgba(10,94,132,0.28); }
.lw-btn-primary:hover { background: linear-gradient(180deg, #1280a8 0%, #0c6190 100%); box-shadow: 0 10px 26px rgba(10,94,132,0.36); }
.lw-btn-ghost { color: var(--ink); background: #fff; border-color: var(--line); box-shadow: var(--sh-sm); }
.lw-btn-ghost:hover { border-color: rgba(12,24,48,0.20); }
.lw-btn-light { color: #0a2c3b; background: #fff; box-shadow: 0 8px 24px rgba(6,59,82,0.22); }
.lw-btn-light:hover { background: #eef5f8; }
.lw-btn-outline-light { color: #fff; background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.40); backdrop-filter: blur(6px); }
.lw-btn-outline-light:hover { background: rgba(255,255,255,0.20); }

/* HERO */
.lw-hero {
  position: relative; overflow: hidden;
  padding: clamp(48px, 8vw, 96px) 0 clamp(80px, 10vw, 130px);
}
.lw-hero-glow {
  position: absolute; top: -140px; left: 50%; transform: translateX(-50%);
  width: min(1100px, 130vw); height: 680px; z-index: 0; pointer-events: none; opacity: 0.85;
  background:
    radial-gradient(38% 56% at 22% 42%, rgba(54,182,196,0.50), transparent 70%),
    radial-gradient(40% 56% at 46% 30%, rgba(20,136,171,0.50), transparent 70%),
    radial-gradient(42% 58% at 68% 50%, rgba(10,94,132,0.45), transparent 70%),
    radial-gradient(34% 52% at 86% 42%, rgba(95,182,214,0.45), transparent 70%);
  filter: blur(58px);
  animation: lw-drift 18s ease-in-out infinite;
}
.lw-hero-inner { position: relative; z-index: 1; text-align: center; }
.lw-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 16px 7px 12px; border-radius: 999px;
  background: #fff; border: 1px solid var(--line); box-shadow: var(--sh-sm);
  font-size: 13px; font-weight: 650; color: var(--ink-2);
}
.lw-pill-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--grad); flex-shrink: 0; }
.lw-h1 {
  font-size: clamp(38px, 6.6vw, 68px); line-height: 1.04; letter-spacing: -0.03em;
  font-weight: 800; margin: 22px 0 18px; color: var(--ink);
}
.lw-grad-text { background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lw-lead {
  max-width: 640px; margin: 0 auto 30px; font-size: clamp(16px, 2.1vw, 19px);
  line-height: 1.58; color: var(--ink-2);
}
.lw-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

/* SHOWCASE / STATS */
.lw-showcase {
  position: relative; z-index: 1; margin-top: clamp(40px, 6vw, 64px);
  display: grid; grid-template-columns: repeat(4, 1fr);
  background: #fff; border: 1px solid var(--line); border-radius: 24px;
  box-shadow: var(--sh-lg); overflow: hidden;
}
.lw-stat { position: relative; padding: 28px 22px; text-align: center; }
.lw-stat + .lw-stat { border-left: 1px solid var(--line); }
.lw-stat-value {
  font-size: clamp(20px, 2.7vw, 28px); font-weight: 800; letter-spacing: -0.01em;
  background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent;
}
.lw-stat-label { font-size: 13px; color: var(--ink-3); margin-top: 6px; }

/* SECTIONS */
.lw-section { padding: clamp(56px, 8vw, 96px) 0; }
.lw-section--soft { background: var(--soft); }
.lw-head { text-align: center; max-width: 640px; margin: 0 auto clamp(34px, 4vw, 46px); }
.lw-eyebrow {
  display: inline-block; font-size: 12px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase;
  background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent;
  margin-bottom: 12px;
}
.lw-h2 { font-size: clamp(27px, 3.8vw, 40px); font-weight: 800; letter-spacing: -0.025em; margin: 0; color: var(--ink); line-height: 1.1; }
.lw-h2--left { text-align: left; margin: 10px 0 16px; }
.lw-sub { margin: 14px 0 0; font-size: 16.5px; line-height: 1.55; color: var(--ink-2); }

/* CARD base */
.lw-card {
  background: var(--card); border: 1px solid var(--line); border-radius: 20px;
  box-shadow: var(--sh-sm);
  transition: transform 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s ease, border-color 0.22s ease;
}

/* SERVICES */
.lw-bento { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.lw-service { padding: 28px 26px; }
.lw-service:hover { transform: translateY(-5px); box-shadow: var(--sh-md); border-color: rgba(20,136,171,0.45); }
.lw-service-icon {
  width: 54px; height: 54px; border-radius: 16px; display: flex; align-items: center;
  justify-content: center; font-size: 26px; margin-bottom: 16px;
  background: var(--grad-soft); border: 1px solid var(--line);
}
.lw-service-title { font-size: 18.5px; font-weight: 700; margin: 0 0 8px; color: var(--ink); letter-spacing: -0.01em; }
.lw-service-desc { font-size: 14.5px; line-height: 1.58; color: var(--ink-2); margin: 0; }

/* OFERTA */
.lw-offer-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
.lw-offer-card { padding: 28px 30px; }
.lw-offer-card:hover { transform: translateY(-3px); box-shadow: var(--sh-md); }
.lw-offer-title { font-size: 16.5px; font-weight: 750; color: var(--ink); margin: 0 0 16px; letter-spacing: -0.01em; display: flex; align-items: center; gap: 10px; }
.lw-offer-title::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--grad); flex-shrink: 0; }
.lw-offer-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 11px; }
.lw-offer-list li {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  font-size: 14.5px; color: var(--ink-2);
  border-bottom: 1px solid var(--line); padding-bottom: 11px;
}
.lw-offer-list li:last-child { border-bottom: none; padding-bottom: 0; }
.lw-unit {
  flex-shrink: 0; font-size: 11px; font-weight: 750; letter-spacing: 0.3px; text-transform: uppercase;
  color: var(--brand); background: rgba(20,136,171,0.12); border-radius: 999px; padding: 3px 10px;
}

/* TAGS */
.lw-tags { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-width: 820px; margin: 0 auto; }
.lw-tag {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 10px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; color: var(--ink);
  background: #fff; border: 1px solid var(--line); box-shadow: var(--sh-sm);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.lw-tag:hover { transform: translateY(-2px); border-color: rgba(20,136,171,0.45); }
.lw-tag--check span {
  color: #fff; background: var(--grad); width: 16px; height: 16px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800;
}

/* REFERENCJE */
.lw-ref-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.lw-ref { padding: 26px 22px; text-align: center; }
.lw-ref:hover { transform: translateY(-3px); box-shadow: var(--sh-md); }
.lw-ref-name { font-size: 16.5px; font-weight: 750; color: var(--ink); letter-spacing: -0.01em; }
.lw-ref-type { font-size: 12.5px; color: var(--ink-3); margin-top: 5px; }

/* ABOUT */
.lw-about { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: clamp(28px, 5vw, 56px); align-items: center; }
.lw-about-p { font-size: 16.5px; line-height: 1.62; color: var(--ink-2); margin: 0; max-width: 560px; }
.lw-list { margin: 24px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(2, 1fr); gap: 13px 24px; }
.lw-list li { position: relative; padding-left: 30px; font-size: 15px; color: var(--ink-2); line-height: 1.45; }
.lw-list li::before {
  content: '✓'; position: absolute; left: 0; top: -1px; width: 21px; height: 21px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #fff;
  background: var(--grad);
}
.lw-about-visual {
  position: relative; aspect-ratio: 1 / 1; border-radius: 28px; overflow: hidden;
  background: linear-gradient(160deg, #063b52, #0a4a68);
  border: 1px solid var(--line); box-shadow: var(--sh-lg);
  display: flex; align-items: center; justify-content: center;
}
.lw-about-glow {
  position: absolute; inset: -30%;
  background:
    radial-gradient(40% 40% at 30% 30%, rgba(54,182,196,0.55), transparent 70%),
    radial-gradient(40% 40% at 70% 65%, rgba(10,94,132,0.55), transparent 70%),
    radial-gradient(45% 45% at 60% 40%, rgba(20,136,171,0.55), transparent 70%);
  filter: blur(30px); animation: lw-drift2 16s ease-in-out infinite;
}
.lw-about-logo { position: relative; width: 62%; filter: brightness(0) invert(1); opacity: 0.96; }
.lw-about-badge {
  position: absolute; bottom: 18px; right: 18px; padding: 8px 14px; border-radius: 999px;
  background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.30);
  backdrop-filter: blur(8px); color: #fff; font-size: 13px; font-weight: 750; letter-spacing: 0.4px;
}

/* CTA BAND (kontakt) */
.lw-cta-band { padding: clamp(40px, 5vw, 64px) 0; }
.lw-cta-band-inner {
  position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: space-between; gap: 32px; flex-wrap: wrap;
  background: linear-gradient(135deg, #063b52 0%, #0a5e84 55%, #1488ab 100%);
  border-radius: 28px; padding: clamp(32px, 4vw, 52px); box-shadow: var(--sh-lg);
}
.lw-cta-band-glow {
  position: absolute; inset: 0; opacity: 0.9; pointer-events: none;
  background:
    radial-gradient(40% 80% at 85% 20%, rgba(54,182,196,0.42), transparent 60%),
    radial-gradient(40% 80% at 70% 90%, rgba(20,136,171,0.45), transparent 60%),
    radial-gradient(30% 70% at 100% 60%, rgba(95,182,214,0.40), transparent 60%);
}
.lw-cta-band-text { position: relative; z-index: 1; flex: 1 1 360px; }
.lw-eyebrow--on-dark { color: #fff; -webkit-text-fill-color: #fff; background: none; }
.lw-cta-band-title { font-size: clamp(24px, 3.4vw, 36px); font-weight: 800; letter-spacing: -0.02em; color: #fff; margin: 8px 0 18px; line-height: 1.12; }
.lw-contact-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.lw-contact-list li { display: flex; align-items: center; gap: 12px; font-size: 15.5px; color: rgba(255,255,255,0.90); }
.lw-contact-list a { color: #fff; text-decoration: none; font-weight: 650; }
.lw-contact-list a:hover { text-decoration: underline; }
.lw-ci {
  width: 36px; height: 36px; flex-shrink: 0; border-radius: 11px; display: flex; align-items: center;
  justify-content: center; font-size: 16px;
  background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.20);
}
.lw-cta-band-actions { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 12px; }

/* FOOTER */
.lw-footer { padding: 40px 0 56px; border-top: 1px solid var(--line); text-align: center; }
.lw-footer .lw-wrap { display: grid; gap: 6px; }
.lw-footer-legal { font-size: 13.5px; font-weight: 650; color: var(--ink-2); }
.lw-footer-reg { font-size: 12.5px; color: var(--ink-3); }
.lw-footer-links { display: flex; gap: 10px; justify-content: center; align-items: center; font-size: 13px; margin-top: 4px; }
.lw-footer-links a { color: var(--brand); text-decoration: none; font-weight: 650; }
.lw-footer-links a:hover { text-decoration: underline; }
.lw-footer-links span { color: var(--ink-3); }
.lw-footer-copy { font-size: 12px; color: var(--ink-3); margin-top: 6px; }

/* REVEAL + drift */
.lw-reveal { animation: lw-rise 0.75s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes lw-rise {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes lw-drift {
  0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
  50% { transform: translateX(-50%) translateY(18px) scale(1.06); }
}
@keyframes lw-drift2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(10px, -12px) scale(1.08); }
}

/* RESPONSIVE */
@media (max-width: 980px) {
  .lw-about { grid-template-columns: 1fr; }
  .lw-about-visual { width: 100%; max-width: 420px; margin: 0 auto; }
}
@media (max-width: 860px) {
  .lw-bento { grid-template-columns: repeat(2, 1fr); }
  .lw-ref-grid { grid-template-columns: repeat(2, 1fr); }
  .lw-offer-grid { grid-template-columns: 1fr; }
  .lw-showcase { grid-template-columns: repeat(2, 1fr); }
  .lw-stat:nth-child(3) { border-left: none; }
  .lw-stat:nth-child(n+3) { border-top: 1px solid var(--line); }
}
@media (max-width: 600px) {
  .lw-navlink span { display: none; }
  .lw-bento { grid-template-columns: 1fr; }
  .lw-ref-grid { grid-template-columns: 1fr; }
  .lw-list { grid-template-columns: 1fr; }
  .lw-cta-band-inner { flex-direction: column; align-items: stretch; }
  .lw-cta-band-actions { flex-direction: row; }
  .lw-cta-band-actions .lw-btn { flex: 1; }
}
@media (max-width: 440px) {
  .lw-showcase { grid-template-columns: 1fr; }
  .lw-stat + .lw-stat { border-left: none; border-top: 1px solid var(--line); }
  .lw-nav .lw-btn-sm { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .lw-reveal, .lw-hero-glow, .lw-about-glow { animation: none; }
}
`;
