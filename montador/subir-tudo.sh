#!/bin/bash
# Sobe o montador e liga a Central nele, de uma vez.
#
# Antes de rodar, uma vez só:
#   gcloud auth login
#   (e ter um projeto no Google Cloud com faturamento ligado)
#
# Uso:  ./subir-tudo.sh <id-do-projeto-gcp>
#
# Ele pega a chave da conta de serviço e a chave do Supabase das variáveis que a
# Central já tem no Cloudflare, publica no Cloud Run, e devolve pro Cloudflare a
# URL e a senha do serviço. Nenhuma credencial fica em arquivo.
set -euo pipefail

PROJETO="${1:-}"
[ -z "$PROJETO" ] && { echo "uso: ./subir-tudo.sh <id-do-projeto-gcp>" >&2; exit 1; }

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
CONTA_CF="9c13fe3e5915ab63f379b644613ed261"
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"

echo "→ lendo as variáveis que a Central já usa no Cloudflare"
LIDO=$(python3 - "$CONTA_CF" <<'PY'
import json,os,re,sys,urllib.request
cfg=os.path.expanduser('~/Library/Preferences/.wrangler/config/default.toml')
tok=None
for l in open(cfg):
    m=re.match(r'\s*oauth_token\s*=\s*"([^"]+)"',l)
    if m: tok=m.group(1)
if not tok: sys.exit('sem login do wrangler — rode: npx wrangler login')
url=f'https://api.cloudflare.com/client/v4/accounts/{sys.argv[1]}/pages/projects/central-gravacao'
d=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+tok})))
ev=d['result']['deployment_configs']['production']['env_vars']
print(ev['GOOGLE_SERVICE_ACCOUNT_KEY']['value'])
print('---CORTE---')
print(ev['VITE_SUPABASE_ANON_KEY']['value'])
PY
)
export GOOGLE_SERVICE_ACCOUNT_KEY="${LIDO%%$'\n'---CORTE---*}"
export SUPABASE_ANON_KEY="${LIDO##*---CORTE---$'\n'}"
echo "  chave da conta de serviço e do Supabase: ok"

CHAVE="$(openssl rand -hex 24)"
export CHAVE
cd "$AQUI"
CHAVE="$CHAVE" ./deploy.sh "$PROJETO"

URL=$(gcloud run services describe montador-anuncios \
        --region "${REGIAO:-southamerica-east1}" --format='value(status.url)')

echo
echo "→ guardando MONTADOR_URL e MONTADOR_CHAVE no Cloudflare"
cd "$RAIZ"
printf '%s' "$URL"   | npx wrangler pages secret put MONTADOR_URL   --project-name=central-gravacao
printf '%s' "$CHAVE" | npx wrangler pages secret put MONTADOR_CHAVE --project-name=central-gravacao

echo "→ republicando a Central para as variáveis valerem"
npm run build
npx wrangler pages deploy --project-name=central-gravacao --branch=main --commit-dirty=true

echo
echo "Pronto. Abra a aba Multiplicar: a opção 'no servidor' aparece sozinha."
echo "Se não aparecer, falta rodar supabase/montagens.sql no Supabase."
