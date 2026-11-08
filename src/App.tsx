import { useState } from 'react';
import { Confirm } from './components/ui';
import { useGame } from './game/useGame';
import { useOnline } from './online/useOnline';
import { Home } from './screens/Home';
import { Ended, Lobby, OnlineGame, OnlineHub } from './screens/Online';
import { Final, Reveal, RoundEnd, Wheel } from './screens/Results';
import { AllDone, Create, Draw, Handoff, Listen, Record } from './screens/Turn';

/** Código de sala vindo de um link (…/#sala=ABCD). */
function codeFromLink(): string | null {
  const m = location.hash.match(/sala=([A-Za-z]{4})/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return m[1].toUpperCase();
}

export default function App() {
  const api = useGame();
  const online = useOnline(api);
  const [quit, setQuit] = useState(false);
  const [linkCode] = useState(codeFromLink);
  const [hub, setHub] = useState(!!linkCode);
  const g = api.game;
  const onQuit = () => setQuit(true);

  let screen;
  let key: string;
  if (online.role) {
    key = 'online';
    if (online.ended) screen = <Ended message={online.ended} onBack={() => { online.leave(); setHub(false); }} />;
    else if (online.shared?.phase === 'lobby') screen = <Lobby api={api} online={online} onQuit={onQuit} />;
    else screen = <OnlineGame api={api} online={online} onQuit={onQuit} />;
  } else if (hub) {
    key = 'hub';
    screen = <OnlineHub api={api} online={online} initialCode={linkCode || ''} onBack={() => { setHub(false); online.setError(null); }} />;
  } else {
    key = g ? `${api.phase}-${g.round.index}-${g.round.turn}` : api.phase;
    if (!g || api.phase === 'home') screen = <Home api={api} onOnline={() => setHub(true)} />;
    else {
      const props = { api, g, onQuit };
      switch (api.phase) {
        case 'draw': screen = <Draw {...props} />; break;
        case 'create': screen = <Create {...props} />; break;
        case 'handoff': screen = <Handoff {...props} />; break;
        case 'listen': screen = <Listen {...props} />; break;
        case 'record': screen = <Record {...props} />; break;
        case 'allDone': screen = <AllDone {...props} />; break;
        case 'reveal': screen = <Reveal {...props} />; break;
        case 'roundEnd': screen = <RoundEnd {...props} />; break;
        case 'wheel': screen = <Wheel {...props} />; break;
        case 'final': screen = <Final api={api} g={g} />; break;
      }
    }
  }

  const inOnline = !!online.role;
  return (
    <div className="app">
      <div key={key} style={{ display: 'contents' }}>{screen}</div>
      {quit && (
        <Confirm
          title={inOnline ? (online.isHost ? 'Encerrar a sala?' : 'Sair da sala?') : 'Sair da partida?'}
          body={inOnline ? (online.isHost ? 'Todos os jogadores serão desconectados.' : 'Você sai da partida online.') : 'Os pontos desta partida serão perdidos.'}
          yes={inOnline && online.isHost ? 'Encerrar' : 'Sair'}
          onNo={() => setQuit(false)}
          onYes={() => {
            setQuit(false);
            if (inOnline) { online.leave(); setHub(false); } else api.toMenu();
          }}
        />
      )}
    </div>
  );
}
