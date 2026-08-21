// Módulo 2 — Editor e filmmaker. Fluxo do arquivo: câmera → Drive → Central → catálogo → edição.
// `frases` + `acoes[i]`: cada ação entra quando a frase i começa a ser falada.
import { SITE } from './motor.mjs'

const ANIM = 'file://' + new URL('.', import.meta.url).pathname + 'anim/fluxo.html'
const DRIVE_BRUTOS = 'https://drive.google.com/drive/folders/1e6CZZ54oMHlSs-5LzbVVZRiz5y20zyVm'
const DRIVE_DIA06 = 'https://drive.google.com/drive/folders/1pMnFOH0dQ2FOU_fcrNrA6JEobsAEcuum'

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

async function noDia06(h) {
  await h.abrir(SITE)
  await h.sleep(2200)
  await noQuadro(h)
  await h.ir('Catálogo')
  await h.sleep(2400)
  await h.clicar('', 'Agosto 2026')
  await h.sleep(1800)
  await h.clicar('', 'Dia 06')
  await h.sleep(2600)
}

async function noPlayer(h, nome) {
  await noDia06(h)
  await h.irAte('button', nome)
  await h.sleep(800)
  await h.clicar('button', nome)
  await h.sleep(2600)
}

export default [
  {
    id: 'm2-01',
    frases: [
      'O seu caminho começa fora da Central.',
      'Gravou, o arquivo sai da câmera e vai pro Drive,',
      'e só depois a Central enxerga.',
    ],
    async pre(h) { await h.abrir(ANIM); await h.sleep(1200) },
    acoes: [
      async (h) => { await h.js('window.tocar()') },
      async () => {},
      async () => {},
    ],
  },
  {
    id: 'm2-02',
    frases: [
      'As gravações moram no drive Time Alasca.',
      'Dentro dele, cada especialista tem a pasta dele: Jaílton Lopes, Pablo Arruda, André Santa Cruz.',
      'E dentro de cada um, a pasta Vídeos brutos.',
    ],
    async pre(h) { await h.abrir(DRIVE_BRUTOS); await h.sleep(4000) },
    acoes: [
      async (h) => { await h.destacar('', 'Time Alasca', 10) },
      async (h) => { await h.destacar('', 'Jaylton Lopes', 10) },
      async (h) => { await h.destacar('', 'Vídeos brutos', 10); await h.sleep(3000); await h.apagar() },
    ],
  },
  {
    id: 'm2-03',
    frases: [
      'Lá dentro é por ano, mês e dia da gravação.',
      'É onde você solta o material do dia.',
      'E é exatamente essa pasta que a Central lê: arquivo fora dessa estrutura ela não vê.',
    ],
    async pre(h) { await h.abrir(DRIVE_DIA06); await h.sleep(4500) },
    acoes: [async () => {}, async () => {}, async () => {}],
  },
  {
    id: 'm2-04',
    frases: [
      'Subiu, você volta na Central, na aba Catálogo,',
      'e clica em Processar novos.',
      'Ela varre a pasta, gera a prévia leve, transcreve e classifica. Leva alguns minutos e atualiza sozinho.',
    ],
    async pre(h) { await h.abrir(SITE); await h.sleep(2200); await noQuadro(h) },
    acoes: [
      async (h) => { await h.destacar('header button', 'Catálogo', 8); await h.sleep(1500); await h.apagar(); await h.ir('Catálogo') },
      async (h) => { await h.destacar('button', 'Processar novos', 10) },
      async (h) => { await h.sleep(4500); await h.apagar() },
    ],
  },
  {
    id: 'm2-05',
    frases: [
      'O que entrou aparece aqui, no mesmo mês e dia da pasta do Drive.',
      'Clicando, toca uma versão leve, com áudio: você assiste sem baixar nada.',
    ],
    async pre(h) { await h.abrir(SITE); await h.sleep(2200); await noQuadro(h); await h.ir('Catálogo'); await h.sleep(2400) },
    acoes: [
      async (h) => {
        await h.destacar('', 'Agosto 2026', 10)
        await h.sleep(1800)
        await h.apagar()
        await h.clicar('', 'Agosto 2026')
        await h.sleep(1200)
        await h.clicar('', 'Dia 06')
      },
      async (h) => { await h.irAte('button', 'C0250'); await h.clicar('button', 'C0250') },
    ],
  },
  {
    id: 'm2-06',
    frases: [
      'O selo verde ou vermelho é proposta da Central.',
      'Ela ouviu a tomada e comparou com a anterior e a seguinte, pra sacar quando ele refez a fala.',
      'E aqui embaixo está o que ele fala, transcrito.',
    ],
    pre: (h) => noPlayer(h, 'BR-testamento'),
    acoes: [
      async (h) => { await h.destacar('', 'IA: Boa', 10) },
      async () => {},
      async (h) => { await h.destacar('', 'O que ele fala', 10); await h.sleep(4000); await h.apagar() },
    ],
  },
  {
    id: 'm2-07',
    frases: ['Quem decide é você: confirmando, deixa de ser palpite e vira definição.'],
    pre: (h) => noPlayer(h, 'BR-testamento'),
    acoes: [
      async (h) => {
        await h.destacar('button', 'Erro', 10)
        await h.sleep(1800)
        await h.destacar('button', 'Gancho', 10)
        await h.sleep(1800)
        await h.apagar()
      },
    ],
  },
  {
    id: 'm2-08',
    frases: [
      'A Central também propõe um nome pra tomada, a partir do que foi falado nela.',
      'Você confere e confirma aqui em cima.',
      'Isso renomeia o arquivo no Drive de verdade: sai o cê zero dois cinquenta, entra o nome do vídeo com BR na frente.',
    ],
    pre: (h) => noPlayer(h, 'C0250'),
    acoes: [
      async (h) => { await h.destacar('', 'O advogado fala', 10) },
      async (h) => { await h.destacar('', 'C0250.MP4', 10) },
      async (h) => { await h.sleep(5000); await h.apagar() },
    ],
  },
  {
    id: 'm2-09',
    frases: [
      'Ela também propõe o card.',
      'Se a tarefa já existe, você liga a tomada nela;',
      'se não existe, cria na hora, com o nome sugerido.',
    ],
    pre: (h) => noPlayer(h, 'C0250'),
    acoes: [
      async (h) => { await h.destacar('', 'TAREFA LIGADA', 10) },
      async (h) => { await h.apagar(); await h.clicar('', 'Ligar a uma tarefa') },
      async (h) => { await h.destacarPai('button', 'Criar e ligar', 2, 12); await h.sleep(3000); await h.apagar() },
    ],
  },
  {
    id: 'm2-09b',
    frases: [
      'E marca o produto da tomada.',
      'É o que faz o bruto aparecer no filtro certo depois, e é o que o Renomeador usa quando esse material virar anúncio.',
    ],
    pre: (h) => noPlayer(h, 'C0250'),
    acoes: [
      async (h) => { await h.destacar('', 'PRODUTO', 10) },
      async (h) => { await h.destacar('', 'Escolher produto', 10); await h.sleep(4000); await h.apagar() },
    ],
  },
  {
    id: 'm2-10',
    frases: [
      'Quando é um dia inteiro de gravação solta, tem o Casar roteiro:',
      'você joga o texto do roteiro e a Central compara com as transcrições, propondo qual gravação é de qual peça.',
      'E pra puxar o material, marca as tomadas e manda baixar.',
    ],
    pre: noDia06,
    acoes: [
      async (h) => { await h.destacar('button', 'Casar roteiro', 10) },
      async () => {},
      async (h) => {
        await h.apagar()
        await h.clicar('[role=checkbox]', '')
        await h.sleep(1400)
        await h.destacar('button', 'Baixar', 10)
        await h.sleep(2600)
        await h.apagar()
      },
    ],
  },
  {
    id: 'm2-11',
    frases: [
      'No quadro, quando pegar o vídeo pra editar, arrasta pra Em edição.',
      'Terminou, o editado sobe na pasta de editados do mês, com o nome do padrão.',
      'Em até uma hora ele aparece na aba Vídeos, com o seu nome como quem subiu.',
    ],
    async pre(h) { await h.abrir(SITE); await h.sleep(2200); await noQuadro(h) },
    acoes: [
      async (h) => { await h.destacarPai('', 'EM EDIÇÃO', 1, 12) },
      async (h) => { await h.apagar() },
      async (h) => {
        await h.ir('Vídeos')
        await h.sleep(1200)
        await h.clicar('button', 'Conteúdo')
        await h.sleep(2000)
        await h.destacar('', 'Gabriel', 10)
        await h.sleep(2600)
        await h.apagar()
      },
    ],
  },
]
