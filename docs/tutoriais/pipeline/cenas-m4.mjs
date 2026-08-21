// Módulo 4 — Social media. Mostra a confirmação do "baixar = postar", mas NÃO confirma.
import { SITE } from './motor.mjs'

async function naAbaVideos(h) {
  await h.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));history.replaceState({},'','/')`)
  await h.sleep(500)
  await h.abrir(SITE)
  await h.sleep(2200)
  const escolha = await h.js(`String(document.body.innerText.indexOf('Escolha o especialista')>=0)`)
  if (String(escolha).trim() === 'true') {
    await h.clicar('button, a, [class*=cursor-pointer]', 'Jaylton')
    await h.sleep(3000)
    await h.kit()
  }
  await h.ir('Vídeos')
  await h.sleep(2400)
}

// abre o primeiro vídeo da lista (o botão de copiar link vive dentro do card; 2 níveis acima é o card).
// Nome fixo não serve: o que está em Conteúdo hoje some de Conteúdo amanhã, quando é postado.
async function abrirPrimeiro(h) {
  await h.clicarPai('[aria-label="Copiar link do vídeo"]', '', 2)
  await h.sleep(2000)
}

async function noVideo(h) {
  await naAbaVideos(h)
  await h.clicar('button', 'Conteúdo')
  await h.sleep(1800)
  await abrirPrimeiro(h)
}

export default [
  {
    id: 'm4-01',
    pre: naAbaVideos,
    // a abertura só NOMEIA as abas (quem explica o "Em revisão" é a cena seguinte).
    // Cada nome é uma frase própria e vem no COMEÇO dela — senão o destaque acende antes da palavra.
    frases: [
      'Essa aba é a sua: os vídeos já editados, prontos pra ir pro ar.',
      'Em revisão.',
      'Conteúdo.',
      'Cortes.',
      'E postados.',
    ],
    acoes: [
      async () => {},
      async (h) => { await h.destacar('button', 'Em revisão', 10) },
      async (h) => { await h.destacar('button', 'Conteúdo', 10) },
      async (h) => { await h.destacar('button', 'Cortes', 10) },
      async (h) => { await h.destacar('button', 'Postados', 10); await h.sleep(1800); await h.apagar() },
    ],
  },
  {
    id: 'm4-02',
    pre: naAbaVideos,
    frases: [
      'Em revisão é o que acabou de sair da edição e ainda não foi checado.',
      'Quem revisa é você: abre, assiste e, se estiver aprovado, marca revisado. Só depois ele vai pro ar.',
    ],
    acoes: [
      // o botão da sub-aba já acendeu na cena anterior: aqui o alvo é o card amarelo…
      async (h) => { await h.destacarPai('[aria-label="Copiar link do vídeo"]', '', 2, 12) },
      // …e aqui a ação que a fala descreve: abrir e ver o botão Marcar revisado
      async (h) => {
        await h.apagar()
        await h.clicarPai('[aria-label="Copiar link do vídeo"]', '', 2)
        await h.sleep(1200)
        await h.destacar('button', 'Marcar revisado', 10)
      },
    ],
  },
  {
    id: 'm4-03',
    frases: [
      'Clicando, o vídeo toca aqui mesmo.',
      'O nome é limpo e tem uma frase explicando do que se trata.',
      'E aqui mostra quem subiu: dúvida sobre um corte, você já sabe com quem falar.',
    ],
    async pre(h) { await naAbaVideos(h); await h.clicar('button', 'Conteúdo'); await h.sleep(1800) },
    acoes: [
      async (h) => { await abrirPrimeiro(h) },
      async (h) => { await h.destacar('', 'Aspectos legais', 10) },
      async (h) => { await h.destacar('', 'Subido por', 10); await h.sleep(3000); await h.apagar() },
    ],
  },
  {
    id: 'm4-04',
    pre: noVideo,
    frases: [
      'Aprovou? O botão principal marca revisado.',
      'O vídeo sai do amarelo e o card lá no quadro é arquivado sozinho.',
      'Nos que já foram revisados, esse mesmo botão mostra a etapa seguinte: marcar postado.',
    ],
    acoes: [
      async (h) => { await h.destacar('button', 'Marcar postado', 10) },
      async () => {},
      async (h) => { await h.sleep(4200); await h.apagar() },
    ],
  },
  {
    id: 'm4-05',
    frases: [
      'Esse botão copia o link do vídeo.',
      'Dá pra copiar direto do card, sem nem abrir.',
      'Colando no ClickUp, no Slack ou no WhatsApp, aparece o card com título, descrição e capa — e quem recebe assiste sem precisar de acesso ao Drive.',
    ],
    async pre(h) { await naAbaVideos(h); await h.clicar('button', 'Conteúdo'); await h.sleep(1800) },
    acoes: [
      async (h) => { await abrirPrimeiro(h); await h.destacar('button', 'Copiar link', 10) },
      async (h) => {
        await h.apagar()
        await h.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
        await h.sleep(800)
        await h.destacar('[aria-label="Copiar link do vídeo"]', '', 12)
      },
      async () => {},
    ],
  },
  {
    id: 'm4-06',
    pre: noVideo,
    frases: [
      'E quando você baixa um vídeo que ainda não foi postado, ele avisa que vai pra Postados.',
      'Confirmando, baixa e marca de uma vez: é o que impede postar o mesmo vídeo duas vezes.',
      'A lista se atualiza sozinha de hora em hora, e o botão Atualizar busca na hora.',
    ],
    acoes: [
      async (h) => { await h.clicar('a, button', 'Baixar') },
      async (h) => { await h.destacar('', 'vai pra Postados', 12); await h.sleep(3000); await h.apagar(); await h.clicar('button', 'Cancelar') },
      async (h) => {
        await h.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
        await h.sleep(1000)
        await h.destacar('button', 'Atualizar', 10)
        await h.sleep(2600)
        await h.apagar()
      },
    ],
  },
]
