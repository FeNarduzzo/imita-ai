// Termos de Uso e Política de Privacidade (mostrados na tela de login e no perfil).
// Ao mudar algo importante, troque TERMS_VERSION: quem já tem conta aceita de novo ao entrar.
// Linhas que começam com "• " viram itens de lista.

export const TERMS_VERSION = '2026-11-08';
export const CONTROLLER = 'Felipe';
export const CONTACT_EMAIL = 'terceiraasso1@gmail.com';

export interface LegalSection { title: string; lines: string[] }
export interface LegalDoc { title: string; updated: string; sections: LegalSection[] }

export const TERMS: LegalDoc = {
  title: 'Termos de Uso',
  updated: '8 de novembro de 2026',
  sections: [
    {
      title: '1. Quem somos',
      lines: [
        `O Imita Aí! é um jogo gratuito feito por ${CONTROLLER}, como projeto pessoal e sem fins lucrativos, para jogar com amigos.`,
        `Contato para qualquer assunto: ${CONTACT_EMAIL}.`,
      ],
    },
    {
      title: '2. Aceitação',
      lines: [
        'Ao criar uma conta, você declara que leu e aceita estes Termos e a Política de Privacidade.',
        'Se não concordar, não crie a conta.',
      ],
    },
    {
      title: '3. Quem pode jogar',
      lines: [
        '• Idade mínima: 12 anos. Menores de 12 anos não podem criar conta.',
        '• De 12 a 17 anos, só com autorização do pai, da mãe ou do responsável legal, informada no cadastro.',
        `• O responsável pode pedir, a qualquer momento, acesso aos dados ou a exclusão da conta pelo e-mail ${CONTACT_EMAIL}.`,
        '• As informações do cadastro precisam ser verdadeiras. Uma conta com dado falso (por exemplo, a idade) pode ser suspensa ou excluída.',
      ],
    },
    {
      title: '4. Sua conta',
      lines: [
        '• Você é responsável pelo seu nome de usuário e pela sua senha. Não compartilhe a senha com ninguém.',
        '• O nome de usuário não pode ofender, se passar por outra pessoa nem ter conteúdo impróprio.',
        '• O jogo não envia e-mails. Se esquecer a senha, peça ajuda pelo contato acima: depois de confirmar que a conta é sua, o admin define uma senha nova.',
        '• Você pode excluir sua conta quando quiser, no próprio jogo, em Perfil → Excluir minha conta.',
      ],
    },
    {
      title: '5. Moedas, XP, níveis e itens',
      lines: [
        '• Moedas, XP, níveis, roupas e outros itens são virtuais. Só valem dentro do jogo e não têm valor em dinheiro.',
        '• Eles não são vendidos por dinheiro real, não podem ser trocados por dinheiro ou por bens e não podem ser negociados fora do jogo.',
        '• As apostas nas mesas de cartas usam só moedas do jogo. Não existe aposta com dinheiro real.',
        '• O jogo não tem caixas de recompensa (loot boxes) nem prêmios aleatórios comprados.',
        '• O admin pode corrigir ou remover moedas, XP e itens obtidos por erro, falha ou trapaça, e pode mudar preços e regras para manter o jogo equilibrado.',
      ],
    },
    {
      title: '6. Regras de convivência',
      lines: [
        'Não é permitido:',
        '• trapacear, usar programas ou versões modificadas do jogo ou se aproveitar de falhas;',
        '• ofender, ameaçar, assediar ou discriminar outras pessoas, inclusive nas gravações de voz;',
        '• gravar ou mandar conteúdo ilegal, sexual, violento ou que exponha outras pessoas;',
        '• criar outra conta para escapar de uma punição;',
        '• tentar entrar na conta de outra pessoa ou acessar dados que não são seus.',
      ],
    },
    {
      title: '7. Moderação e punições',
      lines: [
        '• O admin pode aplicar advertência, suspensão com prazo ou banimento.',
        '• Suspensões e banimentos valem para a conta e para os aparelhos usados por ela. Em casos graves, um endereço IP pode ser bloqueado por tempo limitado.',
        `• Toda punição tem o motivo registrado. Para contestar, escreva para ${CONTACT_EMAIL}.`,
      ],
    },
    {
      title: '8. Microfone e gravações de voz',
      lines: [
        '• No modo Imitação o jogo usa o microfone só enquanto você está gravando.',
        '• Jogando num aparelho só, a gravação fica nesse aparelho.',
        '• No modo online, a gravação vai direto para os aparelhos dos jogadores da sala, para eles ouvirem e o jogo dar a nota. Ela não fica guardada nos servidores do jogo.',
        '• Só grave o que você aceita que os outros jogadores da sala escutem.',
      ],
    },
    {
      title: '9. Sons e conteúdo',
      lines: [
        '• Os sons que já vêm no jogo são do próprio Imita Aí!.',
        '• Pacotes de som que você importa continuam pertencendo aos seus autores. Importe só o que você tem direito de usar.',
      ],
    },
    {
      title: '10. Disponibilidade',
      lines: [
        '• O jogo é gratuito e oferecido como está. Ele pode ficar fora do ar, mudar ou ser encerrado.',
        '• O servidor gratuito pode pausar se ninguém jogar por alguns dias. Mudanças importantes serão avisadas no jogo sempre que possível.',
      ],
    },
    {
      title: '11. Responsabilidade',
      lines: [
        'Na medida permitida pela lei, não respondemos por progresso perdido por falha técnica, por mau uso da sua conta ou por conteúdo enviado por outros jogadores.',
        'Nada nestes Termos tira direitos que a lei garante a você.',
      ],
    },
    {
      title: '12. Mudanças nestes Termos',
      lines: ['Estes Termos podem ser atualizados. Se a mudança for importante, o jogo vai pedir que você aceite a nova versão ao entrar.'],
    },
    {
      title: '13. Lei aplicável',
      lines: [
        'Valem as leis do Brasil, entre elas o Marco Civil da Internet (Lei 12.965/2014), a Lei Geral de Proteção de Dados (Lei 13.709/2018), o Estatuto da Criança e do Adolescente (Lei 8.069/1990) e o ECA Digital (Lei 15.211/2025).',
        'Fica eleito o foro do domicílio do usuário.',
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Política de Privacidade',
  updated: '8 de novembro de 2026',
  sections: [
    {
      title: '1. Quem cuida dos seus dados',
      lines: [
        `O controlador dos dados é ${CONTROLLER}, responsável pelo Imita Aí!. Contato: ${CONTACT_EMAIL}.`,
        'Como agente de tratamento de pequeno porte, não indicamos encarregado (Resolução CD/ANPD nº 2/2022). Esse e-mail é o canal para qualquer assunto sobre dados pessoais.',
      ],
    },
    {
      title: '2. Quais dados coletamos',
      lines: [
        '• Cadastro: nome de usuário, senha (guardada só de forma criptografada; nem o admin consegue ver) e data de nascimento.',
        '• Se você tem de 12 a 17 anos: nome e e-mail do responsável e a data da autorização.',
        '• Jogo: moedas, XP, nível, itens, roupa do personagem, extrato de moedas e de XP e códigos usados.',
        '• Registros de acesso: endereço IP, identificador do aparelho (um número aleatório criado pelo jogo), tipo de aparelho ou navegador, e data e hora de cada acesso.',
        '• Moderação: advertências, suspensões e banimentos, com o motivo.',
        '• Não coletamos nome completo, CPF, endereço, localização, contatos, fotos nem dados de pagamento.',
      ],
    },
    {
      title: '3. Para que usamos (e a base legal na LGPD)',
      lines: [
        '• Criar e manter sua conta e seu progresso: execução dos Termos de Uso (art. 7º, V).',
        '• Conferir a idade e a autorização do responsável: proteção de crianças e adolescentes (art. 14) e cumprimento de obrigação legal (art. 7º, II).',
        '• Registros de acesso, combate a trapaça e aplicação de punições: legítimo interesse na segurança do jogo (art. 7º, IX) e guarda de registros prevista no Marco Civil da Internet (art. 15).',
        '• E-mail do responsável: só para falar sobre a conta do menor.',
        '• Não mostramos anúncios, não vendemos dados e não montamos perfis para propaganda.',
      ],
    },
    {
      title: '4. Crianças e adolescentes',
      lines: [
        '• Menores de 12 anos não podem criar conta. De 12 a 17 anos, só com autorização do responsável.',
        '• Usamos só os dados necessários para o jogo funcionar, sempre no melhor interesse do adolescente.',
        '• O jogo não tem anúncios, não vende nada por dinheiro real e não tem caixas de recompensa.',
        '• A idade é a informada no cadastro. Se soubermos que alguém informou a idade errada, a conta pode ser suspensa até a situação ser resolvida.',
      ],
    },
    {
      title: '5. Com quem os dados são compartilhados',
      lines: [
        '• Supabase: guarda as contas e o banco de dados do jogo, em servidores na região de São Paulo. A empresa é dos Estados Unidos, então pode haver acesso técnico a partir de outro país, com as garantias de segurança do provedor.',
        '• GitHub Pages: hospeda o site do jogo e registra acessos conforme a política própria do GitHub.',
        '• PeerJS: serviço público que ajuda a conectar os aparelhos no modo online. Ele vê o endereço IP de quem se conecta.',
        '• Outros jogadores da sala: no modo online os aparelhos se conectam direto entre si, então eles podem ver o endereço IP uns dos outros. Eles também recebem seu nome de usuário, seu personagem e suas gravações daquela partida.',
        '• Autoridades: só com ordem judicial, como manda o Marco Civil da Internet.',
      ],
    },
    {
      title: '6. Por quanto tempo guardamos',
      lines: [
        '• Conta e progresso: enquanto a conta existir. Se você excluir a conta, eles são apagados na hora.',
        '• Registros de acesso: 6 meses. Depois são apagados automaticamente, mesmo que a conta já tenha sido excluída.',
        '• Punições: enquanto forem necessárias para a segurança do jogo, para impedir que alguém fuja de uma punição criando outra conta.',
        '• O que fica salvo no seu aparelho (preferências, sessão de login, identificador do aparelho) fica até você sair da conta ou limpar os dados do app.',
      ],
    },
    {
      title: '7. Seus direitos',
      lines: [
        'Pela LGPD (art. 18) você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização ou eliminação de dados desnecessários, portabilidade, eliminação, informação sobre com quem compartilhamos e revogação do consentimento.',
        `• Para excluir a conta, use Perfil → Excluir minha conta. Para os outros pedidos, escreva para ${CONTACT_EMAIL}. Respondemos em até 15 dias.`,
        '• Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em gov.br/anpd.',
      ],
    },
    {
      title: '8. Segurança',
      lines: [
        '• As senhas são guardadas criptografadas pelo provedor. A conexão com o servidor é criptografada (HTTPS).',
        '• Regras no próprio banco de dados fazem cada jogador ver só os próprios dados. Só o admin vê registros de acesso e punições.',
        '• Se acontecer um incidente de segurança que possa causar risco ou dano relevante, avisaremos as pessoas afetadas e a ANPD (art. 48).',
      ],
    },
    {
      title: '9. Cookies e armazenamento no aparelho',
      lines: ['Não usamos cookies de rastreamento nem anúncios. O jogo guarda no aparelho só as preferências, a sessão de login e o identificador do aparelho.'],
    },
    {
      title: '10. Mudanças nesta política',
      lines: ['Esta política pode ser atualizada. Se a mudança for importante, o jogo vai avisar e pedir que você aceite a nova versão ao entrar.'],
    },
  ],
};
