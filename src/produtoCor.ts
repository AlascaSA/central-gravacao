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

export function corDoProduto(nome: string): string {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return PALETA[h % PALETA.length]
}
