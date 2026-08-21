/**
 * Multiplicação de anúncios: corpos × ganchos × CTAs.
 *
 * Tudo acontece no navegador de quem usa. Os arquivos nunca saem do computador
 * — nada de upload, nada de servidor de render, nada de depender de uma máquina
 * ligada. O ffmpeg roda em WebAssembly na própria aba.
 */

export type Papel = 'gancho' | 'corpo' | 'cta'

export interface Peca {
  id: string          // id do arquivo no Drive
  papel: Papel
  nome: string
  mb?: number | null
  duracao?: number | null
  largura?: number | null
  altura?: number | null
  arquivo?: File      // preenchido só quando o conteúdo é baixado
}

/** Adivinha o papel pelo nome do arquivo — o editor corrige o que errar. */
export function papelPeloNome(nome: string): Papel | null {
  const t = nome.toLowerCase()
  if (/\bgancho|hook|abertura/.test(t)) return 'gancho'
  if (/\bcta\b|chamada|encerr|final/.test(t)) return 'cta'
  if (/\bcorpo|body|conte[uú]do|miolo/.test(t)) return 'corpo'
  return null
}

export interface Combinacao {
  id: string
  gancho?: Peca
  corpo: Peca
  cta?: Peca
  nome: string
  estado: 'espera' | 'montando' | 'pronta' | 'enviando' | 'enviada' | 'erro'
  erro?: string
  blob?: Blob
  bytes?: number
}

/** Sufixo de variação do Playbook: AD07A, AD07B… e AA em diante depois do Z. */
export function letra(i: number): string {
  if (i < 26) return String.fromCharCode(65 + i)
  return String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26))
}

export function apelidar(nome: string): string {
  return nome
    .replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ').slice(0, 5).join(' ')
}

export interface Nomeacao {
  codigo: string       // ex.: 2609-JL-IIP-PDS
  objetivo: string     // CAP | VND | RMK
  adInicial: number
  versao: number
}

/**
 * A matriz. Cada CORPO vira um número de AD; cada combinação daquele corpo vira
 * a letra — que é exatamente o que o Playbook já prevê para variação.
 */
export function combinar(pecas: Peca[], n: Nomeacao): Combinacao[] {
  const corpos = pecas.filter(p => p.papel === 'corpo')
  const ganchos = pecas.filter(p => p.papel === 'gancho')
  const ctas = pecas.filter(p => p.papel === 'cta')
  const semGancho: (Peca | undefined)[] = ganchos.length ? ganchos : [undefined]
  const semCta: (Peca | undefined)[] = ctas.length ? ctas : [undefined]

  const saida: Combinacao[] = []
  corpos.forEach((corpo, iCorpo) => {
    const ad = n.adInicial + iCorpo
    let v = 0
    semGancho.forEach(gancho => {
      semCta.forEach(cta => {
        const ape = apelidar(corpo.nome)
        const num = String(ad).padStart(2, '0')
        saida.push({
          id: `${corpo.id}-${gancho?.id ?? 'x'}-${cta?.id ?? 'x'}`,
          gancho, corpo, cta,
          nome: `${ape} ${n.codigo}-${n.objetivo}-AD${num}${letra(v)}-VID-V${n.versao}`,
          estado: 'espera',
        })
        v++
      })
    })
  })
  return saida
}

/** Lê duração e tamanho sem decodificar o vídeo inteiro. */
export function medir(arquivo: File): Promise<{ duracao: number; largura: number; altura: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src)
      resolve({ duracao: v.duration, largura: v.videoWidth, altura: v.videoHeight })
    }
    v.onerror = () => reject(new Error('não consegui ler o vídeo'))
    v.src = URL.createObjectURL(arquivo)
  })
}

/**
 * Peças com formatos diferentes não podem ser emendadas sem reencodar. Avisar
 * antes é melhor que descobrir depois de montar 150 arquivos tortos.
 */
export function conferir(pecas: Peca[]): string[] {
  const avisos: string[] = []
  const medidos = pecas.filter(p => p.largura && p.altura)
  const formatos = new Set(medidos.map(p => `${p.largura}x${p.altura}`))
  if (formatos.size > 1) {
    avisos.push(`Resoluções diferentes entre as peças (${[...formatos].join(', ')}) — a emenda vai precisar reencodar, o que é mais lento.`)
  }
  const curtas = pecas.filter(p => (p.duracao ?? 9) < 0.8)
  if (curtas.length) {
    avisos.push(`${curtas.length} arquivo(s) com menos de 1 segundo: ${curtas.map(p => p.nome).join(', ')}.`)
  }
  if (!pecas.some(p => p.papel === 'corpo')) {
    avisos.push('Sem nenhum corpo não há o que multiplicar.')
  }
  return avisos
}
