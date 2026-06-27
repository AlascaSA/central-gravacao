export const FASES = ['A gravar', 'A editar', 'Em edição', 'Finalizado', 'No tráfego', 'para Jaylton gravar'] as const
export type Fase = (typeof FASES)[number]

// Copywriters. "Sem roteiro" NÃO é copy — virou um marcador à parte (campo semRoteiro),
// pra um vídeo poder ser sem roteiro E de uma copy ao mesmo tempo.
export const COPYS = ['Andressa', 'Sofia', 'Thayná'] as const
export type Copy = (typeof COPYS)[number]

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
