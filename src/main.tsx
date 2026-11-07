import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// App instalável (iPhone/Android pelo navegador): funciona offline depois da 1ª visita.
const isNativeShell = 'Capacitor' in window || location.protocol === 'app:' || location.protocol === 'file:';
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'https:' && !isNativeShell) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
