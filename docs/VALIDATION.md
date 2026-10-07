# ClickIT — validação do MVP existente

## Sinais de preferência isolados — 2026-10-06

Executado `node scripts/preference-signals-test.mjs` nas mesmas cinco imagens e análises reais salvas. [JSON com hashes e medidas](evidence/preference-signals-2026-10-06T13-05-51-937Z.json). Para -1/-4/-5, centróide horizontal facial normalizado: **0,519 / 0,515 / 0,507**; espaço superior até o rosto: **0,209 / 0,207 / 0,205**. São retângulos faciais reais, próximos entre si; não distinguem confiavelmente preferência de composição. Distância a linhas dos terços é só medida bruta auxiliar. Dimensões originais vieram do Sharp; retângulos estão normalizados no preview do FaceLandmarker.

`technicalScore` atual no replay: -1=80, -4=79, -5=77. Escala pós-saturação, não comparável aos valores lineares antigos. `aestheticScore=null`, `compositionScore=null`, `expressionScore=null`: score não confiável não vira nota zero. Os registros faciais têm EAR/OPEN/CLOSED e blendshapes de blink; gaze, boca/sorriso, pose e landmarks completos não estão salvos. EAR/blink não foram interpretados como estética.

NIMA MobileNet/AVA é candidato porque o projeto upstream declara Apache-2.0 para implementação e modelos treinados. O ONNX público de 12,9 MB não tem licença/model card nem documenta conversão. Artefato, tensor/preprocessing e SHA local não foram verificados. Shell não alcançou Hugging Face e Chrome bloqueou o CDN Xet (`ERR_BLOCKED_BY_CLIENT`). Nenhum modelo foi incorporado/executado nem score estético inventado. A alternativa Aesthetic Predictor V2.5/AGPL-3.0 foi excluída. Procedência em [MODELS.md](MODELS.md).

**Resultado incompleto por bloqueio na obtenção/verificação do modelo.** Foram examinadas somente medidas faciais/geométricas previamente persistidas; não houve combinação experimental, que depende dos novos scores. Para diferenciar -1/-4/-5 segundo preferência humana, é necessário um sinal real de estética/composição/expressão. Camada B não simulada. Faltam artefato Apache com origem documentada, hash local, contrato ONNX verificado, inferência real e comparação com preferência humana. Nenhuma alteração em agrupamento, DINOv2, EAR, thresholds oculares, saturação/pesos ou ranking de produção. `npm run lint`: PASS; `npm run typecheck`: PASS; `npm test`: 34/34 PASS; `npm run build`: PASS.

## Saturação da nitidez na qualidade técnica — 2026-10-06

Auditoria executada **antes da alteração**: [distribuição e contribuições lineares originais](evidence/ranking-audit-2026-10-06T12-46-42-016Z.json). Sharpness global/regional/facial são medidas já normalizadas de 0–100 pela função logarítmica do Laplaciano; os valores medidos foram preservados. Não foram usadas preferências por -4/-5 na definição da curva.

| Foto | Global normalizado | Regional normalizado | Facial/subject normalizado | Contribuição linear da nitidez (.45+.20) |
|---|---:|---:|---:|---:|
| -1 | 51,379352 | 59,092124 | 33,088864 | 21,507762 |
| -4 | 51,633377 | 60,518549 | 31,373359 | 20,392684 |
| -5 | 49,386118 | 57,274332 | 28,929071 | 18,803896 |
| -3 | 42,755077 | 49,470580 | 19,988600 | 12,992590 |
| -2 | 49,388196 | 57,308167 | 26,971488 | 17,531468 |

### Função implementada

`T(s) = (100+k)*clamp(s,0,100)/(clamp(s,0,100)+k)`, com **k=thresholds.softFocus=27**, limiar técnico preexistente, não estimado a partir das cinco fotos. Dentro de [0,100], `T'(s)=3429/(s+27)² > 0` e `T''(s)=-6858/(s+27)³ < 0`. Logo é monotônica e estritamente côncava; T(0)=0 e T(100)=100. Os valores 100 definem a escala existente, não representam probabilidade ou calibração humana. O uso do limiar 27 como escala é uma escolha técnica documentada, ainda sujeita a validação em outras fotografias e tamanhos de rosto.

| Sharpness medido | Utilidade técnica T(s) |
|---:|---:|
| 0 | 0 |
| 20 | 54,043 |
| 27 | 63,500 |
| 35 | 71,694 |
| 48 | 81,280 |
| 50 | 82,468 |
| 70 | 91,649 |
| 90 | 97,692 |
| 100 | 100 |

Ganho 20→35: **17,651**, versus 70→90: **6,043**, apesar do segundo intervalo ser maior. Com peso combinado .65, os ganhos são 11,473 e 3,928 pontos. Perder foco de 50 para 20 reduz 18,476 pontos ponderados; foco zero perde toda contribuição de nitidez. A influência marginal da nitidez cai conforme ela melhora: a 70, derivada combinada ~.237 por unidade; a 90, ~.163, em vez de .65 constante. No teste unitário, sharpness 70/exposição 95 supera sharpness 72/exposição 90 com olhos iguais: pequena melhora de foco alto não anula a diferença de exposição.

Camada A centralizada em `src/ai/technical-score.ts`: foco, nitidez do rosto, exposição e olhos. Fórmula para estas cinco fotos: `round(.45*T(face) + .20*exposição + .20*T(face) + .15*olhos)`. Sem rosto, foco usa T(regional); termos ausentes continuam omitidos e pesos renormalizados. Pesos .45/.20/.20/.15 não mudaram. O orçamento máximo de nitidez continua 65 pontos quando há rosto; foi reduzida sua influência **marginal na faixa alta**, não o peso nominal. Ambas as ocorrências da nitidez facial passam pela curva, evitando deixar um termo linear residual.

Os valores medidos, limiares e flags de foco permanecem na escala original; utilidade transformada serve apenas para pontuar. Uma foto desfocada pode continuar em REVIEW mesmo com score composto numericamente maior. Score absoluto não significa probabilidade de qualidade. Não foram criadas novas categorias calibradas de foco. A ausência de estética permanece explícita em `aestheticScore=null`; Camada B (preferência fotográfica) não foi implementada nem simulada.

Versão de análise atualizada para `clickit-1-dinov2-mp1-ear1-focus-saturation1`, invalidando análises antigas no mecanismo existente de cache. Embeddings DINOv2, agrupamento e limiar .965, EAR e thresholds oculares não foram modificados. Relatórios de contribuição agora usam a mesma função da produção para a versão nova e preservam a leitura da fórmula linear em evidências antigas.

### Replay real: antes/depois

Executado `node scripts/focus-saturation-test.mjs`, sobre uma cópia isolada do SQLite da execução real anterior, com `makeAnalysis`, `rank` e `Store.saveGroups` de produção. Membership foi congelada em **5+1+1**, sem executar reclustering. Nenhum embedding/landmark foi inventado; não houve nova inferência. [JSON com contribuições completas, parâmetros, hashes de origem e verificações](evidence/focus-saturation-2026-10-06T12-49-01-066Z.json).

| Foto | Sharpness facial | Contribuição antes | Score/rank antes | T(sharpness) | Contribuição depois | Score/rank depois | Decisão |
|---|---:|---:|---|---:|---:|---|---|
| -1 | 33,088864 | 21,507762 | 56 / 1 | 69,934518 | 45,457437 | 80 / 1 | AI_SELECTED |
| -4 | 31,373359 | 20,392684 | 55 / 2 | 68,257450 | 44,367342 | 79 / 2 | UNDECIDED |
| -5 | 28,929071 | 18,803896 | 54 / 3 | 65,690203 | 42,698632 | 77 / 3 | UNDECIDED |
| -3 | 19,988600 | 12,992590 | 48 / 4 | 54,024852 | 35,116154 | 70 / 4 | REVIEW |
| -2 | 26,971488 | 17,531468 | 40 / 5 | 63,466455 | 41,253196 | 64 / 5 | REVIEW |

**Pick continua -1.** Não se considera aprovação por mudança de Pick. Critérios executados no replay: CLOSED abaixo das alternativas OPEN nítidas; desfocada abaixo das nítidas; nenhuma rejeitada; mesmos membros nos três grupos; objetos faciais e score ocular preservados. Penalidade CLOSED versus OPEN permanece 12 pontos antes de arredondar. Nenhuma nova preferência humana foi aprendida.

Limite da evidência: os scores **faciais** de todas as cinco fotos ficam abaixo de 48, inclusive as visualmente consideradas boas. A margem ponderada de nitidez entre -1 e -4 diminuiu apenas de 1,115078 para 1,090094. Este conjunto não valida por si só distinções entre rostos realmente na faixa alta da métrica; a concavidade foi verificada por testes matemáticos, não por um novo dataset calibrado. A transformação também eleva a escala absoluta dos scores, portanto eles não devem ser comparados diretamente com a versão antiga. Não se afirma que foco/crop/tamanho de rosto estejam universalmente calibrados.

**Para diferenciar de forma confiável -1 de -4/-5 segundo preferência humana, precisamos agora adicionar um sinal real de estética/composição/expressão.** O ranking técnico atual não tem sinal suficiente para reconhecer esses fatores. Nenhum modelo dessa natureza foi adicionado nesta tarefa.

Validação: lint PASS; typecheck PASS; **34/34 testes PASS**; build PASS. A primeira execução de lint apontou `structuredClone` não declarado na configuração ESLint do harness; substituído por cópia JSON das análises serializáveis e lint reexecutado com sucesso. Logs em `docs/evidence/focus-saturation-{lint,typecheck,test,build}.log`. Replay não equivale a nova validação end-to-end facial; permanece o histórico separado da limitação Electron/ACL. O hook isolado continua não reproduzido, causa indeterminada, sem atribuição ao projeto e sem contar como PASS/FAIL do aplicativo.

## Auditoria do ranking, sem mudança em produção — 2026-10-06

Fonte: análises reais de `selection-test-2026-10-06T12-22-27-400Z.json`, com os cinco membros e ranks de `selection-grouping-replay.json`. Não houve nova inferência nem alteração de agrupamento, pesos, EAR ou thresholds oculares. Cada score salvo foi reproduzido por `makeAnalysis` e conferido. [Auditoria original completa](evidence/ranking-audit-2026-10-06T12-32-11-664Z.json) e [único experimento antes/depois](evidence/ranking-audit-2026-10-06T12-32-30-877Z.json), incluindo SHA-256 da evidência fonte.

Reprodução:

```powershell
node scripts/ranking-audit.mjs docs/evidence/selection-test-2026-10-06T12-22-27-400Z.json
node scripts/ranking-audit.mjs docs/evidence/selection-test-2026-10-06T12-22-27-400Z.json --regional-focus-experiment
```

### Medidas de cada fotografia

Identificação pelos sufixos dos arquivos; os nomes completos e SHA-256 estão no JSON. Sharpness bruto significa variância do Laplaciano, não embedding. A variância bruta **não foi persistida**: os valores abaixo foram reconstruídos algebricamente pela inversa `10^(score/20)-1`, porque nenhum score usado está saturado em 100. Não são novas medições de pixels. O score regional é média dos dois melhores entre 16 tiles normalizados; não há uma única variância regional recuperável dessa média.

| Foto | Variância global reconstruída | Variância facial reconstruída | Sharpness global normalizado | Regional normalizado | Rosto/foco usado | Exposição | Olhos |
|---|---:|---:|---:|---:|---:|---:|---|
| -1 | 369,653048 | 44,127701 | 51,379352 | 59,092124 | 33,088864 | 98,455302 | OPEN / 100 |
| -4 | 380,653156 | 36,039743 | 51,633377 | 60,518549 | 31,373359 | 98,550415 | OPEN / 100 |
| -5 | 293,649636 | 26,954617 | 49,386118 | 57,274332 | 28,929071 | 98,493449 | OPEN / 100 |
| -3 | 136,326341 | 8,986883 | 42,755077 | 49,470580 | 19,988600 | 98,469035 | OPEN / 100 |
| -2 | 293,720113 | 21,313846 | 49,388196 | 57,308167 | 26,971488 | 98,405457 | CLOSED / 20 |

Normalização exata: `L = 4*centro - esquerda - direita - acima - abaixo`; `variance = max(0, mean(L²) - mean(L)²)`; `sharpness = clamp(20*log10(1+variance), 0, 100)`. As bordas de um pixel são excluídas. Não é percentil relativo ao grupo nem probabilidade calibrada. Global/regional usam preview em grayscale com máximo de 512; rosto usa crop do preview facial, RGB convertido por .299/.587/.114, sem padronizar tamanho do rosto. Escala, textura e crop podem influenciar nitidez facial; o score não mede beleza ou expressão. Exposição mede `100*(1 - proporção de pixels <6 ou >249)`, não uma avaliação artística da luz.

### Fórmula e contribuições atuais

`focus = faceScore ?? regionalSharpness`. `faceScore` é a menor nitidez entre rostos utilizáveis, não confiança de detecção nem qualidade da expressão. `eyesScore` é 20 se algum rosto CLOSED, 100 se todos OPEN, e null em incerteza/ausência. Termos null são omitidos e os pesos presentes renormalizados:

`final = round((.45*focus + .20*exposição + .20*rosto [se disponível] + .15*olhos [se disponível]) / soma dos pesos disponíveis)`.

Nas cinco fotos todos os termos existem e o denominador é 1: **`round(.65*nitidezFacial + .20*exposição + .15*olhos)`**. Sharpness global e regional não entram diretamente no score quando há rosto.

| Foto | Foco × .45 | Exposição × .20 | Rosto × .20 | Olhos × .15 | Soma antes de arredondar | Final | Rank |
|---|---:|---:|---:|---:|---:|---:|---:|
| -1 | 14,889989 | 19,691060 | 6,617773 | 15 | 56,198822 | 56 | 1 |
| -4 | 14,118012 | 19,710083 | 6,274672 | 15 | 55,102767 | 55 | 2 |
| -5 | 13,018082 | 19,698690 | 5,785814 | 15 | 53,502586 | 54 | 3 |
| -3 | 8,994870 | 19,693807 | 3,997720 | 15 | 47,686397 | 48 | 4 |
| -2 | 12,137170 | 19,681091 | 5,394298 | 3 | 40,212559 | 40 | 5 |

Penalidade CLOSED versus a mesma foto OPEN: **12 pontos** antes de arredondar em -2; zero nas demais. Não é um segundo desconto aplicado após a tabela: já está incluída na contribuição ocular 3 em vez de 15. Penalidade explícita por desfoque: **zero em todas**. A redução vem do valor menor de nitidez (sobretudo em -3); flags UNCERTAIN/POSSIBLE_BLUR orientam REVIEW, não subtraem score. Score relativo ao grupo: **não implementado em nenhuma foto**. O grupo define os concorrentes e a ordem; a anotação de blur relativo pode mudar depois do ranking, sem recalcular o score. Nenhuma rejeição automática foi introduzida.

**Por que -1 vence:** sua vantagem facial sobre -4 é 1,715505, contada com peso efetivo .65, ou +1,115078 ponto. Sua exposição perde apenas .019023 ponto ponderado; olhos empatam. Saldo: **+1,096056** antes de arredondar. Não é desempate por ID no ranking atual. -4 tem melhores nitidez global/regional e exposição, mas a primeira dupla não participa diretamente quando há rosto. -5 tem menor nitidez facial, global e regional que -1. Se a preferência humana por -4/-5 depende de expressão/composição: **o sistema atual ainda não mede este fator** (`aestheticScore=null`).

### Um único ajuste experimental, não aplicado ao produto

Hipótese apresentada após a auditoria: usar `regionalSharpness` no termo foco .45 e manter rosto .20, exposição .20, olhos .15. Isso separa os dois sinais de nitidez hoje repetidos, sem mudar pesos. É apenas um cenário do script de auditoria, não alteração de `makeAnalysis` ou `rank`. Usa exatamente as mesmas análises e mantém os mesmos cinco membros.

