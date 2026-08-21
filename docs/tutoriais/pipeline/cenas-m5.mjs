// Módulo 5 — Renomeador (apresentação). Versão publicada, onde a sessão do Gustavo vive.
// O arquivo de exemplo entra por script (input.files) — o seletor do Finder mostrava os arquivos
// pessoais dele no vídeo. NADA é enviado: a gravação para antes do "Renomear e subir".
const APP = 'https://renomeador-web.onrender.com/'
const APELIDO = 'mestrado em portugal'   // um bruto já batizado na Central
const ARQUIVO = 'BR-testamento esquizofrenia.mp4'

async function naEntrada(h) {
  await h.abrir(APP)
  await h.sleep(3500)
  const tem = await h.js(`String(document.body.innerText.indexOf('escolha o especialista')>=0)`)
  if (String(tem).trim() !== 'true') {
    await h.js(`document.querySelectorAll('button').forEach(function(b){ if((b.innerText||'').trim()==='trocar') b.click() })`)
    await h.sleep(2500)
    await h.kit()
  }
}

async function noApp(h) {
  await naEntrada(h)
  await h.clicar('button, a, [class*=cursor-pointer]', 'Jaylton')
  await h.sleep(4000)
  await h.kit()
}

// escolhe campanha e fase (lidos do Drive), deixando o destino resolvido
async function comDestino(h) {
  await noApp(h)
  await h.js(`(function(){var s=document.querySelectorAll('select')[1];s.selectedIndex=1;s.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()`)
  await h.sleep(6000)
  await h.js(`(function(){var s=document.querySelectorAll('select');
    for(var i=0;i<s.length;i++){ if(s[i].options.length>1 && s[i].selectedIndex===0 && (s[i].options[0].text||'').indexOf('scolha')>=0){ s[i].selectedIndex=1; s[i].dispatchEvent(new Event('change',{bubbles:true})) } }
    return 'ok'})()`)
  await h.sleep(3000)
}

// põe o arquivo na lista sem abrir o seletor do sistema
async function comArquivo(h) {
  await h.js(`(function(){
    var i=document.querySelector('input[type=file]'); if(!i) return 'sem input';
    var f=new File([new Uint8Array(2048)],'${ARQUIVO}',{type:'video/mp4'});
    var dt=new DataTransfer(); dt.items.add(f);
    i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true}));
    return 'ok'})()`)
  await h.sleep(2500)
}

// escolhe o apelido vindo da Central (é o que acende "bruto da Central")
async function comApelido(h) {
  await h.js(`(function(){
    var ins=Array.prototype.slice.call(document.querySelectorAll('input'));
    var alvo=null; for(var i=0;i<ins.length;i++){ if(((ins[i].placeholder||'')+'').indexOf('apelido')>=0){alvo=ins[i];break} }
    if(!alvo) return 'sem campo';
    var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    setter.call(alvo,'${APELIDO}');
    alvo.dispatchEvent(new Event('input',{bubbles:true}));
    return 'ok'})()`)
  await h.sleep(2500)
}

const pecaPronta = async (h) => { await comDestino(h); await comArquivo(h); await comApelido(h) }

export default [
  {
    id: 'm5-01',
    pre: naEntrada,
    frases: [
      'O Renomeador é o outro lado da corrente.',
      'Ele pega o vídeo pronto, dá o nome do padrão e sobe na pasta certa do Drive.',
    ],
    acoes: [async () => {}, async () => {}],
  },
  {
    id: 'm5-02',
    pre: naEntrada,
    frases: [
      'Você escolhe o especialista.',
      'E diz o tipo: lançamento, perpétuo ou conteúdo.',
    ],
    acoes: [
      async (h) => { await h.clicar('button, a, [class*=cursor-pointer]', 'Jaylton') },
      async (h) => { await h.sleep(1800); await h.destacar('', 'Tipo', 10); await h.sleep(2200); await h.apagar() },
    ],
  },
  {
    id: 'm5-03',
    pre: noApp,
    frases: [
      'No lançamento, você escolhe a campanha.',
      'A fase.',
      'E o objetivo: captação, vendas ou remarketing.',
      'É só isso que ele pergunta. O resto ele lê do Drive e da planilha.',
    ],
    acoes: [
      async (h) => {
        await h.destacar('', 'Lançamentos', 10)
        await h.js(`(function(){var s=document.querySelectorAll('select')[1];s.selectedIndex=1;s.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()`)
      },
      async (h) => { await h.destacar('', 'Fase', 10) },
      async (h) => { await h.destacar('', 'Objetivo', 10) },
      async (h) => { await h.sleep(2600); await h.apagar() },
    ],
  },
  {
    id: 'm5-04',
    pre: comDestino,
    frases: [
      'Aí é só soltar os arquivos aqui.',
      'O apelido vem da Central: se o bruto foi batizado lá, o nome aparece pronto pra escolher.',
      'Número do anúncio, versão, mês e formato ele preenche sozinho.',
    ],
    acoes: [
      async (h) => { await comArquivo(h) },
      async (h) => { await comApelido(h); await h.destacar('', 'bruto da Central', 12) },
      async (h) => { await h.apagar(); await h.destacar('', 'AD01', 12) },
    ],
  },
  {
    id: 'm5-05',
    pre: pecaPronta,
    frases: [
      'Esse é o nome final, montado no padrão do Playbook.',
      'E aqui embaixo, o destino: se a pasta que o padrão exige não existir, ele cria na hora.',
    ],
    acoes: [
      async (h) => { await h.destacar('', 'AD01-VID-V1', 12) },
      async (h) => { await h.apagar(); await h.destacar('', 'Jaylton/Lançamentos/', 12) },
    ],
  },
  {
    id: 'm5-06',
    pre: pecaPronta,
    frases: [
      'Confere e manda subir.',
      'Ele registra na planilha e devolve o link da pasta, pra você passar pro tráfego.',
      'Bruto batizado na Central, editado com o mesmo nome, anúncio nomeado no padrão: é isso que deixa rastrear qualquer peça no ar até a gravação que deu origem a ela.',
    ],
    acoes: [
      async (h) => { await h.destacar('button', 'Renomear e subir', 12) },
      async (h) => { await h.sleep(2600); await h.apagar() },
      async (h) => { await h.abrir('file://' + new URL('.', import.meta.url).pathname + 'anim/fluxo.html'); await h.sleep(500); await h.js('window.tocar()') },
    ],
  },
]
