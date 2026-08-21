# Montador de variações

Monta os anúncios da aba **Multiplicar** fora da máquina de quem pediu: o vídeo
sai do Drive, é emendado aqui e volta pro Drive. Nada trafega pelo computador do
editor, e a fila continua mesmo com o navegador fechado.

## Por que existe

A aba Multiplicar monta no próprio navegador, com ffmpeg em WebAssembly. Funciona,
mas tem dois tetos: as peças prontas sobem pela internet de quem está usando
(150 variações são uns 4,5 GB de upload), e fechar a aba mata a fila. Aqui o Drive
é do próprio Google — o arquivo não sai da rede deles.

## O que ele faz

1. Recebe a lista de combinações já nomeadas (a Central é que nomeia)
2. Cria a subpasta `Variações <código>` dentro da pasta de origem
3. Baixa cada peça-fonte **uma vez**, mesmo aparecendo em trinta combinações
4. Roda `ffprobe` para saber se as peças casam
   - casam → emenda por cópia de bytes, cerca de 1s por peça
   - não casam → recodifica, o que é bem mais lento (e a Central avisa antes)
5. Sobe cada variação e apaga do disco na hora
6. Escreve o progresso na tabela `montagens` do Supabase a cada peça

## Rotas

| | |
|---|---|
| `GET /saude` | responde `{ok:true}` |
| `GET /listar?pasta=<id>` | vídeos de uma pasta |
| `POST /montar` | recebe `{pasta, codigo, combinacoes[]}`, responde `202 {id}` e trabalha em segundo plano |

Todas exigem o header `x-chave` igual à variável `CHAVE`.

## Variáveis

| variável | para quê |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON da conta de serviço (a mesma da Central, que já tem acesso ao Shared Drive) |
| `CHAVE` | senha do serviço; a Central manda no header `x-chave` |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | onde gravar o progresso |
| `PARALELO` | quantas peças ao mesmo tempo (padrão 2, igual ao número de vCPUs) |

Para rodar **na máquina** durante o desenvolvimento, em vez da conta de serviço dá
para usar um token OAuth de usuário:

```
OAUTH_TOKEN_JSON=~/Documents/claude/selecionador-fotos/token.json \
OAUTH_CLIENT_JSON=~/.claude/.google/client_secret.json \
CHAVE=prova node index.js
```

## Subir no Cloud Run

```
GOOGLE_SERVICE_ACCOUNT_KEY="$(cat chave.json)" \
SUPABASE_ANON_KEY="..." \
./deploy.sh <id-do-projeto-gcp>
```

O script liga as APIs, guarda a chave da conta de serviço como secret, publica e
imprime `MONTADOR_URL` e `MONTADOR_CHAVE` — os dois valores que faltam nas
variáveis do projeto `central-gravacao` no Cloudflare Pages.

Detalhes das opções que importam:

- `--no-cpu-throttling` — sem isso a CPU é cortada depois da resposta HTTP, e a
  fila (que roda em segundo plano) congela
- `--concurrency 1` — cada instância cuida de uma rodada; ffmpeg já usa as duas vCPUs
- `--timeout 3600` — a rodada é assíncrona, mas o teto alto evita corte no meio
- `2Gi` de memória — em Cloud Run o `/tmp` é RAM: cabem as peças-fonte e a saída da vez

## Antes de usar

Rodar `supabase/montagens.sql` no SQL Editor do Supabase (uma vez). Sem a tabela o
serviço monta e entrega igual, mas a Central não tem de onde ler a barra.

## Prova de que funciona

Testado de ponta a ponta em 21/08/2026 contra o Shared Drive de verdade
(«Time Alasca»): 5 peças-fonte sintéticas → 4 variações. Cada uma saiu com
10,02s (3s de gancho + 5s de corpo + 2s de CTA), 1080x1920, h264/aac, e os frames
em 1s, 5s e 9s conferem as cores das três origens — ou seja, a ordem está certa.