| Foto | Antes (score/rank) | Soma experimental | Depois arredondado/rank |
|---|---|---:|---|
| -1 | 56 / 1 | 67,900289 | 68 / 1 |
| -4 | 55 / 2 | 68,218102 | 68 / 2 |
| -5 | 54 / 3 | 66,257953 | 66 / 3 |
| -3 | 48 / 4 | 60,953288 | 61 / 4 |
| -2 | 40 / 5 | 53,864064 | 54 / 5 |

**Resultado: Pick não mudou.** -4 supera -1 antes do arredondamento, mas ambas ficam em 68; o desempate existente por ID mantém -1 nesta execução. IDs são gerados na importação, portanto esse empate não é uma preferência fotográfica e pode variar entre novas importações. Não foi introduzido segundo ajuste para alterar esse desempate. A hipótese não foi promovida à produção e não comprova alinhamento com a preferência humana. CLOSED e desfocada continuam em quinto/quarto.

### Investigação de “Hook failed / hook exited with code 1”

**Hook failure não reproduzido; causa não determinada.** Não foi encontrada essa ocorrência exata nos logs acessíveis do projeto/npm, eventos da sessão atual ou registros de hooks do Codex. A pasta `app-server-daemon` negou acesso à listagem; não se contornou essa restrição. O usuário confirmou que dispõe somente de “Hook failed / hook exited with code 1”, sem nome, comando ou stack. **Sem evidência suficiente para atribuir ao projeto. Não considerar PASS nem FAIL do aplicativo por esse evento isolado; ele não bloqueia a validação.** [Registro da investigação](evidence/hook-investigation.json).

Há dois hooks externos do plugin Impeccable 4.3.1 configurados: `PostToolUse` (matcher Edit|Write|apply_patch) e `Stop`. Ambos usam o comando Windows abaixo, com PLUGIN_ROOT resolvido para `C:\Users\jasso\.codex\plugins\cache\openai-curated-remote\impeccable\4.3.1`:

```cmd
if exist "${PLUGIN_ROOT}/skills/impeccable/scripts/impeccable.cmd" ("${PLUGIN_ROOT}/skills/impeccable/scripts/impeccable.cmd" hook & exit /b)
```

Reprodução executada do Stop via `cmd.exe /d /s /c`, com payload diagnóstico: **exit 0, stdout vazio, stderr vazio, nenhuma stack**. [Comando expandido, entrada e saída integral](evidence/hook-reproduction.json). Isso não prova que o hook original teve sucesso nem identifica o hook que apresentou exit 1. O SQLite de logs contém falhas antigas de `legacy_notify`/`codex-computer-use.exe turn-ended` com `os error 206` (nome de arquivo/extensão muito grande), mas são de outra thread; não são evidência do erro relatado. Nenhum hook foi desativado ou erro convertido em PASS. A falha Electron/ACL com exit 2147483651 também é distinta.

### Status real

Auditoria e experimento executados com análises reais salvas. Não houve nova inferência facial/end-to-end nesta rodada. A execução completa anterior existe, mas a última tentativa nova registrada continua FAIL na inicialização Electron por ACL; agrupamento 5+1+1 está comprovado em embeddings novos e no replay das análises reais. Preferência humana do Pick ainda não satisfeita. O hook isolado, não reproduzido e de causa indeterminada, não participa do resultado de validação do aplicativo e não bloqueia a auditoria do ranking.

`npm run lint`: PASS; `npm run typecheck`: PASS; `npm test`: **31/31 PASS**; `npm run build`: PASS. Saídas completas em `docs/evidence/ranking-audit-{lint,typecheck,test,build}.log`. Sem mudanças em produção, agrupamento, EAR, thresholds de olhos, pesos ou UI.

## Correção de conectividade das sequências — 2026-10-06

Diagnóstico feito **antes** de alterar código/limiar: [matriz original e 21 pares](evidence/selection-matrix-before.json), extraídos da execução completa real `selection-test-2026-10-06T12-22-27-400Z.json`. A/B/C/D/E correspondem respectivamente aos arquivos terminados em -1/-2/-3/-4/-5 (retratos); F=-6 (câmera), G=-7 (paisagem). B tem olhos fechados e C é a mais desfocada, conforme rótulos confirmados pelo usuário.

| | A | B | C | D | E | F | G |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 1 | .957317 | .984449 | .989281 | .971460 | .069754 | -.014669 |
| B | .957317 | 1 | .969867 | .963801 | .962877 | .066222 | -.034939 |
| C | .984449 | .969867 | 1 | .995725 | .986316 | .076111 | -.019864 |
| D | .989281 | .963801 | .995725 | 1 | .988161 | .079236 | -.018675 |
| E | .971460 | .962877 | .986316 | .988161 | 1 | .067579 | -.010032 |
| F | .069754 | .066222 | .076111 | .079236 | .067579 | 1 | -.042025 |
| G | -.014669 | -.034939 | -.019864 | -.018675 | -.010032 | -.042025 | 1 |

Limiar anterior sem EXIF: **0,975**. Arestas aprovadas: AC, AD, CD, CE, DE; todos os demais 16 pares falham. A/E=.971460 não conectam diretamente, mas A/C/E e A/D/E já oferecem caminhos; comparar somente um representante perde essas conexões. B fica isolada mesmo com componentes conexos em 0,975: sua maior similaridade é BC=**0,9698674289296891**. Portanto havia dois problemas, representação única e limiar excessivo para a variação ocular observada.

Correção genérica: todas as conexões visuais entre candidatos alimentam union-find; grupos são componentes conexos. Nenhum nome, hash de fixture, quantidade de retratos, estado dos olhos ou score define a conexão. Deduplicação por igualdade de bytes continua genérica. Similaridade exibida contra representante é apenas descritiva e pode ficar abaixo do limiar em um componente transitivo. Não há mais corte pelos últimos 24 representantes. Custo O(n² × dimensão) em comparações e O(n) de estado do grafo na produção; grandes bibliotecas ainda precisam de avaliação de desempenho. Há risco de encadeamento de cenas parecidas em coleções maiores; este conjunto não valida universalmente falsos positivos.

Limiar visual central alterado para **0,965**, após a evidência: margem aproximada de .00487 abaixo da ponte BC. Neste conjunto, uma faixa maior que .0792362157922569 e até .9698674289296891 conecta os retratos sem conectar conteúdos diferentes. A escolha de .965 é conservadora dentro dessa faixa, **não calibração geral**; exige novos conjuntos independentes. Limiar temporal .91/janela 12 s preservados e centralizados na mesma função usada pelo relatório. Tempo nunca cria aresta sozinho; sem datas válidas, usa-se exclusivamente o visual. Arestas atuais: AC, AD, AE, BC, CD, CE, DE. Componentes: **ABCDE, F, G**.

Executado reagrupamento com `group` e `Store.saveGroups` em cópia isolada do SQLite da execução completa anterior, usando análises/embeddings reais já persistidos: [evidência do replay](evidence/selection-grouping-replay.json). Não houve nova inferência facial nesse replay e a base original foi preservada. Resultado: exatamente cinco retratos juntos e duas isoladas. Ranking/score não alterados:

| Rank | Foto | Score | Olhos | Decisão |
|---:|---|---:|---|---|
| 1 | A / -1 | 56 | OPEN | AI_SELECTED — ClickIT Pick |
| 2 | D / -4 | 55 | OPEN | UNDECIDED |
| 3 | E / -5 | 54 | OPEN | UNDECIDED |
| 4 | C / -3 | 48 | OPEN | REVIEW |
| 5 | B / -2 | 40 | CLOSED | REVIEW |

CLOSED permanece no grupo abaixo das alternativas OPEN; a desfocada perde prioridade sem rejeição. Nenhuma das cinco foi rejeitada. O Pick A diverge da preferência anterior por D/E: isso continua uma limitação do ranking existente, **não foi corrigido nem mascarado**. O critério `pick-acceptable` anterior permanece no harness e pode retornar FAIL mesmo com agrupamento correto.

Nova execução do comando `npm run selection:test -- --dir "C:\dev\ClickIT\Imagens Teste"`: embeddings/matriz/arestas/componentes visuais foram calculados novamente. A inicialização Electron nesta sessão continuou falhando em `app-ready-wait` pela ACL de `node_modules/electron/dist`, exit 2147483651; o comando retornou 1. Não se declara PASS end-to-end novo. O JSON distingue componentes visuais reais de grupos persistidos com ranking, que exigem conclusão facial. Para concluir a nova rodada completa, executar no PowerShell normal onde MediaPipe já funcionou. O terminal e JSON agora incluem matriz completa, 21 pares, limiares, arestas, componentes e rótulos do conjunto; critérios verificam também que nenhuma foto da sequência é rejeitada.

Evidência da última execução: [selection-test-2026-10-06T12-28-23-593Z.json](evidence/selection-test-2026-10-06T12-28-23-593Z.json).

Verificações executadas: lint PASS; typecheck PASS; **31/31 testes PASS**; build PASS. Novos testes exercitam transitividade sem EXIF, independência da ordem/score, isolamento de conteúdo diferente, limites temporais, duplicatas e ausência do corte de representantes. Nenhuma alteração no ranking, EAR, pesos, UI ou reconhecimento de identidade.

## Pipeline de seleção controlado — 2026-10-06

Comando preparado e executado:

```powershell
npm run selection:test -- --dir "C:\dev\ClickIT\Imagens Teste"
```

**Resultado: FAIL, exit code 1. Pipeline completo ainda não validado.** Evidência final desta rodada: [selection-test-2026-10-06T12-10-45-709Z.json](evidence/selection-test-2026-10-06T12-10-45-709Z.json). Execução de 5296 ms: 7 imagens lidas, 7 embeddings reais de 384 dimensões, foco/exposição reais e 21 similaridades calculadas. SHA-256 e integridade dos originais registrados. Nenhum resultado facial foi simulado.

O harness usa Pipeline, worker Sharp/ExifTool/DINOv2, agrupamento e persistência de produção. O pós-processamento facial foi extraído sem mudança de fórmula para `src/ai/face-analysis.ts`, compartilhado pelo renderer de produção e pelo diagnóstico. Um observador opcional preserva a evidência do worker mesmo quando a etapa facial falha. Scores, thresholds, EAR e decisões automáticas não foram alterados. Cada execução mantém SQLite/cache isolados e grava JSON exclusivo, inclusive em falha.

**Falha executada:** nas sete imagens, Electron abortou em `app-ready-wait`, antes de inicializar MediaPipe, com exit 2147483651. A mensagem fatal `install_dir_access.cc:52` relata ACL incompatível em `node_modules/electron/dist`: há entrada AppContainer sem ALL APPLICATION PACKAGES, impedindo leitura pelo token sandbox desta sessão. Não é falha de detecção de rosto nem timeout de inferência. As etapas dependentes ficam NOT_EVALUATED; o teste geral permanece FAIL. Zero análises completas/grupos persistidos nesta execução; não há ranking ou ClickIT Pick validado. As imagens com erro não são reportadas como isoladas por diferença visual.

Evidência parcial real: os 10 pares entre os cinco retratos têm cosine entre **0,957317178820426 e 0,995725346327477**. Os 10 pares entre retratos e imagens diferentes têm cosine entre **-0,0349393104240659 e 0,0792362157922569**. Todas as datas EXIF estão ausentes; aplica-se o threshold visual existente **0,975**, não o temporal 0,91 (janela 12 segundos). Alguns pares semelhantes não atingem 0,975; isso merece observação na execução completa, mas não comprova sozinho a composição final dos grupos, pois produção compara representantes. Não foi ajustado threshold para forçar aprovação.

Rótulos visuais confirmados pelo usuário: -2 olhos fechados, -3 mais desfocada, -4 tecnicamente boa, -5 composição/expressão preferida; -6 câmera e -7 paisagem são diferentes. `scripts/selection-expectations.json` associa essas expectativas aos hashes, apenas para conferir o resultado após o ranking. Não participa dos embeddings, scores ou grupos. Conjuntos desconhecidos são analisados, mas as expectativas recebem NOT_EVALUATED, sem PASS automático.

Quando a etapa facial puder executar, o relatório inclui landmarks reais, EAR, scores parciais, contribuições ponderadas, grupo, rank, motivo relativo, primeiro colocado e ClickIT Pick efetivamente persistido. Primeiro colocado em REVIEW não é apresentado como AI_SELECTED. Pesos de produção: foco 0,45; exposição 0,20; rosto 0,20; olhos 0,15, renormalizados quando uma métrica não existe. Confidence ocular é heurística, não probabilidade calibrada. Produção não mede estética/composição/expressão; só é possível comparar o Pick técnico com a preferência rotulada.

**Pendente:** executar o mesmo comando no PowerShell normal onde FaceLandmarker já funcionou e examinar a nova evidência: cinco retratos juntos, duas imagens distintas fora, CLOSED detectado e com menor prioridade que alternativa aberta, desfoque com menor prioridade sem rejeição, Pick entre -4/-5. Se algum critério divergir, o comando retorna 1 e registra FAIL. Não alterar ACL ou desativar sandbox foi parte desta validação.

Verificações executadas após a implementação: `npm run lint` PASS; `npm run typecheck` PASS; `npm test` **28/28 PASS**; `npm run build` PASS. Os testes unitários do relatório conferem argumentos e distinguem análise bloqueada de agrupamento incorreto; não substituem a inferência facial pendente. Nenhuma UI ou funcionalidade de seleção nova foi adicionada.

## Harness ocular: expected explícito — 2026-10-06

Alteração restrita ao harness e seus testes: `--expected` é obrigatório, aceita OPEN/CLOSED/UNCERTAIN e não depende do nome do arquivo. O antigo padrão OPEN foi removido. EAR, thresholds, confidence e classificação de produção não foram alterados nesta rodada.

```powershell
npm run eyes:test -- --photo "C:\dev\ClickIT\FOTO A.png" --expected OPEN
npm run eyes:test -- --photo "C:\dev\ClickIT\FOTO C.png" --expected CLOSED
```

Para exit 0, é necessário pelo menos um rosto, a quantidade avaliada deve corresponder à quantidade detectada e **os dois olhos de todos os rostos** devem corresponder ao estado esperado. Estado misto não passa. UNCERTAIN deve ocorrer individualmente em ambos os olhos; não basta que o agregado seja UNCERTAIN por discordância. Argumentos ausentes/inválidos retornam 2; divergência ou falha de inferência retorna 1. Confidence continua sendo margem heurística, não probabilidade calibrada.

Cada execução válida grava arquivo exclusivo `docs/evidence/eyes-test-<foto>-<expected>-<UUID>.json`, inclusive quando falha. Assim fotos diferentes ou novas tentativas não sobrescrevem evidências anteriores. O nome da foto apenas identifica o relatório, nunca determina expected.

### Resultados reais anteriores e conferência nesta rodada

| Foto | EAR esquerdo | EAR direito | Estado medido | Proveniência |
|---|---|---|---|---|
| FOTO A | 0.30945865335726774 | 0.31778747022212517 | OPEN / OPEN | Resultado real informado pelo usuário; o relatório antigo de A havia sido sobrescrito pelo teste de C |
| FOTO C | 0.02292883944403182 | 0.017656606261224284 | CLOSED / CLOSED | Resultado informado pelo usuário e conferido no [relatório original preservado](evidence/eyes-test-open.json) |

O relatório original de C tem expected OPEN e ok false, apesar dos dois olhos CLOSED. Ele registra 1 rosto, 478 landmarks, inferência facial 116,4000 ms e EAR 0,2570 ms. O SHA-256 da FOTO C local confere com esse relatório: `3ded4d3721b823402e07006eb75ba6436cd45e4740ea07141cf5211938711b44`.

