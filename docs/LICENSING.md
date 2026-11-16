# Licenciamento da ClickIT — Operação

## Visão geral

O desktop (Electron) exige uma licença ativa para abrir o workspace. A ativação é feita
pelo usuário na janela "Ative sua ClickIT" com uma chave `CLICKIT-XXXX-XXXX-XXXX`. A
validação acontece de ponta a ponta contra a **License API** (servidor separado), que
assina tokens Ed25519. O desktop nunca conhece a chave privada.

Componentes:

- `src/licensing/*` — núcleo no desktop (verificação de token, armazenamento local DPAPI, guard de IPC).
- `licensing/` — License API (http), banco, CLI admin.
- Chave pública embutida fixa em `src/licensing/publicKey.ts`.

## Publicar a License API

Sem `DATABASE_URL`, a API usa `licensing/license.sqlite` (SQLite). Em produção use Postgres/Neon:

```sh
DATABASE_URL=postgres://... LICENSE_ADMIN_KEY=<secreta> LICENSE_PRIVATE_KEY=<pem> npm run license:build
```

Inicie o bundle em `licensing/dist/server.cjs`. Envs:

| Env | Descrição |
|---|---|
| `DATABASE_URL` | Postgres (Neon/RDS). Ausente → SQLite local. |
| `LICENSE_ADMIN_KEY` | Token Bearer para rotas `/admin/*` (crie via `npm run license:keys`). |
| `LICENSE_PRIVATE_KEY` | PEM Ed25519 privada do par de assinatura. |
| `LICENSE_PORT` | Porta HTTP (default `8085`). |

O desktop conversa com `https://clickit-license-api.vercel.app` por padrão; override só para
desenvolvimento com `CLICKIT_LICENSE_API`. O domínio `licensing.clickit.app` está
estacionado e não serve a API: builds que ainda apontem para ele falham ao ativar.

## CLI admin

Os comandos operam sobre o Postgres de produção quando `DATABASE_URL` existe (ou com
`--db postgres`), e sobre `licensing/license.sqlite` caso contrário (caminho controlado
por `CLICKIT_LICENSE_SQLITE`). Use o mesmo banco da API em produção:

- `npm run license:keys` — gera novo par de chaves; **atualizar `src/licensing/publicKey.ts`
  e rebuildar o desktop** sempre que trocar o par.
- `npm run license:create` — cria licença (nome, email, maxDevices, plano, versão); mostra a chave **uma vez**.
- `npm run license:list` — lista licenças (sem hash; apenas prefixo).
- `npm run license:revoke <id>` — revoga uma licença.
- `npm run license:devices <id>` — lista ativações por device.
- `npm run license:trials` — lista os testes grátis emitidos (janela de 20 minutos).
- `npm run license:serve` — sobe a API dev em `http://127.0.0.1:8085`.

Admin HTTP: `POST/GET /admin/licenses`, `POST /admin/licenses/:id/revoke|unrevoke`,
`GET /admin/licenses/:id/activations` com `Authorization: Bearer $LICENSE_ADMIN_KEY`.

## Regras de negócio

- Chave = 3 blocos `CLICKIT-XXXX-XXXX-XXXX`; aleatória; armazenada só como hash sha256 no banco.
- `maxDevices` padrão 2; mesma máquina reativar não consome vaga.
- Plano atual: `LIFETIME` (expiração opcional via `expiresAt`). A API também assina tokens
  de `TRIAL` (janela de 20 minutos) para o teste grátis.
- Revalidação: ~7 dias online e graça offline de 30 dias (`VALID_OFFLINE` → `GRACE_EXPIRED`).
- Licença revogada é reconhecida na próxima validação e bloqueia o workspace offline.
- `CLICKIT_DEV_LICENSE=1` é ignorado em builds empacotados (só serve no app não-empacotado).

## Segurança

- Chave privada só na API (env) ou `licensing/dev-keypair.json` (gitignored, nunca parte do instalador).
- Renderer não recebe chave material; tokens são verificados no main e o armazenamento usa `safeStorage` (DPAPI).
- IPC de dados fica atrás do guard de licença; internet é bloqueada por allowlist no main (só o origin da API).
- Nunca exponha `LICENSE_PRIVATE_KEY`/`LICENSE_ADMIN_KEY` no frontend ou em logs.

## Verificação de release

Antes de distribuir: confirmar que o instalador/portable **não** contém `BEGIN PRIVATE KEY`
nem o json do keypair dev (teste automatizado: `tests/licensing-build.test.ts`).

Integração completa: `npm run package:win` executa typecheck → lint → teste → build →
NSIS + portable.