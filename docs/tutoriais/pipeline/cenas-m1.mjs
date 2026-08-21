// Módulo 1 — Copy e estrategista. Nada é salvo: abre, mostra e cancela.
// `frases` + `acoes[i]`: cada ação entra no instante em que a frase i começa a ser falada.
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

async function noCard(h) {
  await noQuadro(h)
  await h.clicar('div', 'Redes Sociais e IA')
  await h.sleep(1800)
}

export default [
  {
    id: 'm1-01',
    pre: noQuadro,
    frases: [
      'Seu ponto de entrada é o botão Subir roteiros.',
      'Você não cria card a card: sobe o documento e a Central quebra ele em um card por vídeo.',
    ],
    acoes: [
      async (h) => { await h.destacar('button', 'Subir', 10) },
      async (h) => { await h.sleep(4000); await h.apagar() },
    ],
  },
  {
    id: 'm1-02',
    pre: noQuadro,
    frases: [
      'Aqui você arrasta o documento, ou clica pra escolher.',
      'Vale docx, pdf e txt, e dá pra subir vários de uma vez.',
    ],
    acoes: [
      async (h) => { await h.clicar('button', 'Subir'); await h.destacar('', 'Escolher documentos', 14) },
      async (h) => { await h.sleep(3200); await h.apagar() },
    ],
  },
  {
    id: 'm1-03',
    frases: [
      'Antes de confirmar, você diz quem é a copy do lote,',
      'e a categoria: conteúdo, anúncio, institucional ou captação.',
      'Categoria é decisão de estratégia, então quem marca é você.',
    ],
    async pre(h) {
      await noQuadro(h)
      await h.clicar('button', 'Subir')
      await h.sleep(1500)
    },
    acoes: [
      async (h) => { await h.destacar('', 'Copy responsável', 10) },
      async (h) => { await h.destacar('', 'Categoria das tarefas', 10) },
      async (h) => { await h.sleep(3000); await h.apagar(); await h.clicar('button', 'Cancelar') },
    ],
  },
  {
    id: 'm1-04',
    pre: noQuadro,
    frases: [
      'Cada vídeo do documento vira um card,',
      'com o roteiro dentro e o documento anexado.',
      'Aquele problema de subir um documento com cinco vídeos e alguém enxergar três acabou aqui.',
    ],
    acoes: [
      async (h) => { await h.destacar('', 'Redes Sociais e IA', 10) },
      async (h) => { await h.destacar('', 'Redução do uso de IA.pdf', 8) },
      async (h) => { await h.sleep(3600); await h.apagar() },
    ],
  },
  {
    id: 'm1-05',
    pre: noQuadro,
    frases: [
      'Depois confere o título do card.',
      'Quando a leitura automática erra o nome, é aqui que você conserta.',
      'E esse nome não é enfeite: é ele que vai pro arquivo bruto e depois pro anúncio.',
    ],
    acoes: [
      async (h) => { await h.clicar('div', 'Redes Sociais e IA') },
      async (h) => { await h.destacarPai('', 'Redes Sociais e IA', 1, 10) },
      async (h) => { await h.sleep(4000); await h.apagar() },
    ],
  },
  {
    id: 'm1-06',
    pre: noCard,
    frases: [
      'Marca o produto do vídeo.',
      'Se ele já existe, aparece na lista; se é novo, você digita e ele fica salvo pras próximas.',
    ],
    acoes: [
      async (h) => { await h.destacar('', 'PRODUTO', 10) },
      async (h) => { await h.destacar('button, [role=combobox], div', 'GERAL', 10); await h.sleep(3600); await h.apagar() },
    ],
  },
  {
    id: 'm1-07',
    pre: noCard,
    frases: [
      'O comentário é o recado pra quem grava e pra quem edita.',
      'Card com comentário ganha um balão amarelo do lado de fora, então a pessoa vê que tem aviso antes de abrir.',
    ],
    acoes: [
      async (h) => { await h.destacar('', 'COMENTÁRIO', 10) },
      async (h) => {
        await h.apagar()
        await h.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));history.replaceState({},'','/')`)
        await h.sleep(1300)
        await h.destacar('', 'Caixinha de perguntas, ângulo de honorários', 10)
        await h.sleep(3000)
        await h.apagar()
      },
    ],
  },
  {
    id: 'm1-08',
    pre: noCard,
    frases: [
      'Esse botão copia o link do card, que é o que você cola na tarefa do ClickUp.',
      'E na aba Virais você olha o que performou lá fora, pra decidir o que vale virar roteiro.',
    ],
    acoes: [
      async (h) => { await h.destacar('button', 'link do card', 10) },
      async (h) => {
        await h.apagar()
        await h.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));history.replaceState({},'','/')`)
        await h.sleep(800)
        await h.ir('Virais')
      },
    ],
  },
]
