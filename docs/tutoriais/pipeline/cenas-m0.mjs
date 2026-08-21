// Módulo 0 — A Central (todos).
// `frases` são as frases da narração; `acoes[i]` roda no instante em que a frase i começa a ser
// falada (medido no próprio mp3, pelos silêncios). É isso que mantém fala e tela juntas.
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

export default [
  {
    id: 'm0-01',
    frases: [
      'Essa é a Central de Audiovisual, onde a Alasca gerencia a produção de vídeo.',
      'Você entra escolhendo o especialista: Jaílton, Pablo ou André.',
    ],
    async pre(h) {
      await h.abrir(SITE)
      await h.js(`localStorage.removeItem('time_ativo');localStorage.removeItem('time_nome');location.reload()`)
      await h.sleep(4000)
      await h.kit()
    },
    acoes: [
      async (h) => { await h.apagar() },
      async (h) => {
        await h.destacar('button, a, [class*=cursor-pointer]', 'Jaylton', 12)
        await h.sleep(1300)
        await h.destacar('button, a, [class*=cursor-pointer]', 'Pablo', 12)
        await h.sleep(1000)
        await h.destacar('button, a, [class*=cursor-pointer]', 'André', 12)
        await h.sleep(1400)
        await h.apagar()
      },
    ],
  },
  {
    id: 'm0-02',
    frases: [
      'Escolhendo, você entra no quadro dele: tudo o que aparece na tela é só desse especialista.',
      'Pra trocar, é só clicar no nome aqui em cima.',
    ],
    acoes: [
      async (h) => { await h.clicar('button, a, [class*=cursor-pointer]', 'Jaylton') },
      async (h) => { await h.destacar('header button', 'Jaylton', 10); await h.sleep(2600); await h.apagar() },
    ],
  },
  {
    id: 'm0-03',
    pre: noQuadro,
    frases: [
      'O quadro é a linha de produção: cada card aqui é um vídeo.',
      'Nessa coluna está o que ainda vai ser gravado.',
      'Aqui, o que já foi gravado e está esperando edição.',
      'Aqui, o que o editor já pegou pra editar.',
      'E no fim do quadro, o que já foi finalizado e o que já está no tráfego.',
      'Quem move o card é quem terminou a etapa.',
    ],
    acoes: [
      async (h) => { await h.apagar() },
      async (h) => { await h.destacarPai('', 'A GRAVAR', 1, 12) },
      async (h) => { await h.destacarPai('', 'A EDITAR', 1, 12) },
      async (h) => { await h.destacarPai('', 'EM EDIÇÃO', 1, 12) },
      async (h) => {
        await h.apagar()
        await h.rolarH(1000)
        await h.sleep(900)
        await h.destacarPai('', 'FINALIZADO', 1, 12)
        await h.sleep(1700)
        await h.destacarPai('', 'NO TRÁFEGO', 1, 12)
      },
      async (h) => { await h.apagar(); await h.rolarH(-1000) },
    ],
  },
  {
    id: 'm0-04',
    pre: noQuadro,
    frases: [
      'O quadro mostra uma semana por vez, pra não virar um paredão de cards.',
      'E aqui do lado você filtra por copy, pra ver só os vídeos de uma pessoa.',
    ],
    acoes: [
      async (h) => { await h.destacar('button', 'hoje', 10) },
      async (h) => {
        await h.destacar('button', 'Thayná', 8)
        await h.sleep(1400)
        await h.clicar('button', 'Thayná')
        await h.sleep(1600)
        await h.apagar()
        await h.clicar('button', 'Tudo')
      },
    ],
  },
  {
    id: 'm0-05',
    pre: noQuadro,
    frases: [
      'São seis áreas aqui em cima.',
      'Quadro é o andamento da semana.',
      'Catálogo é tudo o que a câmera gravou, já transcrito e classificado.',
      'Vídeos são os editados, esperando revisão e postagem.',
      'Arquivo é o que já terminou.',
      'Links são os atalhos do time.',
      'E Virais é o que performou lá fora.',
    ],
    acoes: [
      async (h) => { await h.apagar() },
      async (h) => { await h.destacar('header button', 'Quadro', 8) },
      async (h) => { await h.destacar('header button', 'Catálogo', 8) },
      async (h) => { await h.destacar('header button', 'Vídeos', 8) },
      async (h) => { await h.destacar('header button', 'Arquivo', 8) },
      async (h) => { await h.destacar('header button', 'Links', 8) },
      async (h) => { await h.destacar('header button', 'Virais', 8); await h.sleep(2200); await h.apagar() },
    ],
  },
  {
    id: 'm0-06',
    pre: noQuadro,
    frases: [
      'Tocando no card, abre o detalhe.',
      'Aqui está a copy responsável,',
      'a categoria,',
      'a semana,',
      'o produto',
      'e o comentário.',
      'Mais abaixo fica o roteiro inteiro, do jeito que a copy escreveu.',
    ],
    acoes: [
      async (h) => { await h.clicar('div', 'Redes Sociais e IA') },
      async (h) => { await h.destacar('', 'COPY', 10) },
      async (h) => { await h.destacar('', 'CATEGORIA', 10) },
      async (h) => { await h.destacar('', 'SEMANA', 10) },
      async (h) => { await h.destacar('', 'PRODUTO', 10) },
      async (h) => { await h.destacar('', 'COMENTÁRIO', 10) },
      async (h) => {
        await h.apagar()
        await h.rolarPerto('COMENTÁRIO', 460)
        await h.sleep(2600)
        await h.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));history.replaceState({},'','/')`)
      },
    ],
  },
  {
    id: 'm0-07',
    frases: [
      'E aqui está o motivo de todo mundo seguir o padrão.',
      'Assim que sai da câmera, o arquivo tem nome de câmera: cê zero dois cinquenta.',
      'Quando o editor liga a gravação à tarefa, ele passa a ter o nome do vídeo, com BR na frente.',
    ],
    async pre(h) {
      await noQuadro(h)
      await h.ir('Catálogo')
      await h.sleep(2500)
      await h.clicar('', 'Agosto 2026')
      await h.sleep(2000)
      await h.clicar('', 'Dia 06')
      await h.sleep(3000)
    },
    acoes: [
      async (h) => { await h.apagar() },
      async (h) => { await h.destacar('', 'C0250', 10) },
      async (h) => {
        await h.apagar()
        await h.irAte('', 'BR-')
        await h.sleep(1100)
        await h.destacar('', 'BR-', 10)
        await h.sleep(2600)
        await h.destacar('', 'BR-', 10, 1)
      },
    ],
  },
  {
    id: 'm0-08',
    frases: [
      'Esse mesmo nome aparece aqui, quando o vídeo volta editado.',
      'É por ele que o editado acha o card sozinho, e é ele que o Renomeador usa na hora de publicar.',
      'Bruto, edição, editado e anúncio viram uma corrente só.',
      'Dá pra sair de um anúncio no ar e chegar na gravação que deu origem.',
      'Renomeou por fora, a corrente quebra.',
    ],
    async pre(h) {
      await noQuadro(h)
      await h.ir('Vídeos')
      await h.sleep(2500)
      await h.clicar('button', 'Conteúdo')
      await h.sleep(2200)
    },
    acoes: [
      async (h) => { await h.destacarPai('', 'Coragem na Advocacia', 2, 12) },
      async (h) => { await h.destacarPai('', 'Diversificando Clientes', 2, 12) },
      async (h) => { await h.apagar() },
      async (h) => { await h.rolarV('div', 320) },
      async (h) => { await h.rolarV('div', -320) },
    ],
  },
]
