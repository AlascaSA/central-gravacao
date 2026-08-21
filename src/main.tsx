import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import EscolherTime from './components/EscolherTime.tsx'
import SeletorFundo from './components/SeletorFundo.tsx'
import RecortarAvatar from './components/RecortarAvatar.tsx'
import { temTime } from './data/team'
import { aplicarFundo } from './fundo'

// ALTURA REAL DA TELA (--vh-real). O Safari do iPhone calcula `vh` com as barras do navegador
// RETRAÍDAS: um modal de 92vh fica mais alto que a área visível e o rodapé — onde ficam Baixar,
// Marcar revisado etc. — desce pra trás da barra de baixo. Girar o aparelho recalculava e por isso
// "só funcionava deitado". O visualViewport dá a altura que a pessoa realmente enxerga, agora, e
// acompanha barra sumindo/aparecendo e teclado abrindo. Os modais medem por ele.
function alturaReal() {
  const h = window.visualViewport?.height || window.innerHeight
  document.documentElement.style.setProperty('--vh-real', h + 'px')
}
alturaReal()
window.visualViewport?.addEventListener('resize', alturaReal)
window.visualViewport?.addEventListener('scroll', alturaReal) // no iPhone a barra encolhe ao rolar
window.addEventListener('resize', alturaReal)
window.addEventListener('orientationchange', alturaReal)
window.addEventListener('pageshow', alturaReal) // volta do cache de navegação com a medida certa

// Teste visual: só liga com ?fundo=/?ceu= na URL. Sem isso, o app fica como sempre.
const { fundo, ceu } = aplicarFundo()

// Ferramenta de recorte de avatar (?recortar). Fica antes de tudo: não precisa de time.
const params = new URLSearchParams(window.location.search)
const permalink = window.location.pathname.startsWith('/v/')

let raiz
if (params.has('recortar')) raiz = <RecortarAvatar />
else if (temTime() || permalink) raiz = <App />
else raiz = <EscolherTime />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {raiz}
    {(fundo || ceu) && <SeletorFundo inicial={fundo} ceuInicial={ceu} />}
  </StrictMode>,
)
