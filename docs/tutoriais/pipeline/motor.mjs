// Motor: dirige o Safari real por AppleScript numa janela DEDICADA (não encosta nas abas do Gustavo).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
const exec = promisify(execFile)

export const SITE = 'https://audiovisual.alascasa.com.br/'
const IDFILE = new URL('./janela.txt', import.meta.url).pathname

let winId = existsSync(IDFILE) ? Number(readFileSync(IDFILE, 'utf8').trim()) || null : null
export const getWin = () => winId

export async function osa(script) {
  const { stdout } = await exec('osascript', ['-e', script], { maxBuffer: 10 * 1024 * 1024 })
  return stdout.trim()
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// roda JS na janela do tutorial
export async function js(code) {
  const limpo = code.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
  return osa(`tell application "Safari" to do JavaScript "${limpo}" in current tab of window id ${winId}`)
}

export async function novaJanela(url = SITE) {
  const id = await osa(`tell application "Safari"
    activate
    make new document with properties {URL:"${url}"}
    delay 0.5
    return id of window 1
  end tell`)
  winId = Number(id)
  writeFileSync(IDFILE, String(winId))
  await esperarCarregar()
  return winId
}

// traz a janela do tutorial pra frente — sem isso a captura pega a janela que estiver por cima
export async function ativar() {
  await osa(`tell application "Safari"
    activate
    set index of window id ${winId} to 1
  end tell`)
  await sleep(550)
}

export async function fecharJanela() {
  if (!winId) return
  try { await osa(`tell application "Safari" to close window id ${winId}`) } catch { /* já fechada */ }
}

export async function irPara(url) {
  await osa(`tell application "Safari" to set URL of current tab of window id ${winId} to "${url}"`)
  await esperarCarregar()
}

export async function esperarCarregar(timeout = 45000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const r = await js('document.readyState').catch(() => '')
    if (r === 'complete') return true
    await sleep(400)
  }
  return false
}

