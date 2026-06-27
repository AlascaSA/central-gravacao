export const FASES = ['A gravar', 'A editar', 'Em edição', 'Finalizado', 'No tráfego'] as const
export type Fase = (typeof FASES)[number]

export const COPYS = ['Andressa', 'Sofia', 'Thayná', 'Sem roteiro'] as const
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
  copy: Copy
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
  copy: Copy
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
