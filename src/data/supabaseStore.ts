import type { Card, Categoria, Copy, Doc, Fase, Urgencia } from '../types'
import { supabase } from './supabase'
import type { Store } from './store'

// Linha do Postgres (snake_case) -> Card (camelCase)
interface Row {
  id: string
  copy: string | null
  sem_roteiro: boolean | null
  fase: string
  semana: string | null
  titulo: string
  campanha: string | null
  categoria: string | null
  produto: string | null
  urgencia: string
  resp_gravacao: string | null
  resp_edicao: string | null
  prazo: string | null
  documentos: Doc[] | null
  observacoes: string | null
  comentario: string | null
  arquivado: boolean
  criado_em: string
  atualizado_em: string
  finalizado_em: string | null
}

function toCard(r: Row): Card {
  return {
    id: r.id,
    copy: (r.copy as Copy) ?? undefined,
    semRoteiro: !!r.sem_roteiro,
    fase: r.fase as Fase,
    semana: r.semana ?? undefined,
    titulo: r.titulo,
    campanha: r.campanha ?? '',
    categoria: (r.categoria as Categoria) ?? undefined,
    produto: r.produto ?? undefined,
    urgencia: (r.urgencia as Urgencia) ?? 'média',
    respGravacao: r.resp_gravacao ?? undefined,
    respEdicao: r.resp_edicao ?? undefined,
    prazo: r.prazo ?? undefined,
    documentos: Array.isArray(r.documentos) ? r.documentos : [],
    observacoes: r.observacoes ?? undefined,
    comentario: r.comentario ?? undefined,
    arquivado: Boolean(r.arquivado),
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
    finalizadoEm: r.finalizado_em ?? undefined,
  }
}

export function createSupabaseStore(): Store {
  const sb = supabase!

  return {
    async listCards() {
      const { data, error } = await sb.from('cards').select('*').order('criado_em', { ascending: false })
      if (error) throw new Error(error.message)
      return (data as Row[]).map(toCard)
    },

    async createCard(input) {
      const { data, error } = await sb
        .from('cards')
        .insert({
          copy: input.copy ?? null,
          sem_roteiro: input.semRoteiro ?? false,
          titulo: input.titulo.trim(),
          campanha: input.campanha ?? '',
          categoria: input.categoria ?? null,
          produto: input.produto ?? null,
          urgencia: input.urgencia ?? 'média',
          prazo: input.prazo ?? null,
          fase: input.fase ?? 'A gravar',
          semana: input.semana ?? null,
          documentos: input.documentos ?? [],
          observacoes: input.observacoes ?? null,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return toCard(data as Row)
    },

    async moverSemana(id, semana) {
      const { data, error } = await sb
        .from('cards')
        .update({ semana: semana, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return toCard(data as Row)
    },

    async uploadArquivo(file, copy) {
      const pasta = (copy || 'geral').normalize('NFD').replace(/[^\w-]+/g, '_')
      const safe = file.name.normalize('NFD').replace(/[^\w.\-]+/g, '_')
      const path = pasta + '/' + Date.now() + '-' + safe
      const { error } = await sb.storage.from('documentos').upload(path, file, { upsert: false })
      if (error) throw new Error(error.message)
      const { data } = sb.storage.from('documentos').getPublicUrl(path)
      return { nome: file.name, url: data.publicUrl }
    },

    async moveCard(id, fase: Fase) {
      const { data, error } = await sb
        .from('cards')
        .update({ fase, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return toCard(data as Row)
    },

    async archiveCard(id) {
      const agora = new Date().toISOString()
      const { data, error } = await sb
        .from('cards')
        .update({ arquivado: true, finalizado_em: agora, atualizado_em: agora })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return toCard(data as Row)
    },

    async definirTitulo(id, titulo) {
      const { data, error } = await sb
        .from('cards')
        .update({ titulo: titulo.trim(), atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return toCard(data as Row)
    },
    async definirComentario(id, comentario) {
      const { data, error } = await sb
        .from('cards')
        .update({ comentario, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return toCard(data as Row)
    },
    async definirCategoria(id, categoria) {
      const { data, error } = await sb
        .from('cards')
        .update({ categoria, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return toCard(data as Row)
    },

    async definirCopy(id, copy) {
      const { data, error } = await sb
        .from('cards')
        .update({ copy, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return toCard(data as Row)
    },

    async definirSemRoteiro(id, valor) {
      const { data, error } = await sb
        .from('cards')
        .update({ sem_roteiro: valor, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return toCard(data as Row)
    },

    async definirProduto(id, produto) {
      const { data, error } = await sb
        .from('cards')
        .update({ produto, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return toCard(data as Row)
    },

    async listarProdutos() {
      const { data, error } = await sb.from('produtos').select('nome').order('nome')
      if (error || !data) return []
      return (data as { nome: string }[]).map((p) => p.nome)
    },

    async salvarProduto(nome) {
      const n = nome.trim()
      if (!n) return
      await sb.from('produtos').upsert({ nome: n }, { onConflict: 'nome' })
    },

    async deletarCard(id) {
      const { error } = await sb.from('cards').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },

    // Realtime: avisa quando qualquer card muda (insert/update/delete)
    subscribe(onChange) {
      const ch = sb
        .channel('cards-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => onChange())
        .subscribe()
      return () => {
        sb.removeChannel(ch)
      }
    },
  }
}
