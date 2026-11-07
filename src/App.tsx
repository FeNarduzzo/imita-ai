import { useState } from 'react';
import { Confirm } from './components/ui';
import { useGame } from './game/useGame';
import { Home } from './screens/Home';
import { Final, Reveal, RoundEnd, Wheel } from './screens/Results';
import { AllDone, Create, Draw, Handoff, Listen, Record } from './screens/Turn';

export default function App() {
  const api = useGame();
  const [quit, setQuit] = useState(false);
  const g = api.game;
  const onQuit = () => setQuit(true);
  const key = g ? `${api.phase}-${g.round.index}-${g.round.turn}` : api.phase;

  let screen;
  if (!g || api.phase === 'home') screen = <Home api={api} />;
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

  return (
    <div className="app">
      <div key={key} style={{ display: 'contents' }}>{screen}</div>
      {quit && (
        <Confirm
          title="Sair da partida?"
          body="Os pontos desta partida serão perdidos."
          yes="Sair"
          onNo={() => setQuit(false)}
          onYes={() => { setQuit(false); api.toMenu(); }}
        />
      )}
    </div>
  );
}
