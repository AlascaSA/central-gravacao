#!/bin/bash
# Sobe o montador no Cloud Run. Precisa de gcloud autenticado e de um projeto
# com faturamento ligado — o resto (build da imagem, APIs) o script resolve.
#
#   ./deploy.sh <id-do-projeto>
#
# Depois de subir, ele imprime a URL do serviço: é o valor de MONTADOR_URL nas
# variáveis do Cloudflare Pages da Central.
set -euo pipefail

PROJETO="${1:-}"
REGIAO="${REGIAO:-southamerica-east1}"   # São Paulo: perto do Drive e da equipe
SERVICO="montador-anuncios"

if [ -z "$PROJETO" ]; then
  echo "uso: ./deploy.sh <id-do-projeto-gcp>" >&2
  exit 1
fi
if [ -z "${GOOGLE_SERVICE_ACCOUNT_KEY:-}" ]; then
  echo "falta GOOGLE_SERVICE_ACCOUNT_KEY (o mesmo JSON que a Central usa)" >&2
  exit 1
fi
CHAVE="${CHAVE:-$(openssl rand -hex 24)}"

gcloud config set project "$PROJETO"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# a chave da conta de serviço vai como secret, não como variável à vista
if ! gcloud secrets describe montador-sa >/dev/null 2>&1; then
  printf '%s' "$GOOGLE_SERVICE_ACCOUNT_KEY" | gcloud secrets create montador-sa --data-file=-
else
  printf '%s' "$GOOGLE_SERVICE_ACCOUNT_KEY" | gcloud secrets versions add montador-sa --data-file=-
fi

gcloud run deploy "$SERVICO" \
  --source . \
  --region "$REGIAO" \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --no-cpu-throttling \
  --concurrency 1 \
  --max-instances 3 \
  --set-secrets "GOOGLE_SERVICE_ACCOUNT_KEY=montador-sa:latest" \
  --set-env-vars "CHAVE=$CHAVE,PARALELO=2,SUPABASE_URL=${SUPABASE_URL:-https://kkvuioyferqbilfwdkqa.supabase.co},SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY:-}"

URL=$(gcloud run services describe "$SERVICO" --region "$REGIAO" --format='value(status.url)')
echo
echo "================= pronto ================="
echo "MONTADOR_URL   = $URL"
echo "MONTADOR_CHAVE = $CHAVE"
echo
echo "Ponha esses dois nas variáveis do projeto central-gravacao no Cloudflare Pages"
echo "e republique a Central. A opção 'no servidor' aparece sozinha na aba Multiplicar."
