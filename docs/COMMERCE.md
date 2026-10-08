# COMMERCE.md — fluxo comercial ClickIT

Landing → pedido → checkout InfinitePay → confirmação server-side →
licença → página de sucesso → serial entregue.

Sem envio de e-mail nesta etapa (fase 1). Sem deploy automático. **Nenhum
pagamento real foi realizado.**

---

## 1. Oferta oficial

| Campo | Valor |
| --- | --- |
| Produto | ClickIT Beta (`clickit-beta-lifetime`) |
| Preço | **R$ 347,00** = `34700` centavos |
| Pagamento | único |
| Licença | vitalícia (`BETA_LIFETIME`) |
| Dispositivos | até 2 |
| Atualizações | 3 próximas versões **principais** após a adquirida |
| Versão adquirida | `0.1.0` |

Fonte única do que é cobrado/entregue: `landing/src/config/commerce.ts`.
O navegador **nunca** envia preço — `startOrder()` sempre usa
`PRODUCT_PRICE_CENTS` do backend.

### Política de atualizações

- `0.1.0 → 0.1.1` = **patch**, não consome atualização.
- `0.1.x → 0.2.0` = atualização principal **#1**
- `0.2.x → 0.3.0` = atualização principal **#2`
- `0.3.x → 0.4.0` = atualização principal **#3**

Depois disso a licença **não expira**: a versão instalada continua
funcionando; apenas versões futuras deixam de estar incluídas.
Metadados gravados na licença: `purchased_version`, `updates_included = 3`,
`updates_used = 0`. Auto-update completo **não** faz parte desta etapa.

---

## 2. Env vars (backend da landing)

Copie `landing/.env.example` para `landing/.env.local` (não commitado).

| Variável | Papel |
| --- | --- |
| `INFINITEPAY_HANDLE` | InfiniteTag (sem o `$`) |
| `INFINITEPAY_API_URL` | padrão `https://api.checkout.infinitepay.io` |
| `INFINITEPAY_WEBHOOK_URL` | URL pública de `POST /api/webhooks/infinitepay` |
| `INFINITEPAY_REDIRECT_URL` | base de retorno (rota `/pagamento`) |
| `LICENSE_API_URL` | padrão `http://127.0.0.1:8085` |
| `LICENSE_ADMIN_KEY` | chave de admin da License API |
| `ORDERS_SQLITE` | caminho do banco de pedidos (padrão `data/orders.sqlite`) |
| `NEXT_PUBLIC_SITE_URL` | base pública do site |
| `NEXT_PUBLIC_DOWNLOAD_URL` | instalador liberado na página de sucesso |

Nenhuma credencial usa `NEXT_PUBLIC_`: nada disso entra no bundle do client.
Enquanto `handle`, `webhook` ou `LICENSE_ADMIN_KEY` faltarem,
`commerceConfigured()` é falso e o `/checkout` exibe "Disponível em breve"
(resposta `503 NOT_CONFIGURED`).

---

## 3. Arquitetura

```
Landing /checkout (form: nome, e-mail, WhatsApp)
   └─ POST /api/checkout
        ├─ valida cliente
        ├─ cria order PENDING (SQLite: data/orders.sqlite)
        ├─ POST https://api.checkout.infinitepay.io/links
        │     handle, items[1 × 34700], order_nsu,
        │     redirect_url=/pagamento?o=<publicToken>, webhook_url, customer
        └─ devolve checkout_url → browser redireciona

InfinitePay (página de pagamento) ── redirect ──> /pagamento?o=...&order_nsu=
                                                   &transaction_nsu=&slug=&receipt_url=&capture_method=
POST /api/webhooks/infinitepay  (evento de pagamento)
   └─ handleWebhook → confirmPayment
        ├─ POST /payment_check {handle, order_nsu, transaction_nsu, slug}
        ├─ success===true && paid===true && valor coerente (34700)
        ├─ claimPago (transação, idempotente)
        └─ POST {LICENSE_API_URL}/admin/licenses  → serial CLICKIT-XXXX-XXXX-XXXX

GET /api/orders/<publicToken>/status   (polling da página /pagamento)
   └─ reconcilia com os parâmetros do redirect; nunca gera licença sozinho
```

