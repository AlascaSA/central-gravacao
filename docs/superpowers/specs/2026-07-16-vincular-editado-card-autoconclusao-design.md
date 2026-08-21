# Vínculo editado → card + auto-conclusão na aprovação — Design

**Data:** 2026-07-16
**Status:** aprovado (decisões-chave confirmadas com o usuário)

## Objetivo

Vincular o vídeo **editado** ao **card** de produção que o originou, com dois efeitos:

1. **O card mostra o vídeo editado final** (o "link" principal): abrir o card — no Quadro ou no Arquivo — exibe a **peça pronta** (tocar, baixar, abrir no Drive), não só as tomadas brutas. O card vira o registro completo da tarefa: roteiro + tomadas + vídeo final.
2. **Auto-conclusão:** ao aprovar o editado na revisão (marcar "revisado" na aba Vídeos), o card é **arquivado automaticamente** (sai do Quadro → Arquivo). O Quadro reflete sozinho o que já foi entregue.

Os dois efeitos usam o mesmo vínculo `editados.card_id`.

## Contexto do dado (por que dá pra automatizar)

Cada card de produção pode ter **brutos ligados** via `brutos.card_id` (fluxo do "batizar", que renomeia o bruto pra `SR - {título do card}`). O **editado** exportado herda exatamente esse nome de arquivo. Logo existe uma cadeia confiável, sem chute de nome:

```
editado.nome_arquivo  ==(nome base)==  bruto.nome  ->  bruto.card_id  ->  card
```

Verificado no banco: 33 brutos têm `card_id`; editados como `SR - Usucapião Imobiliária.mp4` casam com o bruto `SR - Usucapião Imobiliária.MP4` (card_id `801db702…`). Casamento por `nome_ia` (reescrito pela IA) ou por título solto é **inviável** — só a cadeia do bruto é confiável.

## Escopo

**No v1:**
- Vínculo automático dos editados que casam com um bruto que tem `card_id` (o grosso do conteúdo sem-roteiro).
- Editado **sem match** → nenhuma ação em card (só marca revisado normalmente).
- **Forward-only:** a auto-conclusão só dispara em aprovações **daqui pra frente**. Editados já aprovados NÃO arquivam cards retroativamente (naturalmente satisfeito: o gatilho é a ação de aprovar, não o sync).

**Fora do v1 (fase 2):** vínculo manual (seletor de card) pros editados sem match; anúncios (que precisariam da mesma cadeia bruto→card). O mecanismo já serve, é só estender.

## Arquitetura

Três camadas, cada uma com uma responsabilidade:

### 1. Dado — coluna nova em `editados`
SQL (rodado à mão no Supabase, como as outras migrações):
```sql
alter table editados add column if not exists card_id text;
alter table editados add column if not exists card_titulo text;
```
- `card_id`: id do card vinculado (ou null se sem match).
- `card_titulo`: título do card, **denormalizado** pra exibir no modal sem consulta extra nem FK. Atualizado a cada sync (se o card for renomeado, atualiza no próximo sync).

### 2. Resolução do vínculo — `worker-editados/index.js` (no sync)
No `sincronizar`, antes dos upserts:
1. Buscar os brutos vinculados: `brutos?select=nome,card_id&card_id=not.is.null`.
2. Buscar os cards (pro título): `cards?select=id,titulo`.
3. Montar dois mapas: `nomeBaseNormalizado(bruto) -> card_id` e `card_id -> titulo`.
4. Pra cada editado, computar o **nome base normalizado** do `nome_arquivo` (tira extensão, `trim`, minúsculas, colapsa espaços) e buscar no mapa. Se achar, setar `card_id` e `card_titulo` na linha.
5. Gravar `card_id`/`card_titulo` **tanto em novosRows quanto em existRows** (mantém o vínculo sempre fresco; isso é só dado, não dispara arquivamento).

`nomeBase(nome)` = `nome.replace(/\.[a-z0-9]{2,4}$/i,'')` normalizado. Ex.: `"SR - Usucapião Imobiliária.mp4"` → `"sr - usucapião imobiliária"`.

