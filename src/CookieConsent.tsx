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

export function CookieConsent({ gtmId, reload = () => window.location.reload() }: { gtmId: string; reload?: () => void }) {
  const containerId = gtmId.trim();
  const [consent, setConsent] = useState(loadConsent);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (containerId && consent === 'accepted') loadGtm(containerId);
  }, [containerId, consent]);

  function chooseConsent(choice: Consent) {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_KEY, choice);
    } catch {
      if (consent === 'accepted' && choice === 'rejected') {
        setError('設定を保存できませんでした。ブラウザのストレージ設定を確認して、もう一度お試しください。');
        return;
      }
      // Still honor the choice for this visit when storage is unavailable.
    }
    setConsent(choice);
    setSettingsOpen(false);
    setError(null);
    // Removing a script cannot stop tags that it has already executed.
    if (consent === 'accepted' && choice === 'rejected') reload();
  }

  if (!containerId) return null;
  if (consent !== null && !settingsOpen) {
    return <button className="cookieSettingsButton" type="button" onClick={() => setSettingsOpen(true)}>Cookie設定</button>;
  }

  return (
    <section className="cookieConsent" role="dialog" aria-labelledby="cookie-consent-title" aria-describedby="cookie-consent-description">
      <h2 id="cookie-consent-title">Cookieの利用について</h2>
      <p id="cookie-consent-description">
        利用状況の分析のため、Google Tag Managerを通じてCookieを利用します。
        承認した場合のみ読み込みます。拒否しても地図の機能はすべて利用できます。
      </p>
      {consent !== null && <p>現在の設定: {consent === 'accepted' ? '承認済み' : '拒否済み'}</p>}
      {consent === 'accepted' && <p>拒否に変更すると、設定を反映するためページを再読み込みします。</p>}
      {error && <p role="alert">{error}</p>}
      <div className="cookieConsentActions">
        {consent !== null && <button type="button" onClick={() => { setSettingsOpen(false); setError(null); }}>閉じる</button>}
        <button type="button" onClick={() => chooseConsent('rejected')}>拒否する</button>
        <button type="button" onClick={() => chooseConsent('accepted')}>承認する</button>
      </div>
    </section>
  );
}
