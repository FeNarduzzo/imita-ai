# Novidades

## 1.1

- **Karaokê:** importe as suas músicas (elas ficam só no aparelho), separadas por estilo. O jogo
  tira a voz, mostra a linha da melodia e a sua voz ao vivo, e dá a nota pela afinação. Letra
  opcional (colada ou arquivo .lrc/.txt).
- **Palco de música** nas partidas de imitação: cortinas, refletores, e quem está na vez no foco de luz.
- **Placar ao vivo** com os nomes durante toda a partida.
- **Imitação online:** líder 👑 transferível que escolhe as regras e comanda a partida; quem chega
  no meio entra na próxima rodada.
- **Nova mesa: Tranca** (1x1 ou 2x2). Nas mesas, prêmio por vitória e taxa de 5% nos potes.
- **Loja nova:** joias, roupas novas, exclusivos de título (destravam pelo nível) e de código.
- **Conexão:** quem fecha o app de repente sai da sala em ~30 s (antes ficava preso).
  Salas da 1.0 e da 1.1 não se misturam: atualize o app para jogar online.

## 1.0 — lançamento (saiu do beta)

- **Contas:** só entra no jogo quem fez login. Cadastro com nome de usuário e senha, idade mínima
  de 12 anos e autorização do responsável de 12 a 17. Termos de Uso e Política de Privacidade na
  tela de login. Em "Minha conta" dá para trocar a senha e excluir a conta.
- **Salão:** tela inicial com abas Offline, Online e Wi-Fi e os jogos de cada uma.
- **Personagem, loja e vestiário:** cada um monta o seu personagem com roupas casuais compradas
  com moedas do jogo (moedas nunca são vendidas por dinheiro de verdade).
- **Mesas de cartas** (offline com bots ou online com código e líder 👑 transferível):
  Blackjack, Duvido! (o jogo do mentiroso, com balão), Truco Paulista com vira (1x1 ou 2x2) e
  Poker Texas Hold'em (até 6). Tudo configurável pelo líder; dá para entrar no meio entre as
  rodadas (menos no Truco). Apostas em jogo voltam para a carteira se a partida for interrompida.
- **Níveis e XP por categoria** (Imitação, Karaokê, Cartas, Social), com títulos de 🐣 Noob a
  🐐 Mito e moedas a cada nível.
- **Moedas, compras e códigos no servidor:** cada código vale uma vez por conta; o que se ganha
  sem internet é enviado quando a conexão volta.
- **Menu de admin:** jogadores, dar/tirar moedas, XP e itens, punições (advertência, suspensão,
  banimento e bloqueio de IP com prazo), nova senha, códigos promocionais e histórico.

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