### 3. Gatilho — na aprovação (frontend)
- `/api/editados` (functions) passa a devolver `cardId` e `cardTitulo`.
- Interface `Editado` ganha `cardId: string | null` e `cardTitulo: string | null`.
- No `Editados.tsx`, `revisar(e)`: depois do `marcarRevisado(id, true)` retornar **ok**, se `e.cardId` existir, chama `arquivarCardVinculado(e.cardId)`.
- `arquivarCardVinculado(cardId)` (nova função em `data/editados.ts`): `supabase.from('cards').update({ arquivado: true, fase: 'Finalizado', finalizado_em: <agora> }).eq('id', cardId)`. Reaproveita a semântica do arquivamento já existente no `store`.
- **Idempotente:** arquivar um card já arquivado é no-op inofensivo.
- **Mão única:** desmarcar revisado (`revisado=false`) **não** desarquiva o card.
- `marcarVariosRevisados` (botão "Marcar todos revisados") também arquiva os cards vinculados do lote.

### 4. Transparência (UI) — modal do editado
No modal do editado, abaixo da descrição/autor: se `cardTitulo` existir, mostrar **"Vinculado ao card: {cardTitulo}"** e, ao aprovar, um aviso discreto "card '{título}' arquivado". Sem clique extra — só informa qual card será encerrado.

### 5. Card mostra o editado — `CardDetail.tsx` (o "link" principal)
Nova seção **"Vídeo editado"** no CardDetail (junto de "Tomadas ligadas"): busca os editados vinculados via `listarEditadosDoCard(cardId)` em `data/editados.ts` (`GET editados?card_id=eq.{id}`, ou um endpoint `/api/editados-do-card?card=`). Pra cada editado ligado, mostra:
- thumb (proxy `/api/thumb`) + nome (`nome_ia`);
- **selo de status**: "Em revisão" (amber) / "Pronto" (revisado, não postado) / "Postado" (emerald);
- **▶ tocar** pelo **player nativo** (reusa `/api/editado-stream` + `<video>`, igual à aba Vídeos);
- **Baixar** (`/api/download-url`) e **abrir no Drive** (`/file/d/{id}/view`).

Assim, abrir um card (inclusive arquivado, ex.: "Coragem na Advocacia") mostra a peça final entregue. Card sem editado vinculado simplesmente não exibe a seção.

## Fluxo de dados

```
sync (worker)  ─► editados.card_id/card_titulo (via bruto→card)
                         │
usuário aprova (revisado) na aba Vídeos
                         │
   marcarRevisado(ok) ──► arquivarCardVinculado(card_id)
                         │
        cards: arquivado=true, fase=Finalizado ─► some do Quadro, aparece no Arquivo
```

## Casos de borda

- **Sem match:** `card_id` null → aprovar só marca revisado, nenhum card tocado.
- **Card já arquivado / vários editados no mesmo card** (vídeo + cortes compartilham o mesmo `card_id`): a primeira aprovação arquiva; as seguintes são no-op.
- **Falha ao arquivar** (rede/RLS): a aprovação do editado já foi confirmada; o arquivamento do card falha em silêncio mas é reversível na próxima aprovação/sync — logar aviso discreto, não reverter o revisado.
- **Card renomeado depois do vínculo:** `card_titulo` atualiza no próximo sync; `card_id` é estável.
- **Desmarcar revisado:** não desarquiva (mão única).

## Verificação

- Rodar o SQL; disparar o sync; conferir via `/api/editados` que os editados "SR - …" trazem `cardId`/`cardTitulo` corretos e os "[SHORT] CONTEÚDO …" vêm null.
- No app: abrir um **card** com editado vinculado (ex.: "Coragem na Advocacia" no Arquivo) → ver a seção **"Vídeo editado"** com o vídeo tocável (player nativo), selo de status, Baixar e Drive.
- Abrir um editado com vínculo em "Em revisão", ver "Vinculado ao card: X", marcar revisado → confirmar que o card X sai do Quadro e aparece no Arquivo (arquivado, Finalizado).
- Editado sem vínculo: aprovar → nenhum card muda.
- Idempotência: aprovar um corte do mesmo card depois → card segue arquivado, sem erro.

## Não-objetivos

- Vínculo manual (seletor de card) — fase 2.
- Anúncios — fase 2.
- Arquivamento retroativo dos já aprovados — descartado (forward-only).
- Desarquivar card ao desmarcar revisado — descartado (mão única).
