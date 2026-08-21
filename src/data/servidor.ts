/**
 * Montagem fora da máquina: a Central só entrega o pedido e depois acompanha.
 * Quem faz o trabalho é o serviço montador (Cloud Run), que lê e escreve no
 * Drive direto — por isso dá pra fechar o navegador no meio da fila.
 */
import { supabase } from './supabase'
import type { Combinacao, Nomeacao } from './multiplicar'

export interface Montagem {
  id: string
  pasta_saida: string | null
  total: number
  feitas: number
  enviadas: number
  falhas: number
  estado: 'fila' | 'montando' | 'pronta' | 'erro'
  erro: string | null
  pecas: { nome: string; estado: string; mb?: number; erro?: string }[]
}

/** O serviço só aparece na interface quando está configurado de fato. */
export async function servidorPronto(): Promise<boolean> {
  try {
    const r = await fetch('/api/mult-montar')
    return !!(await r.json())?.pronto
  } catch { return false }
}

const peca = (p: { id: string; nome: string; mb?: number | null }) =>
  ({ id: p.id, nome: p.nome, mb: p.mb ?? null })

export async function pedirMontagem(
  pasta: string, combinacoes: Combinacao[], nome: Nomeacao,
): Promise<string> {
  const r = await fetch('/api/mult-montar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pasta, codigo: nome.codigo,
      // o que o serviço precisa: nome final, as peças e o tamanho delas — é pelo
      // tamanho que ele recusa uma leva que não caberia no disco do runner
      combinacoes: combinacoes.map(c => ({
        nome: c.nome,
        gancho: c.gancho ? peca(c.gancho) : null,
        corpo: peca(c.corpo),
        cta: c.cta ? peca(c.cta) : null,
      })),
    }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error || 'o servidor recusou o pedido')
  return d.id as string
}

export async function lerProgresso(id: string): Promise<Montagem | null> {
  if (!supabase) return null
  const { data } = await supabase.from('montagens').select('*').eq('id', id).maybeSingle()
  return (data as Montagem) ?? null
}

/** A montagem mais recente que ainda não terminou — para retomar ao reabrir a aba. */
export async function montagemAberta(pasta: string): Promise<Montagem | null> {
  if (!supabase) return null
  const { data } = await supabase.from('montagens').select('*')
    .eq('pasta', pasta).in('estado', ['fila', 'montando'])
    .order('criado_em', { ascending: false }).limit(1)
  return (data?.[0] as Montagem) ?? null
}
