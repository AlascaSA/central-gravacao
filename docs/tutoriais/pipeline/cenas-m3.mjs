// Módulo 3 — Gestão de operação. Refeito em cima do vídeo que o Gustavo gravou pra gestora:
// o fluxo real é abrir o card em A editar, copiar o link, colar na tarefa do ClickUp e mover o card.
// Só leitura: nada é alterado no quadro.
import { SITE } from './motor.mjs'

async function noQuadro(h) {
  await h.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));history.replaceState({},'','/')`)
  await h.sleep(600)
  await h.js(`window.__tut && __tut.apagar()`)
  const escolha = await h.js(`String(document.body.innerText.indexOf('Escolha o especialista')>=0)`)
  if (String(escolha).trim() === 'true') {
    await h.clicar('button, a, [class*=cursor-pointer]', 'Jaylton')
    await h.sleep(3000)
    await h.kit()
  }
  await h.ir('Quadro')
  await h.sleep(900)
}

// card com comentário (tem o balão amarelo) — é o exemplo das cenas 04 e 05
const CARD = 'Caixinha de perguntas, ângulo'

export default [
  {
    id: 'm3-01',
    pre: noQuadro,
    frases: [
      'Essa é a visão da semana: tudo o que a produção do especialista tem pra fazer.',
      'As copys sobem os roteiros, e é daqui que sai o que vai ser gravado.',
    ],
    acoes: [
      async (h) => { await h.destacar('button', 'hoje', 10) },
      // "as copys sobem os roteiros" → o botão Subir, não a coluna (a coluna é a cena seguinte)
      async (h) => { await h.destacar('button', 'Subir', 10); await h.sleep(3200); await h.apagar() },
    ],
  },
  {
    id: 'm3-02',
    pre: noQuadro,
    frases: [
      'A gravar é o que ainda vai pro estúdio.',
      'Para o especialista gravar é o que ele grava sozinho.',
      'A editar são os vídeos que já foram gravados e catalogados, esperando edição.',
      'E em edição é o que o editor já pegou.',
    ],
    acoes: [
      async (h) => { await h.destacarPai('', 'A GRAVAR', 1, 12) },
      async (h) => { await h.destacarPai('', 'PARA JAYLTON GRAVAR', 1, 12) },
      async (h) => { await h.destacarPai('', 'A EDITAR', 1, 12) },
      async (h) => { await h.destacarPai('', 'EM EDIÇÃO', 1, 12); await h.sleep(2600); await h.apagar() },
    ],
  },
  {
    id: 'm3-03',
    pre: noQuadro,
    frases: ['Vídeo que não sai essa semana, você adia — ele passa pra semana seguinte.'],
    acoes: [
      async (h) => { await h.destacar('button', 'Adiar 1 semana', 10); await h.sleep(3000); await h.apagar() },
    ],
  },
  {
    id: 'm3-04',
    pre: noQuadro,
    frases: [
      'Abrindo o card, você lê as tags dele:',
      'a copy responsável,',
      'a categoria — conteúdo, anúncio, institucional ou captação —',
      'e o produto.',
      'É por essas tags que você acha o vídeo depois, no filtro do Arquivo.',
    ],
    acoes: [
      async (h) => { await h.clicar('div', CARD) },
      async (h) => { await h.destacar('', 'COPY', 10) },
      async (h) => { await h.destacar('', 'CATEGORIA', 10) },
      async (h) => { await h.destacar('', 'PRODUTO', 10) },
      async (h) => { await h.sleep(3600); await h.apagar() },
    ],
  },
  {
    id: 'm3-05',
    frases: [
      'Aqui embaixo fica o comentário: é o recado pra quem grava e pra quem edita.',
      'Card com comentário ganha esse balão amarelo do lado de fora, então dá pra ver de longe onde tem recado.',
    ],
    async pre(h) {
      await noQuadro(h)
      await h.clicar('div', CARD)
      await h.sleep(1800)
      await h.rolarPerto('PRODUTO', 260) // desce até o campo de comentário aparecer
      await h.sleep(1200)
    },
    acoes: [
      async (h) => { await h.destacar('', 'COMENTÁRIO', 10) },
      async (h) => {
        await h.apagar()
        await h.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));history.replaceState({},'','/')`)
        await h.sleep(1400)
        // o balão é um span com aria-label="Tem aviso" (CardItem.tsx)
        await h.destacar('[aria-label="Tem aviso"]', '', 14)
        await h.sleep(4200)
        await h.apagar()
      },
    ],
  },
  {
    id: 'm3-06',
    pre: noQuadro,
    frases: [
      'O card em A editar é onde a gestão entra.',
      'Você abre o card e copia o link dele.',
      'Cola na tarefa do ClickUp, pra equipe editar,',
      'e move o card pra Em edição.',
    ],
    acoes: [
      async (h) => { await h.destacarPai('', 'A EDITAR', 1, 12) },
      async (h) => { await h.apagar(); await h.clicar('div', 'mestrado em portugal'); await h.destacar('button', 'link do card', 10) },
      async () => {},
      async (h) => {
        await h.apagar()
        await h.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));history.replaceState({},'','/')`)
        await h.sleep(500)
        await h.destacarPai('', 'EM EDIÇÃO', 1, 12)
      },
    ],
  },
  {
    id: 'm3-07',
    pre: noQuadro,
    frases: [
      'O que termina vai pro Arquivo, por mês, com filtro de produto, categoria, copy e semana.',
      'E na aba Vídeos ficam os vídeos que vão pras redes sociais.',
      'Se estão em revisão, quem revisa é o social media.',
    ],
    acoes: [
      async (h) => { await h.ir('Arquivo') },
      async (h) => { await h.ir('Vídeos') },
      async (h) => { await h.destacar('button', 'Em revisão', 10); await h.sleep(3400); await h.apagar() },
    ],
  },
]