A comparação do harness corrigido foi executada sobre os estados e scores reais preservados de C: **matches=true para expected CLOSED**. [Evidência da comparação](evidence/eyes-harness-recorded-C.json), incluindo hash do relatório original. Isso verifica a correção da comparação, **não é uma nova execução de MediaPipe**. Não se alterou o relatório original para fabricar um PASS.

### Comandos executados nesta sessão

As duas invocações solicitadas foram executadas, mas ambas retornaram **exit 1 por ACL do Electron**, em `app-ready-wait`, antes da inferência (`install_dir_access.cc:52`, acesso sandbox à pasta Electron negado). Não produziram novos scores e não foram registradas como PASS. Esse bloqueio de ambiente é separado do resultado real anterior e da correção do harness.

- A / expected OPEN: [console](evidence/eyes-harness-A.log), [exit](evidence/eyes-harness-A.exit.txt), [evidência separada](evidence/eyes-test-FOTO-A-open-3e5b0459-34af-42a2-bd92-245dab62eb3b.json).
- C / expected CLOSED: [console](evidence/eyes-harness-C.log), [exit](evidence/eyes-harness-C.exit.txt), [evidência separada](evidence/eyes-test-FOTO-C-closed-75f80db7-37f4-4d94-b59e-5b9e3b44cfeb.json).

| Check | Execução real |
|---|---|
| `npm run lint` | PASS, exit 0; [log](evidence/lint-eyes-harness.log) |
| `npm run typecheck` | PASS, exit 0; [log](evidence/typecheck-eyes-harness.log) |
| `npm test` | PASS, 26 testes, zero skipped; [log](evidence/tests-eyes-harness.log) |
| `npm run build` | PASS, exit 0; [log](evidence/build-eyes-harness.log) |

Os novos testes cobrem argumentos explícitos, independência do nome da foto, todos os rostos/ambos os olhos, zero rostos, contagem divergente e UNCERTAIN. Fixtures desses testes verificam somente a lógica do harness, não são evidência de inferência. Para registrar novos exits 0 de inferência, repetir os dois comandos no terminal normal onde os casos reais já funcionaram.

## Histórico: classificação geométrica dos olhos — 2026-10-06

Implementado EAR por olho em `src/ai/eyes.ts`, compartilhado pelo renderer de produção e `npm run eyes:test`. Configuração única: `src/ai/eyes-config.ts`. Não há classificação baseada nos scores de blink: esses campos permanecem apenas como dados já existentes. A versão de análise passou a `clickit-1-dinov2-mp1-ear1`, para não reutilizar classificações antigas do cache como se fossem EAR.

### Landmarks, fórmula e critérios

Os lados são anatômicos da pessoa (não os lados de quem observa a imagem). Cada sequência fornece p1 a p6, conforme os contornos de olhos do [MediaPipe](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/face_mesh_connections.py):

- Esquerdo: **362, 385, 387, 263, 373, 380**.
- Direito: **33, 160, 158, 133, 153, 144**.

