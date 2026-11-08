# Imita Aí!

Jogo de festa de imitação para jogar em um só aparelho: o jogo toca um som, cada pessoa imita na sua vez, e o
microfone dá a nota (fala/timbre, tom e ritmo). Tem modos Clássico e Times, roleta de sabotagens e bônus,
sons misteriosos, desafios gravados pelos próprios jogadores e pacotes de som.

## Jogar

| Plataforma | Arquivo | Como instalar |
|---|---|---|
| Android | `ImitaAi.apk` | Copie para o celular, abra e permita "instalar apps desconhecidos". |
| Windows | `ImitaAi-Instalador-*.exe` ou `ImitaAi-Portatil-*.exe` | Instalador cria atalho; o portátil roda direto. O Windows pode avisar "editor desconhecido": clique em *Mais informações → Executar assim mesmo*. |
| macOS | `ImitaAi-*-mac-arm64.zip` (Apple Silicon) ou `ImitaAi-*-mac-x64.zip` (Intel) | Descompacte, mova para Aplicativos e siga o `LEIA-ME.txt` (dois comandos no Terminal, uma vez só). |
| iPhone / iPad | **https://fenarduzzo.github.io/imita-ai/** | Abra no Safari → Compartilhar ⬆️ → **Adicionar à Tela de Início**. Vira um app com ícone, tela cheia e funciona offline. Não precisa de Mac nem de conta Apple. |
| Navegador | `npm run dev` | Abra `http://localhost:5173` no Chrome/Edge do computador. |

### Seus pacotes no iPhone (ou em qualquer aparelho)

O site público vem só com os sons nativos. Para jogar com os pacotes da Oficina:

1. No PC, rode `npm run export-packs` (gera `release/ImitaAi-pacotes.zip`).
2. Mande o zip para o celular (iCloud Drive, WhatsApp como documento, e-mail, Google Drive…) e salve em **Arquivos**.
3. No app: **Importar pacotes** → escolha o zip. Os pacotes ficam guardados no aparelho.

Também dá para importar uma pasta da Oficina zipada (`theme.json` + `.wav`) ou áudios soltos (mp3, wav, m4a).

## Jogar online

Cada um joga no próprio celular (ou computador):

1. Uma pessoa toca em **Jogar online → Criar sala**. Aparecem um código de 4 letras e um QR code.
2. Os outros abrem o Imita Aí!, tocam em **Jogar online** e digitam o código (ou abrem o link / leem o QR).
3. O anfitrião escolhe a gravação: **Todos juntos** (cada um num lugar) ou **Um de cada vez** (todos na
   mesma sala, para as vozes não se misturarem) e toca em **Começar**.

As regras, rodadas e pacotes vêm da tela inicial do anfitrião. A conexão é direta entre os aparelhos
(WebRTC/PeerJS): funciona melhor no mesmo Wi-Fi, mas também pela internet.

## Desenvolvimento

```bash
npm install
npm run dev          # navegador (localhost)
npm run desktop      # app desktop (Electron)
npm run dist:win     # .exe (instalador + portátil) em release/
npm run dist:mac-zip # .zip de macOS montado no Windows (depois do dist:win)
npm run dist:mac     # .dmg/.zip assinável — precisa rodar num Mac
npm run android:apk  # APK assinado em android/app/build/outputs/apk/release/
npx cap open ios     # abre o projeto no Xcode (num Mac)
```

Pacotes de som: `npm run import-packs -- "<pasta com subpastas theme.json + .wav>"` converte para `public/packs`.
Sem argumento, usa a pasta do Steam Workshop. Os pacotes da comunidade são de terceiros: use só pessoalmente,
não publique o app nas lojas com eles.

A chave que assina o APK fica em `android/keystore/` (fora do git). Guarde uma cópia: sem ela, atualizações do
APK não instalam por cima da versão anterior.

## Builds na nuvem (macOS, iOS, Windows)

Suba esta pasta para um repositório no GitHub e rode **Actions → Build apps → Run workflow**. Os arquivos
aparecem em *Artifacts* ao final.
