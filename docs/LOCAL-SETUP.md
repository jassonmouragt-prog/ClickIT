# ClickIT — continuação e validação local no Windows

Este guia prepara o MVP existente. Não pressupõe que o código esteja validado: a sessão anterior não conseguiu instalar pacotes/modelos devido a `connect EACCES` na rede. Consulte [VALIDATION.md](VALIDATION.md) para as evidências. Execute os comandos abaixo em **PowerShell**, como usuário normal, e pare/corrija se um comando retornar erro.

## 1. Pré-requisitos

### Estado da rodada de modelos (2026-10-06)

Dependências instaladas em `C:\dev\ClickIT`; setup preparado mas downloads bloqueados nesta sessão por `EACCES`. Lint/typecheck/21 testes/build passaram. Doctor ainda tem 5 FAIL de modelos. Dev foi tentado e encerrou com erro Crashpad. Veja [VALIDATION.md](VALIDATION.md) para o resultado atual, sem inferências presumidas.

Em um PowerShell com HTTPS permitido, a sequência específica para os arquivos já fornecidos é:

```powershell
Set-Location -LiteralPath 'C:\dev\ClickIT'
npm run models:setup
if ($LASTEXITCODE -ne 0) { throw 'Setup falhou; não continuar como se os modelos estivessem prontos.' }
npm run models:test -- 'FOTO A.png' 'FOTO B.png'
if ($LASTEXITCODE -ne 0) { throw 'Inferência/similaridade/faces não aprovadas.' }
npm run doctor
npm run doctor -- --photo 'C:\dev\ClickIT\FOTO A.png' --json 'docs/evidence/doctor-models-photo.json'
```

`models:test` cria temporariamente a versão levemente modificada de A, verifica embeddings reais/repetibilidade e a desigualdade de similaridade, e exige detecção positiva de rosto/landmarks no Electron. O sucesso é registrado em `docs/evidence/models-inference.json`. Falhas não viram resultados simulados. Depois execute lint, typecheck, test, build e dev conforme as seções abaixo. Não é necessário reinstalar dependências já válidas.

