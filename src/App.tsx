import { useState } from 'react';
import { Confirm } from './components/ui';
import type { Player } from './game/model';
import { loadSelfId, saveSelfId } from './game/storage';
import { useGame } from './game/useGame';
import { useOnline } from './online/useOnline';
import { Home } from './screens/Home';
import { Ended, Lobby, OnlineGame, OnlineHub } from './screens/Online';
import { Final, Reveal, RoundEnd, Wheel } from './screens/Results';
import { Salao, type Dest } from './screens/Salao';
import { AllDone, Create, Draw, Handoff, Listen, Record } from './screens/Turn';
import { Wardrobe } from './screens/Wardrobe';

type View = 'salao' | 'imitacao' | 'online-hub';

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
  const [view, setView] = useState<View>(linkCode ? 'online-hub' : 'salao');
  const [selfId, setSelfId] = useState(() => loadSelfId(api.players));
  const [dress, setDress] = useState<{ pid: string; tab: 'closet' | 'shop' } | null>(null);
  const [salaoKey, setSalaoKey] = useState(0);
  const g = api.game;
  const onQuit = () => setQuit(true);
  const self = api.players.find((p) => p.id === selfId) || api.players[0];

  const openDress = (p: Player, tab: 'closet' | 'shop' = 'closet') => setDress({ pid: p.id, tab });
  const switchSelf = () => {
    const i = api.players.findIndex((p) => p.id === self.id);
    const next = api.players[(i + 1) % api.players.length];
    setSelfId(next.id);
    saveSelfId(next.id);
    setSalaoKey((k) => k + 1);
  };
  const openDest = (d: Dest) => {
    if (d === 'imitacao') setView('imitacao');
    else if (d === 'imitacao-online') setView('online-hub');
  };

  let screen;
  let key: string;
  if (online.role) {
    key = 'online';
    if (online.ended) screen = <Ended message={online.ended} onBack={() => { online.leave(); setView('salao'); }} />;
    else if (online.shared?.phase === 'lobby') screen = <Lobby api={api} online={online} onQuit={onQuit} />;
    else screen = <OnlineGame api={api} online={online} onQuit={onQuit} />;
  } else if (g && api.phase !== 'home') {
    key = `${api.phase}-${g.round.index}-${g.round.turn}`;
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
  } else if (view === 'online-hub') {
    key = 'hub';
    screen = <OnlineHub self={self} online={online} initialCode={linkCode || ''} onDress={() => openDress(self)} onBack={() => { setView('salao'); online.setError(null); }} />;
  } else if (view === 'imitacao') {
    key = 'imitacao';
    screen = <Home api={api} onBack={() => setView('salao')} onDress={(p) => openDress(p)} />;
  } else {
    key = `salao-${salaoKey}`;
    screen = <Salao self={self} players={api.players} onSwitchSelf={switchSelf} onDress={openDress} onOpen={openDest} />;
  }

  const dressPlayer = dress && api.players.find((p) => p.id === dress.pid);
  const inOnline = !!online.role;
  return (
    <div className="app">
      {dressPlayer ? (
        <Wardrobe
          key={`dress-${dressPlayer.id}`}
          player={dressPlayer}
          initialTab={dress!.tab}
          onClose={() => { setDress(null); setSalaoKey((k) => k + 1); }}
          onSave={(look) => {
            api.setPlayers(api.players.map((p) => (p.id === dressPlayer.id ? { ...p, look } : p)));
            setDress(null);
            setSalaoKey((k) => k + 1);
          }}
        />
      ) : (
        <div key={key} style={{ display: 'contents' }}>{screen}</div>
      )}
      {quit && (
        <Confirm
          title={inOnline ? (online.isHost ? 'Encerrar a sala?' : 'Sair da sala?') : 'Sair da partida?'}
          body={inOnline ? (online.isHost ? 'Todos os jogadores serão desconectados.' : 'Você sai da partida online.') : 'Os pontos desta partida serão perdidos.'}
          yes={inOnline && online.isHost ? 'Encerrar' : 'Sair'}
          onNo={() => setQuit(false)}
          onYes={() => {
            setQuit(false);
            if (inOnline) { online.leave(); setView('salao'); } else api.toMenu();
          }}
        />
      )}
    </div>
  );
}
