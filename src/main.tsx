import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './styles.css';
import App from './App';
import { unlockAudio } from './audio/engine';

// iOS só libera o áudio dentro de um toque: a cada toque garantimos o som como mídia de jogo
// (e não como chamada), inclusive depois de cada gravação.
const unlock = () => { unlockAudio(); };
for (const ev of ['touchend', 'pointerdown', 'click', 'keydown']) {
  window.addEventListener(ev, unlock, { capture: true, passive: true });
}

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && location.search.includes('galeria')) {
  import('./dev/Gallery').then(({ Gallery }) => root.render(<Gallery />));
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// App instalável (iPhone/Android pelo navegador): funciona offline depois da 1ª visita.
const isNativeShell = 'Capacitor' in window || location.protocol === 'app:' || location.protocol === 'file:';
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'https:' && !isNativeShell) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