| Arquivo | Papel |
| --- | --- |
| `landing/src/config/commerce.ts` | preço/planos/dispositivos centralizados |
| `landing/src/lib/commerce/db.ts` | pedidos em SQLite (`node:sqlite`), transições condicionais |
| `landing/src/lib/commerce/infinitepay.ts` | `/links`, `/payment_check`, `assertPaid` |
| `landing/src/lib/commerce/license-api.ts` | emite licença na License API |
| `landing/src/lib/commerce/orders.ts` | orquestração, idempotência, status público |
| `landing/src/lib/commerce/validate.ts` | nome/e-mail/WhatsApp |
| `landing/src/lib/commerce/log.ts` | logs estruturados com redação |
| `landing/src/app/api/checkout/route.ts` | cria pedido + link |
| `landing/src/app/api/webhooks/infinitepay/route.ts` | webhook |
| `landing/src/app/api/orders/[token]/status/route.ts` | polling/reconciliação |
| `landing/src/app/pagamento/*` | página de sucesso/processando |
| `landing/tools/orders.ts` | CLI administrativa |
| `licensing/src/{app,db,types}.ts` | License API com metadados comerciais |

---

## 4. Status do pedido

`PENDING → PAID → LICENSE_CREATED → COMPLETED`, com `FAILED` e `CANCELLED`
como estados terminais. `order_nsu` é **UNIQUE**; `transaction_nsu` também
(un índice; vários NULL são permitidos).

| Estado | Significado |
| --- | --- |
| `PENDING` | pedido criado, aguardando pagamento |
| `PAID` | `payment_check` confirmou; aguardando/emitindo licença |
| `LICENSE_CREATED` | licença emitida; serial pronto para entrega |
| `COMPLETED` | serial entregue ao comprador |
| `FAILED` | falha ao criar o link (ou erro terminal) |
| `CANCELLED` | cancelado manualmente |

`order_nsu` = `CLICKIT-ORDER-<18 hex>` (nunca sequencial).
`publicToken` = 32 hex (usado na URL de status).

---

## 5. Regras de segurança

1. **Preço do backend**: `items[0].price = 34700` sempre; campos enviados
   pelo cliente (`price`, `amount`, `productId`) são ignorados.
2. **Redirect não prova pagamento**: `/pagamento` apenas localiza o pedido e
   roda `payment_check`; sem `transaction_nsu + slug` nada acontece.
3. **Webhook não é confiado**: exige pedido existente, produto ClickIT,
   valor 34700 e `payment_check` com `success && paid`.
4. **Idempotência**: `claimPaid`/`attachLicense` usam `BEGIN IMMEDIATE` +
   `UPDATE ... WHERE status IN (...)`; webhook duplicado → mesmo resultado,
   uma única licença. Além disso há trava por pedido dentro do processo.
5. **Valor divergente** (`amount` e `paid_amount` diferentes de 34700) →
   `AMOUNT_MISMATCH`, sem licença, webhook responde 400 (retry).
6. **Serial**: no banco da License API fica apenas o **hash**
   (`key_hash`); a chave plain-text existe no pedido apenas para a entrega
   inicial. `orders:get` é o caminho de recuperação administrativa.
7. **Logs**: eventos `ORDER_CREATED`, `CHECKOUT_CREATED`, `WEBHOOK_RECEIVED`,
   `PAYMENT_VERIFIED`, `PAYMENT_REJECTED`, `LICENSE_CREATED`,
   `LICENSE_FAILED`, `ORDER_COMPLETED`, `RECONCILE_SKIPPED`. Nunca serial,
   cartão ou chave (`log.ts` redige esses campos).

### Respostas do webhook (docs InfinitePay)

- `200` tratado — inclusive pedido desconhecido (evita retry infinito)
- `400` algo deu errado (`PAYMENT_NOT_CONFIRMED`, `AMOUNT_MISMATCH`,
  `TRANSACTION_CONFLICT`, `LICENSE_API_UNAVAILABLE`, `SLUG_MISSING`) —
  a InfinitePay reenvia

---

## 6. Página /pagamento

