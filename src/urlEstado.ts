// Guarda o "onde você está" na URL (aba + pasta do catálogo). Serve pra duas coisas:
// 1) recarregar a página não joga mais tudo pro começo;
// 2) o link da barra de endereço pode ser copiado e mandado pra alguém, que abre no mesmo lugar.
// Mexe SÓ nos parâmetros próprios — ?t= (time), ?card= e o caminho /v/ continuam intactos.

export function lerParam(nome: string): string | null {
  const v = new URLSearchParams(window.location.search).get(nome)
  return v && v.trim() ? v : null
}

/** Atualiza (ou remove, com null) parâmetros sem recarregar e sem empilhar histórico. */
export function gravarParams(vals: Record<string, string | null>) {
  const u = new URL(window.location.href)
  for (const [k, v] of Object.entries(vals)) {
    if (v == null || v === '') u.searchParams.delete(k)
    else u.searchParams.set(k, v)
  }
  window.history.replaceState({}, '', u.toString())
}
