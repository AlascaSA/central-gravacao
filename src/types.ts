// Lista-mestra de TODAS as fases possíveis (fonte do type Fase + validação de drop). A ordem das COLUNAS
// de cada quadro vem de fasesDoTime() — cada time tem seu fluxo.
export const FASES = ['A gravar', 'para Jaylton gravar', 'A editar', 'Em edição', 'Em revisão', 'Finalizado', 'No tráfego'] as const
export type Fase = (typeof FASES)[number]

// Colunas do quadro POR TIME (cada professor tem seu fluxo). Default = fluxo do Jaylton.
const FASES_DEFAULT: Fase[] = ['A gravar', 'para Jaylton gravar', 'A editar', 'Em edição', 'Finalizado', 'No tráfego']
const FASES_TIME: Record<string, Fase[]> = {
  // Pablo: sem "para o Pablo gravar"; com "Em revisão" depois de "Em edição".
  pablo: ['A gravar', 'A editar', 'Em edição', 'Em revisão', 'Finalizado', 'No tráfego'],
}
export function fasesDoTime(team: string): Fase[] {
  return FASES_TIME[team] || FASES_DEFAULT
}

// Copywriters. "Sem roteiro" NÃO é copy — virou um marcador à parte (campo semRoteiro),
// pra um vídeo poder ser sem roteiro E de uma copy ao mesmo tempo.
// Lista-mestra de TODAS as copies que já existiram (fonte do type Copy). Quem sai da equipe
// continua aqui pros cards antigos seguirem válidos e mostrando o nome — só some dos seletores.
// Quem aparece pra escolher vem de copysDoTime().
export const COPYS = ['Andressa', 'Sofia', 'Thayná', 'Amanda', 'Caio', 'Isabella', 'Juliana', 'Julianna', 'Pedro'] as const
export type Copy = (typeof COPYS)[number]

// Copies ativas POR TIME (cada professor tem sua equipe).
const COPYS_DEFAULT: Copy[] = ['Andressa', 'Sofia', 'Thayná']
const COPYS_TIME: Record<string, Copy[]> = {
  // Jaylton: Sofia saiu, Amanda entrou. Os cards da Sofia continuam intactos.
  jaylton: ['Andressa', 'Thayná', 'Amanda', 'Pedro'],
  andre: ['Sofia', 'Caio', 'Julianna'],
  pablo: ['Isabella', 'Juliana'],
}
export function copysDoTime(team: string): Copy[] {
  return COPYS_TIME[team] || COPYS_DEFAULT
}

export const URGENCIAS = ['alta', 'média', 'baixa'] as const
export type Urgencia = (typeof URGENCIAS)[number]

// Categoria da tarefa — escolhida pela pessoa (copy no upload, ou você ao indexar)
export const CATEGORIAS = ['Conteúdo', 'Anúncio', 'Institucional', 'Captação'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export interface Doc {
  nome: string
  url: string
}

export interface Card {
  id: string
  /** Copywriter responsável. Opcional: um vídeo sem roteiro pode ainda não ter copy. */
  copy?: Copy
  /** Gravado sem roteiro escrito. Independente da copy. */
  semRoteiro?: boolean
  fase: Fase
  /** Segunda-feira da semana alvo, 'YYYY-MM-DD'. Vazio = sem semana. */
  semana?: string
  titulo: string
  campanha: string
  categoria?: Categoria
  produto?: string
  urgencia: Urgencia
  respGravacao?: string
  respEdicao?: string
  prazo?: string
  documentos: Doc[]
  observacoes?: string
  comentario?: string
  arquivado: boolean
  criadoEm: string
  atualizadoEm: string
  finalizadoEm?: string
}

export interface NovoCard {
  copy?: Copy
  semRoteiro?: boolean
  titulo: string
  campanha?: string
  categoria?: Categoria
  produto?: string
  urgencia?: Urgencia
  prazo?: string
  semana?: string
  fase?: Fase
  documentos?: Doc[]
  observacoes?: string
}