Estados: `PROCESSING` (confirmando), `PENDING` (aguardando pagamento),
`PAID` (aprovado, emitindo licença), `LICENSE_READY` (serial na tela),
`FAILED`.

- Polling a cada 2,5 s, até 72 tentativas (~3 min), com "Verificar
  novamente" manual.
- Ao entregar o serial o pedido vira `COMPLETED` + `license_delivered_at`.
- Serial + botões **Copiar licença** e **Baixar ClickIT para Windows**
  (`NEXT_PUBLIC_DOWNLOAD_URL`; o instalador é protegido pelo licenciamento,
  por isso pode ser baixado livremente).

---

## 7. Administração

```bash
cd landing
npm run orders:list                      # status, e-mail, tx, licença, pago em
npm run orders:get <orderNsu|token>      # detalhe + serial (recuperação)
npm run orders:reconcile [orderNsu]      # PAID sem licença → reemitir
```

`reconcile` só consegue concluir pedidos `PAID` com `transaction_nsu` +
`infinitepay_slug` gravados. `PENDING` depende do webhook ou do redirect.

---

## 8. Testes

```bash
cd landing
npm test        # 19 casos — mocks de HTTP, nenhuma chamada real
npm run lint
npm run typecheck
npm run build
```

Cobertura: preço do backend, cliente não altera preço, `order_nsu` único,
payload `/links`, redirect não aprova, webhook desconhecido/duplicado,
`transaction_nsu` repetido, `paid=false`, valor divergente, retry com
License API fora, `maxDevices=2`, `BETA_LIFETIME`, `updatesIncluded=3`,
`expiresAt=null`, estados `PENDING`/`LICENSE_READY`, validação do formulário.

Licenciamento (raiz): `node --test tests/licensing-*.test.ts` → 31 PASS.

---

## 9. Pendências conhecidas

- **E-mail**: fora desta etapa; a licença continua recuperável por
  `orders:get` (e-mail/order_nsu).
- **Deploy**: não realizado.
- **Pagamento real**: não realizado (exige autorização explícita;
  validar primeiro com mocks/ambiente de teste da InfinitePay).
- **Webhook assinado**: a InfinitePay não documenta assinatura — a prova é
  sempre o `payment_check`.

## 10. Deploy na Vercel (2026-10-08)

- **URL pública**: `https://clickit-pearl.vercel.app` (alias de produção;
  deployments individuais usam `clickit-<hash>-jason-3c4d.vercel.app`).
- **Projeto Vercel**: `clickit` (org `jason-3c4d`), importado pela CLI a
  partir de `landing/`. Repositório `jassonmouragt-prog/ClickIT` **privado**
  já conectado na Vercel (Integração Git detectada no `vercel link`).
- **Root Directory**: `landing` (o deploy via CLI sobe exatamente a pasta
  `landing/`; para deploys por push do Git, confirmar `Root Directory =
  landing` e `Build Command = npm run build` no painel).
- **Node/runtime**: build e funções rodando no runtime default da Vercel.
  Locais (dev) permanecem Node 24 + `node:sqlite`.
- **Env vars configuradas** (Production, secret):
  - `NEXT_PUBLIC_SITE_URL=https://clickit-pearl.vercel.app`
  - `INFINITEPAY_WEBHOOK_URL=https://clickit-pearl.vercel.app/api/webhooks/infinitepay`
  - `INFINITEPAY_REDIRECT_URL=https://clickit-pearl.vercel.app/pagamento`
- **Env vars PENDENTES** (não inventadas; não quebram o deploy):
  - `INFINITEPAY_HANDLE` (InfiniteTag da conta)
  - `LICENSE_API_URL` + `LICENSE_ADMIN_KEY` (License API pública)
  - `NEXT_PUBLIC_DOWNLOAD_URL` (instalador hospedado)
  - `NEXT_PUBLIC_SUPPORT_URL` (fallback `/#faq` já usado pelo site)