- Windows 10/11 **x64**, com acesso à internet durante instalação/empacotamento. O app deve funcionar offline depois de instalado.
- **Node.js 24 LTS x64**, preferencialmente **24.21.0** para reproduzir o ambiente e a versão embutida no Electron 44.5.1. Instale pela [distribuição oficial do Node](https://nodejs.org/en/download); se usar um patch de segurança posterior da linha 24, registre a versão e repita os checks. [Versão do Electron configurada](https://releases.electronjs.org/release/v44.5.1).
- Gerenciador: **npm** incluído no Node. Referência observada: npm **11.19.0**. Não é necessário pnpm/yarn nem instalar ferramentas globais.
- Espaço para node_modules, cache, modelos, previews e distribuição. Use uma pasta local com escrita permitida. OneDrive pode bloquear arquivos em uso; uma cópia integral em `C:\dev\ClickIT` é uma alternativa caso isso seja comprovado, preservando os PNGs e o código.
- Um conjunto de fotografias próprias/autorizadas: um JPEG/PNG para o primeiro teste, duas fotos semelhantes e uma diferente para similaridade, retratos com olhos abertos/fechados para inspeção facial e pelo menos 100 fotografias para performance.

Abra um novo PowerShell após instalar o Node:

```powershell
Set-Location -LiteralPath 'C:\Users\jasso\OneDrive\Documents\jobs\ClickIT'
node -v
npm -v
node -p "process.platform + ' ' + process.arch"
npm config get registry
npm config get cache
npm config get prefix
```

Se mover o projeto, ajuste somente o caminho do `Set-Location`. Esperado: Node 24.x, `win32 x64`, registry npm autorizado. `.npmrc` mantém o cache em `.npm-cache` dentro do projeto. Se a política de execução bloquear `npm.ps1`, use **`npm.cmd`** nos mesmos comandos; não é necessário desabilitar a política do Windows.

## 2. Instalar dependências

```powershell
if (Test-Path -LiteralPath 'package-lock.json') {
    npm ci --include=dev --include=optional --foreground-scripts
} else {
    npm install --include=dev --include=optional --foreground-scripts
}
if ($LASTEXITCODE -ne 0) { throw 'Instalação falhou. Corrija antes de continuar.' }
npm ls --depth=0
```

Preserve e revise o `package-lock.json` gerado. Nas próximas instalações use `npm ci`, que reinstala node_modules a partir do lock; ele não deve ser apagado para esconder conflitos. Não use `--ignore-scripts`, `--omit=optional` ou `--force`: Electron e módulos nativos dependem de binários/scripts e opcionais da plataforma. O projeto já declara as dependências e devDependencies necessárias; não adicione better-sqlite3.

Se `npm ci` disser que package.json e lock divergem, verifique a alteração que causou isso. Apenas se ela for intencional, execute `npm install` para atualizar o lock e revise o diff.

Para capturar uma falha completa:

```powershell
npm install --include=dev --include=optional --foreground-scripts --verbose *> npm-install-local.log
$installExit = $LASTEXITCODE
Get-Content -LiteralPath 'npm-install-local.log'
Write-Output "Exit code: $installExit"
```

`connect EACCES ...:443` indica falha de conexão; não se resolve presumindo erro de escrita ou apagando cache. O npm também pode precisar acessar hosts de binários Electron/GitHub e ONNX. Identifique o host exato nos logs e peça autorização à administração da rede quando necessário. Não desabilite TLS, antivírus ou firewall como solução genérica.

## 3. Instalar os modelos locais

```powershell
npm run models:setup
if ($LASTEXITCODE -ne 0) { throw 'Modelos não foram instalados.' }
node scripts/verify-models.mjs
Get-ChildItem -LiteralPath 'resources/models' | Select-Object Name,Length
Get-Content -LiteralPath 'resources/models/manifest.json'
```

| Função | Nome exato local | Tamanho aproximado | Fonte |
|---|---|---|---|
| Embeddings visuais DINOv2 small, FP32 | `resources/models/dinov2-small.onnx` | 88,5 MB | [Conversão ONNX usada](https://huggingface.co/onnx-community/dinov2-small/tree/main/onnx), [checkpoint original Meta](https://huggingface.co/facebook/dinov2-small) |
| Detecção facial, landmarks e blendshapes/olhos | `resources/models/face_landmarker.task` | 3–4 MB | [Google MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) |
| Revisão, URLs, tamanhos e SHA-256 | `resources/models/manifest.json` | Poucos KB | Gerado por `scripts/models.mjs` |

URLs utilizadas pelo instalador:

```text
https://huggingface.co/onnx-community/dinov2-small/resolve/ef1fb1005bfd7768839d18080f7038b403506f87/onnx/model.onnx
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

A revisão está fixada em `scripts/models.lock.json`: `ef1fb1005bfd7768839d18080f7038b403506f87`. O setup não consulta mais a API nem atualiza revisões automaticamente. O arquivo remoto `model.onnx` é salvo como **`dinov2-small.onnx`**. A conversão `onnx-community` é comunitária, não um export ONNX oficial Meta. O setup verifica tamanho e SHA-256 previamente fixados, ignora modelos válidos e substitui inválidos somente após verificar o temporário. Consulte [MODELS.md](MODELS.md) para contratos, hashes, proveniência e licenças. O manifesto descreve arquivos esperados; não comprova sua instalação.

O bundle Google contém detector, malha facial e modelo de blendshapes. Não há download separado de olhos. **Não existe modelo estético nesta implementação**; `aestheticScore` permanece null.

O runtime MediaPipe vem do npm em `node_modules/@mediapipe/tasks-vision/wasm`; o build copia esses arquivos para `public/wasm` e `dist/renderer/wasm`. Os pesos vão para `process.resourcesPath/models` na distribuição. O download é explícito, não acontece no runtime ou build. `verify-models` confere o manifesto contra `scripts/models.lock.json` e compara tamanho/SHA-256 dos pesos. A origem de cada hash está documentada em [MODELS.md](MODELS.md); não equivale a assinatura digital do fornecedor. Não edite hashes para aprovar arquivos incompletos.

## 4. Diagnóstico com PASS / WARN / FAIL

```powershell
npm run doctor
npm run doctor -- --json 'docs/evidence/doctor-local.json'
```

O `doctor` roda sem bibliotecas próprias adicionais e não baixa nada. Cria pequenos arquivos temporários de diagnóstico e testa:

- Node, arquitetura, Windows, npm e permissões no projeto/cache/modelos.
- Presença de todas as dependências e `npm ls --depth=0` para a árvore direta.
- Modelos, tamanhos mínimos, manifesto e SHA-256.
- SQLite real em disco, incluindo fechar/reabrir e ler um valor persistido.
- Sharp decodificando a logo existente e produzindo um PNG reduzido em memória.
- API ONNX Runtime e criação de uma sessão CPU com DINOv2; **carregar não é inferir**.
- Arquivos JS/WASM do MediaPipe; **presença não é detecção facial**.
- Executável Electron e um subprocesso dele que carrega SQLite, Sharp e DINOv2 em modo Node. Esse probe testa módulos no runtime Electron, mas não abre a janela nem testa preload/IPC.

`PASS`: o probe descrito passou. `WARN`: etapa manual/escopo não executado ou versão fora da referência. `FAIL`: falta ou falha concreta. Exit code **1** se houver FAIL, **0** sem FAIL mesmo havendo WARN, **2** para argumentos inválidos. WARN da GUI e do MediaPipe deve ser resolvido por validação manual; não significa que o MVP está pronto. O relatório JSON opcional inclui detalhes/stacks e, com `--photo`, resultados reais. Crie o diretório pai se escolher outro caminho de relatório.

O doctor não substitui lint/typecheck/tests/build. Não requer acesso a rede para diagnosticar o que já está instalado. Um PASS de `npm ls --depth=0` também não é auditoria de todas as dependências transitivas.

## 5. Lint, tipagem, testes e build

Execute individualmente para localizar falhas:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

O typecheck é `tsc --noEmit`. O lint usa `--max-warnings 0`: o objetivo é zero erros e zero warnings. A suíte atual tem 19 testes (16 do núcleo e 3 do diagnóstico); confira a contagem real na sua execução. Não marque skipped como aprovados. Corrija falhas e repita o comando afetado; não desabilite regras ou introduza `as any` para mascará-las.

Depois que os comandos individuais passarem:

```powershell
npm run check
```

O build gera `dist/main.cjs`, `dist/preload.cjs`, `dist/analysis.cjs`, `dist/grouping.cjs` e `dist/renderer`. Os modelos continuam fora do bundle JS, em `resources/models` até o empacotamento.

## 6. Executar uma fotografia real e conferir ONNX

Substitua o exemplo por um JPEG/PNG existente; não use os PNGs de identidade como prova de acurácia fotográfica:

```powershell
npm run doctor -- --photo 'C:\FotosTeste\retrato.jpg' --json 'docs/evidence/doctor-photo.json'
```

Esse comando usa **`src/workers/analysis.ts` de produção**, com Sharp, ExifTool e `src/ai/embedding.ts`. Executa `InferenceSession.run` com o DINOv2 local. Mostra SHA-256 do input, duração, foco/exposição, 384 dimensões, norma e primeiros oito valores do embedding. O JSON preserva o vetor completo, caminhos e tamanhos dos previews/thumbnails. Os arquivos de diagnóstico ficam em `.test-tmp/doctor-photo-*`; nenhum original é modificado. A opção do doctor aceita JPEG/JPG/PNG; RAW deve ser validado pelo app depois.

Esperado: embedding finito com 384 valores e norma próxima de 1; arquivos de preview/thumbnail existentes; tempos reais. Um FAIL não deve ser convertido em resultado fictício. O probe tem limite de 180 segundos por foto; timeout não é aprovação.

Para as duas semelhantes e a diferente:

```powershell
npm run doctor -- --photo 'C:\FotosTeste\sequencia-01.jpg' --photo 'C:\FotosTeste\sequencia-02.jpg' --photo 'C:\FotosTeste\outra-cena.jpg' --json 'docs/evidence/doctor-similarity.json'
```

O script imprime o cosseno entre cada par. Confirme visualmente quais fotos são semelhantes, compare os valores e registre os números reais. PASS da linha de cosseno significa **cálculo executado**, não aprovação automática do algoritmo ou do threshold. Fotos diferentes semanticamente ainda podem ter similaridade relativamente alta; avalie a ordenação e as regras de `src/ai/grouping.ts` com o conjunto real.

Nitidez e exposição são **heurísticas determinísticas**, implementadas em `src/ai/quality.ts`; não são redes neurais. Olhos usam coeficientes neurais de blink mais limiares heurísticos. Nenhum score deve ser tratado como verdade artística.

## 7. Abrir Electron e verificar MediaPipe/uma foto

```powershell
npm run dev
```

`dev` faz build e abre Electron; **não possui hot reload**. Para abrir o último build sem recompilar:

```powershell
npm start
```

1. Confirme janela preenchida, logo original, cores e fontes. Abra DevTools com **Ctrl+Shift+I** e confira erros no Console. Se o atalho não abrir, use o modo de inspeção local abaixo.
2. Crie um projeto novo, escolha uma pasta com a fotografia de teste e clique em **Analisar fotografias**.
3. Confira progresso, thumbnail, preview, score e ausência de erro na foto. Falha facial é registrada como falha da análise, não deve aparecer como resultado validado.
4. Em um retrato claro, confira rostos detectados e estados dos olhos. Repita com retrato de olhos fechados. Compare visualmente; “zero rostos” numa foto sem pessoas é resultado válido, mas não prova detecção positiva.
5. Faça seleção manual, favorita, estrelas e rejeição. Feche após terminar, reabra e confirme os dados. Exporte uma seleção e compare SHA-256 da cópia com o original usando `Get-FileHash -Algorithm SHA256`.

Para inspecionar também o renderer facial invisível, feche a instância atual antes de iniciar a sessão abaixo:

```powershell
.\node_modules\.bin\electron.cmd --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 .
```

Abra `http://127.0.0.1:9222` no navegador local e inspecione os targets `clickit://app/index.html` e `clickit://app/faces.html`. O target facial só é criado ao iniciar a análise. No target facial, confira ausência de erro de WASM/CSP e requisição bem-sucedida de `clickit://models/face_landmarker.task`. Em Sources, use um breakpoint na chamada `landmarker.detect(bitmap)` e inspecione o input e `result.faceLandmarks`/`result.faceBlendshapes` após a execução. Não exponha a porta de depuração na rede; encerre essa sessão depois.

No Console do **renderer principal**, após a análise, é possível consultar a API já existente sem habilitar NodeIntegration:

```javascript
const projects = await window.clickit.projects();
console.table(projects.map(p => ({ id: p.id, name: p.name, count: p.count })));
// Substitua pelo ID do projeto de teste exibido acima:
const photos = await window.clickit.photos('ID-DO-PROJETO');
console.table(photos.map(p => ({
  file: p.fileName,
  status: p.analysisStatus,
  error: p.error,
  embedding: p.analysis?.embeddingAvailable,
  facesAnalyzed: p.analysis?.facesAvailable,
  faces: p.analysis?.faces.length,
  score: p.analysis?.overall
})));
console.log(photos[0]?.analysis?.faces);
```

Para análise completa: `analysisStatus = DONE`, `embeddingAvailable = true`, `facesAvailable = true`; rostos retornam caixas, nitidez, eyes, eyesConfidence e blinkLeft/Right. Os flags sozinhos não medem acurácia. O doctor com `--photo` agora executa um renderer Electron real com as opções compartilhadas do FaceLandmarker; PASS facial exige rostos e landmarks. Zero rostos gera WARN, não aprovação de detecção positiva. O teste `models:test` exige pelo menos um rosto em A. Nenhum dos dois aprova a classificação de olhos, cuja confidence é uma margem heurística não calibrada.

### Confirmar que não são mocks

- Leia os caminhos reais: `src/ai/embedding.ts` chama `InferenceSession.create/run`; `src/ai/face-host.ts` chama `FaceLandmarker.createFromOptions/detect`. O worker referencia esses módulos diretamente.
- O doctor `--photo` não importa testes nem usa fixture; registra hash da fotografia, vetor calculado e tempo. Varie o input e confronte vetores/cossenos; igualdade de resultados numa execução repetida do mesmo input pode ser determinismo legítimo.
- Os testes automatizados incluem um worker fixture de orquestração. **Resultados desses testes não demonstram inferência.** Não use o `tests/pipeline.test.ts` como benchmark de IA.
- O app reutiliza cache. Use um **projeto novo** para observar inferência pela primeira vez, sem apagar originais ou banco. Breakpoint em `detect` e sessão ONNX confirmam execução; consultar um resultado antigo não confirma inferência nova.
- Sem modelo/pacote válido, o doctor deve produzir FAIL e o app deve mostrar erro, nunca scores aleatórios. Não é necessário renomear/apagar modelos para provar isso.

Dados do app ficam em `app.getPath('userData')/storage` (normalmente `%APPDATA%\clickit\storage` no desenvolvimento; confirme o caminho da distribuição). Dentro há `clickit.sqlite`, cache e logs. Não apague essa pasta ao reinstalar dependências: ela contém projetos/decisões.

## 8. Variáveis de ambiente

**Nenhuma variável de ambiente, chave API, token de Hugging Face ou credencial é necessária para executar o projeto.** Os modelos são públicos. Não há `.env` obrigatório.

- `ELECTRON_RUN_AS_NODE` deve estar ausente no terminal usado para abrir a GUI. O doctor define `1` somente no subprocesso de verificação nativa e não altera seu terminal.
- Não deixe `ELECTRON_SKIP_BINARY_DOWNLOAD` habilitado durante instalação.
- `NODE_ENV=production` ou configurações `omit=dev/optional` podem impedir a instalação de ferramentas/binários; os comandos acima pedem explicitamente dev e optional.
- Proxy/certificado corporativo, se necessário, é configuração do seu ambiente, não requisito ClickIT. Configure com a equipe responsável; não use `strict-ssl=false` ou `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Para remover uma variável que foi definida numa sessão de diagnóstico, apenas no terminal atual:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue
```

## 9. Native modules no Windows / rebuild

Arquiteturas precisam combinar: Windows/Node/Electron/pacotes **x64**. Erros de `NODE_MODULE_VERSION` são diferentes de DLL ausente, arquivo bloqueado, falha de rede ou falta de modelo. Consulte [módulos nativos no Electron](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules).

| Módulo | Procedimento aplicável |
|---|---|
| SQLite | O projeto usa **node:sqlite**, incluído no Node/Electron. **Não usa better-sqlite3**; não há rebuild dele e não deve ser instalado para corrigir o projeto. |
| Sharp | Usa Node-API e binários por plataforma. Preserve dependências opcionais @img. Primeiro reinstale pelo lock correto e execute doctor; não force compilação C++ sem evidência. [Documentação Sharp](https://sharp.pixelplumbing.com/install/) |
| ONNX Runtime | Usa binding nativo e bibliotecas do runtime. Primeiro confirme CPU/Windows x64, pacote/DLLs e carga real no doctor. Rodar npm rebuild reexecuta scripts de instalação; não é garantia de compilação do ONNX para Electron. [Documentação ONNX Node](https://onnxruntime.ai/docs/get-started/with-javascript/node.html) |
| MediaPipe | WASM no Chromium, sem rebuild de módulo Node. Confira o bundle .task, JS/WASM copiados, CSP e protocolo local. |

Feche o app antes de reinstalar ou reconstruir. Com o lock válido:

```powershell
npm ci --include=dev --include=optional --foreground-scripts
npm run doctor
```

Se a instalação passou, mas houve falha específica nos scripts/binários de Sharp ou ONNX:

```powershell
npm rebuild sharp --foreground-scripts
npm rebuild onnxruntime-node --foreground-scripts
npm run doctor
```

Para preparar dependências nativas para o Electron configurado, usando o builder já declarado:

```powershell
.\node_modules\.bin\electron-builder.cmd install-app-deps --arch=x64
npm run doctor
```

Esse comando pode precisar de rede para headers/binários e não substitui teste de carga. Se um módulo realmente exigir compilação de fonte e o log mencionar node-gyp, instale Python compatível e Visual Studio Build Tools com C++/Windows SDK conforme as instruções do módulo. Não reinstale toolchains ou altere versões cegamente. `@electron/rebuild` é a ferramenta oficial para módulos dependentes de ABI quando necessária; não foi adicionada como dependência nem é um passo obrigatório para o node:sqlite/Node-API desta base.

Se aparecer erro de DLL/VC runtime, identifique a DLL no log e siga o instalador oficial correspondente, nunca baixe DLL isolada de sites terceiros. Se funcionar no Node mas falhar no probe Electron, registre ambas as versões/ABI e preserve o erro completo. Se só falhar empacotado, confira `asarUnpack` no package.json (Sharp/@img/ONNX/ExifTool) e `resources/models` na distribuição.

## 10. Gerar o .exe final

Somente após lint/typecheck/tests/build, doctor e o fluxo real pela interface passarem:

```powershell
node scripts/verify-models.mjs
npm run check
npm run package:win
Get-ChildItem -LiteralPath 'release' -Filter '*.exe'
```

`package:win` verifica modelos, repete os checks e chama `electron-builder --win portable --x64`. A configuração atual gera **.exe portátil**, não instalador. A saída fica em `release`; com a versão 0.1.0 e nomes padrão do builder, espere um nome como `ClickIT 0.1.0.exe`, confirmando o nome real pelo comando acima. Não é necessário trocar o target para NSIS nesta etapa.

O builder pode baixar ferramentas de empacotamento durante a primeira execução. Não há certificado de assinatura configurado; geração local do portátil e distribuição assinada são etapas distintas. Registre alertas do Windows sem desabilitar suas proteções.

Copie o `.exe` para uma pasta separada ou Windows x64 de teste sem Node/node_modules/código-fonte. Execute offline e repita projeto → pasta real → análise → revisão → exportação → fechar/reabrir. Verifique os modelos e módulos nativos incorporados, persistência e hash dos originais exportados. A abertura de `release/win-unpacked/ClickIT.exe` na máquina dev, isoladamente, não prova independência do ambiente.

## 11. Registrar o resultado

Atualize `docs/VALIDATION.md` com PASS/WARN/FAIL por item e evidências da máquina local: versões, logs, imagens usadas, tempos reais e pico de RAM. No ensaio de 100 fotos, meça importação, previews/análise e RAM do conjunto de processos Electron/workers/ExifTool, distinguindo execução fria de reuso de cache.

Para continuar, os comandos principais são: **install/ci → models → doctor → lint → typecheck → tests → build → dev → validação real → package:win**. Não declare MVP concluído apenas porque um build ou o doctor passou.
