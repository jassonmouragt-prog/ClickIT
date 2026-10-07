# Modelos locais ClickIT

## Candidato revisado para avaliação estética — 2026-10-06

**NIMA MobileNet aesthetic (AVA) é o candidato preferido, mas não foi incorporado nem executado nesta rodada.** O projeto original `idealo/image-quality-assessment` declara Apache-2.0 para implementação e modelos treinados; essa licença permite uso comercial se seus avisos e condições forem mantidos. O modelo prediz uma distribuição de avaliações humanas em dez classes; a saída escalar pretendida é `sum(i * p[i])`, `i=1..10`. O upstream relata LCC 0,626 / SRCC 0,609 no AVA: evidência de um sinal aprendido, não garantia de corresponder à preferência de uma pessoa. [NIMA upstream, resultados e licença](https://github.com/idealo/image-quality-assessment), [documentação](https://idealo.github.io/image-quality-assessment/).

O espelho ONNX público `cromsc/nima-mobilenet-aesthetic` tem um commit visível de upload `9884a024f1f186109a52a111a99733f5b281e6d8`, arquivo `nima_mobilenet_aesthetic.onnx`, tamanho **12,9 MB**, SHA-256 publicado `c58b0c39b5b8f752b1b0ebf10e07e48406780ce3bf9d4647f8c43898748fe69c`. A página não tem model card nem licença explícita. Como ela não documenta conversão ou procedência do artefato, não copiamos, distribuímos, confiamos ou executamos esse ONNX, apesar de o upstream NIMA ser Apache-2.0. [Arquivo e SHA remotos](https://huggingface.co/cromsc/nima-mobilenet-aesthetic/blob/main/nima_mobilenet_aesthetic.onnx), [página do espelho](https://huggingface.co/cromsc/nima-mobilenet-aesthetic).

A alternativa independente Aesthetic Predictor V2.5 declara AGPL-3.0 e foi excluída porque incorporá-la exigiria assumir as obrigações dessa licença. [Repositório e licença V2.5](https://github.com/discus0434/aesthetic-predictor-v2-5).

**Contrato ONNX e hashes gravados em 2026-10-06 após conversão Docker.** O HDF5 oficial foi fornecido localmente e verificado; o ONNX foi convertido, equivalente ao Keras e executado em `onnxruntime-node`. Nenhuma incorporação no ranking de produção foi feita.

Scores separados no estado atual: `aestheticScore=null` sem inferência NIMA local verificada; `compositionScore=null` porque retângulos faciais brutos não formam score de composição validado; `expressionScore=null` porque os registros salvos têm apenas EAR e blendshapes de piscar, não gaze/boca/sorriso/pose. Esta auditoria não mudou análise nem ranking de produção.

## NIMA oficial MobileNet Aesthetic AVA — convertido e validado; não incorporado ao ranking

**Origem fixada:** repositório oficial `idealo/image-quality-assessment`, commit `dceaf7c2d218bc6e80b21d6e147e3b56a21b7f31` (commit assinado, 2019-11-08). Arquitetura: classe `Nima` do código oficial, MobileNet `include_top=False`, `pooling='avg'`, `Dropout(0.75)` da configuração estética AVA e `Dense(10, activation='softmax')`. Pesos HDF5: `models/MobileNet/weights_mobilenet_aesthetic_0.07.hdf5`, **13.174.216 bytes**. SHA-1 de Git blob oficial: `003fb321ce92445e41d708144a3656589f9214e7`. Arquivo local `resources/models/weights_mobilenet_aesthetic_0.07.hdf5`: **PASS tamanho**, **PASS SHA-1 oficial**, **PASS assinatura HDF5**, **PASS abertura/carregamento Keras dentro do container Python 3.7.9** (TF 2.0.0), SHA-256 real `e563ad91b3d47410e45f7238f07ab8f6abd1bd0c4b18a4b0af9c681a21a91cb2`. [Commit e árvore oficiais](https://github.com/idealo/image-quality-assessment/tree/dceaf7c2d218bc6e80b21d6e147e3b56a21b7f31), [pesos/configuração](https://github.com/idealo/image-quality-assessment/tree/dceaf7c2d218bc6e80b21d6e147e3b56a21b7f31/models/MobileNet), [construtor](https://github.com/idealo/image-quality-assessment/blob/dceaf7c2d218bc6e80b21d6e147e3b56a21b7f31/src/handlers/model_builder.py), [gerador de avaliação](https://github.com/idealo/image-quality-assessment/blob/dceaf7c2d218bc6e80b21d6e147e3b56a21b7f31/src/handlers/data_generator.py).

**Licença:** o repositório upstream declara Apache-2.0 e contém os pesos AVA no mesmo repositório licenciado. É a licença declarada pelo fornecedor do artefato; a redistribuição comercial é permitida sob os termos da Apache-2.0, incluindo preservação de licença/avisos aplicáveis. Manteremos atribuição e cópia da licença junto aos avisos de terceiros da ClickIT. [LICENSE no commit fixado](https://github.com/idealo/image-quality-assessment/blob/dceaf7c2d218bc6e80b21d6e147e3b56a21b7f31/LICENSE).

**Contrato observado no código oficial (Keras):** input NHWC `[batch,224,224,3]`, RGB float, carregamento `load_img(target_size=(224,224), interpolation='nearest')`; `MobileNet.preprocess_input` transforma valores RGB `[0,255]` em `[-1,1]`. A saída Keras tem 10 probabilidades softmax para ratings AVA 1–10. A média é `sum(p_i * i), i=1..10`; desvio é `sqrt(sum(p_i*(i-mean)^2))`. Exibição 0–100: `(mean-1)/9*100`. O máximo de classe não é usado como score.

**Contrato ONNX efetivo (inspecionado no artefato gerado):** entrada `image`, float32 `[1,224,224,3]`; saída `dense`, float32 `[1,10]`; opset 13; IR 7; um input e um output. Preprocessing documentado no manifesto: `tf.keras.applications.mobilenet.preprocess_input`; RGB `[0,255]` → `[-1,1]`; resize 224×224 com interpolação Keras `nearest`.

**Conversão executada em 2026-10-06 (Docker):** `scripts/models/convert-nima-to-onnx.py` consome o HDF5 já presente; não baixa o peso nem faz checkout do repo. O script reconstitui a arquitetura auditada, confere tamanho/Git blob SHA-1/assinatura HDF5, carrega os pesos via `model.load_weights` e só publica ONNX, evidência e manifesto após equivalência. Config e hashes das fontes oficiais estão em `scripts/models/nima-source.lock.json`. Dependências ficam fora do runtime em `scripts/models/requirements-nima-conversion.txt`. Docker Desktop 29.8.2 disponível no Windows; imagem `clickit-nima-converter:tf2.0` (Python 3.7.9 + TF 2.0.0 + tf2onnx 1.9.3) construída por `scripts/models/Dockerfile.nima-converter`. O Dockerfile aponta os repositórios apt de buster para `archive.debian.org` (repositórios EOL removidos de deb.debian.org). Modo gravado em `.nima-converter-mode`: `docker`. Conversão ONNX usa tf2onnx/opset 13; compara cada uma das 10 probabilidades em CPU contra Keras usando as mesmas imagens. Critério: `allclose(rtol=1e-4, atol=1e-5)` e máximo absoluto `<=1e-4`.

**Resultado da conversão e equivalência:** ONNX publicado em `resources/models/nima-mobilenet-aesthetic.onnx`. SHA-256 do ONNX: `b00e347d9b3cf6442d561b6b349732368c058a07416a2eda30a9acb21e2164db`; tamanho: 12.842.030 bytes. Equivalência Keras/ONNX nas 5 fotos: **PASS**. maxAbs observado por foto: 3.28e-07 (-1), 2.09e-07 (-2), 4.32e-07 (-3), 4.77e-07 (-4), 4.47e-07 (-5); todos muito abaixo da tolerância 1e-4. Evidência: [nima-equivalence.json](evidence/nima-equivalence.json).

**Execução com `npm run nima:convert`:** o npm/cmd do Windows perde as aspas em paths com espaços (`Imagens Teste\...`), e o conversor rejeita args fragmentados. As cinco fotos originais foram copiadas byte a byte para `.tools/nima-images/img-1.png`…`img-5.png` (caminho sem espaço) e passadas como `--images`; os hashes SHA-256 conferem com os originals. O peso HDF5 não foi baixado novamente.

**Estado desta execução:** conversão, validação e paridade de preprocessing NIMA concluídas (Docker funcional, HDF5 carregado pelo Keras, ONNX gerado, equivalência medida, ONNX executado em `onnxruntime-node` nas cinco fotos, preprocessing JS alinhado ao PIL/Keras). Correção de paridade: o runtime JS usava `floor(i*src/224)`; o PIL/Keras usa `floor((i+0.5)*src/224)`. Módulo compartilhado `scripts/nima-preprocess.mjs` + teste `tests/nima-preprocess.test.ts`; paridade do tensor: maxAbsDiff `5.91e-08`, meanAbsDiff `1.75e-08`; três vias (Keras/ONNX Python/ONNX Node) na mesma foto com maxAbsDiff ≤ `3.28e-07`. Ainda **não há incorporação no ranking de produção** e **não há combinação technicalScore + aestheticScore**. `aestheticScore` segue `null` no fluxo de produção. DINOv2, agrupamento, threshold 0.965, EAR, thresholds oculares, saturação de sharpness e ranking técnico permanecem intocados.

## Estado em 2026-10-06

**Pesos instalados e hashes verificados; DINOv2 validado por inferência real em Node e Electron.** O doctor atual registrou 43 PASS, 1 WARN, 1 FAIL. A inferência facial ainda está bloqueada nesta sessão por ACL do executável Electron, antes de criar o renderer. Veja [VALIDATION.md](VALIDATION.md) e [doctor-three-fixes.json](evidence/doctor-three-fixes.json). Nenhum modelo foi substituído.

## Auditoria antes do download

### DINOv2

`src/main/index.ts` resolve `resources/models/dinov2-small.onnx` em desenvolvimento e `process.resourcesPath/models/dinov2-small.onnx` no pacote. `src/workers/analysis.ts` instancia `Embedder`; `src/ai/embedding.ts` carrega com `onnxruntime-node`, provider `cpu`, uma thread intra-op e uma inter-op.

Contrato real, lido via ONNX Runtime do arquivo instalado; configuração única em `src/ai/dinov2-contract.json`, consumida pelo Embedder de produção e pelo catálogo/manifesto. Doctor usa o mesmo Embedder, não uma segunda implementação:

- Entrada única `pixel_values`, float32. Metadados reais: `["batch_size","num_channels","height","width"]`, dimensões dinâmicas. Entrada concreta do aplicativo: NCHW `[1,3,224,224]`.
- Preprocessing: worker orienta a fotografia via EXIF e gera preview JPEG com lado máximo 1600, qualidade 88. Embedder redimensiona com Sharp `fit: outside`, menor lado 256, kernel padrão Lanczos3, recorte central 224 × 224 com coordenadas arredondadas para baixo.
- RGB em planos CHW, pixel / 255, mean `[0.485,0.456,0.406]`, std `[0.229,0.224,0.225]`.
- Saída única real `last_hidden_state`, float32. Metadados: `["batch_size","floor(height/14)*floor(width/14) + 1",384]`; tensor recebido em inferência `[1,257,384]`. Extrai-se apenas o token CLS (índice 0) e aplica-se normalização L2 para produzir 384 valores. **Não existe `pooler_output` neste export**: essa exigência incorreta era a causa dos FAIL no doctor e no probe Electron.
- O Embedder valida nomes, tipos e shapes dos metadados ao carregar, o tensor concreto ao inferir e a dimensão/valores finitos/norma do embedding. O doctor exige inferência em fotografia, além de sessão carregada. Metadados adicionais de produtor/opset/custom não são expostos pela interface `InferenceSession` utilizada; não foram presumidos.
- Correções desta rodada: conversão sRGB explícita para evitar interpretação incorreta de imagens em cinza/CMYK; orientação também no uso direto; kernel explicitado sem trocar o resize; rejeição de NaN/Infinity; liberação da sessão no teste.

O resize Lanczos3 existente não é uma reprodução bit a bit de implementações PIL bicúbicas. Foi preservado; nenhuma alegação de equivalência numérica a PyTorch foi feita.

### Face Landmarker

`src/ai/face-host.ts` roda em renderer Electron oculto, sandbox e isolamento de contexto, recebe `ImageBitmap` decodificado do preview e chama `detect`. `FilesetResolver.forVisionTasks('clickit://app/wasm')` usa recursos locais de `@mediapipe/tasks-vision@0.10.35`; `scripts/build.mjs` copia JS/WASM para `public/wasm` e o build os inclui no renderer. O modelo é servido por `clickit://models/face_landmarker.task`. URLs absolutas são compartilhadas em `face-options.ts`; não dependem do diretório de trabalho.

As opções existentes foram extraídas sem alteração para `src/ai/face-options.ts`, compartilhadas com o diagnóstico: delegate CPU, IMAGE, 20 rostos, blendshapes habilitadas, confiança mínima de detecção/presença 0,6. Tracking permanece no default do pacote, sem aplicação ao fluxo IMAGE.

O app não fornece tensores nomeados, mean/std ou resize manual ao FaceLandmarker: esse contrato pertence ao grafo Tasks. A [documentação do bundle](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) indica detector 192 × 192, FaceMesh 256 × 256 e entrada de blendshapes 1 × 146 × 2. Saída da API: 478 landmarks xyz normalizados por rosto e 52 coeficientes de expressão. Não há embedding de identidade. A inspeção dos tensores internos do arquivo ainda está pendente, não confundida com a auditoria do consumidor JS.

## Artefatos fixados

| Campo | DINOv2 | Face Landmarker |
|---|---|---|
| Modelo | Small ViT-S/14 FP32, sem classificador | Bundle float16 v1 |
| Autor | Meta AI; export ONNX Community/Xenova | Google MediaPipe |
| Versão | `ef1fb1005bfd7768839d18080f7038b403506f87` | `float16/1` |
| Finalidade | Embeddings visuais de 384 dimensões | Rostos, landmarks e blendshapes |
| Tamanho esperado | 88.532.934 bytes | 3.758.596 bytes |
| Licença | Apache-2.0 | Apache-2.0 |
| Tempo CPU medido | 138,33 ms Node; 138,75 ms Electron/Node | N/D: renderer bloqueado por ACL nesta sessão |
| Rostos detectados | Não se aplica | N/D: inferência não executada nesta sessão |

SHA-256 DINOv2:
`f22797eabf810a75e41de68d378541ebea372122b25c4ce3ef25ff618250c20a`

SHA-256 Face Landmarker:
`64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`

Os SHA-256 dos arquivos locais foram recalculados e conferem com os hashes publicados fixados no catálogo. O DINOv2 vem do [ponteiro LFS do repositório exportador](https://huggingface.co/onnx-community/dinov2-small/raw/main/onnx/model.onnx), que informa também o tamanho. Para MediaPipe, a referência inicial foi o [ponteiro de uma cópia publicada](https://huggingface.co/lithiumice/models_hub/blame/8a7b241f38e33d194a06f881a1211b3e7eda4edd/face_landmarker.task); não é assinatura do Google. A verificação atual confirmou os bytes instalados, sem alterar o hash para acomodar divergências.

Fontes dos pesos:

- [DINOv2 ONNX na revisão fixada](https://huggingface.co/onnx-community/dinov2-small/resolve/ef1fb1005bfd7768839d18080f7038b403506f87/onnx/model.onnx), derivado de [facebook/dinov2-small](https://huggingface.co/facebook/dinov2-small). É um export comunitário de DINOv2 real, não um ONNX oficial da Meta. Já existe export; não é necessária conversão PyTorch local/manual. A reprodução usa a URL imutável e o SHA-256, sem consultar `main` no setup.
- [Face Landmarker oficial Google v1](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task).

## Licenças e distribuição comercial

A [licença Meta DINOv2](https://github.com/facebookresearch/dinov2/blob/main/LICENSE) e os model cards Google de [BlazeFace](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf), [FaceMesh V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf) e [Blendshape V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf) indicam Apache-2.0. Não foi encontrada cláusula non-commercial nesses documentos.

A [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) permite uso/distribuição comercial sob suas condições: entregar cópia da licença, preservar atribuições e avisos aplicáveis, incluir NOTICE quando fornecido e indicar modificações. Isso não concede marcas ou certificação de qualidade. Antes de distribuir o executável, reunir esses textos/avisos no pacote e concluir os testes reais. Nenhum executável foi empacotado nesta rodada.

## Setup e verificação

`npm run models:setup` cria o diretório, verifica tamanho/SHA-256, preserva modelos válidos e baixa somente ausentes/inválidos. Usa HTTPS inclusive nos redirecionamentos, timeout, progresso e arquivo `.partial` único no mesmo diretório. Após flush/fechamento, relê e valida tamanho/hash e só então faz rename; em falha, remove seu temporário e mantém o destino anterior. Um processo abruptamente morto pode deixar `.partial`, que nunca é consumido como modelo. Não baixa pesos durante runtime/build.

`scripts/models.lock.json` fixa os artefatos; `src/ai/dinov2-contract.json` fornece o contrato DINOv2 único para gerar `resources/models/manifest.json`. O manifesto não é certificado de instalação. `verify-models`, `doctor` e `package:win` comparam o catálogo composto e verificam os arquivos; editar só o manifesto não aprova um modelo adulterado. `npm run models` continua como alias compatível.

## Inferência, similaridade e olhos

Diagnóstico facial isolado: `npm run face:test -- --photo "C:\dev\ClickIT\FOTO A.png"`. Executa somente um renderer oculto, CPU, sem React, sem polyfills de DOM no Node e sem heurística de olhos. Registra etapas de inicialização/import/WASM/modelo/foto/conversão/detect/retorno/fechamento e limite de 30 segundos por etapa, inclusive detect síncrono monitorado pelo processo pai. PASS exige rosto, 478 landmarks finitos e saída normal do processo. Confiança de detecção por rosto não é exposta por `FaceLandmarkerResult`; relatório usa null com explicação, nunca um score inventado. No app empacotado, o protocolo resolve modelos em `process.resourcesPath/models` e WASM no renderer compilado. No probe, caminhos absolutos partem de `import.meta.url` e são convertidos com `pathToFileURL`, incluindo espaços/backslashes.

O timeout original ocorria em `app.whenReady()` antes de importar MediaPipe: top-level await no entry ESM bloqueava a conclusão do módulo que o Electron aguarda antes de emitir ready. A espera agora ocorre em função async iniciada sem top-level await. Nesta sessão, isso revelou um abort nativo por ACL, registrado como FAIL explícito em vez de timeout ou WARN. Essa restrição não foi contornada desabilitando sandbox ou alterando permissões.

`npm run models:test -- "FOTO A.png" "FOTO B.png"` exige arquivos reais e pesos válidos. Gera uma variante temporária de A (brilho +3%, saturação −2%, JPEG 92), executa o Embedder de produção em A duas vezes, variante e B. Exige 384 valores finitos, vetor não nulo, repetição com diferença máxima ≤ 1e-6 e cosseno(A,variante) > cosseno(A,B). Registra valores medidos e tempos de preprocessing + inferência, sem limiares de similaridade fabricados.

Depois executa MediaPipe num renderer Electron real, com protocolo local, opções compartilhadas, sandbox e rede externa desabilitada; exige pelo menos um rosto e 478 landmarks finitos por rosto. A evidência é escrita em `docs/evidence/models-inference.json` apenas se tudo passar. `doctor --photo` testa também Sharp/métricas independentemente dos pesos e reporta detecção facial separadamente.

Olhos agora usam EAR geométrico por olho em `src/ai/eyes.ts`, com pontos e limites centralizados em `src/ai/eyes-config.ts`. `eyeBlinkLeft/Right` não decidem o estado. EAR usa distâncias 2D em pixels; CLOSED ≤ 0,18, OPEN ≥ 0,25, intervalo intermediário UNCERTAIN, pontos de operação provisórios. `leftEyeScore`/`rightEyeScore` são EAR bruto, com estados independentes. `eyesConfidence` é a margem heurística conjunta, **não probabilidade calibrada**. `npm run eyes:test -- --photo "FOTO A.png"` exige OPEN nos dois olhos e registra scores, pontos e tempos; `--expect CLOSED` permite validar posteriormente uma foto rotulada com olhos fechados. Veja [VALIDATION.md](VALIDATION.md) para a fórmula, índices e evidências efetivamente obtidas. FaceLandmarker funcionar não aprova olhos; a regra não rejeita automaticamente fotos nem reconhece identidade.