- **Problema crítico descoberto no serverless**: o filesystem do runtime
  Vercel é somente leitura (exceto `/tmp`), então **o SQLite de pedidos
  (`data/orders.sqlite`) NÃO funciona em produção** — antes isso derrubava
  as rotas com 500 (`ENOENT mkdir 'data'`). Corrigido: quando o store não
  abre, as rotas respondem estados seguros — `POST /api/checkout` → **503**
  `STORE_UNAVAILABLE`, `POST /api/webhooks/infinitepay` → **400**
  `STORE_UNAVAILABLE` (retry), status → **503**. Nenhuma licença é gerada
  sem `payment_check` válido. Para a venda real a frente de pedidos precisa
  de **Postgres (Neon)** — ver seção 12.
- **Validação do deploy** (screenshots/métricas Puppeteer, zero console
  error): `/` desktop+mobile, `/checkout` desktop+mobile com
  `scrollWidth == viewport`, 1 stylesheet, `bodyBackground rgb(7,10,16)`,
  overflow somente em blobs decorativos bleeds; `/pagamento`, `/privacidade`
  e `/termos` retornam 200. Um `ERR_CONNECTION_RESET` no otimizador de
  imagem (`cmp-05.webp`, w=128) no mobile foi transiente (retry sem erro).

## 11. Infraestrutura recomendada

### 11.1 License API (auditoria)

Estado atual: projeto independente em `licensing/` — servidor `node:http`
de longa duração (`src/index.ts`), banco **SQLite local** por padrão
(`licensing/license.sqlite`) e **Postgres já suportado** via `DATABASE_URL`
(`postgresLicenseDb`); chave de assinatura Ed25519 por env
`LICENSE_PRIVATE_KEY` (ou `dev-keypair.json` ignorado). Requer estado
persistente (ativações/revogações/trials) — **não é serverless-friendly com
SQLite**.

Recomendação (em ordem):
- **A) Vercel Serverless + Neon Postgres** — menor custo operacional (tudo
  na Vercel, Neon tem tier grátis) e `db.ts` já tem driver Postgres; falta
  um wrapper serverless quebrado do `createLicenseServer` para a função e
  configurar `DATABASE_URL` + `LICENSE_PRIVATE_KEY` como env. Requer etapa
  de código pequena.
- **B) Railway / Render / Fly.io** — roda o servidor atual intocado
  (container persistente com volume SQLite) em ~5–7 min, custo ~US$5/mês.
- Não recomendado hospedar com banco SQLite em serverless (Runtime não
  persistente).

Para a venda aberta, a **frente de pedidos da landing precisa do mesmo
Postgres** (Neon): `ORDERS_SQLITE` é dev-only; em produção o `db.ts` de
pedidos deveria ganhar variante Postgres (ou usar Vercel Postgres/KV).

### 11.2 Instalador (auditoria)

Estado atual: `release/ClickIT Setup 0.1.0.exe` (≈ **313,9 MB**) e
`release/ClickIT 0.1.0.exe` portable (≈ 313,6 MB) + blockmap — **não** está
hospedado.

Recomendação:
- **Cloudflare R2** (10 GB grátis, **zero egress**) ou **Backblaze B2**
  (10 GB grátis) — arquivos grandes com download aceitável; bucket público
  ou URL pré-assinada de longa duração como `NEXT_PUBLIC_DOWNLOAD_URL`.
- **GitHub Releases NÃO serve** (limite de 2 GB por versão, mas arquivos
  acima de 100 MB não são permitidos) — 313 MB ultrapassa.
- **Vercel não cabe**: limite de 250 MB por arquivo estático no projeto +
  custo de bandwidth; não recomendado.

### 11.3 Pendências para abrir a venda (checklist)

1. Neon Postgres para pedidos da landing (migrar `OrdersStore` ou Vercel KV).
2. License API pública (opção 11.1.A ou 11.1.B) + `LICENSE_API_URL` /
   `LICENSE_ADMIN_KEY` na Vercel.
3. `INFINITEPAY_HANDLE` + registrar `INFINITEPAY_REDIRECT_URL` e
   `INFINITEPAY_WEBHOOK_URL` na conta InfinitePay.
4. Instalador em R2/B2 → `NEXT_PUBLIC_DOWNLOAD_URL`.
5. Só então: teste real de pagamento (autorização explícita).
