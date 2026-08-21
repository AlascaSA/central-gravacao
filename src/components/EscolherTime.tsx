import { useEffect, useState } from 'react'
import { listarTimes, setTeam, type Time } from '../data/team'

// Foto do professor no círculo da tela de entrada (por id do time). Quem não tem foto usa a inicial.
// Recortes 1024×1024 feitos na ferramenta ?recortar — já vêm centralizados no rosto.
const FOTOS: Record<string, string> = {
  jaylton: '/times/jaylton.jpg',
  andre: '/times/andre.jpg',
  pablo: '/times/pablo.jpg',
}

// Tela de entrada: escolhe o especialista ANTES de entrar no site. Cada time é 100% isolado —
// você só acessa o espaço de um professor clicando no nome dele aqui.
export default function EscolherTime() {
  const [times, setTimes] = useState<Time[] | null>(null)
  useEffect(() => {
    listarTimes().then(setTimes).catch(() => setTimes([]))
  }, [])

  return (
    <div className="min-h-dvh w-full grid place-items-center px-5 py-10 bg-surface relative overflow-hidden">
      {/* brilho de fundo sutil */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[420px] w-[720px] max-w-[120vw] rounded-full opacity-[0.18] blur-[90px] bg-[radial-gradient(closest-side,#14a8f5,transparent)]" aria-hidden />

      <div className="relative w-full max-w-3xl">
        <div className="flex flex-col items-center text-center mb-9 sm:mb-11">
          <img src="/alasca-logo.png" alt="Alasca" className="h-7 w-auto mb-6 opacity-95" />
          <h1 className="text-[26px] sm:text-[34px] font-bold tracking-[-0.02em] text-ink">Central de Audiovisual</h1>
          <p className="mt-2 text-[14px] sm:text-[15px] text-muted">Escolha o especialista pra entrar</p>
        </div>

        {times === null ? (
          <div className="grid place-items-center py-16">
            <div className="h-7 w-7 rounded-full border-[3px] border-border-strong border-t-brand animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
            {times.map((t) => {
              const cor = t.cor || '#14a8f5'
              return (
                <button
                  key={t.id}
                  onClick={() => setTeam(t.id)}
                  className="group relative flex flex-col items-center gap-5 rounded-2xl border border-border bg-elev/70 px-5 py-9 sm:py-12 transition-all duration-200 hover:-translate-y-1 hover:border-[color:var(--cor)] hover:bg-elev focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cor)]"
                  style={{ ['--cor' as string]: cor }}
                >
                  {/* halo na cor do time no hover */}
                  <span
                    className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ boxShadow: `0 18px 50px -20px ${cor}` }}
                    aria-hidden
                  />
                  {FOTOS[t.id] ? (
                    <img
                      src={FOTOS[t.id]}
                      alt={t.nome}
                      className="h-24 w-24 sm:h-[128px] sm:w-[128px] rounded-full object-cover shadow-xl ring-4 ring-surface-2"
                      style={{ boxShadow: `0 0 0 3px ${cor}` }}
                    />
                  ) : (
                    <span
                      className="grid place-items-center h-24 w-24 sm:h-[128px] sm:w-[128px] rounded-full text-[38px] sm:text-[52px] font-bold text-white shadow-xl ring-4 ring-surface-2"
                      style={{ background: cor }}
                    >
                      {t.nome.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-[19px] sm:text-[22px] font-bold text-ink tracking-[-0.01em]">{t.nome}</span>
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted group-hover:text-ink-2 transition-colors">
                    Entrar
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-hover:translate-x-0.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
