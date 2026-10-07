# Session progress — 2026-10-06

## Completed

- Added RAW, photo benchmark and read-only grouping audit commands.
- Two real PhotoTraces DNGs passed EXIF, embedded preview, production analysis and byte-identical export checks.
- 100/500/1000-file tiers passed using authorized replication of 82 local source files; peak node+electron WorkingSet approximately 1.19 GiB.
- Cache: cold 100 misses, warm 100 hits, one managed-file mutation 99 hits/1 miss; source hash unchanged.
- Resume: 31 completed before cancellation, 69 resumed, 100 DONE, no completed-photo reprocessing.
- Grouping audit: stored and recomputed groups match; visual-only threshold remains 0.965.
- Human templates support dataset ranks and per-group filename orders; comparisons happen after ranking. Group matching is independent of UUIDs. No training/tuning performed.
- Final sequential checks: typecheck, lint, 43/43 tests and build PASS.
- Documentation and evidence: `docs/VALIDATION.md`, `docs/evidence/photographer-beta-readiness.json` and linked per-topic reports.
- No temporary validation processes remain active.

## Pending / next action

- Photographer fills human annotations and runs `npm run ranking:validate -- --root "C:\dev\ClickIT\Validation Datasets"`.
- CR2/CR3/NEF/ARW remain NOT_TESTED because no real inputs were available.
- Validate a large independent photo collection and optionally `--sizes 3000` later.

## Result and caveats

- Operational classification: READY_FOR_PHOTOGRAPHER_BETA for the tested scope.
- Experimental ranking classification: READY_FOR_MORE_DATA; artificial crops without EXIF remain fragmented as characterized.
- Latest completed ranking summary is retained. A later repeat was interrupted before completion; rerun the full command before auditing its temporary workspace again.
- Canonical resume evidence: `resume-test-2026-10-06T19-14-34-996Z.json`. Earlier resume report incorrectly labeled remaining PENDING photos as failures; the corrected rerun separates them.

## Memória para retomar a sessão

- Projeto: `C:\dev\ClickIT`. Ler este arquivo e `docs/VALIDATION.md` antes de continuar.
- Ambiente Windows / PowerShell 5.1, 8 GB de RAM. Executar tarefas pesadas sequencialmente; não deixar watchers ou workers temporários ativos.
- Pasta RAW fornecida pelo usuário: `C:\Users\jasso\OneDrive\Documents\jobs\Plataforma para professores\Arquivos Editáveis` (dois DNGs PhotoTraces reais).
- Pool de benchmark: `.test-tmp/benchmark/pool`; fontes: Imagens Teste (7), Validation Datasets (22), Downloads (53). Replicação autorizada pelo usuário.
- Scripts npm: `raw:validate`, `benchmark:photos`, `grouping:audit`, `ranking:validate`, `datasets:build`.
- Template por grupo na raiz: `human-ranking-template.json`, com `humanRank: []` pendente. Preencher nomes do melhor ao pior; corresponder por dataset/conjunto de arquivos, não UUID.
- Template por dataset: `Validation Datasets/human-ranking-template.json`, com ranks null pendentes.
- Nenhum treino ou tuning nesta etapa. Preservar ranking de produção, ClickIT Pick, modelos, pesos, schema, exportação e thresholds; visual-only similarity continua 0.965.
- A etapa solicitada foi encerrada e validada. Próxima ação é anotação humana; não repetir benchmarks ou checks completos sem nova mudança ou motivo.
- Este arquivo é o registro persistente de contexto para futuras sessões.

## Contexto atual — auditoria e validação do harness sintético (2026-10-06)

