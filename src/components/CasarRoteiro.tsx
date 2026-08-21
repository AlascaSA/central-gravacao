import { useState } from 'react'
import { supabase } from '../data/supabase'
import { getTeam } from '../data/team'
import { MARCA_PENDENTE } from '../data/revisao'
import { currentMonday } from '../week'

type Tomada = { drive_id: string; nome: string; seg: number | null; tipo: string | null }
type Peca = { titulo: string; trecho: string; tomadas: Tomada[] }

// Joga o roteiro aqui: a IA compara com a transcrição das tomadas soltas e diz qual gravação é de
// qual peça. Nada é criado direto — vira proposta na fila de revisão, pra alguém aprovar.
export default function CasarRoteiro({ onFechar, onPronto }: { onFechar: () => void; onPronto: () => void }) {
  const [texto, setTexto] = useState('')
  const [dia, setDia] = useState('')
  const [fase, setFase] = useState<'edita' | 'lendo' | 'revisa' | 'criando'>('edita')
  const [erro, setErro] = useState('')
  const [pecas, setPecas] = useState<Peca[]>([])
  const [fora, setFora] = useState<Set<string>>(new Set())

  async function lerArquivo(f: File | undefined) {
    if (!f) return
    setErro('')
    if (!/\.(txt|md|rtf)$/i.test(f.name)) {
      setErro('Por ora leio .txt — no Google Docs use Arquivo › Fazer download › Texto sem formatação, ou cole o texto aqui.')
      return
    }
    setTexto(await f.text())
  }

  async function analisar() {
    setFase('lendo'); setErro('')
    try {
      const r = await fetch('/api/casar-roteiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, team: getTeam(), dia: dia.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'não consegui analisar')
      if (!d.pecas?.length) throw new Error('Não achei tomada que casasse com esse roteiro. Confira o dia ou se as tomadas já estão em alguma tarefa.')
      setPecas(d.pecas); setFase('revisa')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falhou'); setFase('edita')
    }
  }

  async function criar() {
    if (!supabase) return
    setFase('criando')
    const usar = pecas.filter((p) => !fora.has(p.titulo))
    for (const p of usar) {
      const { data } = await supabase.from('cards').insert([{
        titulo: p.titulo, categoria: 'Anúncio', fase: 'A editar', semana: currentMonday(),
        team: getTeam(), urgencia: 'média', documentos: [], campanha: '',
        observacoes: MARCA_PENDENTE, // entra na fila de revisão, não direto no fluxo
      }]).select('id')
      const cardId = data?.[0]?.id
      if (!cardId) continue
      for (const t of p.tomadas) {
        await supabase.from('brutos').update({ card_id: cardId }).eq('drive_id', t.drive_id)
        await fetch('/api/bruto-batizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drive_id: t.drive_id }) }).catch(() => {})
      }
    }
    onPronto()
    onFechar()
  }

  const usadas = pecas.filter((p) => !fora.has(p.titulo))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fade-in absolute inset-0 bg-black/65" onClick={onFechar} />
      <div className="sheet-up relative w-full sm:max-w-2xl bg-elev border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl max-h-[calc(var(--vh-real,100vh)*0.88)] flex flex-col shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="shrink-0 flex items-start gap-3 p-5 sm:p-6 pb-3 border-b border-border/70">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold tracking-[-0.01em]">Casar roteiro com as gravações</h2>
            <p className="text-[12.5px] text-muted mt-0.5">Jogue o roteiro aqui. Eu comparo com o que foi falado em cada tomada e monto as tarefas.</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="shrink-0 h-11 w-11 grid place-items-center rounded-xl bg-surface-2 border border-border text-muted hover:text-ink transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 pt-4">
          {fase === 'revisa' ? (
            <>
              <div className="text-[12.5px] text-muted mb-3">Achei {pecas.length} peça{pecas.length > 1 ? 's' : ''}. Desmarque o que não quiser criar.</div>
              <div className="flex flex-col gap-2.5">
                {pecas.map((p) => {
                  const dentro = !fora.has(p.titulo)
                  return (
                    <div key={p.titulo} className={'rounded-2xl border p-3.5 transition-colors ' + (dentro ? 'border-border bg-surface' : 'border-border/50 bg-surface/40 opacity-60')}>
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox" checked={dentro}
                          onChange={() => setFora((s) => { const n = new Set(s); n.has(p.titulo) ? n.delete(p.titulo) : n.add(p.titulo); return n })}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-[#14a8f5]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-bold leading-snug">{p.titulo}</div>
                          {p.trecho && <div className="text-[12px] text-muted mt-0.5 line-clamp-2">“{p.trecho}”</div>}
                          <div className="flex flex-col gap-1 mt-2">
                            {p.tomadas.map((t) => (
                              <div key={t.drive_id} className="flex items-center gap-2 text-[12px]">
                                <span className={'shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold ' + (t.tipo === 'erro' ? 'text-rose-300 bg-rose-500/12 border-rose-500/30' : 'text-emerald-300 bg-emerald-500/12 border-emerald-500/30')}>{t.tipo || '—'}</span>
                                <span className="truncate text-ink-2">{t.nome}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </label>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <label className="faixa-toque flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong hover:border-brand/50 bg-surface/40 py-6 cursor-pointer transition-colors mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-2"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>
                <span className="text-[13.5px] font-semibold">Escolher arquivo do roteiro</span>
                <input type="file" accept=".txt,.md,.rtf" className="hidden" onChange={(e) => lerArquivo(e.target.files?.[0])} />
              </label>
              <textarea
                value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="…ou cole o roteiro aqui"
                className="w-full h-44 rounded-2xl bg-surface border border-border p-3.5 text-[13px] text-ink-2 outline-none focus:border-brand/60 resize-none placeholder:text-muted"
              />
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[12.5px] text-muted">Gravado no dia</span>
                <input
                  value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="06" inputMode="numeric"
                  className="w-16 h-11 rounded-xl bg-surface border border-border px-3 text-[14px] text-ink text-center outline-none focus:border-brand/60"
                />
                <span className="text-[12px] text-muted">deixe vazio pra buscar em todas as tomadas soltas</span>
              </div>
            </>
          )}
          {erro && <div className="mt-3 text-[12.5px] text-red bg-red/10 border border-red/20 rounded-xl px-3 py-2">{erro}</div>}
        </div>

        <div className="shrink-0 flex items-center gap-2 p-5 sm:p-6 pt-3 border-t border-border/70">
          {fase === 'revisa' ? (
            <>
              <button onClick={() => setFase('edita')} className="h-11 px-4 rounded-xl bg-surface-2 border border-border text-ink-2 text-[13px] font-semibold">Voltar</button>
              <div className="flex-1" />
              <button onClick={criar} disabled={!usadas.length || fase !== 'revisa'} className="h-11 px-5 rounded-xl bg-brand text-white text-[14px] font-bold disabled:opacity-60 active:scale-[0.98] transition-transform">
                Criar {usadas.length} tarefa{usadas.length > 1 ? 's' : ''}
              </button>
            </>
          ) : (
            <>
              <div className="flex-1" />
              <button onClick={analisar} disabled={texto.trim().length < 40 || fase === 'lendo'} className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-brand text-white text-[14px] font-bold disabled:opacity-60 active:scale-[0.98] transition-transform">
                {fase === 'lendo' && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                {fase === 'lendo' ? 'Lendo as tomadas…' : 'Casar com as gravações'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
