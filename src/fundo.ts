// Dois eixos independentes, ambos só ligam por URL (nada muda em produção sem parâmetro):
//   ?fundo=linha|redacao  → a DIREÇÃO VISUAL (paleta, card, coluna)
//   ?ceu=sepia|tinta|petroleo|grafite → o FUNDO propriamente dito, por baixo da direção
export const FUNDOS = ['linha', 'redacao'] as const
export type Fundo = (typeof FUNDOS)[number]

export const CEUS = ['sepia', 'tinta', 'petroleo', 'grafite'] as const
export type Ceu = (typeof CEUS)[number]

const KEY = 'fundo_teste'
const KEY_CEU = 'ceu_teste'
const valido = (v: string): v is Fundo => (FUNDOS as readonly string[]).includes(v)
const validoCeu = (v: string): v is Ceu => (CEUS as readonly string[]).includes(v)

function ler(param: string, chave: string): string {
  try {
    const p = new URLSearchParams(window.location.search).get(param) || ''
    if (p === 'off') { window.localStorage.removeItem(chave); return 'off' }
    const v = p || window.localStorage.getItem(chave) || ''
    if (v && v !== 'off') window.localStorage.setItem(chave, v)
    return v
  } catch {
    return ''
  }
}

/** Lê ?fundo= e ?ceu= (ou os últimos escolhidos) e aplica no <html>. */
export function aplicarFundo(): { fundo: Fundo | null; ceu: Ceu | null } {
  const f = ler('fundo', KEY)
  const c = ler('ceu', KEY_CEU)
  const fundo = valido(f) ? f : null
  const ceu = validoCeu(c) ? c : null
  if (fundo) document.documentElement.dataset.fundo = fundo
  else delete document.documentElement.dataset.fundo
  if (ceu) document.documentElement.dataset.ceu = ceu
  else delete document.documentElement.dataset.ceu
  return { fundo, ceu }
}

export function trocarFundo(f: Fundo) {
  try { window.localStorage.setItem(KEY, f) } catch { /* ignore */ }
  document.documentElement.dataset.fundo = f
}

export function trocarCeu(c: Ceu | null) {
  try {
    if (c) window.localStorage.setItem(KEY_CEU, c)
    else window.localStorage.removeItem(KEY_CEU)
  } catch { /* ignore */ }
  if (c) document.documentElement.dataset.ceu = c
  else delete document.documentElement.dataset.ceu
}

export function desligarFundo() {
  try { window.localStorage.removeItem(KEY); window.localStorage.removeItem(KEY_CEU) } catch { /* ignore */ }
  delete document.documentElement.dataset.fundo
  delete document.documentElement.dataset.ceu
}
