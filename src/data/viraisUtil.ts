import type { PostIG } from './ig'

/** Números do jeito que se lê em português: 6,9 mil · 3,2 mi. */
export function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.', ',').replace(',0', '') + ' mi'
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace('.', ',').replace(',0', '') + ' mil'
  return String(n)
}

/** Mediana, não média: um viral isolado não pode puxar o retrato inteiro. */
export function mediana(v: number[]): number {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

export function pct(x: number): string {
  return (x * 100).toFixed(x < 0.1 ? 1 : 0).replace('.', ',') + '%'
}

export const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '')

export const mesDe = (iso: string) => iso.slice(0, 7)

// Cada assunto tem cor fixa — é o que dá leitura rápida na barra e nos cards.
export const COR_TEMA: Record<string, string> = {
  'Sucessões e inventário': '#14a8f5',
  'Família e divórcio': '#ff5c8a',
  'Imobiliário e usucapião': '#2bd47f',
  'Processo civil e prática forense': '#8b7dff',
  'Carreira e negócio da advocacia': '#ffb648',
  'Caso famoso e celebridade': '#22c1c3',
  'Bastidores e vida pessoal': '#ff8f5c',
  'Notícia e decisão de tribunal': '#5cc4ff',
  'Divulgação de curso ou evento': '#c084fc',
  Outro: '#7f8b9c',
  'Sem classificação': '#4b5563',
}
export const SEM_TEMA = 'Sem classificação'
export const corTema = (t: string | null) => (t && COR_TEMA[t]) || '#7f8b9c'

export interface Analisado extends PostIG {
  engajamento: number
  taxaCurtida: number
  multiplo: number
  impulsionado: boolean
  /** dias desde a publicação */
  idade: number
}

/** Acrescenta a cada post o que a análise precisa: engajamento, múltiplo do mês e o alerta de alcance pago. */
export function analisar(ps: PostIG[]): Analisado[] {
  // mediana do MÊS de cada post: compara o vídeo com a régua da própria época,
  // senão o alcance decrescente do perfil faria todo viral parecer coisa de 2024.
  const porMes = new Map<string, number[]>()
  ps.forEach((p) => {
    const k = mesDe(p.postadoEm)
    porMes.set(k, [...(porMes.get(k) || []), p.views])
  })
  const medMes = new Map<string, number>()
  porMes.forEach((v, k) => medMes.set(k, mediana(v)))
  const agora = Date.now()
  return ps.map((p) => {
    const base = medMes.get(mesDe(p.postadoEm)) || 1
    const taxaCurtida = p.views ? p.curtidas / p.views : 0
    return {
      ...p,
      engajamento: p.views ? (p.curtidas + p.comentarios) / p.views : 0,
      taxaCurtida,
      multiplo: p.views / (base || 1),
      // muita view com quase nenhuma curtida = alcance comprado, não viral orgânico
      impulsionado: p.views >= 50_000 && taxaCurtida < 0.005,
      idade: Math.floor((agora - new Date(p.postadoEm).getTime()) / 86400_000),
    }
  })
}
