import { useEffect, useRef, useState } from 'react'

// Recortador de avatar: joga a foto, arrasta pra posicionar, dá zoom, baixa o quadrado pronto.
// Não depende de Photoshop e não toca em arquivo nenhum — é só canvas no navegador.
const V = 512 // resolução do quadrado exportado
const DISP = 340 // tamanho de exibição do canvas na tela

export default function RecortarAvatar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const off = useRef({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [nome, setNome] = useState('avatar')
  const [, tick] = useState(0)

  const base = () => (img ? Math.max(V / img.naturalWidth, V / img.naturalHeight) : 1)

  function clamp() {
    if (!img) return
    const eff = base() * zoom
    const dw = img.naturalWidth * eff
    const dh = img.naturalHeight * eff
    off.current.x = Math.min(0, Math.max(V - dw, off.current.x))
    off.current.y = Math.min(0, Math.max(V - dh, off.current.y))
  }

  function draw() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#0b0d11'
    ctx.fillRect(0, 0, V, V)
    if (!img) return
    const eff = base() * zoom
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, off.current.x, off.current.y, img.naturalWidth * eff, img.naturalHeight * eff)
  }

  useEffect(() => { clamp(); draw() }, [img, zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  function carregar(file: File | undefined) {
    if (!file) return
    const im = new Image()
    im.onload = () => {
      const b = Math.max(V / im.naturalWidth, V / im.naturalHeight)
      off.current = { x: (V - im.naturalWidth * b) / 2, y: (V - im.naturalHeight * b) / 2 }
      setZoom(1)
      setImg(im)
    }
    im.src = URL.createObjectURL(file)
  }

  function onDown(e: React.PointerEvent) {
    if (!img) return
    drag.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return
    const k = V / DISP
    off.current.x += (e.clientX - drag.current.x) * k
    off.current.y += (e.clientY - drag.current.y) * k
    drag.current = { x: e.clientX, y: e.clientY }
    clamp()
    draw()
    tick((n) => n + 1)
  }
  function onUp() { drag.current = null }

  const OUT = 1024 // resolução do arquivo final (o preview usa V=512; a exportação amostra da foto original)

  function baixar() {
    if (!img) return
    // recorte amostrado DIRETO da foto original em resolução cheia (sem passar por um canvas menor):
    const eff = base() * zoom
    const sx = -off.current.x / eff
    const sy = -off.current.y / eff
    const s = V / eff // lado do recorte em pixels da FOTO ORIGINAL
    const oc = document.createElement('canvas')
    oc.width = OUT
    oc.height = OUT
    const octx = oc.getContext('2d')
    if (!octx) return
    octx.imageSmoothingEnabled = true
    octx.imageSmoothingQuality = 'high'
    octx.fillStyle = '#0b0d11'
    octx.fillRect(0, 0, OUT, OUT)
    octx.drawImage(img, sx, sy, s, s, 0, 0, OUT, OUT)
    oc.toBlob(
      (b) => {
        if (!b) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(b)
        a.download = (nome.trim() || 'avatar').replace(/\.jpe?g$/i, '') + '.jpg'
        document.body.appendChild(a)
        a.click()
        a.remove()
      },
      'image/jpeg',
      0.95,
    )
  }

  return (
    <div className="min-h-dvh w-full grid place-items-center px-5 py-10 bg-bg text-ink">
      <div className="w-full max-w-md">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-center">Recortar avatar</h1>
        <p className="text-[13px] text-muted text-center mt-1 mb-6">Joga a foto, arrasta pra centralizar o rosto no círculo e baixa. O quadrado já sai no tamanho certo.</p>

        {!img ? (
          <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong hover:border-brand/50 bg-elev/50 py-14 cursor-pointer transition-colors">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-2"><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
            <span className="text-[14px] font-semibold">Escolher foto</span>
            <span className="text-[12px] text-muted">.jpg · .png · .heic</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => carregar(e.target.files?.[0])} />
          </label>
        ) : (
          <>
            <div className="relative mx-auto select-none touch-none" style={{ width: DISP, height: DISP }}>
              <canvas
                ref={canvasRef}
                width={V}
                height={V}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className="rounded-xl cursor-grab active:cursor-grabbing"
                style={{ width: DISP, height: DISP, touchAction: 'none' }}
              />
              {/* guia do círculo: escurece os cantos que serão cortados no avatar */}
              <div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ boxShadow: '0 0 0 9999px rgba(8,9,11,.62)', outline: '2px solid rgba(255,255,255,.55)', outlineOffset: -1 }}
              />
            </div>

            <div className="flex items-center gap-3 mt-5">
              <span className="text-[12px] text-muted">Zoom</span>
              <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[#14a8f5]" />
            </div>

            <div className="mt-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">Nome do arquivo</div>
              <div className="flex gap-2 mb-2 flex-wrap">
                {['jaylton', 'andre', 'pablo'].map((n) => (
                  <button key={n} onClick={() => setNome(n)} className={'text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors ' + (nome === n ? 'bg-brand/12 border-brand/40 text-brand-2' : 'bg-surface border-border text-ink-2 hover:border-border-strong')}>{n}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={nome} onChange={(e) => setNome(e.target.value)} className="flex-1 h-10 px-3 rounded-xl bg-surface border border-border text-ink text-[14px] outline-none focus:border-brand/70" />
                <span className="grid place-items-center px-2 text-[13px] text-muted">.jpg</span>
              </div>
            </div>

            <div className="flex gap-2.5 mt-5">
              <label className="h-11 px-4 grid place-items-center rounded-xl bg-surface-2 border border-border text-ink-2 font-semibold text-[13px] hover:border-border-strong cursor-pointer transition-colors">
                Trocar foto
                <input type="file" accept="image/*" className="hidden" onChange={(e) => carregar(e.target.files?.[0])} />
              </label>
              <button onClick={baixar} className="flex-1 h-11 rounded-xl bg-brand text-white font-bold text-[14px] shadow-[0_10px_30px_-6px_rgba(20,168,245,0.5)] active:scale-[0.98] transition-transform">Baixar quadrado</button>
            </div>

            {/* prévia no tamanho real do avatar */}
            <div className="flex items-center gap-3 mt-6 justify-center">
              <span className="text-[11px] text-muted">Fica assim:</span>
              <img alt="prévia" className="h-[112px] w-[112px] rounded-full object-cover ring-4 ring-surface-2" style={{ boxShadow: '0 0 0 3px #14a8f5' }} src={canvasRef.current?.toDataURL('image/jpeg', 0.85)} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