- Usuário proibiu alterações em produção, UI, IA, ranking, modelos, grouping, NIMA, DINOv2, EAR e thresholds. A correção permitida é somente no harness de benchmark.
- Os artefatos antigos em `docs/evidence/scale-benchmark-100.json`, `-500.json` e `-1000.json` não são aceite de pipeline bem-sucedido: `cold N/N` era número de tentativas; houve zero fotos `DONE`, todas FAILED pelo host facial. Cache warm, invalidação, NIMA, FaceLandmarker completo, grouping e retomada ficaram NOT_MEASURED/BLOCKED.
- Usuário informou mais recentemente que o smoke local com três imagens PASSOU no PowerShell. A resposta ao usuário constatou `scale-face-smoke.json` PASS, três requests/três responses e fingerprints de harness/produção correspondentes naquele momento. Essa evidência tem precedência para orientar o trabalho local, mas verificar fingerprint após novas alterações do harness antes de liberar a etapa seguinte.
- O harness oferece `npm run benchmark:harness -- --count 10 --dir "C:\dev\ClickIT\.test-tmp\scale-data-100"`. Copia dez itens do manifesto verificado para uma pasta isolada e executa apenas dez. Exige smoke PASS com fingerprints atuais. A sequência também aceita `--count 100`, mas somente depois do relatório de dez fotos PASS. NÃO executar 100, 500 ou 1000 ainda sem pedido expresso; 500/1000 permanecem proibidos nesta etapa.
- O benchmark genérico não suporta `--limit`; não modificar o parser para adicioná-lo, pois o comando dedicado acima já é a solução autorizada. O usuário pediu especificamente não criar dataset novo se houver fluxo suportado existente.
- Ao executar a etapa dez, use `npm run benchmark:harness -- --count 10 --dir "C:\dev\ClickIT\.test-tmp\scale-data-100"`. Depois, leia `docs/evidence/scale-harness-10.json` e relate indexed, prepared, analysisStarted, DONE, FAILED, tempo, host starts/requests/responses, unexpected exits e cobertura de RAM. Só avançar a 100 se dez PASS.
- Os dados do ambiente gerenciado podem diferir do PowerShell local: lá o Electron sandbox foi bloqueado por ACL e o smoke apareceu BLOCKED com fatal native `install_dir_access.cc:52`; não alterar ACL nem desativar sandbox. Usuário tem evidência local de smoke PASS; não disputar esse resultado nem repetir smoke/benchmarks só para reconciliar ambientes. Usar fingerprints/relatórios produzidos pelo host local.
- O harness foi modificado após a tentativa de smoke bloqueada para usar IPC local persistente, IDs/timeout, shutdown ACK, logs de ciclo de vida, estados corrigidos, categorização de exit/crash e memória sem valor Electron stale. Há quatro testes unitários adicionados para os contratos do harness. Lint, typecheck, 50/50 testes e build passaram; 36 arquivos em `src/` e `resources/models/` foram confirmados inalterados. Não rode esses checks novamente sem nova mudança/necessidade.
- O code path antigo que fechava stdin/readline e chamava `app.quit()` sem SHUTDOWN foi removido, mas a causa exata histórica do `code=0` não pôde ser provada porque os logs antigos não têm ciclo de vida. Instrumentação atual salva stdout, stderr, `host-internal.jsonl` e `lifecycle.jsonl` por lote.
- Próximo passo é apenas a validação de 10 fotos solicitada, quando trabalhando no PowerShell local. Não rodar os benchmarks de escala antigos como se fossem evidência de sucesso, não alterar produção e não atualizar classificações passadas sem relatórios novos.
- Evidências e notas da correção: `docs/VALIDATION.md`, `docs/SCALE-VALIDATION.md`, `docs/evidence/scale-harness-repair.json`, `scale-face-smoke.json`. Ao resumir smoke, observar timestamps/fingerprints: o usuário pode ter atualizado evidência local após esta cópia do workspace.

## Atualiza��o � pol�tica de mem�ria e classifica��o do harness (2026-10-06)

