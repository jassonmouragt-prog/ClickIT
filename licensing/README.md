# License API — ClickIT

Servidor de licenciamento separado do desktop. Validação de ativações, revogação,
limite de dispositivos e assinatura Ed25519 das licenças.

## Deploy

- PostgreSQL/Neon via `DATABASE_URL` (aplicar `schema.sql`). O desktop também funciona
  com um banco SQLite local (`licensing/license.sqlite`) para dev/teste/e2e.
- Assinatura: `LICENSE_PRIVATE_KEY` (PEM PKCS8). A chave **pública** correspondente é
  embutida no desktop (`src/licensing/publicKey.ts`). Sem par de chaves no deploy:
  gere com `npm run license:keys` — a chave privada fica em `licensing/dev-keypair.json`
  (ignorado pelo git) e a pública deve ser copiada para o desktop antes do build.
- Admin: `LICENSE_ADMIN_KEY` protege as rotas `/admin/*` (Bearer).
- Interface: `LICENSE_PORT` (padrão 8085). Compatível com Vercel/Node serverless via
  `licensing/build.mjs` (bundle ESM externo a `pg`).

## Endpoints

- `POST /licenses/activate` — `{licenseKey, deviceId, deviceName, appVersion}` →
  `{ok:true, token}` ou `{ok:false, reason}`. Reativação da mesma máquina não consome vaga.
- `POST /licenses/validate` — `{licenseId, deviceId}` → `{valid}` + `lastSeenAt`.
- `POST /licenses/deactivate` — `{licenseId, deviceId}` → libera a vaga.
- Admin (Bearer): `POST/GET /admin/licenses`, `GET /admin/licenses/:id/activations`,
  `POST /admin/licenses/:id/revoke|unrevoke`.

## Operação

```bash
npm run license:create -- --name "Cliente" --email a@b.co --maxDevices 2
npm run license:list
npm run license:revoke <licenseId>
npm run license:devices
npm run license:serve          # API local (SQLite + dev-keypair)
```

A chave completa é exibida **uma única vez** na criação; o banco guarda apenas o hash (sha256).