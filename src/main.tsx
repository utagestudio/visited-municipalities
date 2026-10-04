import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CookieConsent } from './CookieConsent';
import './styles.css';
import { setupAboutDialog } from './aboutDialog';

setupAboutDialog();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <CookieConsent gtmId={import.meta.env.GTM_ID} />
  </StrictMode>,
);