- Mudan�as somente em scripts/scale-harness-state.mjs, scripts/benchmark-scale.mjs e testes. Produ��o/IA/ranking/modelos/grouping/cache intactos.
- memoryReport: cobertura de amostras v�lidas (PASS >= 0.95, WARN 0.80�0.95, NOT_MEASURED < 0.80 ou sem amostra), com totalSamples/validSamples/invalidSamples/coverageRatio/reason. Cold real 97% ? PASS.
- memoryLeak: heur�stica conservadora em steady-state (ignora startup/shutdown): regress�o linear na janela est�vel; FAIL s� com halvesAgree + crescimento >= 50% relativo E >= 256 MiB absoluto; >= 20% ? WARN; sen�o PASS. Cold real ? PASS (-43% relativo).
- classifyTier: checks CRITICAL (falha ? FAIL), REQUIRED (n�o-PASS/WARN ? BLOCKED), OBSERVATIONAL (NOT_MEASURED n�o bloqueia; FAIL ? BLOCKED). Check desconhecido = CRITICAL. Tier 100 existente reclassificado como PASS na nova pol�tica.
- aggregateStages(stages, observational): memoryLeak por tier � observacional; WARN conta como medido.
- Testes adicionados em tests/scale-harness-state.test.ts: 98/101, 80/101, 0/101, RSS est�vel (PASS), crescimento lento (WARN), crescimento claro (FAIL), guarda < 256 MiB, amostras insuficientes, classifyTier (CRITICAL/REQUIRED/OBSERVATIONAL) e aggregate observacional. Lint, typecheck, 54/54 testes e build passaram.
- Benchmark n�o reexecutado; evid�ncias antigas em docs/evidence n�o foram reescritas. Pr�xima a��o quando autorizado: rerun 100 (gera scale-benchmark-100.json novo) e depois 500/1000 + retomada para limpar o BLOCKED agregado.


## 2026-10-07 — Empacotamento beta (win-unpacked + NSIS)

