# Empacotamento Windows

## Patch NSIS reproduzível

O build NSIS apresentou `spawn UNKNOWN` durante a extração do uninstaller:
o electron-builder tentava executar o intermediário GUI recém-gerado. O patch
usa o `UninstallerReader` existente na dependência para extrair o uninstaller
diretamente dos bytes, antes da assinatura e da incorporação no instalador final.
A causa específica da falha de spawn no Windows não foi determinada.

- **electron-builder: 26.15.3** (versão resolvida no `package-lock.json`).
- **app-builder-lib: 26.15.3**.
- Arquivo alterado: `node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js`.
- Patch versionado: `patches/app-builder-lib-26.15.3-nsis.json`.
- Aplicador: `scripts/apply-nsis-patch.mjs`.

O mecanismo equivalente a patch-package não adiciona dependências: o `postinstall`
aplica a substituição exata automaticamente em `npm install` e `npm ci`.
Ele é idempotente e falha com código diferente de zero se qualquer versão mudar,
o trecho original não corresponder ou o patch estiver parcialmente aplicado.
A alteração de comportamento é restrita ao Windows.

Não use `--ignore-scripts` para a instalação de desenvolvimento/build. Para
verificar o patch sem alterar arquivos:

```powershell
node scripts/apply-nsis-patch.mjs --check
```

Reinstalação e validação no Windows (tarefas sequenciais):

```powershell
Remove-Item -LiteralPath node_modules -Recurse -Force
npm.cmd ci
node scripts/apply-nsis-patch.mjs --check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npx.cmd electron-builder --win --x64
```

## Remoção futura

Quando uma versão upstream corrigir o problema, faça uma tarefa separada:
confirme o fix, remova o `postinstall`, o aplicador e o JSON do patch, atualize
intencionalmente as dependências/lockfile e execute uma instalação limpa.
Valide novamente NSIS, portable e a exigência de licença em ambos.
Não basta apagar a alteração em `node_modules`: a próxima instalação a reaplica.

## Resultado da reinstalação limpa (2026-10-07)

`node_modules` removido, `npm ci` e patch automático: PASS. Lint, typecheck,
85 testes, build, geração NSIS e portable: PASS. O portable foi executado com
dados novos e flag DEV e continuou exigindo licença.

O `app.asar` extraído diretamente de cada artefato é idêntico por SHA-256.
A execução do Setup NSIS foi bloqueada pela política de Controle de Aplicativo
do Windows nesta rodada; a instalação real deve ser validada em ambiente
autorizado. Detalhes e hashes em `docs/VALIDATION.md` e
`docs/evidence/packaging-reproducibility-2026-10-07.json`.

## Branding do ícone (2026-10-07)

### Origem e geração

Os assets de marca existentes no projeto eram wordmarks horizontais
(`LOGO CLICK IT.png` = `public/logo.png`, 1672x941, cópia idêntica) ou posters
sem transparência (`ID VISUAL 01/02.png`). Não havia símbolo isolado. O símbolo
oficial foi entregue em `build/symbol.png` (origem: `ClickIT icon.png` na raiz,
1254x1254, fundo transparente, conteúdo 923x849, proporção 1.09, azul da marca
~RGB 38/99/252, antialiasing real).

Geração reproduzível via `scripts/generate-icon.mjs`:

```powershell
node scripts/generate-icon.mjs        # gera build/icon.ico + build/icon.png
node scripts/generate-icon.mjs --check # compara por SHA-256 com o gerado
```

O script usa `sharp` (Já dependência) e escreve um container `.ico` com entradas
PNG (formato aceito pelo Windows desde Vista) nos tamanhos
16 / 24 / 32 / 48 / 64 / 128 / 256, canvas quadrado transparente de 256px com o
símbolo centralizado a 86% (margem 7%). Não houve upscaling: a fonte (1254px) é
maior que 256px. O modo `--check` reprova (exit 1) se a saída não for
bit-a-bit idêntica.

- `build/icon.ico`: 114.297 bytes, SHA-256 `ecaa73405d893d3a2aa870465f9b5e273dd2004537075fc8a72c03bdd2af3bad`
- `build/icon.png` (preview 256px): SHA-256 `9a1a0906ba48e9bb8b27df7cfdb28f2d5994856106ee079c159e40f2bcf6d9c1`

### Configuração electron-builder (package.json)

- `build.win.icon`: `build/icon.ico` (icon padrão de win, NSIS e portable).
- `build.nsis.shortcutName`: `ClickIT` (atalhos de menu iniciar e desktop).
- `build.productName`: `ClickIT`; `build.appId`: `com.clickit.desktop`;
  `author`: `ClickIT`.
- Não há `CompanyName`/`Publisher` legal definido; o campo `CompanyName` dos
  metadados deriva do `author` ("ClickIT") e não foi inventado. Nenhuma extensão
  de marca sonora/visual foi criada: o ícone usa somente o símbolo oficial.
- `BrowserWindow` não declara `icon`: no Windows empacotado o ícone da janela,
  taskbar e Alt+Tab vem dos recursos do `.exe`. Não existe tray na aplicação.

### Rebuild completo com o novo ícone

`npm ci` (com `postinstall` reaplicando o patch NSIS automaticamente), lint,
typecheck, 85 testes e build: PASS. `electron-builder --win --x64` regenerou
NSIS e portable usando o novo ícone, incluindo assinatura com signtool.

Artefatos finais (2026-10-07, com branding):

| Artefato | Tamanho (bytes) | SHA-256 |
| --- | ---: | --- |
| `release/ClickIT Setup 0.1.0.exe` (NSIS) | 329041767 | `a6aa23352e8f6ed92a2de57721e9bc50dcdd8ada8a10cb47515a852c0090e084` |
| `release/ClickIT 0.1.0.exe` (portable) | 328720765 | `045be4f0fd8a3bf52e9246013942cf6f50f6e3e555c372c21693788b1e6e35ca` |
| `release/win-unpacked/ClickIT.exe` | 245803520 | `f2149985fc7dc222596f9b8bc9489a93e8c4263c217ebe3d81e66b6bc9f27fb1` |

`app.asar` idêntico entre NSIS e portable (SHA-256
`1e8263746decd93420b2ace784f792d4cfe811bbe041547fee3a28cec73259c5`), sem chave
privada, sem `dev-keypair.json`, sem fontes do licensing server, com guard de
licença no main.

### Validação de ícone e metadados

`Icon.ExtractAssociatedIcon` retornou o ícone azul da marca (32x32; RGB médio
18/139/249, 100% dos pixels opacos azulados — blueishRatio 1,0) para o setup,
o portable e o `win-unpacked/ClickIT.exe`. VersionInfo lido dos três:
`ProductName=ClickIT`, `CompanyName=ClickIT`, `FileVersion=0.1.0`;
`FileDescription` = descrição do projeto no setup/portable e "ClickIT" no
executável do app; `InternalName=ClickIT` no app executável (vazio no instalador
NSIS, comportamento normal). Valores e hashes registrados em
`docs/evidence/packaging-reproducibility-2026-10-07.json` (seção `branding`).

### Limitações restantes

- Instalação NSIS: a política de Controle de Aplicativo do Windows bloqueia
  executar o novo Setup nesta máquina (`ENVIRONMENT_BLOCKED`). Uninstaller não
  pôde ser executado localmente; o uso do patch `UninstallerReader` continua
  sendo o caminho validado no build.
- `InternalName`/`OriginalFilename` não são definidos explicitamente; no
  instalador eles ficam vazios. Adicionar exige decidir o nome legal/publicador
  oficial e fica fora do escopo desta rodada.
