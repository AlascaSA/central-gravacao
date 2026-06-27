import type { Card, Categoria, Doc, Fase, NovoCard } from '../types'
import { currentMonday } from '../week'
import { hasSupabase } from './supabase'
import { createSupabaseStore } from './supabaseStore'

/**
 * Interface de dados. A UI só conhece isto.
 * Mock em memória (dev) OU Supabase (produção) — a UI não muda.
 */
export interface Store {
  listCards(): Promise<Card[]>
  createCard(input: NovoCard): Promise<Card>
  moveCard(id: string, fase: Fase): Promise<Card>
  /** Move o card para outra semana (segunda-feira 'YYYY-MM-DD', ou null = sem semana). */
  moverSemana(id: string, semana: string | null): Promise<Card>
  archiveCard(id: string): Promise<Card>
  /** Renomeia a tarefa (título do card). */
  definirTitulo(id: string, titulo: string): Promise<Card>
  /** Define/troca a categoria da tarefa. */
  definirCategoria(id: string, categoria: Categoria): Promise<Card>
  /** Define/troca o produto da tarefa. */
  definirProduto(id: string, produto: string): Promise<Card>
  /** Lista de produtos salvos (pra escolher no upload). */
  listarProdutos(): Promise<string[]>
  /** Salva um produto novo na lista. */
  salvarProduto(nome: string): Promise<void>
  /** Apaga o card de vez. */
  deletarCard(id: string): Promise<void>
  /** Sobe um arquivo e devolve {nome, url} pra anexar num card. */
  uploadArquivo(file: File, copy?: string): Promise<Doc>
  /** Realtime opcional: chama onChange quando algum card muda. Retorna função de cancelar. */
  subscribe?(onChange: () => void): () => void
}

function agora(): string {
  return new Date().toISOString()
}

let _seq = 0
function novoId(): string {
  _seq += 1
  return 'c' + Date.now().toString(36) + '-' + _seq
}

function seed(): Card[] {
  const base = (over: Partial<Card>): Card => ({
    id: novoId(),
    copy: 'Andressa',
    fase: 'A gravar',
    semana: currentMonday(),
    titulo: '',
    campanha: '',
    urgencia: 'média',
    documentos: [],
    arquivado: false,
    criadoEm: agora(),
    atualizadoEm: agora(),
    ...over,
  })
  return [
    base({ copy: 'Andressa', fase: 'A gravar', titulo: 'Dívida de ITBI', campanha: 'Redes sociais', urgencia: 'alta', documentos: [{ nome: 'Copy - Dívida de ITBI.pdf', url: 'https://example.com/doc1' }] }),
    base({ copy: 'Sofia', fase: 'A gravar', titulo: 'Manifesto PPC', campanha: 'POS PPC', urgencia: 'alta' }),
    base({ copy: 'Thayná', fase: 'A gravar', titulo: 'Neuromarketing', campanha: 'Redes sociais', urgencia: 'média', documentos: [{ nome: 'Roteiro.docx', url: 'https://example.com/doc2' }] }),
    base({ copy: 'Sem roteiro', fase: 'A editar', titulo: 'Deserdar herdeiro', campanha: 'Redes sociais', urgencia: 'média' }),
    base({ copy: 'Andressa', fase: 'Em edição', titulo: 'VSL do PDI', campanha: 'PDI', urgencia: 'alta' }),
    base({ copy: 'Sofia', fase: 'Finalizado', titulo: 'Reforma tributária e ITCMD', campanha: 'YouTube', urgencia: 'baixa' }),
    base({ copy: 'Thayná', fase: 'No tráfego', titulo: 'Anúncio de captação', campanha: 'Captação', urgencia: 'alta' }),
  ]
}

export function createMockStore(): Store {
  let cards: Card[] = seed()
  const produtosSalvos: string[] = []

  return {
    async listCards() {
      return cards.map((c) => ({ ...c, documentos: [...c.documentos] }))
    },
    async createCard(input) {
      const card: Card = {
        id: novoId(),
        copy: input.copy,
        fase: input.fase ?? 'A gravar',
        titulo: input.titulo.trim(),
        campanha: input.campanha ?? '',
        categoria: input.categoria,
        produto: input.produto,
        urgencia: input.urgencia ?? 'média',
        prazo: input.prazo,
        semana: input.semana,
        documentos: input.documentos ?? [],
        observacoes: input.observacoes,
        arquivado: false,
        criadoEm: agora(),
        atualizadoEm: agora(),
      }
      cards = [card, ...cards]
      return card
    },
    async definirTitulo(id, titulo) {
      const c = cards.find((x) => x.id === id)
      if (!c) throw new Error('Card não encontrado')
      c.titulo = titulo.trim()
      c.atualizadoEm = agora()
      return { ...c }
    },
    async definirCategoria(id, categoria) {
      const c = cards.find((x) => x.id === id)
      if (!c) throw new Error('Card não encontrado')
      c.categoria = categoria
      c.atualizadoEm = agora()
      return { ...c }
    },
    async definirProduto(id, produto) {
      const c = cards.find((x) => x.id === id)
      if (!c) throw new Error('Card não encontrado')
      c.produto = produto
      c.atualizadoEm = agora()
      return { ...c }
    },
    async listarProdutos() {
      return [...produtosSalvos].sort((a, b) => a.localeCompare(b))
    },
    async salvarProduto(nome) {
      const n = nome.trim()
      if (n && !produtosSalvos.includes(n)) produtosSalvos.push(n)
    },
    async moverSemana(id, semana) {
      const c = cards.find((x) => x.id === id)
      if (!c) throw new Error('Card não encontrado')
      c.semana = semana ?? undefined
      c.atualizadoEm = agora()
      return { ...c }
    },
    async uploadArquivo(file) {
      return { nome: file.name, url: '#mock' }
    },
    async moveCard(id, fase) {
      const c = cards.find((x) => x.id === id)
      if (!c) throw new Error('Card não encontrado')
      c.fase = fase
      c.atualizadoEm = agora()
      return { ...c }
    },
    async archiveCard(id) {
      const c = cards.find((x) => x.id === id)
      if (!c) throw new Error('Card não encontrado')
      c.arquivado = true
      c.finalizadoEm = agora()
      c.atualizadoEm = agora()
      return { ...c }
    },
    async deletarCard(id) {
      cards = cards.filter((c) => c.id !== id)
    },
    subscribe() {
      return () => {}
    },
  }
}

// Supabase quando há credenciais; mock caso contrário.
export const store: Store = hasSupabase ? createSupabaseStore() : createMockStore()
