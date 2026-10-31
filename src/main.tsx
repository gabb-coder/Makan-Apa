import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installErrorReporting } from './lib/errors';
import { useLang } from './lib/i18n';
import './lib/install';
import { applyTheme } from './lib/prefs';
import './styles/global.css';

applyTheme();
installErrorReporting();

/** Changing the language redraws the app in it (keeping the room open). */
function Root() {
  const lang = useLang();
  return <App key={lang} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is a bonus; the app works without it */
    });
  });
}