// ——— kit visual injetado na página: cursor, halo de clique, destaque e legenda ———
export const KIT = `
(function(){
 ['tutcur','tutring','tutspot','tutleg'].forEach(function(id){var v=document.getElementById(id);if(v)v.remove()});
 var st=document.createElement('style');
 st.textContent=\`
 #tutcur{position:fixed;z-index:2147483647;width:26px;height:26px;left:0;top:0;pointer-events:none;
   transition:transform .75s cubic-bezier(.22,.61,.36,1);will-change:transform;filter:drop-shadow(0 2px 6px rgba(0,0,0,.55))}
 #tutring{position:fixed;z-index:2147483646;width:18px;height:18px;border-radius:999px;left:-9px;top:-9px;pointer-events:none;
   background:rgba(56,189,248,.35);border:2px solid rgba(56,189,248,.9);opacity:0;transform:scale(.4)}
 @keyframes tutpulse{0%{opacity:.9;transform:scale(.4)}70%{opacity:.35;transform:scale(2.6)}100%{opacity:0;transform:scale(3)}}
 .tutpulse{animation:tutpulse .55s ease-out}
 #tutspot{position:fixed;z-index:2147483645;pointer-events:none;border-radius:14px;
   box-shadow:0 0 0 3px rgba(56,189,248,.9),0 0 0 9999px rgba(2,6,15,.55);opacity:0;transition:opacity .12s, all .16s cubic-bezier(.22,.61,.36,1)}
 #tutleg{position:fixed;z-index:2147483647;left:50%;bottom:34px;transform:translateX(-50%) translateY(14px);opacity:0;
   background:rgba(10,13,20,.92);color:#e7eef8;border:1px solid rgba(148,178,255,.25);border-radius:14px;
   padding:12px 22px;font:600 21px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.2px;
   box-shadow:0 18px 50px rgba(0,0,0,.55);transition:opacity .4s, transform .4s;max-width:78vw;text-align:center}
 \`;
 document.documentElement.appendChild(st);
 var c=document.createElement('div');c.id='tutcur';
 c.innerHTML='<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l7.5 18 2.2-7.3L21 10.5z" fill="#fff" stroke="#0b1220" stroke-width="1.4" stroke-linejoin="round"/></svg>';
 var r=document.createElement('div');r.id='tutring';
 var s=document.createElement('div');s.id='tutspot';
 var l=document.createElement('div');l.id='tutleg';
 document.documentElement.appendChild(c);document.documentElement.appendChild(r);
 document.documentElement.appendChild(s);document.documentElement.appendChild(l);
 var pos={x:window.innerWidth/2,y:window.innerHeight/2};
 function put(x,y){pos={x:x,y:y};c.style.transform='translate('+x+'px,'+y+'px)';r.style.transform='translate('+x+'px,'+y+'px)'}
 put(pos.x,pos.y);
 function vis(e){var b=e.getBoundingClientRect();if(b.width<=2||b.height<=2)return false;
   var s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'}
 /* menor elemento visivel que contem o texto */
 function sel_(s){return (!s||s==='*')?'div,span,h1,h2,h3,h4,p,button,a,li,label,strong,em,td,th':s}
 /* quando tem modal aberto (overlay fixed grande), procura SÓ dentro dele */
 function raiz(){
   var fixos=Array.prototype.slice.call(document.querySelectorAll('div')).filter(function(e){
     var s=getComputedStyle(e);if(s.position!=='fixed')return false;
     var b=e.getBoundingClientRect();
     return b.width>window.innerWidth*0.5&&b.height>window.innerHeight*0.5&&e.querySelectorAll('*').length>8});
   if(!fixos.length)return document;
   fixos.sort(function(a,b){return b.querySelectorAll('*').length-a.querySelectorAll('*').length});
   return fixos[0];
 }
 function achar(sel,txt,idx,livre){
   var els=Array.prototype.slice.call(raiz().querySelectorAll(sel_(sel))).filter(vis);
   var naTela=function(e){if(livre)return 0;var b=e.getBoundingClientRect();
     return (b.top<window.innerHeight&&b.bottom>0&&b.left<window.innerWidth&&b.right>0)?0:1e9};
   if(txt){var t=txt.toLowerCase().trim();
     els=els.filter(function(e){return (e.innerText||e.value||'').toLowerCase().indexOf(t)>=0});
     els.sort(function(a,b){var ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
       return (naTela(a)+ra.width*ra.height)-(naTela(b)+rb.width*rb.height)});
   } else {
     /* sem texto: pelo menos prioriza o que está visível na tela */
     els.sort(function(a,b){return naTela(a)-naTela(b)});
   }
   return els[idx||0]||null;
 }
 window.__tut={
   achar:achar,
   mover:function(sel,txt,idx){var e=achar(sel,txt,idx);if(!e)return 'nao';var b=e.getBoundingClientRect();
     put(b.left+b.width/2,b.top+b.height/2);return 'ok'},
   clicar:function(sel,txt,idx){var e=achar(sel,txt,idx);if(!e)return 'nao';var b=e.getBoundingClientRect();
     put(b.left+b.width/2,b.top+b.height/2);
     setTimeout(function(){r.style.opacity=1;r.classList.remove('tutpulse');void r.offsetWidth;r.classList.add('tutpulse');
       setTimeout(function(){e.click();r.style.opacity=0},260)},780);return 'ok'},
   destacar:function(sel,txt,pad,idx){var e=achar(sel,txt,idx);if(!e)return 'nao';var p=pad||10;var b=e.getBoundingClientRect();
     s.style.left=(b.left-p)+'px';s.style.top=(b.top-p)+'px';s.style.width=(b.width+2*p)+'px';s.style.height=(b.height+2*p)+'px';
     s.style.opacity=1;return 'ok'},
   apagar:function(){s.style.opacity=0;return 'ok'},
   irAte:function(sel,txt,idx){var e=achar(sel,txt,idx,true);if(!e)return 'nao';
     e.scrollIntoView({behavior:'smooth',block:'center'});return 'ok'},
   clicarPai:function(sel,txt,niveis,idx){var e=achar(sel,txt,idx);if(!e)return 'nao';
     for(var i=0;i<(niveis||1)&&e.parentElement;i++){e=e.parentElement}
     var b=e.getBoundingClientRect();put(b.left+b.width/2,b.top+b.height/2);
     setTimeout(function(){r.style.opacity=1;r.classList.remove('tutpulse');void r.offsetWidth;r.classList.add('tutpulse');
       setTimeout(function(){e.click();r.style.opacity=0},260)},780);return 'ok'},
   destacarPai:function(sel,txt,niveis,pad,idx){var e=achar(sel,txt,idx);if(!e)return 'nao';
     for(var i=0;i<(niveis||1)&&e.parentElement;i++){e=e.parentElement}
     var p=pad||10;var b=e.getBoundingClientRect();
     s.style.left=(b.left-p)+'px';s.style.top=(b.top-p)+'px';s.style.width=(b.width+2*p)+'px';s.style.height=(b.height+2*p)+'px';
     s.style.opacity=1;return 'ok'},
   legenda:function(t){if(!t){l.style.opacity=0;l.style.transform='translateX(-50%) translateY(14px)';return 'ok'}
     l.textContent=t;l.style.opacity=1;l.style.transform='translateX(-50%) translateY(0)';return 'ok'},
   rolar:function(sel,px){var alvo=sel?achar(sel):null;
     if(alvo){alvo.scrollIntoView({behavior:'smooth',block:'center'})}
     else{var sc=document.scrollingElement;sc.scrollBy({top:px||300,behavior:'smooth'})}return 'ok'},
   rolarH:function(px){var els=Array.prototype.slice.call(document.querySelectorAll('div'));
     var alvo=null;for(var i=0;i<els.length;i++){var e=els[i];
       if(e.scrollWidth>e.clientWidth+40&&getComputedStyle(e).overflowX!=='visible'){alvo=e;break}}
     if(!alvo)return 'nao';alvo.scrollBy({left:px||400,behavior:'smooth'});return 'ok'},
   rolarPerto:function(txt,px){var e=achar('',txt);if(!e)return 'nao';
     var p=e;for(var i=0;i<12&&p;i++){var s=getComputedStyle(p);
       if(p.scrollHeight>p.clientHeight+20&&/auto|scroll/.test(s.overflowY)){p.scrollBy({top:px||200,behavior:'smooth'});return 'ok'}
       p=p.parentElement}
     return 'nao'},
   rolarV:function(sel,px){var els=Array.prototype.slice.call(document.querySelectorAll(sel||'div'));
     var alvo=null;for(var i=0;i<els.length;i++){var e=els[i];
       if(e.scrollHeight>e.clientHeight+40&&/auto|scroll/.test(getComputedStyle(e).overflowY)){alvo=e;break}}
     if(!alvo)return 'nao';alvo.scrollBy({top:px||300,behavior:'smooth'});return 'ok'},
   zoom:function(z){document.body.style.zoom=z;return 'ok'}
 };
 return 'ok';
})()
`

export async function kit() { return js(KIT) }
