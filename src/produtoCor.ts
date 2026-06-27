// Cor estável por produto: o mesmo nome sempre cai na mesma cor (sem configurar nada).
// Strings literais pra o Tailwind incluir as classes no build.
const PALETA = [
  'text-sky-300 bg-sky-500/15 border-sky-500/30',
  'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  'text-amber-300 bg-amber-500/15 border-amber-500/30',
  'text-violet-300 bg-violet-500/15 border-violet-500/30',
  'text-rose-300 bg-rose-500/15 border-rose-500/30',
  'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
  'text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-500/30',
  'text-orange-300 bg-orange-500/15 border-orange-500/30',
  'text-teal-300 bg-teal-500/15 border-teal-500/30',
  'text-indigo-300 bg-indigo-500/15 border-indigo-500/30',
  'text-pink-300 bg-pink-500/15 border-pink-500/30',
  'text-lime-300 bg-lime-500/15 border-lime-500/30',
]

// Pontinhos sólidos (mesma família de cor da PALETA, mesma ordem) — pro chip neutro
// com um ponto colorido que distingue o produto sem pintar a pílula inteira.
const PONTOS = [
  'bg-sky-400',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-violet-400',
  'bg-rose-400',
  'bg-cyan-400',
  'bg-fuchsia-400',
  'bg-orange-400',
  'bg-teal-400',
  'bg-indigo-400',
  'bg-pink-400',
  'bg-lime-400',
]

function hashProduto(nome: string): number {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return h
}

export function corDoProduto(nome: string): string {
  return PALETA[hashProduto(nome) % PALETA.length]
}

export function corPontoProduto(nome: string): string {
  return PONTOS[hashProduto(nome) % PONTOS.length]
}
