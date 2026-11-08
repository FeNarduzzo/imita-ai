# Novidades

## 1.4

- **Modo online:** cada um joga no próprio celular. Toque em "Jogar online" na tela inicial.
- **Salas com código de 4 letras:** o anfitrião cria a sala; os outros entram digitando o código,
  abrindo o link (`…/#sala=XXXX`) ou lendo o QR code.
- **Gravação "Todos juntos" ou "Um de cada vez":** todo mundo imita ao mesmo tempo (cada um num lugar)
  ou um por vez enquanto os outros ficam quietos (todos na mesma sala).
- **O anfitrião comanda a partida:** sorteia o som, manda o áudio para todos, dá as notas, avança a
  revelação e o ranking; quem gira a roleta gira no próprio celular.
- **Conexão direta entre os aparelhos** (WebRTC via PeerJS, com servidores TURN gratuitos do PeerJS):
  sem conta e sem custo.
- **"Continuar sem quem falta":** o anfitrião segue a rodada se alguém sair ou demorar.
- As regras da partida foram separadas em `src/game/engine.ts`, usado pelo jogo local e pelo online.

## 1.3

- **Som de jogo, não de chamada (iPhone):** a gravação agora usa um motor de áudio separado, que
  é fechado ao terminar; o motor de reprodução é recriado depois de cada gravação e liberado como
  mídia a cada toque na tela. Assim o iPhone sai do modo "chamada" e o volume volta a ser o de mídia.
- **Mais volume em tudo:** compressor na saída de áudio, que aumenta o volume percebido sem distorcer.
- **App iOS nativo:** sessão de áudio de reprodução (mídia).
- A gravação termina pelo tempo certo mesmo se a animação da tela atrasar.

## 1.2

- **Volume das gravações corrigido.** As imitações agora tocam no mesmo volume dos sons dos pacotes
  (nivelamento automático com limitador), em vez de saírem baixinhas.
- **iPhone:** depois de gravar, o áudio volta para o alto-falante em volume normal (antes ficava no
  modo "ligação") e o jogo toca mesmo com a chave de silencioso ligada.
- **Android:** o microfone grava sem o processamento de chamada, e os botões de volume controlam o
  volume de mídia.
- **Forma de onda que acompanha o som:** ao ouvir o original, ao gravar (com o original como guia e
  a sua voz sendo desenhada em tempo real) e na revelação de cada imitação, com um cursor que anda
  junto com o áudio.
- Versão aparece no rodapé da tela inicial.

## 1.1

- App web instalável (iPhone/Android pelo navegador) publicado no GitHub Pages, com modo offline.
- Importar pacotes de som no aparelho (.zip do Imita Aí, pastas da Oficina ou áudios soltos).

## 1.0

- Primeira versão: modos Clássico e Times, roleta de sabotagens e bônus, sons misteriosos,
  desafios gravados pelos jogadores, pacotes de som, apps para Android, Windows e macOS.