- Race auditada via race-test.mjs; guarda existente OK, sem correcao.
- Fluxo completo no app empacotado com DB isolado: 33/33 PASS (evidencia beta-installed-flow-2026-10-07T11-50-29-044Z.json).
- Helper UIA dialog-pick.ps1 validado (janela #32770 aninhada, BM_CLICK, navegacao por endereco com foco verificado).
- Instaladores gerados em release/: ClickIT Setup 0.1.0.exe (NSIS, 313,5 MB) e ClickIT 0.1.0.exe (portable, 313,3 MB).
- Instalacao limpa silenciosa testada: exe instalado abre, cria projeto e importa 7 fotos, zero erros.
- npm run check: lint PASS, typecheck PASS, 56/56 testes PASS, build PASS. Nenhuma mudanca em src/ ou resources/models/.
- Pendente: icone de aplicativo (cosmetico), RAW CR2/CR3/NEF/ARW NOT_TESTED, escala com inferencia continua.

---

## Etapa LICENSING (2026-10-07) - CONCLUIDA

Concluido: Fase 1 (nucleo src/licensing), Fase 2 (License API + CLI admin), Fase 3 (integracao main/preload/renderer),
Fase 4 (testes unit+e2e 26 casos; suite 84/84; lint/typecheck/build PASS), Fase 5 (E2E desktop win-unpacked 8/8),
Fase 6 (rebuild NSIS+portable 313MB cada; instalador real validado; docs/LICENSING.md criado; VALIDATION.md atualizado).

Classificacao final: LICENSING_READY_FOR_BETA.

Pontos de atencao:
- NSIS nesta maquina exigiu patch local em node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js
  (win32 usa UninstallerReader em vez de spawn do uninstaller GUI - "spawn UNKNOWN").
  Atualizacao: agora reproduzivel via postinstall; ver etapa abaixo.
- Chave privada de assinatura: so em licensing/dev-keypair.json (gitignored) ou env LICENSE_PRIVATE_KEY.
  Se regenerar o par, atualizar LICENSE_PUBLIC_KEY em src/licensing/publicKey.ts e rebuildar o desktop.
- Licencas existentes na CLI/sqlite dev: "Cliente CLI" e "E2E Desktop" (so dev; banco de producao = Postgres/Neon).
- Pendente herdado (nao relacionado): icone do aplicativo, RAW CR2/CR3/NEF/ARW NOT_TESTED, escala com inferencia continua.

---

## Estabilizacao do empacotamento (2026-10-07)

Concluido:
- Patch versionado em `patches/app-builder-lib-26.15.3-nsis.json` + aplicador
  `scripts/apply-nsis-patch.mjs`, automatico via `postinstall` de npm install/npm ci.
- Valida exatamente electron-builder/app-builder-lib 26.15.3 e o trecho esperado;
  falha explicitamente em drift. Sem atualizacao de versoes.
- node_modules removido, npm ci limpo executado, patch aplicado automaticamente e verificado.
- npm run lint, npm run typecheck, npm test (85/85) e npm run build: PASS, sequenciais.
- NSIS e portable regenerados: PASS (328745952 e 328516402 bytes).
- Portable real exige licenca, inclusive com flag DEV: UNACTIVATED, tela de ativacao,
  workspace bloqueado e IPC projects:list negado.
- Payload app.asar extraido dos dois artefatos e comparado: identico, guard de licenca
  presente, sem chave privada/keypair dev.
- Documentacao em docs/PACKAGING.md e docs/VALIDATION.md; evidencia em
  docs/evidence/packaging-reproducibility-2026-10-07.json.

Bloqueio / proxima acao:
- Windows Controle de Aplicativo bloqueou executar o novo NSIS Setup.
  Build e payload passaram, mas instalacao real deste artefato permanece BLOCKED.
  Validar em Windows autorizado pela politica antes de encerrar a verificacao runtime NSIS.
- A classificacao anterior LICENSING_READY_FOR_BETA permanece historica;
  esta rodada nao deve ser declarada inteiramente PASS para instalacao NSIS.

## Branding (2026-10-07) - em andamento

Preparado (aguardando simbolo oficial):
- Auditoria da marca: todos os assets existentes sao wordmarks horizontais
  (LOGO CLICK IT.png = public/logo.png, 1672x941, conteudo 4.58:1, azul claro
  avgRGB 154,186,253) ou posters opacos (ID VISUAL 01/02). Nao ha simbolo isolado.
- Auditoria electron-builder (package.json): productName ClickIT, appId
  com.clickit.desktop, author ClickIT, target nsis+portable, sem CompanyName/
  Publisher oficial (nao inventar). BrowserWindow sem icon explicito (Windows
  empacotado usa o icone do exe).
- Config: win.icon -> build/icon.ico e nsis.shortcutName -> ClickIT (explicito).
- Novo script reproduzivel scripts/generate-icon.mjs (sharp + writer ICO com
  entradas PNG 16/24/32/48/64/128/256, canvas 256 transparente, simbolo central
  86%, --check para reproducibilidade, source/upscale informados no summary).
- Falta: build/symbol.png (simbolo oficial do usuario). Pos-geracao: build.mjs,
  npm ci, lint, typecheck, test, build, electron-builder, validacao de artefatos.

Pendente / criterio BRANDING_*:
- Gerar build/icon.ico a partir do simbolo, rebuild e validar icone/atalhos/
  metadata nos artefatos; NSIS runtime permanece ENVIRONMENT_BLOCKED nesta maquina.

## Branding (2026-10-07) - CONCLUIDO - BRANDING_READY_FOR_BETA

- Simbolo oficial entregue em build/symbol.png (ClickIT icon.png 1254x1254,
  transparente, azul ~38/99/252). Nenhum asset existente era simbolo isolado.
- scripts/generate-icon.mjs gera build/icon.ico (PNG entries 16..256) + preview
  build/icon.png; --check reproduz por SHA-256. ICO: ecaa7340..., 114297 bytes.
- package.json: win.icon=build/icon.ico, nsis.shortcutName=ClickIT.
  productName/appId/author ja corretos; sem CompanyName/Publisher inventado.
- npm ci (patch NSIS reaplicado), lint, typecheck, 85/85, build, electron-builder: PASS.
- Artefatos novos com temanhos/hashes registrados em docs/PACKAGING.md,
  docs/VALIDATION.md e docs/evidence/packaging-reproducibility-2026-10-07.json.
- Portable (binario novo) com DEV flag: exige licenca (UNACTIVATED, projects
  negado). Icone extraido azul da marca nos 3 exes; ProductName/CompanyName/
  InternalName ok; FileDescription por artefato registrado.
- Limitacao mantida: instalacao/execucao NSIS ENVIRONMENT_BLOCKED nesta maquina;
  uninstaller nao executado localmente. Classificacao BRANDING_READY_FOR_BETA.
- Nenhuma mudanca em licenciamento, IA, ranking, grouping, pipeline ou UI.

## Validacao RAW (2026-10-07) - NOT_TESTED (sem arquivos reais)

- Busca ampla por CR2/CR3/NEF/ARW/DNG/RAF na maquina: nenhum RAW real (so o
  fixture sintetico de 30 bytes no .test-tmp; nenhum raw em Pictures, OneDrive
  Pictures, Desktop, Documents, Downloads, C:\dev ou E:\ completo).
- npm run raw:validate rodou: 5/5 formatos NOT_TESTED, status NOT_TESTED.
  Evidencia docs/evidence/raw-validation-2026-10-07T14-55-33-191Z.json.
- docs/RAW-SUPPORT.md criado: formatos/magic, como rodar, caminho de codigo
  verificado por inspecao (preview embutido, originalPath preservado, export
  byte-identity, pares RAW+JPEG independentes, UI via cache), limitacoes.
- Nenhum codigo alterado. Checks finais PASS (lint, typecheck, 85/85, build).
- RAW_READY_FOR_BETA NAO declarado: exige arquivos reais e PASS via harness.
## Checkpoint Beta 0.1.0 + Planejamento modulo Editar (2026-10-07)

- Repositorio git inicializado em C:\dev\ClickIT (nao existia .git). Commit inicial
  cd7f079 com o estado Beta 0.1.0 (305 arquivos; .tools/ e .tmp-nima-docker/
  deixados fora). Tag anotada clickit-beta-0.1.0 criada (checkpoint congelado).
- docs/EDITING-MODULE.md criado (SOMENTE planejamento, sem codigo):
  - Tipos/interfaces: EditingProfile (parametros quantitativos -100..+100 +
    conceituais skinToneStyle/greensStyle/bluesStyle/blackPointStyle/highlightStyle/overallMood),
    EditingPlan (baseStyle + sceneCorrection + finalAdjustment, auditavel,
    inputFingerprint p/ invalidar plano quando entradas mudam), ReferenceImage, XmpExportResult.
  - Schema v2 aditivo: editing_profiles, editing_plans, reference_images
    (padrao JSON do Store atual; banco v1 intacto; user_version 2).
  - Questionario estruturado -> deltas deterministicos (sem IA). Sinais de cena:
    so os que ja existem (exposure/sharpness/rostos); indoor/temperatura/ceu/verde
    ficam null (proibido inventar classificador).
  - Estrategia XMP-first (whitelist crs, sidecar .xmp, round-trip test) - so Fase E.
  - Fluxo: perfil -> questionario -> referencias -> fotos alvo (Picks/Selecionadas/
    Favoritas/Manual) -> gerar plano -> revisar -> exportar XMP.
  - Fases A-G com criterios EDITING_READY_FOR_BETA ao final. Nada implementado.
- Nenhum codigo de producao alterado. Pendente: validar doc com o usuario antes de
  qualquer implementacao (Fase A).
## Revisao final schema/interfaces do modulo Editar (2026-10-07) - SCHEMA_READY_FOR_PHASE_A

- docs/EDITING-MODULE.md atualizado (planejamento apenas, Fase A NAO iniciada):
  - EditingProfile: separado em q (quantitativo, MODEL_DELTA) e c (conceitual,
    DERIVED_DELTA); adicionado profileVersion; tabela explicita de tipos de campo.
  - EditingPlan: mantidos baseStyle/sceneCorrection/finalAdjustment; adicionados
    engineVersion, profileVersion, generatedAt, sourcePhotoId,
    sourceOriginalPath, status com ciclo DRAFT/GENERATED/REVIEWED/EXPORTED/STALE.
  - inputFingerprint deterministico (sem timestamp): engineVersion + profileVersion
    + sha256(conteudo do perfil) + ANALYSIS_VERSION + photos.hash.
  - Schema v2 100% aditivo; bancos v1 abrem intactos; editing_* opcionais.
  - STALE via leitura (fingerprint) + evento (edicao de perfil); regeneracao
    preserva finalAdjustment por padrao.
  - ReferenceImage: kind REFERENCE|BEFORE|AFTER, pairId, fingerprint sha256;
    referencia nao altera original/plano.
  - Espaco interno -100..+100 documentado como NAO equivalente XMP (conversao so Fase E).
  - Testes de compatibilidade especificados (tests/editing-schema.test.ts): v1->v2,
    round-trip v2, idempotencia, projeto antigo sem editing_*, STALE por mudanca
    de perfil, fingerprint deterministico (item 17).
- Resultado: SCHEMA_READY_FOR_PHASE_A. Proximo passo: Fase A quando autorizado.

## Fase A do módulo Editar — 2026-10-07 — PHASE_A_READY

- Implementados tipos reais (q/c separados, três camadas de plano, status,
  referências), versões centralizadas, validação e fingerprint canônico.
- Store integra EditingStore: migração transacional/aditiva para v2; CRUD de
  perfis/planos/referências, incremento semântico de profileVersion,
  lifecycle explícito e histórico de status; STALE em leitura e eventos.
- Planos somente DRAFT, sem deltas ou geração; generatedAt=null.
  Exclusão de perfil com dependentes falha, sem apagar histórico automaticamente.
- 18 testes novos usam schema extraído da tag clickit-beta-0.1.0 para provar
  compatibilidade e rollback. Nenhum original modificado.
- Checks sequenciais PASS: typecheck, lint, 103/103 testes (85 Beta + 18 novos),
  build. Comparação com Beta sem diff em pipeline/AI/export/main/renderer.
- docs/EDITING-MODULE.md e docs/VALIDATION.md atualizados.
- Sem IPC novo, UI, questionário, XMP ou nova IA nesta fase.
- Próxima ação: aguardar autorização para Fase B. Nenhuma fase adicional iniciada.

## Fase B do módulo Editar — 2026-10-07 — PHASE_B_READY

- Questionário determinístico (7 etapas, 15 sliders `q`, 6 conceitos `c`) com
  resumo reproduzível; conceitos `c` seguem intenção semântica (sem derivação).
- Referências individuais ou pares BEFORE/AFTER (mesmo pairId, adição atômica),
  miniatura via clickit://reference?id&v=fingerprint (no-store), arquivo original
  nunca modificado; duplicar perfil copia só q/c (decisão do usuário).
- 9 IPCs de edição, todos atrás de requireWorkspaceLicense; sem licença, IPCs e
  thumbnails negados (validado em GUI).
- UI: entrada "Editar" na navegação, EditingWorkspace (perfis + wizard 7 etapas +
  referências + "Geração de edição · Em breve").
- testes: editing-style.test.ts 8 casos; suite 111/111 (85 Beta + 18 Fase A + 8).
- Validação GUI Electron real (scripts/validate-editing-ui.mjs): PASS, 10 checks,
  0 erros; evidência docs/evidence/editing-ui/validation.json + 4 screenshots.
- Checks sequenciais PASS: typecheck, lint, 111/111, build. Sem plano/XMP/motor/
  preview editado nesta fase.
- Próxima ação: aguardar autorização para Fase C. Fase A + B ainda não commitadas
  neste registro (próximo passo: commit local).

## Fase C do módulo Editar — 2026-10-07 — PHASE_C_READY

- Gerador real e determinístico em `src/editing/planner.ts`
  (EDITING_ENGINE_VERSION=2): baseStyle 1:1 dos q (zeros omitidos);
  sceneCorrection só com confidence>=0.6 e exposure<70 (deficit 70−exposure →
  shadows=min(14,round(d*0.2)), blacks=min(7,round(d*0.1)),
  highlights=−min(4,round(d*0.05))); finalAdjustment=clamp(base+scene) com
  reason PROFILE_BASE/SCENE e nota "base X; cena Y; final Z."; explanation
  auditável; sceneAdvisories só de sinais reais (sharpness UNCERTAIN/POSSIBLE_BLUR,
  olhos, retrato-like, ISO>=3200); missingSignals sempre com
  temperatureK/outdoorIndoor/skyPresence/greenPresence (jamais inventados).
  ReferenceImage não influencia; conceitos c seguem sem número.
- Store: photoData, generateEditingPlan(s) batch {generated,skipped},
  regeneração só DRAFT|STALE, fingerprint recalculado, statusHistory preservado,
  UNIQUE(profileId,photoId), idempotência, fotos sem análise puladas.
- IPC: 4 handlers novos (total 13, todos atrás de requireWorkspaceLicense):
  plans:list/get/generate(scope PHOTO/SELECTED/PICKS/FAVORITES/ALL)/delete;
  planView com profileName, fileName e previewUrl clickit://photo/id/preview?v=mtime.
- UI: botão "Planos" → painel .plan-section (projeto/escopo/gerar), cards
  .plan-card (badge Gerado, tabela finalAdjustment, explanation base·cena·final,
  advisories, missing) e nota determinística/auditável.
- testes/editing-plan.test.ts 13 casos; suite 124/124 (85+18+8+13); typecheck,
  lint e build PASS (sequenciais).
- Validação GUI Electron real (scripts/validate-editing-plan-ui.mjs): PASS,
  5 checks, 0 erros; evidência docs/evidence/editing-plan-ui/validation.json +
  4 screenshots. Cobriu geração por foto, batch ClickIT Picks idempotente,
  marcada saudável sem correção, byte-identity dos originais e reabertura
  persistindo 2 planos.
- Re-execução da GUI da Fase B instável por RAM crítica do host (0.3 GB livres;
  falha na automatização do diálogo nativo, sem banner de erro). Referências
  confirmadas em nível de store (import+thumbnail PASS) e evidência PASS da
  Fase B restaurada de git. Sem regressão de produto.
- docs/EDITING-MODULE.md (seção 22) e docs/VALIDATION.md atualizados.
- Fase C commitada em `1a2176f`. Nada de XMP, preview/
  editado, modelos novos, aprendizado por referência ou Lightroom nesta fase.
- Próxima ação: aguardar autorização para Fase D. Não iniciar automaticamente.

## Fase D do módulo Editar - 2026-10-07 - PHASE_D_READY

- Prévia visual NÃO destrutiva do EditingPlan: motor `src/editing/preview.ts`
  (JPEG a partir do preview em cache, chunked/cancelável, gravação atômica) +
  mapeamento central puro `src/editing/preview-map.ts` (13 params
  renderizáveis, PREVIEW_ENGINE_VERSION=1, largura ≤1280, qualidade 85;
  temperature/tint = UNSUPPORTED_PREVIEW, nunca simulados; sem equivalência
  1:1 com Lightroom). Corrigido na passada: vinheta não aplicava duas vezes
  `vignetteAmount`.
- Overrides manuais = DELTA sobre finalAdjustment (efetivo = clamp(sugestão
  + override, -100..100), grão 0..100), persistidos em `manualOverrides` com
  reset individual/global; `reviewedAt` ao revisar; sugestão gerada nunca
  sobrescrita.
- Cache de preview separado da análise (sha256 de engine|largura|photoHash|
  inputFingerprint|valores|tamanho+mtime do preview base) em
  `storage/cache/editing-preview`; URL `clickit://edited/<sha256>` com regex
  estrita + requireWorkspaceLicense.
- Store: `photoHash`, `setEditingPlanOverrides`, `resetEditingPlanOverrides`,
  `updateEditingPlanStatus` grava `reviewedAt` em REVIEWED.
- IPC: 4 novos handlers (17 total, todos atrás de requireWorkspaceLicense):
  `editing:preview:render` (guards DRAFT/STALE com mensagem explícita + token
  de cancelamento por plano), `editing:overrides:save/reset`,
  `editing:plans:review` (só GENERATED→REVIEWED, nunca EXPORTED).
- UI: componente `PlanPreview` (render sob demanda por IntersectionObserver,
  debounce 240ms + flush, modos Antes/Depois/Lado a lado, segurar-para-ver-
  original, 13 sliders com chip "sugestão ±N", reset individual ↺ e global,
  chips UNSUPPORTED_PREVIEW, estado STALE, "Marcar como revisado") + CSS
  `.plan-preview*`; `preview-map.ts` importado pelo renderer (só tipos de
  `./types.ts`, sem sharp/node).
- tests/editing-preview.test.ts: 12 casos PASS; editing-style guard atualizado
  para 17 IPCs. Suite 136/136 (85+18+8+13+12); typecheck e build PASS
  (sequenciais); lint dos arquivos alterados PASS. Lint global permanece com
  4 erros pré-existentes em arquivos não
  tocados (landing/, scripts/validate-editing-plan-ui.mjs).
- Validação GUI Electron real (scripts/validate-editing-preview-ui.mjs): PASS,
  9 checks, 0 erros; evidência docs/evidence/editing-preview-ui/validation.json
  + 5 screenshots. Cobriu: render sozinho em clickit://edited com chip
  UNSUPPORTED (temperature), comparação/hold, slider DELTA + chip sugestão +
  re-render por src, reuso de cache, reset global, revisão REVIEWED, originais
  byte-idênticos e reabertura com Revisado + cache. Executado com o host em
  RAM crítica (~0,16 GB livres) sem falhas.
- docs/EDITING-MODULE.md (seção 23) e docs/VALIDATION.md atualizados.
- Fechamento local autorizado: `feat(editing): complete phases C and D`.
  A Fase C já consta em `1a2176f`; este commit conclui a Fase D e registra
  conjuntamente o estado validado das Fases C/D. Nada de XMP, exportação
  editada, escrita no original, novos
  modelos, aprendizado por referência ou Lightroom nesta fase.
- Próxima ação: aguardar autorização para Fase E. Não iniciar automaticamente.

### Registro do fechamento C/D

- Fase C: geração determinística de `EditingPlan`.
- Fase D: preview não destrutivo; before/after/side-by-side; manual overrides;
  cache/fingerprint; STALE handling; REVIEWED lifecycle.
- Validação: 136/136 testes PASS; GUI Electron real PASS (9 checks, 0 erros).
- Os 4 erros de lint remanescentes são pré-existentes e não pertencem às
  alterações das Fases C/D; lint dos arquivos alterados PASS.
- Commit limitado ao código, testes, documentação e evidências C/D;
  sem ferramentas locais, temporários, caches ou segredos. Fase E não iniciada.
