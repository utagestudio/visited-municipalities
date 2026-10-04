import { useEffect, useState } from 'react';

export const COOKIE_CONSENT_KEY = 'visitedMunicipalityMap:cookieConsent:v1';
type Consent = 'accepted' | 'rejected';

function loadConsent(): Consent | null {
  try {
    const saved = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    return saved === 'accepted' || saved === 'rejected' ? saved : null;
  } catch {
    return null;
  }
}

function loadGtm(gtmId: string) {
  // The DOM guard survives StrictMode effects and component remounts.
  if (document.getElementById('municipality-map-gtm')) return;

  const gtmWindow = window as Window & { dataLayer?: Record<string, unknown>[] };
  gtmWindow.dataLayer ??= [];
  gtmWindow.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = document.createElement('script');
  script.id = 'municipality-map-gtm';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(script);
}

export function CookieConsent({ gtmId }: { gtmId: string }) {
  const containerId = gtmId.trim();
  const [consent, setConsent] = useState(loadConsent);

  useEffect(() => {
    if (containerId && consent === 'accepted') loadGtm(containerId);
  }, [containerId, consent]);

  function chooseConsent(choice: Consent) {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_KEY, choice);
    } catch {
      // Still honor the choice for this visit when storage is unavailable.
    }
    setConsent(choice);
  }

  if (!containerId || consent !== null) return null;

  return (
    <section className="cookieConsent" role="dialog" aria-labelledby="cookie-consent-title" aria-describedby="cookie-consent-description">
      <h2 id="cookie-consent-title">Cookieの利用について</h2>
      <p id="cookie-consent-description">
        利用状況の分析のため、Google Tag Managerを通じてCookieを利用します。
        承認した場合のみ読み込みます。拒否しても地図の機能はすべて利用できます。
      </p>
      <div className="cookieConsentActions">
        <button type="button" onClick={() => chooseConsent('rejected')}>拒否する</button>
        <button type="button" onClick={() => chooseConsent('accepted')}>承認する</button>
      </div>
    </section>
  );
}