Convertem-se primeiro coordenadas normalizadas para pixels: `(x × largura, y × altura)`. Isso evita distorção do EAR em imagens não quadradas. Usa-se distância euclidiana 2D, conforme a construção de [Eye Aspect Ratio (Soukupová, 2016)](https://cmp.felk.cvut.cz/ftp/articles/cech/Soukupova-TR-2016-05.pdf):

```text
EAR = (||p2 - p6|| + ||p3 - p5||) / (2 × ||p1 - p4||)
```

`leftEyeScore` e `rightEyeScore` são o EAR bruto, não probabilidades. Configuração inicial explícita: **CLOSED ≤ 0,18**, **OPEN ≥ 0,25**, entre esses valores **UNCERTAIN**. Esses são pontos de operação provisórios escolhidos para o teste, não thresholds universais comprovados pela publicação. A faixa intermediária evita decidir casos próximos do limiar; ainda é necessária calibração com fotografias rotuladas variadas, incluindo olhos fechados.

Landmarks ausentes/não finitos/fora da imagem, olho menor que 12 pixels ou geometria com EAR > 0,6 produzem UNCERTAIN. Todos esses limites estão na mesma configuração. `confidence` por olho é a margem até o limiar dividida por 0,1, limitada a [0,1]; zero para UNCERTAIN. É uma margem heurística, não probabilidade calibrada nem score de detecção MediaPipe. Confidence conjunta é o mínimo das duas, ou zero quando discordam. O estado conjunto é UNCERTAIN se os olhos discordam; ambos são reportados individualmente. No objeto Face existente, a margem conjunta é armazenada em `eyesConfidence`.

EAR 2D não resolve sozinho pose extrema, oclusão, diferenças anatômicas ou landmarks plausíveis mas errados. Não foi implementada rejeição automática de fotos. As decisões humanas existentes permanecem preservadas.

### Evidência efetiva

O arquivo [face-test.json](evidence/face-test.json), produzido no terminal do usuário e conferido nesta rodada, registra **1 rosto, 478 landmarks, inicialização 1978,8 ms, inferência 121,2 ms, exit 0**, em renderer Electron sandbox/CPU. Esse teste antecede EAR e salva somente três pontos do rosto: não contém os pontos de olhos necessários e não comprova OPEN/CLOSED.

`npm run eyes:test -- --photo "C:\dev\ClickIT\FOTO A.png"` foi executado nesta sessão. **FAIL antes da inferência**, pelo erro de ACL do Electron em `app-ready-wait`; [log](evidence/eyes-test-current.log), [relatório](evidence/eyes-test-open.json). SHA-256 da foto: `61bfafdc45c1b90c407b46bc811c03f9069b3a52cda87e9737416f4dca9592f6`. Scores esquerdo/direito, confidence e tempo EAR nesta tentativa: **N/D**, sem landmarks de olhos obtidos. O tempo total da tentativa falha não é tempo de execução EAR.

O teste agora recebe os landmarks completos reais do probe e registra os doze pontos utilizados em pixels, score/estado/confidence por olho, configuração e tempos. Seu PASS exige **ambos os olhos OPEN** por padrão, não apenas presença de landmarks. Foi solicitada execução no terminal normal onde FaceLandmarker já funcionou; resultado ocular real ainda pendente no momento deste registro.

Caso CLOSED: **não validado**, ainda falta uma segunda fotografia real rotulada com olhos fechados. Com ela, executar `npm run eyes:test -- --photo "CAMINHO" --expect CLOSED`. Esse modo exige CLOSED nos dois olhos e salva `eyes-test-closed.json`. Testes unitários com geometria analítica não substituem essa validação.

| Check executado | Resultado |
|---|---|
| `npm run lint` | PASS, exit 0; [log](evidence/lint-eyes.log) |
| `npm run typecheck` | PASS, exit 0; [log](evidence/typecheck-eyes.log) |
| `npm test` | PASS, 24 testes, zero skipped; [log](evidence/tests-eyes.log). Os testes EAR verificam fórmula/aspect ratio/escala/abstenção, não acurácia fotográfica |
| `npm run build` | PASS, exit 0; [log](evidence/build-eyes.log) |

## Histórico: correção do contrato ONNX e diagnóstico facial — 2026-10-06

**Resultado executado nesta sessão: 43 PASS / 1 WARN / 1 FAIL.** [Doctor completo](evidence/doctor-three-fixes.json), [console](evidence/doctor-three-fixes.log). Os dois FAIL de contrato DINOv2 foram resolvidos. O timeout facial teve a causa localizada e corrigida no código; a execução agora aborta explicitamente por ACL do Electron antes de criar renderer. Portanto a inferência facial **ainda não é PASS nesta sessão**.

### DINOv2: contrato real e inferência CPU

ONNX Runtime leu estes metadados do `resources/models/dinov2-small.onnx` instalado, sem substituir pesos:

| Campo | Valor observado |
|---|---|
| inputNames | `["pixel_values"]` |
| Tipo de entrada | float32 |
| Shape declarado de entrada | `["batch_size","num_channels","height","width"]` (dinâmico) |
| Entrada concreta aceita | `[1,3,224,224]` |
| outputNames | `["last_hidden_state"]` |
| Tipo de saída | float32 |
| Shape declarado de saída | `["batch_size","floor(height/14)*floor(width/14) + 1",384]` |
| Saída concreta recebida | `[1,257,384]` |
| Embedding CLS | 384 dimensões, finito, não zero, norma `1.0000000000000007` |
| CPU Node | 138,3266 ms em `session.run`; carga 263,9409 ms |
| CPU Electron 44.5.1 / Node 24.21.0 | 138,7538 ms em `session.run`; carga 214,1425 ms |

Tempos são amostras reais desta execução, não benchmark agregado. Input: `C:\dev\ClickIT\FOTO A.png`. O doctor exigia incorretamente `pooler_output`, ausente no grafo; o worker já extraía CLS de `last_hidden_state`. A correção centralizou entrada/saída/shapes/preprocessing/mean/std/dimensão/provider em `src/ai/dinov2-contract.json`. O Embedder agora valida metadados, saída concreta e embedding. Doctor usa esse mesmo Embedder e exige inferência real; a validação não foi removida.

O probe Electron roda com `ELECTRON_RUN_AS_NODE=1`; confirmou SQLite, Sharp e ONNX no processo Node controlado, fora do renderer React. O aplicativo continua executando Embedder no worker de análise. O doctor também executou o worker de produção com Sharp/ExifTool/ONNX: 384D normalizado, foco global 51,8733638493423, regional 58,17586248580504 e exposição 98,91815185546875. O teste direto usa a imagem original e o worker usa seu preview JPEG; ambos compartilham o mesmo preprocessing DINOv2, mas os bytes das imagens diferem, portanto não se exige igualdade entre esses dois vetores.

### FaceLandmarker: causa do timeout e bloqueio observado

Instrumentação executada no probe original:

1. `process-start` em `2026-10-06T10:57:54.427Z`.
2. `app-ready-wait` em `2026-10-06T10:57:54.432Z`.
3. Timeout instrumentado em 30s; nenhuma importação MediaPipe/WASM/modelo/foto foi alcançada.

A espera era `await app.whenReady()` no nível superior do entry ESM. Isso criava uma dependência circular: Electron aguarda a avaliação do módulo antes de ready, e o módulo aguardava ready. Foi movida para uma função async chamada com `void main()`, permitindo concluir a avaliação do módulo. O comportamento de carregamento ESM antes de ready é descrito na [documentação Electron](https://www.electronjs.org/docs/latest/tutorial/esm).

Após a correção, `npm run face:test -- --photo "C:\dev\ClickIT\FOTO A.png"` foi efetivamente executado. [Log](evidence/face-test-current.log), [exit do comando](evidence/face-test-current.exit.txt). O Electron encerrou imediatamente com exit nativo `2147483651`, antes de ready, com:

```text
FATAL:electron\shell\browser\win\install_dir_access.cc:52
Sandboxed processes cannot read C:\dev\ClickIT\node_modules\electron\dist:
its ACL has an entry for an AppContainer package SID but none for ALL APPLICATION PACKAGES,
so Windows denies the sandbox token access.
```

O log também contém `os_crypt_win.cc:77 Failed to encrypt (0x2)`. O erro fatal de ACL é a evidência de abort atual; não foi tratado como WARN, nem confundido com falha do modelo. Não foram modificadas ACLs ou desativado o sandbox para contornar restrições da sessão.

O diagnóstico facial agora imprime timestamps e última etapa, com watchdog externo de 30s por etapa; roda em renderer Electron oculto/sandbox, CPU, sem Node polyfills. Instrumenta import MediaPipe, resolução WASM, FilesetResolver, leitura do `.task`, criação FaceLandmarker, fotografia, ImageBitmap, detect, retorno e fechamento. URLs de assets são absolutas e caminhos físicos partem de `import.meta.url`; o app mantém resolução dev/pacote existente. O teste exige >= 1 rosto, 478 landmarks finitos por rosto e encerramento normal. Ele não executa heurística de olhos.

**Tempo de inicialização MediaPipe: N/D. Inferência: N/D. Rostos: N/D. Landmarks: N/D.** Essas etapas não foram alcançadas nesta sessão. Confiança facial não é exposta pela API FaceLandmarkerResult; o diagnóstico informa null em vez de inventar score. Nenhuma aceitação positiva de FaceLandmarker foi registrada.

### Checks executados após as correções

| Comando | Evidência |
|---|---|
| `node scripts/models.mjs` | Ambos os modelos existentes passaram em tamanho/SHA-256; manifesto regenerado com contrato correto, sem download |
| `npm run doctor -- --photo "C:\dev\ClickIT\FOTO A.png"` | 43 PASS / 1 WARN / 1 FAIL, exit 1; [JSON](evidence/doctor-three-fixes.json) |
| `npm run lint` | PASS, exit 0; [log](evidence/lint-three-fixes.log) |
| `npm run typecheck` | PASS, exit 0; [log](evidence/typecheck-three-fixes.log) |
| `npm test` | PASS, 22 testes, 0 skipped; [log](evidence/tests-three-fixes.log). Inclui inferência real DINOv2 na FOTO A e rejeição de contrato incompatível |
| `npm run build` | PASS, exit 0; [log](evidence/build-three-fixes.log) |
| Assets MediaPipe do build | Seis arquivos JS/WASM em `dist/renderer/wasm` conferem byte a byte (SHA-256) com o pacote instalado; [relatório](evidence/face-assets-three-fixes.json). Isso valida cópia/caminhos, não execução do WASM |

Pendente: executar `face:test` em ambiente Electron com permissões compatíveis e confirmar os landmarks; depois repetir doctor para eliminar o FAIL restante. Os resultados anteriores abaixo são histórico, não o estado atual.

## Rodada anterior: infraestrutura de modelos — 2026-10-06

**BLOQUEADO por download HTTPS `EACCES` nesta sessão. Os cinco FAIL de modelos ainda não foram eliminados.** O Windows tem dependências instaladas, mas os subprocessos desta sessão não conseguiram acessar Hugging Face nem Google Storage. Não foi tentado contornar a restrição. Os registros abaixo substituem o estado dos relatos históricos posteriores.

Implementado: `models:setup` com catálogo fixado, hashes publicados e tamanho esperado, HTTPS inclusive redirects, download temporário, verificação antes do rename e reaproveitamento de arquivos válidos. Manifesto presente, pesos ausentes. Documentação completa de contratos/fontes/licenças em [MODELS.md](MODELS.md). Teste de inferência/similaridade e probe facial Electron preparados; não aprovados sem pesos.

| Execução efetiva | Resultado / evidência |
|---|---|
| `npm run models:setup` | FAIL nos dois downloads: `EACCES`; [log](evidence/models-setup-current.log) |
| `npm run doctor` | **36 PASS / 3 WARN / 5 FAIL**; [JSON](evidence/doctor-models.json) |
| `npm run doctor -- --photo "C:\dev\ClickIT\FOTO A.png"` | **37 PASS / 1 WARN / 7 FAIL**, exit 1; [JSON](evidence/doctor-models-photo.json) |
| Sharp na FOTO A | PASS real, nitidez global 51,8733638493423, regional 58,17586248580504, exposição 98,91815185546875 |
| `npm run models:test -- "FOTO A.png" "FOTO B.png"` | FAIL: DINOv2 ausente; [log](evidence/models-inference-attempt.log). Não houve embedding, repetição, cosseno ou contagem facial |
| `npm run lint` | PASS, exit 0; [log](evidence/lint-models.log) |
| `npm run typecheck` | PASS, exit 0; [log](evidence/typecheck-models.log) |
| `npm test` | PASS, 21 testes, zero falhas; [log](evidence/tests-models.log) |
| `npm run build` | PASS; [log](evidence/build-models.log); também recompilado pelo dev após alteração de olhos |
| Bundle do renderer do probe facial | Compilação esbuild executada com sucesso; não é inferência |
| `npm run dev` | FAIL, exit 1: Electron/Crashpad `not connected`; [log](evidence/dev-models.log). GUI não aprovada |

Fotos fornecidas pelo usuário no projeto: `FOTO A.png` (retrato frontal), `FOTO B.png` (câmera/objetos). Inspeção visual confirmou conteúdos distintos; isso não substitui medições neurais. Originais não modificados. O teste gera a variante A apenas em diretório temporário após validação dos modelos.

Dimensão contratada DINOv2: **384**, dimensão medida: **N/D**. Tempo CPU: **N/D**. Similaridades: **N/D**. Rostos detectados: **N/D**, não zero, pois inferência não ocorreu. Hashes/tamanhos do manifesto são referências publicadas, ainda não confirmação de arquivos locais.

Os testes unitários novos verificam segurança do instalador e a regra de olhos (abstenção/margem de confiança); não simulam inferência nem comprovam acurácia. OPEN/CLOSED/UNCERTAIN requer avaliação separada em fotos rotuladas. Nenhuma rejeição automática foi adicionada.

Para concluir: executar o setup em terminal com HTTPS permitido, repetir `models:test` com as duas fotos e ambos os doctors, depois os checks e dev. Corrigir qualquer incompatibilidade medida antes de marcar PASS. Não houve empacotamento comercial.

## Histórico anterior (não representa o ambiente atual)

**Resultado histórico: BLOQUEADO. O MVP não estava validado nem pronto para distribuição.**

## Adendo — preparação para validação local

Foram adicionados [LOCAL-SETUP.md](LOCAL-SETUP.md), `npm run doctor` e seus probes, sem alteração nas funcionalidades do aplicativo. O doctor foi executado neste ambiente: **9 PASS, 4 WARN, 31 FAIL**, com dependências/modelos ausentes explicitamente reportados. [Relatório JSON](evidence/doctor-current.json). Os probes com bibliotecas ausentes não puderam ser validados no caminho de sucesso; a GUI e a inferência MediaPipe permanecem verificações manuais.

A suíte passou com **19/19 testes, zero falhas/pulados** após incluir três testes do diagnóstico: SQLite real persistido, rejeição de fotografia inexistente e rejeição de argumentos incompletos. A sintaxe dos dois scripts doctor passou no `node --check`. Lint/typecheck/build continuam bloqueados pela ausência de dependências. O restante deste documento preserva os resultados da rodada anterior (16 testes), não representa validação integral nova.

Verificação em 05/10/2026, Windows_NT 10.0.26200, win32/x64. Nenhuma funcionalidade nova ou alteração visual nesta rodada. Foram criados scripts de validação e evidências. O lint foi ajustado para excluir somente fixtures geradas em `.test-tmp`; nenhuma regra foi desabilitada. `AbortSignal` foi declarado como global nativo para os scripts.

## ITEM | STATUS | EVIDÊNCIA

PASS se aplica somente ao escopo explicitado. PARCIAL não representa aceitação do aplicativo. BLOCKER indica que não foi possível executar a etapa.

| ITEM | STATUS | EVIDÊNCIA |
|---|---|---|
| Ambiente | PASS | Node v24.21.0, npm 11.19.0, Windows x64; pnpm não encontrado. [environment.json](evidence/environment.json) |
| Escrita no projeto e cache | PASS | Arquivos temporários criados e excluídos nos dois diretórios; npm gravou logs. [environment.json](evidence/environment.json) |
| npm install | **FAIL / BLOCKER** | `npm install --verbose`, exit 1, EACCES no fetch de metadados HTTPS, antes de postinstall. [debug integral](evidence/npm-install-debug.log) |
| Diagnóstico de rede | **FAIL / BLOCKER** | `connect EACCES 104.16.6.34:443`, errno -4092; IPv6 também registra ENETUNREACH. [stack completo](evidence/network.log) |
| Imports declarados | PASS estático | Nenhum pacote importado sem declaração; nenhum import relativo inexistente. [imports.json](evidence/imports.json) |
| Compatibilidade efetiva dos pacotes | BLOCKER | Revisão documental abaixo; peers, lock e binários não foram resolvidos/instalados. |
| lint | BLOCKER | Exit 1, eslint ausente. **Warnings: não apurados; errors de lint: não apurados, não zero.** [lint.log](evidence/lint.log) |
| typecheck | BLOCKER | `tsc --noEmit`: exit 1, tsc ausente. **Quantidade de erros TypeScript não apurada.** [typecheck.log](evidence/typecheck.log) |
| tests | PASS limitado | **16 testes, 16 aprovados, 0 falhas, 0 pulados, 0 cancelados**; runner 282,67 ms. Não cobre integrações ausentes. [test.log](evidence/test.log) |
| Renderer build | BLOCKER | Exit 1, `ERR_MODULE_NOT_FOUND: esbuild`; Vite não iniciou. [build.log](evidence/build.log) |
| Electron build | BLOCKER | Mesmo erro antes de compilar main/preload/workers. [build.log](evidence/build.log) |
| Electron dev | BLOCKER | `npm run dev`, exit 1, falta esbuild; nenhuma janela aberta. [dev.log](evidence/dev.log) |
| Electron startup | BLOCKER | `npm start`, exit 1, electron ausente. [start.log](evidence/start.log) |
| Janela / DevTools / preload / IPC / assets / logo | BLOCKER | Não observados em execução. Nenhuma confirmação de ausência de erro fatal ou tela branca. |
| SQLite | PASS backend | SQLite 3.53.4; banco em disco fechado/reaberto, dados preservados. [native-smoke.json](evidence/native-smoke.json) |
| Importação real | PARCIAL | Pipeline.index indexou 3 PNGs reais da marca em 3,26 ms; não é ensaio com 20–50 fotografias pela UI. [native-smoke.json](evidence/native-smoke.json) |
| Thumbnail real | BLOCKER | Sharp ausente; nenhuma thumbnail do pipeline de produção gerada. |
| Seleção / favorita / estrelas / rejeição | PARCIAL | Store.decide real: seleção, favorita, 5 estrelas, rejeição e revisão persistiram após reabrir SQLite. UI não testada. [native-smoke.json](evidence/native-smoke.json) |
| Export originals | PASS backend | 1 PNG original copiado, SHA-256 idêntico; recursos visuais originais intactos. [native-smoke.json](evidence/native-smoke.json) |
| Reabrir app sem perder projeto | PARCIAL | Reabertura do SQLite comprovada; Electron não executado. |
| Download de modelos | **FAIL / BLOCKER** | Falha no primeiro fetch de metadados do Hugging Face: `connect EACCES 3.174.27.45:443`. [models.log](evidence/models.log) |
| ONNX inference | BLOCKER | onnxruntime-node e dinov2-small.onnx ausentes; zero inferências executadas. |
| Face detection | BLOCKER | Pacote/WASM/face_landmarker.task ausentes; zero inferências MediaPipe executadas. |
| Eyes detection | BLOCKER | Depende da mesma inferência MediaPipe; nenhum resultado real de olhos obtido. |
| Similarity | BLOCKER | Nenhum embedding real; não existem valores medidos de 2 fotos parecidas versus 1 diferente. Testes de vetores explícitos não substituem a inferência. |
| Nitidez / exposição | PARCIAL | Funções reais de quality.ts executadas em pixels dos 3 PNGs; heurísticas, não redes neurais. Valores abaixo. Não valida Sharp ou acurácia fotográfica. |
| Performance — 100 fotografias | BLOCKER | Conjunto fotográfico ausente e pipeline indisponível; tempos e RAM deste cenário são N/D. |
| Windows package | BLOCKER | Gate verify-models falhou com ENOENT do manifesto. Empacotamento não iniciado porque as etapas anteriores falharam. [verify-models.log](evidence/verify-models.log) |
| Executável independente do dev | BLOCKER | Nenhum executável gerado para testar. |

## Diagnóstico exato do EACCES

### npm

- Comando: `npm install --verbose`.
- Executável: `C:\Program Files\nodejs\node.exe`.
- CLI: `C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`.
- CWD: `C:\Users\jasso\OneDrive\Documents\jobs\ClickIT`.
- Fase: obtenção de metadados pelo npm/minipass-fetch. As 21 consultas registraram EACCES; o erro final reporta `https://registry.npmjs.org/@eslint%2fjs`.
- Frames completos preservados no [debug npm](evidence/npm-install-debug.log), incluindo minipass-fetch/lib/index.js:130:14, ClientRequest.emit, _http_client e processTicksAndRejections.
- Um fetch diagnóstico do Node ao mesmo endpoint identificou **syscall connect, IPv4 TCP/443**, incluindo `104.16.6.34:443`. Todos os endereços/frames estão em [network.log](evidence/network.log).
- **Não existe caminho de arquivo responsável por esse EACCES: o recurso recusado é a conexão de rede.** A sugestão genérica do npm sobre arquivos/antivírus não foi tomada como causa comprovada.
- Não chegou ao postinstall do Electron, ONNX Runtime, MediaPipe ou Sharp. Nenhuma inferência participou desse erro. Foi npm, não pnpm.

### Modelos

- Comando: `npm run models` → `node scripts/models.mjs`.
- Primeiro acesso: `https://huggingface.co/api/models/onnx-community/dinov2-small`.
- Erro: TypeError fetch failed, AggregateError EACCES, `connect EACCES 3.174.27.45:443`, além de outros IPv4 e IPv6 sem rota. [Stack completo](evidence/models.log).
- O script falha na consulta da revisão, antes de abrir `.partial`, baixar pesos ou alcançar o host MediaPipe. Não é uma falha observada de gravação de modelo.

### Permissões e limpeza

- Cache: `C:\Users\jasso\OneDrive\Documents\jobs\ClickIT\.npm-cache`.
- Prefixo: `C:\Users\jasso\AppData\Roaming\npm`; não é o destino desta instalação local.
- ACL: proprietário JARVIS\jasso; Modify para CodexSandboxUsers; também há uma ACE Todos Deny DeleteSubdirectoriesAndFiles. [Projeto](evidence/project-acl.log), [cache](evidence/cache-acl.log). Não se presume permissão de remoção recursiva com base na ACL.
- Teste efetivo de criar/excluir um arquivo temporário passou no projeto e cache. O npm também conseguiu escrever seu debug log.
- Não há node_modules nem package-lock.json. Nada foi removido: não existe evidência de corrupção justificando apagar cache ou lock.
- Instalação nova executada **sem --ignore-scripts**; falhou antes de chegar aos scripts.
- A configuração da sessão declara rede restrita e proíbe escalonamento de permissões do sandbox. O erro é compatível com essa restrição. Não foi identificado um produto específico de firewall/antivírus. Não se alteraram ACLs, regras do sistema ou rede; não foi usado sudo/administrador.

## package.json e compatibilidade

Auditoria completa dos imports de src, scripts e configurações: [imports.json](evidence/imports.json). Nenhuma declaração ausente. A auditoria estática não comprova resolução de versões pelo registry.

| Grupo | Pacotes | Avaliação |
|---|---|---|
| dependencies — UI | react, react-dom, @fontsource/inter | Usados pelo renderer/fontes locais. |
| dependencies — análise | sharp, exiftool-vendored, onnxruntime-node, @mediapipe/tasks-vision | Necessários aos módulos reais de imagem/EXIF/IA. |
| devDependencies — desktop | electron, electron-builder | Electron usado para desenvolvimento e incorporado ao executável; builder somente para distribuição. |
| devDependencies — build | vite, @vitejs/plugin-react, esbuild, tailwindcss, @tailwindcss/vite | Vite para renderer; esbuild para main/preload/workers. |
| devDependencies — qualidade | typescript, eslint, @eslint/js, typescript-eslint, @types/node, @types/react, @types/react-dom | Tipagem/lint. |
| SQLite | node:sqlite | Built-in do Node. Não falta better-sqlite3; testes executaram SQLite real. |

Compatibilidade documental:

- [Electron 44.5.1](https://releases.electronjs.org/release/v44.5.1) incorpora Node 24.21.0, igual ao Node local. Falta executar node:sqlite e módulos nativos dentro do Electron.
- [Vite 8 e plugin-react 6](https://vite.dev/blog/announcing-vite8) são a combinação publicada; Node 24 satisfaz os requisitos. Configurados Vite ~8.3.0 e plugin ^6.0.0.
- React/ReactDOM compartilham ^19.1.0, tipos 19, TypeScript ^5.9.0. Resolução real de versões/peers pendente.
- [Sharp](https://sharp.pixelplumbing.com/install/) fornece Windows x64/Node-API; configuração ^0.34.3. Carga binária no Electron ainda não testada.
- [ONNX Runtime Node](https://onnxruntime.ai/docs/get-started/with-javascript/node.html) oferece Windows x64 CPU; configuração ^1.22.0. DLL e execução do modelo não testadas.
- [MediaPipe Face Landmarker Web](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) usa WASM/modelo no renderer isolado. Pacote 0.10.35 declarado. Protocolo local/CSP ainda precisam ser exercitados.

Nenhuma versão foi alterada nesta rodada. Não há lock reproduzível, árvore instalada ou confirmação de compatibilidade integral.

## Inventário físico dos modelos

Diretório `C:\Users\jasso\OneDrive\Documents\jobs\ClickIT\resources\models`: existe e está **vazio**. [Inventário capturado](evidence/model-directory.log).

| Função | Caminho esperado | Tamanho aproximado | Presença |
|---|---|---|---|
| Embeddings DINOv2 small | resources/models/dinov2-small.onnx | 88,5 MB, conforme [repositório do modelo](https://huggingface.co/onnx-community/dinov2-small/tree/main/onnx) | AUSENTE — BLOCKER |
| Rostos/landmarks/blendshapes | resources/models/face_landmarker.task | Ordem de 3–4 MB; não medido localmente | AUSENTE — BLOCKER |
| Olhos | Mesmo face_landmarker.task | Incluído no bundle acima | AUSENTE — BLOCKER |
| Integridade | resources/models/manifest.json | Poucos KB | AUSENTE — BLOCKER |
| Runtime WASM | node_modules/@mediapipe/tasks-vision/wasm → public/wasm | Vários arquivos JS/WASM; não medidos | AUSENTE — BLOCKER |
| Estética | Nenhum arquivo previsto | Não se aplica | NÃO IMPLEMENTADO; score null |

O [bundle MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/index) inclui detector, malha facial e blendshapes. Não existe um modelo independente de olhos na implementação.

Downloads ocorrem explicitamente em `npm run models`, durante instalação, com revisão/SHA-256 registrados. Build copia WASM local, sem baixar pesos. package:win verifica manifesto e inclui resources/models em extraResources. O app não baixa modelos em runtime. Downloads de binários durante instalação npm ainda não foram alcançados. Nenhum arquivo/modelo fake foi criado.

## IA e heurísticas: implementação versus execução

| Módulo | Código | Natureza | Executado? |
|---|---|---|---|
| Similaridade | src/ai/embedding.ts: Embedder.load/run, InferenceSession.create/run; src/ai/grouping.ts: cosine/group | DINOv2 neural + comparação de vetores/regras | Inferência NÃO; regras testadas com vetores explícitos |
| Rostos | src/ai/face-host.ts: FaceLandmarker.createFromOptions/detect | MediaPipe neural, CPU/WASM | NÃO |
| Olhos | src/ai/face-host.ts: eyeBlinkLeft/Right + thresholds/tamanho mínimo | Saída neural + regra heurística | NÃO |
| Nitidez | src/ai/quality.ts: sharpness/regionalSharpness | Laplaciano/distribuição regional; heurística | SIM, em pixels dos PNGs reais abaixo |
| Exposição | src/ai/quality.ts: exposure | Proporção de pixels nos limites de luminância; heurística | SIM, mesmas entradas |

Para validar somente as funções de métricas, um helper externo ao produto decodificou os PNGs existentes com Windows System.Drawing, lado máximo 256. **Isso não valida nem substitui Sharp.** Não são fotografias de um ensaio, não são testes de inferência neural e não demonstram acurácia artística.

| Input real | Dimensões analisadas | Foco global | Foco regional | Exposição | Tempo das métricas |
|---|---|---|---|---|---|
| ID VISUAL 01.png | 256 × 192 | 64,74 | 73,05 | 98,89 | 8,66 ms |
| ID VISUAL 02.png | 256 × 144 | 69,20 | 73,85 | 99,73 | 4,97 ms |
| LOGO CLICK IT.png | 256 × 144 | 73,26 | 85,71 | 6,64 | 4,33 ms |

[Valores completos e tempos de decodificação](evidence/quality-real-assets.json). A exposição baixa da logo reflete áreas pretas/brancas; não expressa qualidade artística. Nenhum valor real de similaridade neural foi obtido.

## Fluxo funcional e performance: alcance real

O inventário do projeto encontrou os três PNGs e a cópia da logo, sem conjunto fotográfico. [local-images.log](evidence/local-images.log). O smoke backend copiou os três PNGs para uma pasta isolada, chamou Pipeline.index, Store.decide, fechou/reabriu SQLite e chamou exportPhotos real. Não chamou worker de inferência, não gerou thumbnails e não exerceu React/IPC.

- Indexação de 3 PNGs: 3,26 ms.
- Exportação de 1 original: 4,32 ms.
- Pico RSS do processo Node desse smoke: 68,75 MiB, via process.resourceUsage().maxRSS; não é RAM do Electron/pipeline completo.
- SHA-256 do original exportado e da cópia: `f8b4b7c1b9e047e8a9193d7fec800b8231351b7bcb5cd22890de6f88c33759fc`.
- Identidade original preservada; hashes dos três recursos conferidos antes/depois.
- Teste manual de 20–50 fotografias: **não realizado**.
- Benchmark de 100 fotografias: **não realizado**. Importação, thumbnails, análise e RAM deste cenário: **N/D**. Nenhuma extrapolação dos três PNGs; nenhuma duplicação para simular 100 fotografias.

## Reproduzir as evidências

```powershell
node scripts/validation-diagnostics.mjs
node scripts/validation-native-smoke.ts
./scripts/validation-decode.ps1
node scripts/validation-quality.ts
```

Os helpers não geram aprovação do MVP. Registram somente os escopos acima. A instalação foi executada separadamente com npm install --verbose. [Comandos/exit codes/tempos](evidence/commands.json).

## Bloqueios para continuar

1. Ambiente autorizado com acesso do Node/npm ao registry e aos hosts oficiais de modelos/binários. Esta sessão não permite conceder essa autorização ou elevar permissões.
2. Instalação completa, resolução dos peers/lock e obtenção/verificação dos pesos.
3. Lint/typecheck/test/build reais e correção dos erros encontrados. Nenhum resultado zero foi presumido.
4. Electron aberto e fluxo manual com 20–50 fotos reais, incluindo persistência e exportação.
5. Inferência neural e similaridade real; benchmark de pelo menos 100 fotografias.
6. Somente depois, empacotamento Windows e teste fora do ambiente dev.

**Definição de sucesso ainda não atendida. Não declarar o MVP concluído ou publicável com base nesta rodada.**

## NIMA oficial: conversão Docker, equivalência e inferência (2026-10-06)

O HDF5 oficial local `resources/models/weights_mobilenet_aesthetic_0.07.hdf5` foi verificado sem download: 13.174.216 bytes (PASS); SHA-256 `e563ad91b3d47410e45f7238f07ab8f6abd1bd0c4b18a4b0af9c681a21a91cb2`; Git blob SHA-1 `003fb321ce92445e41d708144a3656589f9214e7` (PASS, igual ao objeto do commit oficial); assinatura HDF5 (PASS). Abertura estrutural e carregamento dos pesos via Keras/`load_weights` no container Python 3.7.9/TF 2.0.0 (PASS). Arquitetura NIMA MobileNet oficial de 10 ratings reconstruída e carregada com os pesos oficiais (PASS).

Ambiente de conversão: Docker Desktop 29.8.2 funcional após subir o daemon (engine `desktop-linux`, 12 CPUs, ~3.7 GiB ao container). Imagem `clickit-nima-converter:tf2.0` construída por `scripts/models/Dockerfile.nima-converter` (Python 3.7.9-slim-buster + TF 2.0.0 + tf2onnx 1.9.3 + onnxruntime 1.10.0). O build inicial falhou porque os repositórios Debian buster saíram de `deb.debian.org`/`security.debian.org` para `archive.debian.org`; o Dockerfile foi corrigido para apontar apt ao archive e desabilitar `Check-Valid-Until`. Setup: `powershell -ExecutionPolicy Bypass -File .\scripts\models\setup-nima-converter.ps1` registrou modo `docker` em `.nima-converter-mode` (fallback `.tools/python37` não foi usado; Python 3.7 não foi instalado globalmente).

Conversão: `npm run nima:convert -- --images .tools/nima-images/img-1.png ... img-5.png` (as cinco fotos originais de `Imagens Teste` foram copiadas byte a byte para caminho sem espaço porque o npm/cmd perde aspas em paths com espaços; hashes conferem). O conversor revalidou tamanho/Git blob/assinatura do HDF5, construiu a arquitetura, carregou pesos, exportou ONNX com tf2onnx opset 13 e comparou as 10 probabilidades Keras × ONNX nas cinco imagens usando o mesmo preprocessing. Critério `allclose(rtol=1e-4, atol=1e-5)` e `maxAbs <= 1e-4`: **PASS**. maxAbs observado: -1 3.278e-07; -2 2.086e-07; -3 4.321e-07; -4 4.768e-07; -5 4.470e-07. Evidência: [nima-equivalence.json](evidence/nima-equivalence.json).

ONNX gerado: `resources/models/nima-mobilenet-aesthetic.onnx`. SHA-256: `b00e347d9b3cf6442d561b6b349732368c058a07416a2eda30a9acb21e2164db`. Tamanho: 12.842.030 bytes. Input: `image`, float32, shape `[1,224,224,3]`. Output: `dense`, float32, shape `[1,10]`. Opset 13, IR 7. Preprocessing: `tf.keras.applications.mobilenet.preprocess_input`; RGB `[0,255]` → `[-1,1]`; resize 224×224, interpolação Keras `nearest`. Manifesto `resources/models/manifest.json` atualizado com a entrada `nimaAesthetic` e o artefato de origem HDF5; inspeção via `onnx` no container confirmou opset/shapes/tipos.

Inferência isolada com `onnxruntime-node` (`npm run nima:test`) nas cinco fotos reais, com technicalScore associado por `docs/evidence/preference-signals-2026-10-06T13-05-51-937Z.json` (sem recalcular). **Preprocessing JS corrigido em 2026-10-06:** o resize nearest do runtime usava `floor(i * src / 224)` e divergia do PIL/Keras (`floor((i + 0.5) * src / 224)`), causando ~0.027 na média. A correção está em `scripts/nima-preprocess.mjs` (usado por `nima-test.mjs`); sem ajuste de modelo, score ou compensação pós-inferência.

Paridade de preprocessing (imagem real -1, 1448×1086): referência exportada pelo pipeline Keras/PIL no container em `tests/fixtures/nima-preprocess-reference.f32`. Tensor JS × Keras: **maxAbsDiff 5.91e-08**, **meanAbsDiff 1.75e-08** (tolerância 1e-06). Teste unitário `tests/nima-preprocess.test.ts` PASS. Três vias na mesma foto (Keras, ONNX Python, ONNX Node): maxAbsDiff keras×onnxPython `3.28e-07`, keras×onnxNode `2.83e-07`, onnxPython×onnxNode `1.49e-07` (tolerância distribuição 1e-04) — **PASS**. Evidência: [nima-preprocess-parity.json](evidence/nima-preprocess-parity.json).

Scores do pipeline Node corrigido (produção/intentado), evidência [nima-test-2026-10-06T15-45-49-156Z.json](evidence/nima-test-2026-10-06T15-45-49-156Z.json):

| Foto | technicalScore | nimaMean (1–10) | nimaStd | aestheticScore0to100 (apenas apresentação) |
|---|---|---|---|---|
| -1 | 80 | 5.250812 | 1.256201 | 47.2312 |
| -2 | 64 | 4.919547 | 1.288743 | 43.5505 |
| -3 | 70 | 5.085799 | 1.263809 | 45.3978 |
| -4 | 79 | 5.296261 | 1.266473 | 47.7362 |
| -5 | 77 | 5.388870 | 1.264889 | 48.7652 |

As médias Node agora coincidem com a evidência de equivalência Keras/ONNX (ex.: -1 `5.250812` vs Keras `5.250813`).

Distribuições completas `ratingDistribution[10]` (ratings 1..10) via pipeline Node corrigido:

- **-1** `[6.27e-7, 0.016825, 0.055833, 0.174112, 0.361062, 0.248203, 0.099660, 0.037724, 0.006533, 0.000047]`
- **-2** `[0.000005, 0.037094, 0.084858, 0.225028, 0.361418, 0.191743, 0.069202, 0.027196, 0.003416, 0.000039]`
- **-3** `[5.53e-7, 0.023535, 0.070263, 0.203111, 0.363518, 0.219001, 0.084553, 0.032155, 0.003842, 0.000020]`
- **-4** `[8.80e-7, 0.015458, 0.053397, 0.167845, 0.357146, 0.252611, 0.104090, 0.041417, 0.007935, 0.000098]`
- **-5** `[4.17e-7, 0.012321, 0.047319, 0.153330, 0.349539, 0.266955, 0.114517, 0.046343, 0.009595, 0.000081]`

Tabela comparativa diagnóstica (não incorporada ao ranking; sem combinação technicalScore + aestheticScore):

| Foto | technicalScore | nimaMean | nimaStd | aestheticScore0to100 |
|---|---|---|---|---|
| -1 | 80 | 5.250812 | 1.256201 | 47.23 |
| -4 | 79 | 5.296261 | 1.266473 | 47.74 |
| -5 | 77 | 5.388870 | 1.264889 | 48.77 |

`-4` e `-5` seguem com aestheticScore maior que `-1` após a paridade (sem compensação artificial). Ranking de produção, grouping, DINOv2, EAR, thresholds e lógica de decisão não foram alterados. `aestheticScore` permanece `null` no fluxo de produção. Os technicalScores anteriores seguem na evidência [preference-signals](evidence/preference-signals-2026-10-06T13-05-51-937Z.json). Registro anterior de bloqueio preservado em [nima-attempt-2026-10-06.json](evidence/nima-attempt-2026-10-06.json). Score do pipeline com preprocessing antigo preservado em [nima-test-2026-10-06T15-14-29-605Z.json](evidence/nima-test-2026-10-06T15-14-29-605Z.json) (não usar).

## Preferência experimental em duas camadas — 2026-10-06

Experimento **somente teste** (`scripts/experimental/`), nunca importado por `src/`. Ranking de produção, grouping, thresholds (inclusive 0,965), DINOv2, EAR, modelo NIMA e preprocessing **inalterados**. Evidência: [preference-ranking-experiment-2026-10-06T15-59-32-374Z.json](evidence/preference-ranking-experiment-2026-10-06T15-59-32-374Z.json) (hashes das três fontes: saturação, NIMA, sinais de preferência).

### Conceito

**Camada A — viabilidade técnica.** Classifica cada foto em tier usando apenas sinais/thresholds de produção existentes:

- `TECHNICALLY_WEAK`: olhos `CLOSED` quando existe outra foto do conjunto com olhos `OPEN`
- `REVIEW`: olhos `UNCERTAIN` (banda de abstenção EAR: `closedMax=0.18`, `openMin=0.25`) ou sem estado ocular utilizável com blur não-CLEAR
- `TECHNICALLY_GOOD`: olhos `OPEN` e `blur=CLEAR`
- `TECHNICALLY_ACCEPTABLE`: olhos `OPEN` com `blur=UNCERTAIN/DOF_POSSIBLE`, ou `blur=CLEAR` sem sinal ocular

Nenhum limiar novo foi inventado; reutiliza `thresholds.softFocus=27`, `thresholds.clearRegion=48`, EYES e as próprias classificações de blur do pipeline.

**Camada B — preferência estética.** Normalização fixa e generalizável do NIMA (não calibrada neste dataset, **não é probabilidade**):

`aestheticIndex = (nimaMean - 1) / 9 * 100` (nimaMean oficial 1–10 → 0–100, monotona)

`experimentalFinal = tierFactor × (wTech × technicalScore + wAes × aestheticIndex)`

**Ranking lexicográfico por tier** (A), depois `experimentalFinal` (B). `wAes = 0` em `REVIEW`/`WEAK`: estética não resgata tier inviável. `tierFactor`: GOOD=1,0; ACCEPTABLE=0,9; REVIEW=0,6; WEAK=0,4.

### Configurações de sensibilidade (fixadas antes de executar)

| Config | Nome | wTech/wAes em GOOD | wTech/wAes em ACCEPTABLE |
|---|---|---|---|
| A | conservadora (técnico domina) | 0,85 / 0,15 | 0,85 / 0,15 |
| B | balanceada | 0,65 / 0,35 | 0,65 / 0,35 |
| C | preferência (estética domina entre GOOD) | 0,25 / 0,75 | 0,70 / 0,30 |

### Tabela de auditoria (dados reais)

| Foto | tier | olhos | blur | technical | nimaMean | aesIndex | A final | B final | C final |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| -1 | GOOD | OPEN | CLEAR | 80 | 5,250812 | 47,2312 | 75,0847 | 68,5309 | 55,4234 |
| -4 | GOOD | OPEN | CLEAR | 79 | 5,296261 | 47,7362 | 74,3104 | 68,0577 | 55,5522 |
| -5 | GOOD | OPEN | CLEAR | 77 | 5,388870 | 48,7652 | 72,7648 | 67,1178 | 55,8239 |
| -3 | ACCEPTABLE | OPEN | UNCERTAIN | 70 | 5,085799 | 45,3978 | 59,6787 | 55,2503 | 56,3574 |
| -2 | WEAK | CLOSED | UNCERTAIN | 64 | 4,919547 | 43,5505 | 25,6000 | 25,6000 | 25,6000 |

Obs.: em config C o `experimentalFinal` de -3 (56,36) fica acima dos GOOD; a ordem final é mantida pelo ranking lexicográfico de tiers (porta da Camada A), não pelo escalar. Isso é intencional e documentado na evidência.

### Rankings e Pick por configuração

| Config | Ranking | Pick experimental | Mudou vs produção? |
|---|---|---|---|
| A | -1 > -4 > -5 > -3 > -2 | -1 | Não |
| B | -1 > -4 > -5 > -3 > -2 | -1 | Não |
| C | -5 > -4 > -1 > -3 > -2 | -5 | **Sim** |

- **A/B**: a vantagem técnica de -1 (80) sobre -5 (77) supera o ganho estético de +1,54 no aesIndex; NIMA diferencia -4/-5 dentro do tier GOOD mas não altera o Pick.
- **C**: com 75% de peso estético entre GOOD, -5 (nima 5,388870, a maior) vence -1; o desvio foi registrado como estava, sem ajuste de pesos para produzir -5.
- **-2 (CLOSED)** permanece último em todas as configs (Camada A + `wAes=0`), mesmo com `hasOpenAlternative=true`; **-3 (ACCEPTABLE)** nunca entra no top-3.
- Nenhuma config permite que nitidez um pouco menor perca para estética em tiers diferentes, nem que WEAK vença GOOD.

### Conclusões (seção 10 do experimento)

1. **NIMA traz informação distinta**: ordens de nitidez (tech: -1>-4>-5) e estética (nima: -5>-4>-1) divergem; em A/B a técnica decide, em C a estética decide — o sinal existe e é mensurável, não é redundante.
2. **Sensibilidade aos pesos é real**: o Pick muda apenas na config de preferência forte (C). Entre GOOD as diferenças são pequenas (aesIndex 47,2–48,8), então pesos intermediários (B) não bastam para inverter.
3. **Pronto para produção? Não.** 5 fotos AI de um único momento, sem preferência humana rotulada, sem validação cross-dataset; `wAes=0,75` e `tierFactor` são escolhas conceituais, não calibradas. Nenhuma mudança de produção é justificada por esta evidência.
4. Pendente para qualquer evolução: dataset maior com escolha humana explícita, avaliação de estabilidade do Pick sob variação de ±0,2 em nimaMean e teste em fotos com olhos `UNCERTAIN`/`DOF_POSSIBLE` reais.

Testes: `tests/experimental-preference-ranking.test.ts` (7 casos: mapeamento NIMA fixo, regras de tier, dominância A sobre B, pesos documentados, lexicografia de tiers, inversão A→C, decomposição das contribuições).

## Validação de ranking em 3 datasets controlados — 2026-10-06

Comando: `npm run ranking:validate -- --root "C:\dev\ClickIT\Validation Datasets"` (`scripts/ranking-validate.mjs`, adicionado ao `package.json`; gerador dos datasets em `scripts/build-validation-datasets.mjs` / `npm run datasets:build`). Modo: **somente validação** — ranking de produção, grouping, thresholds (inclusive 0,965), DINOv2, EAR, NIMA e pesos experimentais **inalterados**; nenhum código de `src/` foi modificado. `humanRank` é **excluído de toda a análise** e comparado somente depois que os rankings ClickIT existem (sem vazamento de dados); nesta execução todos os `humanRank` são `null`, portanto `humanTop1Match`/`humanTop3Containment` são `null` por construção.

Evidência agregada: [ranking-validation-summary.json](evidence/ranking-validation-summary.json). Por dataset: [composition-01](evidence/ranking-validation-composition-01-2026-10-06T17-04-02-004Z.json), [couple-event-01](evidence/ranking-validation-couple-event-01-2026-10-06T17-04-02-004Z.json), [portrait-expression-01](evidence/ranking-validation-portrait-expression-01-2026-10-06T17-04-02-004Z.json). A evidência congela todos os inputs (pesos, thresholds, EYES, contrato DINOv2, ordem de tiers, configurações A/B/C e SHA-256 dos manifestos).

### Datasets (labels = ground truth de validação, calculados com o pipeline de produção)

| Dataset | Fotos | Conteúdo | Labels |
|---|---|---|---|
| portrait-expression-01 | 7 | -1..-5 originais + desfoque(1,6) em -1 + recorte 92% de -4 | 4 technically-good, 1 closed-eyes, 2 soft-focus; 1 sequência |
| couple-event-01 | 7 | compostos de dois sujeitos (deslocamento/escala/fundo compartilhado); 04 usa rosto CLOSED de -2 | 6 technically-good, 1 closed-eyes; 1 sequência |
| composition-01 | 8 | variantes de -4: centrada, descentralizadas, recortes, extensões | 8 técnicamente boas (mesmo momento); 1 sequência |

Nenhum arquivo -6/-7 entrou: sem rosto detectável. Manifestos `dataset.json` têm `humanRank: null` em todas as 22 fotos.

### Resultados por dataset

| Dataset | Grupos | Ordem technicalScore (top→) | Ordem NIMA (top→) | Pick A | Pick B | Pick C | Pick produção |
|---|---|---|---|---|---|---|---|
| composition-01 | **5** | 07 > 06 > 02 > 01 > 03 > 04 > 05 > 08 | 05 > 06 > 08 > 07 > 04 > 03 > 01 > 02 | 07 | 06 | 06 | 04 |
| couple-event-01 | 1 | 06 > 01 > 02 > 03 > 05 > 07 > 04 | 06 > 03 > 02 > 05 > 01 > 07 > 04 | 06 | 06 | 06 | 06 |
| portrait-expression-01 | **2** | 01 > 04 > 07 > 05 > 03 > 06 > 02 | 07 > 05 > 01 > 04 > 03 > 06 > 02 | 01 | 07 | 07 | 01 |

Tabela agregada do comando (idempotente ao JSON):

| Dataset | A Pick | B Pick | C Pick | Human Pick | A Top3 | B Top3 | C Top3 |
|---|---|---|---|---|---|---|---|
| composition-01 | 07.png | 06.png | 06.png | null | 07 > 06 > 05 | 06 > 07 > 05 | 06 > 05 > 08 |
| couple-event-01 | 06.png | 06.png | 06.png | null | 06 > 03 > 02 | 06 > 03 > 02 | 06 > 03 > 02 |
| portrait-expression-01 | 01.png | 07.png | 07.png | null | 01 > 07 > 04 | 07 > 01 > 04 | 07 > 05 > 01 |

### Métricas (todas as 3 configs, todos os datasets)

- `closedEyesPenaltyCorrect`: **PASS em A, B e C nos 3 datasets** — toda foto `closed-eyes` fica estritamente abaixo de toda `technically-good` (02.png e 04.png sempre últimos; tier WEAK + `wAes=0` + fator 0,4).
- `softFocusPriorityCorrect`: **PASS em A, B e C nos 3 datasets** — todo `soft-focus` (tier ACCEPTABLE) fica abaixo de todo `technically-good`.
- WEAK/REVIEW como top1: **nunca**. Fraude estética (soft acima de good): **nunca**.
- `differentImagesOutsideSequence`: **1 PASS (couple-event-01) / 2 FAIL** — ver agrupamento abaixo.
- `humanTop1Match` / `humanTop3Containment`: **null** em A/B/C (0/0 avaliados) — anotação humana ainda não preenchida.

### Agrupamento (único critério não atendido)

- **couple-event-01: PASS** — os 7 compostos formam 1 grupo (fundos compartilhados mantêm similaridade ≥ limiar).
- **portrait-expression-01: FAIL** — 2 grupos: `01..06` juntos (inclusive a variante desfocada), `07.png` (recorte de 92% de -4) isolada.
- **composition-01: FAIL** — 5 grupos: `01,02,03,07` juntos; `04,05,06,08` isoladas. Recortes/extensões fortes da mesma cena caem abaixo do limiar.
- **Causa**: as imagens geradas não têm data EXIF, então todo par é avaliado com `visualOnlySimilarity = 0,965` (proximidade temporal inexistente → `pairThreshold` não baixa para 0,91). Não é regressão do grouping (código intocado); é o comportamento real de produção em pares sem data, e caracteriza os datasets sintéticos. Burst real com EXIF não é representado por estes recortes.

### Observações de consistência (seções 6/9 — sem tuning de pesos)

- A escolhe sempre o **top technical**; B/C escolhem o **top NIMA** quando o top técnico não domina nos dois sinais (composition: 07→06; portrait: 01→07). Em couple-event-01 as três configs convergem para 06 porque ela lidera os dois sinais simultaneamente (technical 82, NIMA 5,472741).
- Diferença entre configs existe e é limpa: `picksDifferAcrossConfigs = [composition-01, portrait-expression-01]`, nenhum em couple-event-01. Nenhuma inversão radical (tier nunca é ignorado).
- Config C (75% estético entre GOOD) não resgatou nenhum ACCEPTABLE/WEAK — a porta lexicográfica da Camada A se manteve em todos os datasets.

### Classificação: `READY_FOR_MORE_DATA`

Rubric aplicada pelo comando (registrada na evidência): `NOT_READY` = falha de comportamento; `READY_FOR_BETA_EXPERIMENT` = comportamento correto + agrupamento PASS nos 3 datasets + sem erros técnicos; `READY_FOR_MORE_DATA` = comportamento correto com agrupamento/erros pendentes (≥1 configuração consistente). Resultado: comportamento 100% correto (0 falhas em A/B/C), 0 erros técnicos, agrupamento 1/3 → **READY_FOR_MORE_DATA**. As três configurações são consistentes (`technicalFailures = 0` em A, B e C).

### Performance (execução registrada, 22 fotos)

| Métrica | Valor |
|---|---|
| Tempo total | 62,7 s (62.666 ms) |
| Média por foto | 3.247 ms (composition) / 2.700 (couple) / 2.361 (portrait) |
| Pipeline (index+analyze) | 16.830 / 15.258 / 15.238 ms |
| faceProbe (faceMs, inclui spawn Electron) | 15.523 / 8.634 / 7.605 ms (≈1,1–1,9 s/foto; dominante) |
| DINOv2 medição isolada (pós-análise, previews cacheados) | 2.980 / 2.492 / 2.700 ms (inferência pura: 2.816 / 2.321 / 2.577 ms) |
| NIMA ONNX (por foto, pré-processo + inferência) | 981 ms (8 fotos) / 1.060 (7) / 541 (7) → 77–151 ms/foto |
| RAM (aprox., soma WorkingSet64 node+electron a cada 1,5 s) | 952.209.408 bytes ≈ 908 MiB |
| maxRSS do processo node principal | 375.316 KB ≈ 366,5 MiB |

### Checks finais (sequenciais, nesta ordem)

| Comando | Resultado |
|---|---|
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm test` | PASS, **43/43**, 0 falhas/pulados |
| `npm run build` | PASS, exit 0 |

### Pendências

1. **Anotação humana**: preencher `humanRank` nos três `dataset.json` e reexecutar o comando — só então `humanTop1Match`/`humanTop3Containment` saem de `null` e a comparação A/B/C vs humano é avaliada.
2. **Agrupamento em datasets sintéticos sem data**: decidir se é aceito como caracterização (limiar 0,965) ou se merece investigação separada com fotos de burst reais; nenhuma mudança de threshold é justificada por esta evidência.
3. Mais dados antes de qualquer calibração de pesos: os 22 labels são sintéticos/derivados, não preferência humana.

## Preparação para beta com fotógrafos — 2026-10-06

### RAW real e preservação dos originais

Comando: `npm run raw:validate -- --dir "C:\Users\jasso\OneDrive\Documents\jobs\Plataforma para professores\Arquivos Editáveis"`.
Evidência: [RAW](evidence/raw-validation-2026-10-06T19-11-13-389Z.json).

| Formato | Arquivos reais | Resultado |
|---|---:|---|
| DNG | 2 | PASS |
| CR2 / CR3 / NEF / ARW | 0 por formato | NOT_TESTED |

Os DNGs PhotoTraces Manhattan Skyline (3.962.612 bytes) e Golden Gate Traffic (5.542.912 bytes) passaram na checagem do container TIFF, leitura EXIF, extração de `PreviewImage`, geração de preview/thumbnail/cache, embedding e análise de produção. As datas EXIF e câmeras Canon foram persistidas. Extração: **248,2 / 321,9 ms**; pipeline dos dois: **9,16 s**; exportação: **18,6 ms**, duas cópias, zero erros. SHA-256 original/exportado foi idêntico para ambos; hashes dos arquivos de origem antes/depois também foram iguais. Fixtures CR3 de 30 bytes não foram usadas como RAW real.

### Benchmark de volume

Comando: `npm run benchmark:photos -- --dir "C:\dev\ClickIT\.test-tmp\benchmark\pool"`.
Evidência: [benchmark](evidence/benchmark-photos-2026-10-06T18-26-26-569Z.json).

Pool de **82 arquivos-fonte**: 7 de Imagens Teste, 22 dos datasets de validação e 53 de Downloads. Com autorização do usuário, os volumes foram atingidos por hardlinks/cópias cíclicas documentadas, com nomes/caminhos distintos. Portanto mede throughput, persistência e memória de 100/500/1000 arquivos; não representa 1000 fotografias independentes. Cada tier usa banco/cache novos e o pipeline real, com concorrência 2, workers nativos e fila facial serializada.

| Arquivos | Análise total | Fotos/min | Média/foto | Face/foto* | RAM aprox. | Cache | Falhas |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 114,8 s | 52,3 | 1.148 ms | 1.119 ms | 1.012 MiB | 14,9 MiB | 0 |
| 500 | 508,9 s | 59,0 | 1.018 ms | 1.011 ms | 1.019 MiB | 69,2 MiB | 0 |
| 1000 | 1.276,7 s (21,3 min) | 47,0 | 1.277 ms | 1.273 ms | 1.215 MiB | 137,9 MiB | 0 |

Indexação: 115,7 / 647,8 / 1.134,7 ms. `filesPerMinute` no JSON mede indexação; `photosPerMinute` mede análise. Todos os arquivos ficaram DONE e com grupos persistidos. RAM é a soma aproximada de WorkingSet de node+electron, amostrada a cada 1,5 s, podendo incluir processos do host. Pico máximo observado: **1.273.839.616 bytes (~1,19 GiB)**.

| Tier | Amostra isolada | DINOv2 (pré-processo+inferência) | Inferência DINOv2 | NIMA | Preview sharp |
|---:|---:|---:|---:|---:|---:|
| 100 | 50 | 932,8 ms | 847,7 ms | 138,1 ms | 240,9 ms |
| 500 | 50 | 278,8 ms | 263,6 ms | 33,9 ms | 41,1 ms |
| 1000 | 50 | 245,9 ms | 204,1 ms | 71,3 ms | 52,5 ms |

Médias isoladas pós-análise, com aquecimento não cronometrado; não devem ser somadas ao tempo do pipeline. NIMA permanece experimental. *Face/foto inclui build do harness, abertura do Electron e inicialização do modelo por foto; é duração do diagnóstico, não inferência pura nem previsão direta de velocidade do app. Variação entre tiers é registrada, sem ajuste dos modelos.

O comando aceita `--sizes 3000` para uma etapa futura; **3000 não foi executado** nesta rodada.

### Cache e retomada

Evidências separadas: [cache](evidence/cache-test-2026-10-06T18-21-40-269Z.json) e [retomada](evidence/resume-test-2026-10-06T19-14-34-996Z.json).

| Execução de cache (100 arquivos) | Tempo de análise | Hits | Misses |
|---|---:|---:|---:|
| 1 — frio | 102,5 s | 0 | 100 |
| 2 — quente | 1,3 s | 100 | 0 |
| 3 — um arquivo alterado | 4,0 s | **99** | **1** |

Hit significa análise aproveitada sem nova preparação; agrupamento ainda é executado. A mutação remove apenas o hardlink da entrada gerenciada e cria um novo arquivo válido nessa entrada. SHA-256 da fonte antes/depois confirma preservação. Resultado **PASS**.

Retomada: cancelamento solicitado em ~30%, **31 DONE / 69 pendentes / 0 falhas**; nova instância de Store reabre o banco e reutiliza o mesmo projeto. Retoma **69** restantes, chega a **100 DONE**, persiste agrupamento e apresenta **duplicatesReprocessed=0**. Resultado **PASS**. O primeiro relatório de retomada rotulava pendentes como `failed`; foi substituído pela execução acima, que distingue corretamente PENDING de FAILED.

Reproduzir: `npm run benchmark:photos -- --dir "C:\dev\ClickIT\.test-tmp\benchmark\pool" --cache-test` ou `--resume-test`.

### Auditoria de agrupamento e sequência versus recorte

Comando: `npm run grouping:audit`. Evidência: [pares e grupos](evidence/grouping-audit-2026-10-06T18-34-40-163Z.json).

| Dataset | Pares | Conexões diretas | Near-misses (0,91–0,965) | Grupos guardados/recalculados |
|---|---:|---:|---:|---:|
| composition-01 | 28 | 3 | 14 | 5 / 5 |
| couple-event-01 | 21 | 20 | 1 | 1 / 1 |
| portrait-expression-01 | 21 | 11 | 10 | 2 / 2 |

Auditoria de consistência **PASS nos três**, usando o código de produção somente para leitura/cálculo. Isso não muda o resultado anterior de qualidade de agrupamento (1/3 sequências sintéticas em um único grupo). O JSON registra similaridade visual, delta de captura, threshold, conexão e grupos atuais/recalculados por conjunto de arquivos.

Uma sequência fotográfica real com duas datas de captura válidas a até 12 segundos usa limiar **0,91**; sem essa proximidade, usa **0,965**. Tempo sozinho nunca cria uma conexão. Os recortes/extensões artificiais não têm EXIF e não demonstram um burst real: o delta fica null e o limiar permanece 0,965. Não se força agrupamento desses recortes nem se reduz o threshold para satisfazer o dataset. Duplicatas exatas podem conectar por hash.

### Anotação humana, comparação e ausência de treinamento

Template por grupo: [`human-ranking-template.json`](../human-ranking-template.json), na raiz. Preencher `humanRank` como array de nomes do melhor ao pior, contendo todas as fotos daquele grupo. Arrays vazios significam pendente. `files` lista os membros disponíveis; `dataset` elimina ambiguidade entre nomes iguais. `groupId` é contexto histórico: a comparação corresponde pelo **conjunto de arquivos**, pois UUIDs mudam a cada execução.

Também há template por dataset em [`Validation Datasets/human-ranking-template.json`](../Validation%20Datasets/human-ranking-template.json), com ranks inteiros únicos de 1 a N ou null por arquivo. Ambos são lidos **depois** de calcular os rankings. Top1 compara o primeiro arquivo; Top3 verifica contenção; Spearman usa `1−6Σd²/(n(n²−1))` somente em ordenações completas, sem empates, com n≥2. Anotações incompletas têm Spearman null.

Verificação local da comparação: ordem idêntica dá ρ=1, inversa dá ρ=−1, parcial dá null, ranks duplicados são rejeitados e UUID diferente mantém correspondência por arquivos. Execução completa após o template por dataset: zero erros, CLOSED/soft-focus penalizados em A/B/C, WEAK/REVIEW nunca top1; classificação do experimento de ranking continua **READY_FOR_MORE_DATA**. Nenhuma anotação real foi preenchida: preferência humana permanece não avaliada.

Nenhum treinamento foi realizado. Respostas humanas não alimentam análise, pesos, thresholds ou modelos. A etapa fornece comparação informativa para o fotógrafo.

### Critério operacional: READY_FOR_PHOTOGRAPHER_BETA

| Critério | Resultado / alcance |
|---|---|
| RAW funciona nos formatos disponíveis | PASS — dois DNGs; demais formatos NOT_TESTED |
| Exportação preserva originais | PASS — cópias DNG com SHA-256 idêntico e fontes intactas |
| 1000 arquivos sem crash | PASS — 1000 DONE, zero falhas; replicação documentada |
| RAM controlada em host de 8 GB | PASS — pico aproximado 1,19 GiB de node+electron |
| Cache | PASS — quente 100/0, mutado 99/1 |
| Retomada e persistência | PASS — 69 retomadas, zero duplicatas reprocessadas, grupos salvos |
| Preservação de fotos nos fluxos testados | PASS — contagens completas, sem exclusão de fontes; hashes RAW preservados |
| CLOSED continua penalizado | PASS — todas as configs/datasets aplicáveis |
| WEAK não ganha por estética | PASS — nunca top1 |
| Erros críticos de persistência/exportação | Nenhum observado nas execuções registradas |

**Resultado operacional: READY_FOR_PHOTOGRAPHER_BETA para o escopo validado**, com checks finais aprovados. Evidência agregada: [critério de beta](evidence/photographer-beta-readiness.json). Não exige concordância perfeita de preferência humana. O resultado não certifica formatos RAW ausentes nem 1000 imagens independentes; esses alcances continuam pendentes. A classificação experimental de ranking é uma métrica separada e permanece READY_FOR_MORE_DATA.

### Checks de fechamento

Executados sequencialmente após as alterações desta etapa:

| Comando | Resultado |
|---|---|
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0 |
| `npm test` | PASS, 43/43, zero falhas/pulados |
| `npm run build` | PASS, exit 0 |

Nenhum processo temporário desta validação ficou ativo. Próxima ação: fotógrafo preencher as anotações humanas e executar `ranking:validate`; ampliar posteriormente a coleção independente e os formatos RAW disponíveis.

## Infraestrutura sintética de escala — 2026-10-06

**Classificação desta rodada: BLOCKED.** O gerador, a indexação e a exportação foram verificados; o benchmark completo não pôde executar porque o Electron abortou ao iniciar o renderer em sandbox neste ambiente. Esta rodada não substitui nem amplia os resultados operacionais anteriores.

Implementados `npm run dataset:scale -- --source "CAMINHO_BASE" --output "CAMINHO_SAIDA" --count 1000 --seed 20261006` e `npm run benchmark:scale -- --dir "CAMINHO_SAIDA"`. Instruções, fórmulas, política de memória e limitações em [SCALE-VALIDATION.md](SCALE-VALIDATION.md).

O gerador suporta 100/500/1000/3000/5000 fotos, usa seed uint32, distribui 12 transformações controladas e registra origem, parâmetros, grupo verdadeiro e SHA-256 por arquivo. Produz uma imagem por vez, com cópias independentes e sem modificar as fontes. A reprodutibilidade exige os mesmos arquivos-base e versões dos codecs registradas no manifesto.

### Evidência obtida nesta rodada

Fontes: sete PNGs já existentes em `Imagens Teste`; não constituem acervo profissional independente. Seed: **20261006**. Datasets em `.test-tmp/scale-data-100`, `scale-data-500` e `scale-data-1000`. Escalas 3000/5000 suportadas, não geradas.

| Escala | Arquivos gerados e hashes verificados | Indexados no Store real | Análise concluída | Exportação COPY idêntica |
| --- | --- | --- | --- | --- |
| 100 | 100 | 100 | 0 — bloqueada | 12/12 |
| 500 | 500 | 500 | 0 — bloqueada | 12/12 |
| 1000 | 1000 | 1000 | 0 — bloqueada | 12/12 |

Regeneração independente: **100/100 e 1000/1000 arquivos idênticos**, incluindo manifestos idênticos entre pastas diferentes. Os 1600 arquivos dos três lotes principais tiveram SHA-256 conferido; as sete fontes permaneceram intactas. Evidência: [scale-generation.json](evidence/scale-generation.json).

O SHA-256 de **36 arquivos em `src/` e `resources/models/`** foi comparado antes/depois: sem alteração. Nenhuma UI, ranking, pesos, modelo, agrupamento, NIMA, DINOv2, EAR ou threshold ocular de produção foi modificado. O build foi regenerado pelo check solicitado.

### Bloqueio observado e limites

Nas três tentativas finais, o host facial Electron encerrou com código **2147483651**. A mensagem fatal em `electron/shell/browser/win/install_dir_access.cc:52` informa que `C:\dev\ClickIT\node_modules\electron\dist` possui uma entrada ACL de AppContainer sem a entrada `ALL APPLICATION PACKAGES` necessária para acesso pelo sandbox. Nenhuma ACL foi alterada e o sandbox permaneceu habilitado.

Por isso, throughput do pipeline, tempos de inferência, agrupamento, cold/warm, invalidação e retomada de 1000 imagens **não foram medidos**. Os picos registrados nas tentativas abortadas representam apenas inicialização, não RAM sob carga nem ausência de memory leak. Campos sem execução ficam nulos/NOT_RUN/BLOCKED. A exportação foi executada separadamente, sobre um subconjunto indexado, com o serviço real `exportPhotos` e comparação de bytes.

O harness está preparado para executar o Pipeline/Store/workers reais com dois workers e renderer facial persistente, cronometrar chamadas, reabrir processos entre cold/warm e retomada, conferir integridade SQLite e exportação, e comparar agrupamento contra o manifesto somente depois da análise. NIMA é uma medição auxiliar usando a implementação experimental existente: o pipeline de produção atual não o inclui. Seu resultado nunca entra no ranking; seu custo adicional entra no tempo do harness.

Retomada planejada no harness: cancelamento seguro perto de 30%, fechamento completo e reinício em outro processo, com comparação dos IDs DONE. Não cobre perda de energia durante transação. A classificação READY exige medições completas; os testes unitários de orquestração não substituem esse ensaio.

### Artefatos e checks

- [Manifesto da escala 1000](evidence/scale-dataset-manifest.json).
- Benchmarks [100](evidence/scale-benchmark-100.json), [500](evidence/scale-benchmark-500.json) e [1000](evidence/scale-benchmark-1000.json), incluindo erro nativo, PID, indexação e amostras de RAM da inicialização.
- [Cache](evidence/scale-cache.json): não executado; `expectedMisses=1`, `actualMisses=null`.
- [Retomada](evidence/scale-resume.json): bloqueada; contagens nulas.
- [Exportação](evidence/scale-export.json): 36/36 comparações idênticas.
- [Classificação agregada](evidence/scale-summary.json): BLOCKED.

Checks via `npm.cmd` (o PowerShell deste ambiente bloqueia o wrapper `npm.ps1`): lint PASS, typecheck PASS, testes **46/46 PASS**, build PASS. Os três testes novos verificam geração/reprodutibilidade e proteção de origem, métricas conhecidas de merge/split e equivalência de resultados entre o worker original e o observador de tempos. Nenhum deles é evidência de preferência estética.

Próximo passo operacional: executar novamente os três benchmarks em um ambiente onde o Electron instalado consiga iniciar seu renderer em sandbox. Até lá, não classificar como READY_FOR_SCALE_BETA nem inferir precisão artística deste corpus.

## Correção exclusiva do harness — 2026-10-06

Esta seção substitui a orientação anterior de executar as três escalas: a sequência autorizada agora é **3 → 10 → 100**, avançando somente com PASS. Nenhum benchmark 500/1000 foi executado nesta correção.

### Diagnóstico e implementação

Os relatórios locais anteriores registram todas as fotos FAILED por `Face host encerrou code=0 signal=null`, embora o progresso tenha chegado ao total. Na implementação anterior, o fechamento de `readline` sobre `process.stdin` chamava `app.quit()` sem solicitar SHUTDOWN. Esse caminho produz encerramento antecipado com código 0. **Não foi possível confirmar que esse foi o evento disparador na execução local anterior**, pois ela não registrava o ciclo de vida; a reprodução instrumentada neste ambiente encontrou um bloqueio de ACL antes de READY.

O host foi desacoplado de stdin: usa um canal IPC local dedicado, handshake, READY, ANALYZE_FACE com ID, RESPONSE do mesmo ID e SHUTDOWN com ACK. Mantém um Electron, um renderer e um modelo por lote. Registro de spawn, conexão, modelo/renderer, mensagens, foto, início/fim de inferência, resposta, espera, pedido de shutdown, app.quit/app.exit, fechamento de renderer/IPC, exceções e saída do processo. Stdout, stderr e log interno síncrono ficam no workspace para preservar o motivo mesmo durante fechamento.

O harness agora registra `indexed`, `prepared`, `analysisStarted`, `done` e `failed`. Progresso é DONE+FAILED, identificado como tentativas encerradas. DONE/FAILED finais são lidos do Store; nenhuma string READY/COMPLETED da rotina é tratada como prova de sucesso. Saída 1 com erro reportado é falha controlada, não crash automático. Classificação exige todos os requisitos PASS para allComplete; retomada BLOCKED e requisitos NOT_MEASURED bloqueiam aprovação sem se tornarem FAIL.

RAM separada em nodeRss/electronRss/totalRss, fases startup/steady-state/shutdown e pico. A amostra Electron é invalidada no evento exit; desconexão ou expiração tornam a parcela desconhecida. Nenhuma conclusão de leak é emitida. Workers, concorrência 2, modelos, resolução, cache e implementação NIMA ficaram inalterados.

### Resultado da validação

O smoke foi tentado com três imagens, inclusive após trocar o transporte. Resultado final: **BLOCKED**. Host iniciado uma vez, zero requests, zero responses, saída **2147483651**, signal null. O stderr contém `FATAL:electron/shell/browser/win/install_dir_access.cc:52`, informando que a ACL da instalação Electron impede acesso pelo renderer em sandbox. Aqui há evidência explícita de abort nativo; isso não reclassifica como crash o antigo encerramento local com código 0.

| Etapa | Estado | DONE | FAILED | Tempo de pipeline | Host starts / requests / responses | Unexpected exits | RAM sob carga |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Smoke 3 | BLOCKED antes de READY | N/A | N/A | NOT_MEASURED | 1 / 0 / 0 | 1 | NOT_MEASURED |
| Cold 10 | NOT_RUN: smoke não passou | N/A | N/A | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |
| Cold 100 | NOT_RUN: etapa 10 não executada | N/A | N/A | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED | NOT_MEASURED |

Portanto, **o critério DONE > 0 ainda não foi demonstrado**. Nenhuma ACL foi alterada nem sandbox desativado. A validação funcional do protocolo persistente com inferência real permanece pendente até o ambiente permitir o smoke; os testes unitários não substituem essa validação.

Evidências: [smoke](evidence/scale-face-smoke.json) e [consolidação da correção](evidence/scale-harness-repair.json). Relatórios anteriores de 100/500/1000 foram preservados como histórico, sem novos benchmarks e sem reescrever seus resultados.

Checks após a correção: **lint PASS, typecheck PASS, 50/50 testes PASS, build PASS**. Quatro testes novos cobrem estados de saída, classificação com retomada bloqueada, invalidação/expiração de memória e IDs do protocolo (incluindo respostas desconhecidas, repetidas ou de tipo errado). Comparação SHA-256 antes/depois dos 36 arquivos em `src/` e `resources/models/`: **inalterados**. Build regenerado apenas pelo check solicitado; nenhuma UI ou lógica de produção editada.


## Empacotamento e instalador beta (win-unpacked + NSIS) â€” 2026-10-07

ValidaÃ§Ã£o do aplicativo empacotado (`release/win-unpacked`) com banco e armazenamento isolados (`--user-data-dir`) e sem modificaÃ§Ã£o em produÃ§Ã£o. Fluxo completo automatizado por CDP com apoio de automaÃ§Ã£o UIA para os diÃ¡logos nativos de seleÃ§Ã£o de pasta. EvidÃªncia: [beta-installed-flow](evidence/beta-installed-flow-2026-10-07T11-50-29-044Z.json) e log do fluxo em `.test-tmp/flow-last.log`.

Resultado do fluxo (7 fotos reais, origem `Imagens Teste`): **33/33 PASS** â€” criaÃ§Ã£o de projeto, importaÃ§Ã£o com previews, anÃ¡lise com Pick persistido (agrupamento 5+1+1 -> 3 grupos, um Pick por grupo), inspector com score real, 12 filtros, busca, decisÃµes (selecionar/rejeitar/favoritar/estrelas/revisar), atalhos X/A/G/EspaÃ§o, comparaÃ§Ã£o, persistÃªncia apÃ³s reabrir, exportaÃ§Ã£o COPY byte-identical (SHA-256, 3/3) e lista JSON vÃ¡lida com 3 fotos, sem erros de console/exceÃ§Ã£o/IPC.

- Auditoria de race: troca/rÃ¡pida de projeto e `refreshRequest`/`currentProject` reproduzida via `.test-tmp/race-test.mjs`; a guarda existente cobre consistentemente; nenhuma correÃ§Ã£o necessÃ¡ria [evidÃªncia](evidence/project-switch-race-2026-10-07T09-32-24-178Z.json).
- Instalador gerado com `electron-builder --win --x64` (26.15.3): `release/ClickIT Setup 0.1.0.exe` (313,5 MB, NSIS, oneClick=false, per-user, caminho alterÃ¡vel) e portable `release/ClickIT 0.1.0.exe` (313,3 MB). NSIS/recursos baixados pelo prÃ³prio builder para o cache (falhas EACCES/EPERM anteriores nÃ£o se repetiram).
- InstalaÃ§Ã£o limpa silenciosa testada: setup extrai para caminho isolado; exe instalado abre (home, renderer, sem erros), cria projeto pelo diÃ¡logo nativo e importa as 7 fotos corretamente; zero erros de console/exceÃ§Ã£o no CDP.
- Racional dos diÃ¡logos: helper UIA (`dialog-pick.ps1`) trata janelas nativas `#32770` aninhadas sob a janela do app (BFS, profundidade <=6); commit via `BM_CLICK` no botÃ£o padrÃ£o; navegaÃ§Ã£o por endereÃ§o com foco verificado (Alt+D em diÃ¡logo de abertura; clique no breadcrumb id=1001 em diÃ¡logo salvar/exportar) e leitura de volta da faixa de endereÃ§o. Nunca envia Enter sem confirmaÃ§Ã£o de foco.
- Caveats conhecidos: sem Ã­cone de aplicativo (nenhum `.ico` em `build.win`), usa o Ã­cone padrÃ£o do Electron â€” cosmÃ©tico para o beta; assinatura feita com o certificado de teste local (Warning de assinatura, esperado). RAW CR2/CR3/NEF/ARW seguem NOT_TESTED (sem insumos reais). ValidaÃ§Ã£o funcional de escala com inferÃªncia contÃ­nua continua pendente de ambiente menos restritivo (histÃ³rico acima).
- Fechamento: **lint PASS, typecheck PASS, 56/56 testes PASS, build PASS** (`npm run check`). Nenhum arquivo em `src/` ou `resources/models/` foi alterado nesta etapa; todas as mudanÃ§as foram restritas a `.test-tmp/` (drivers e helper de teste). Nenhum processo temporÃ¡rio permanece ativo.

---

# LICENSING 0.1.0 - Resultado (2026-10-07)

Sistema de licenciamento concluido de ponta a ponta e validado.

## Escopo validado
- Ativacao do desktop (gate de workspace) contra a License API real (Ed25519, tokens assinados).
- Offline: revalidacao em ~7 dias e grace offline de 30 dias (VALID_OFFLINE -> GRACE_EXPIRED).
- Reativacao da mesma maquina nao consome vaga; deactivate remove a linha de ativacao.
- Limite de devices (maxDevices=2; 3o device bloqueado), revogacao de licenca e de device.
- Bypass CLICKIT_DEV_LICENSE ignorado em build empacotado.
- Chave privada nunca no pacote; renderer sem chave material; storage DPAPI (safeStorage).
- Allowlist de internet no main (somente o origin da License API).

## Suites
- Unit + E2E de licenca (servidor HTTP e SQLite reais, sem mocks): 26 casos.
- Suite completa: 84/84 PASS (lint, typecheck, testes, build).
- E2E desktop empacotado (win-unpacked) 8/8 PASS:
  1 tela de ativacao em instalacao limpa
  2 IPC protegido (projects negado antes da ativacao)
  3 chave invalida rejeitada
  4 chave valida ativa e abre o workspace
  5 license.bin cifrado (sem key/ID em claro)
  6 reabre offline com workspace
  7 bypass DEV ignorado no app empacotado
  8 artefato sem private key / keypair dev
- Instalador real (NSIS): instalado silenciosamente e confirmada a tela de ativacao.

## Verificacoes finais dos artefatos
- release/ClickIT Setup 0.1.0.exe (313,5 MB) e release/ClickIT 0.1.0.exe portable (313,3 MB) gerados.
- app.asar sem "BEGIN PRIVATE KEY" e sem referencia a dev-keypair.json.

## Nota operacional (maquina de dev)
- Para o NSIS nesta maquina foi aplicado patch local em
  node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js: no Windows o harvest do
  uninstaller usa UninstallerReader (leitura de bytes) em vez de spawn de .exe GUI
  recem-gravado (erro "spawn UNKNOWN"). Reversivel em proxima install de dependencias.

## Classificacao
LICENSING_READY_FOR_BETA

---

## Estabilizacao do empacotamento - 2026-10-07

### Patch reproduzivel

- Substituida a dependencia de edicao manual por patch em
  `patches/app-builder-lib-26.15.3-nsis.json`, aplicado por
  `scripts/apply-nsis-patch.mjs` no `postinstall`.
- Versoes exatas verificadas: electron-builder **26.15.3** e app-builder-lib **26.15.3**.
  Nenhuma atualizacao do electron-builder nesta tarefa.
- Arquivo modificado pela instalacao:
  `node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js`.
- No Windows, extrai o uninstaller com `UninstallerReader.exec(installerPath, uninstallerPath)`
  em vez de executar o intermediario GUI que falhava com `spawn UNKNOWN`.
- Aplicacao idempotente; falha com exit code 1 em divergencia de versao ou de trecho.
- Motivo, procedimento de instalacao e remocao futura: `docs/PACKAGING.md`.

### Reinstalacao e verificacoes executadas

1. `Remove-Item -LiteralPath C:\dev\ClickIT\node_modules -Recurse -Force`: PASS.
2. `npm.cmd ci --no-audit --no-fund`: PASS; postinstall reaplicou o patch automaticamente.
3. `node scripts/apply-nsis-patch.mjs --check`: PASS.
4. `npm run lint`: PASS.
5. `npm run typecheck`: PASS.
6. `npm test`: **85/85 PASS**, incluindo teste isolado do patch, idempotencia e falhas por drift.
7. `npm run build`: PASS.
8. `npx electron-builder --win --x64`: PASS; NSIS e portable regenerados.

### Artefatos e licenciamento

- NSIS: `release/ClickIT Setup 0.1.0.exe`, 328745952 bytes.
- Portable: `release/ClickIT 0.1.0.exe`, 328516402 bytes.
- Portable executado com dados novos e `CLICKIT_DEV_LICENSE=1`: PASS.
  Estado UNACTIVATED, tela de ativacao presente, workspace ausente e projects:list negado.
- app.asar extraido diretamente de ambos os executaveis: identico por SHA-256
  `1e8263746decd93420b2ace784f792d4cfe811bbe041547fee3a28cec73259c5`.
  Guard de licenca presente; sem chave privada e sem referencia ao keypair dev.
- **Instalacao/execucao NSIS: BLOCKED nesta rodada.** O Windows recusou executar
  o Setup com a mensagem de politica de Controle de Aplicativo. A geracao do NSIS
  e a inspecao do payload passaram; nao equivalem a validar a instalacao real.
- A mensagem atual de politica explica o spawn UNKNOWN desta tentativa de execucao;
  nao determina retroativamente a causa exata da falha anterior do build.

Evidencia: `docs/evidence/packaging-reproducibility-2026-10-07.json`.
Proxima acao: validar instalacao real deste NSIS em ambiente Windows autorizado
pela politica de Controle de Aplicativo. Sem alteracoes em licenciamento, IA,
ranking, grouping, pipeline de selecao ou UI principal nesta etapa.

## Branding (2026-10-07)

- Fonte oficial do icone: build/symbol.png (ClickIT icon.png, 1254x1254,
  transparente, azul da marca ~38/99/252). Sem upscaling; escopo: simbolo so.
- scripts/generate-icon.mjs gerou build/icon.ico com entradas PNG
  16/24/32/48/64/128/256 em canvas 256 transparente (simbolo 86% centralizado).
  --check OK (reproduzivel): SHA-256 ecaa73405d893d3a2aa870465f9b5e273dd2004537075fc8a72c03bdd2af3bad.
- package.json: build.win.icon build/icon.ico; nsis.shortcutName ClickIT.
  productName ClickIT, appId com.clickit.desktop, author ClickIT (CompanyName
  deriva do author; nenhum nome legal/publicador foi inventado).
- npm ci (postinstall reaplicou patch NSIS), lint, typecheck, 85/85 testes,
  build e electron-builder --win --x64: PASS.
- Artefatos com o novo icone (2026-10-07):
  - NSIS ClickIT Setup 0.1.0.exe: 329041767 bytes, sha a6aa23352e8f6ed92a2de57721e9bc50dcdd8ada8a10cb47515a852c0090e084
  - Portable ClickIT 0.1.0.exe: 328720765 bytes, sha 045be4f0fd8a3bf52e9246013942cf6f50f6e3e555c372c21693788b1e6e35ca
  - win-unpacked ClickIT.exe: 245803520 bytes, sha f2149985fc7dc222596f9b8bc9489a93e8c4263c217ebe3d81e66b6bc9f27fb1
- app.asar identico entre NSIS e portable (1e8263746decd93420b2ace784f792d4cfe811bbe041547fee3a28cec73259c5),
  sem chave privada/dev-keypair/licensing sources, guard presente.
- Portable novo com CLICKIT_DEV_LICENSE=1: PASS. UNACTIVATED, tela de ativacao,
  home ausente, projects:list negado ("Ative sua ClickIT...").
- Icone extraido (Icon.ExtractAssociatedIcon) dos 3 executaveis: 32x32 azul da
  marca (avgRGB 18/139/249, blueishRatio 1.0). ProductName=ClickIT,
  CompanyName=ClickIT, FileVersion=0.1.0; FileDescription descricao do projeto
  (setup/portable) e ClickIT (app exe); InternalName ClickIT no app exe.
- Configurado conforme escopo: sem mudancas em licenciamento, IA, ranking,
  grouping, pipeline de selecao ou UI principal. Sem tray. BrowserWindow usa
  o icone do exe empacotado.
- Instalacao/execucao NSIS: permanece BLOCKED nesta maquina (Controle de
  Aplicativo). Uninstaller nao executado localmente.

Classificacao: BRANDING_READY_FOR_BETA (execucao real do NSIS permanece
ENVIRONMENT_BLOCKED nesta maquina; validar instalacao e desinstalacao em
Windows autorizado). Evidencia atualizada:
docs/evidence/packaging-reproducibility-2026-10-07.json.

## Suporte RAW (2026-10-07)

- Nenhum arquivo RAW real encontrado nesta maquina (busca by extensao, somente
  leitura: Pictures/OneDrive Pictures/Desktop/Documents/Downloads/C:\dev/E:\).
  Unico .CR3 existente e fixture sintetico de 30 bytes (ASCII) no .test-tmp.
- npm run raw:validate -- --dir "...": OK, 5/5 formatos NOT_TESTED
  (cr2, cr3, nef, arw, dng). Nada simulado/criado; NOT_TESTED nao reprova.
  Evidencia em docs/evidence/raw-validation-2026-10-07T14-55-33-191Z.json.
- Classificacao: nao e possivel declarar RAW_READY_FOR_BETA sem arquivos reais.
- Caminho de codigo verificado por inspecao (sem execucao em RAW real):
  - preview embutido JpgFromRaw/PreviewImage/OtherImage + cache (services/preview.ts);
  - originalPath nunca substituido; analise/DINOv2/EAR/NIMA/grouping sobre o preview;
  - export = copia byte-a-byte com verificacao de integridade (services/export.ts);
  - pares RAW+JPEG nao emparelhados; dedupe apenas por hash exato de bytes;
  - UI usa thumbnail/preview do cache e zoom de RAW via preview.
- Checks: lint PASS, typecheck PASS, 85/85 PASS, build PASS. Zero codigo alterado.
- Proxima acao: quando houver RAWs reais, rodar
  npm run raw:validate -- --dir "CAMINHO" e declarar RAW_READY_FOR_BETA se PASS.

## Fase A do módulo Editar — 2026-10-07

**Classificação: PHASE_A_READY.**

- Contratos reais em `src/editing/types.ts`; versões centralizadas em
  `src/editing/config.ts`. CRUD no Store, validadores/fingerprint/lifecycle
  separados. Nenhuma geração/aplicação de ajustes é executada.
- Migração v1→v2 aditiva e idempotente das tabelas `editing_profiles`,
  `editing_plans`, `reference_images`, com transação e rollback de DDL/version.
- `tests/editing-schema.test.ts` extrai o schema do commit/tag
  `clickit-beta-0.1.0` via `git show`, cria banco isolado equivalente e prova
  preservação integral de projects/photos/photo_analysis/photo_decisions,
  referências de cache e bytes do arquivo original.
- 18 testes novos: migração/round-trip/reabertura/vazios legados;
  profileVersion e STALE por evento/leitura; ordem canônica de propriedades;
  fingerprint sem timestamps/paths; range/enums/versões; lifecycle inválido;
  engineVersion/hash/path/fingerprint divergentes; refs BEFORE/AFTER;
  FKs inválidas, exclusão explícita e rollback real de migração.
- Planos são criados somente DRAFT com arrays vazios e generatedAt=null.
  Geração e exportação não são simuladas por transições de status;
  histórico das transições é preservado. Perfil com dependentes não é apagado.
- Comparação com a tag Beta: nenhum diff em `src/services/pipeline.ts`,
  `export.ts`, `preview.ts`, `src/ai`, `src/main` ou `src/renderer`.
  Store recebe apenas integração de persistência/migração e hooks de validade.
- Checks executados sequencialmente: `npm.cmd run typecheck` PASS;
  `npm.cmd run lint` PASS; `npm.cmd test` **103/103 PASS** (85 anteriores +
  18 novos); `npm.cmd run build` PASS. Os testes existentes de importação,
  análise, picks/decisões, cache/retomada, exportação byte-idêntica e licenciamento
  continuaram passando.
- Nenhum novo IPC exposto; não foi necessário alterar guards ou preload.
  Futura exposição IPC deve reutilizar o guard de licença `owner`.
- Sem questionário, UI, XMP, edição automática ou nova IA. Fase B não iniciada.

## Fase B do módulo Editar — 2026-10-07

**Classificação: PHASE_B_READY.**

- Questionário determinístico em `src/editing/questionnaire.ts`: 7 etapas
  (Nome e intenção → Luz e exposição → Cor → Contraste e tons → Textura →
  Estilo geral → Revisão), 15 sliders cobrindo todos os campos `q`, 6 conceitos
  cobrindo todos os campos `c`; `newStyleProfile`, `quantitativeAnswer`,
  `conceptualAnswer`, `describeSlider` e `styleSummary` (resumo "Seu estilo
  tende a: …" reproduzível). Conceitos `c` continuam intenção semântica — sem
  números derivados nesta fase.
- Gestão de referências em `src/editing/references.ts`: importação por diálogo
  nativo ou cópia de arquivo; individuais `REFERENCE` ou pares `BEFORE`/`AFTER`
  adicionados juntos (mesmo `pairId`); miniatura via protocolo
  `clickit://reference/<id>?v=<fingerprint>` (`no-store`); referência ausente
  marcada "Referência indisponível" sem quebrar o perfil; par atômico;
  original jamais modificado. Duplicar perfil copia somente `q/c`, sem referências.
- IPC: 9 handlers (`editing:profiles:list/get/create/update/delete/duplicate`,
  `editing:references:list/add/remove`) todos atrás de `requireWorkspaceLicense`
  (`VALID`/`VALID_OFFLINE`); sem licença os 9 IPCs e o fetch de thumbnail são negados.
- UI: entrada "Editar" na navegação principal, `EditingWorkspace` com lista de
  perfis (profileVersion, resumo, nº de referências), wizard de 7 etapas,
  duplicar/excluir com confirmação, grade de referências com miniaturas/estados
  vazios e "Geração de edição · Em breve" sem geração real.
- `tests/editing-style.test.ts`: 8 casos PASS (cobertura do questionário,
  determinismo/limites, conceitos sem derivação, IPC e persistência, duplicação,
  par BEFORE/AFTER com arquivo ausente e atomicidade, bloqueio de licença nos
  9 IPCs). Suite final: **111/111 PASS** (85 Beta + 18 Fase A + 8 Fase B).
- Validação GUI em Electron real (`scripts/validate-editing-ui.mjs`):
  **PASS, 10 checks, 0 erros**; evidência `docs/evidence/editing-ui/validation.json`
  e 4 screenshots (estado vazio, wizard Cor no desktop/1000, perfis+referências).
  Fluxos: criar/questionário/revisão/salvar, reabrir/editar (profileVersion=2),
  duplicar, diálogo nativo + miniatura, par Antes/Depois, fechar/reabrir
  (persistência), referência indisponível, remover, confirmar exclusão e gate de
  ativação bloqueando todos os IPCs de edição e thumbnails sem licença.
- Checks sequenciais PASS: typecheck, lint, `npm test` 111/111, build.
  Nenhuma geração de plano, XMP, motor de edição ou preview/editado nesta fase.
- Próxima ação: aguardar autorização para Fase C.
