# Validação sintética de escala

Esta infraestrutura valida volume, fila, persistência, cache, retomada, exportação, agrupamento e performance. **Não valida preferência estética humana, escolha de fotógrafo profissional ou qualidade artística final.** Réplicas e variações não equivalem a milhares de fotografias independentes.

## Gerar

```powershell
npm run dataset:scale -- --source "CAMINHO_BASE" --output "CAMINHO_SAIDA" --count 1000 --seed 20261006
```

Em PowerShell que bloqueia `npm.ps1`, usar `npm.cmd` nos mesmos comandos. Não é necessário alterar a política de execução.

Escalas permitidas: 100, 500, 1000, 3000 e 5000. Cada comando gera somente a escala solicitada. Source aceita JPEG/PNG, recursivamente; fontes com bytes idênticos são deduplicadas. O destino deve estar vazio e não pode conter a origem nem estar dentro dela. Links simbólicos não são percorridos. Originais não são modificados; cópias exatas usam cópia independente, nunca hardlink.

Há 12 transformações balanceadas por fonte: cópia exata, recompressão JPEG, dois crops, brilho aditivo, exposição multiplicativa, dois níveis de blur, resize, rotação de até 2°, contraste e nitidez. Predominam mudanças leves; crop e blur moderados são casos específicos. Os parâmetros e os hashes ficam em `dataset-scale-manifest.json`. Cada imagem é gerada individualmente; não se mantém o lote de pixels em RAM.

A ordem de fontes é determinística, a seed é uint32 e o manifesto não inclui horários nem caminhos absolutos. Reproduzir exige **mesmos bytes e nomes relativos das fontes, seed, quantidade e ambiente Sharp/libvips** registrado no manifesto. Trocar a versão do codec pode mudar bytes: comparar o ambiente e os hashes antes de atribuir uma diferença à seed.

O grupo verdadeiro significa “mesma imagem-base”. Fontes diferentes podem ter conteúdo visual parecido: false merge de proveniência não prova erro perceptual. Nomes gerados são neutros e não codificam grupos. Labels ficam exclusivamente no manifesto; o subprocesso de análise recebe apenas pasta, workspace e opções de medição. A comparação com labels acontece após a persistência dos grupos automáticos.

## Executar o benchmark

```powershell
npm run benchmark:scale -- --dir "CAMINHO_SAIDA"
```

Usar um diretório por escala. O comando valida os hashes e abre um workspace novo em `.test-tmp/scale-runs`, preservando tentativas anteriores. Exige os modelos locais verificados e um Electron cujo renderer em sandbox consiga iniciar. Não baixa modelos, não modifica ACLs e não desativa sandbox.

Fluxo por escala:

1. Processo cold: indexação, Pipeline/Store/workers reais, previews, DINOv2, foco/exposição, FaceLandmarker e métricas de rosto/olhos, agrupamento, ranking e persistência.
2. Exportação real `exportPhotos(..., 'COPY')` de até 12 arquivos distribuídos no lote, comparando SHA-256. Essa etapa é independente de inferência e pode ser validada mesmo se o renderer impedir a análise.
3. Novo processo warm, mesmo banco e cache; nenhum resultado válido deve ser recalculado.
4. Acrescentar um trailer diagnóstico a exatamente um arquivo sintético: muda bytes/tamanho e mantém a imagem decodificável. Novo processo deve preparar apenas esse ID. Restaurar o arquivo em `finally`, conferir o hash e reindexar o arquivo restaurado para não deixá-lo marcado DONE para bytes antigos. Uma interrupção forçada do próprio orquestrador pode impedir esse `finally`; a próxima execução recusa hashes divergentes.
5. Para 1000: workspace cold separado, cancelamento pela API real perto de 30%, encerramento completo do processo, novo processo no mesmo SQLite/cache. Comparar IDs persistidos, IDs preparados e registros duplicados.

O teste de retomada cobre fechamento após cancelamento seguro. **Não simula queda de energia ou término abrupto durante uma transação.** IDs preparados mas ainda não persistidos podem ser processados novamente; IDs já DONE não podem.

### NIMA e instrumentação

O pipeline de produção atual não inclui NIMA. O harness executa o modelo experimental real como medição auxiliar em cada cache miss, sobre o original, usando o pré-processamento existente. O resultado não é enviado ao Store, ranking ou agrupamento. Assim, o tempo total inclui o custo adicional de NIMA e não representa exatamente a latência da UI atual.

O observador `scale-analysis-worker.mjs` envolve as chamadas originais de DINOv2 e gravação do preview apenas para medir duração; em seguida importa o worker de produção. Usa dois workers. FaceLandmarker roda em um renderer Electron persistente e oculto, com opções e pós-processamento importados de produção e um bitmap por chamada. Não se abre uma instância de Electron por foto.

Tempos de DINOv2, preview, FaceLandmarker, olhos/rosto, NIMA e agrupamento/ranking são medidos nas chamadas reais. As somas podem sobrepor-se por concorrência; não devem ser somadas como se fossem tempo decorrido. `totalMs` inclui inicialização, indexação, análise e verificações antes do fechamento; logs e tempos por fase ficam no relatório.

Cache hit significa registro DONE válido da versão atual, embedding/rostos disponíveis e preview/thumbnail existentes. `cacheMisses` conta os pendentes antes da execução; `preparedCount` mede as preparações realmente concluídas. Em uma execução interrompida, esses números não são equivalentes.

### Agrupamento

- Purity: soma da maior classe verdadeira de cada grupo produzido / total de fotos.
- Fragmentation: média da quantidade de grupos produzidos por fonte; ideal 1.
- False merges: grupos produzidos com mais de uma fonte verdadeira.
- False splits: fontes distribuídas em mais de um grupo produzido.
- Reportar também pares falsamente unidos/separados e cobertura de fotos agrupadas.

Nenhum threshold é ajustado. Estas métricas descrevem o corpus; não há um gate de preferência estética nem exigência artificial de purity perfeita.

### RAM e classificação

A cada 500 ms, somar RSS do Node (inclui worker threads) com working sets dos processos Electron obtidos por `app.getAppMetrics()`. É uma aproximação: páginas compartilhadas podem ser contadas duas vezes; helpers ExifTool e o orquestrador ficam fora. Heap e ArrayBuffers também são registrados. Não é profiling completo do sistema nem prova de ausência de leak.

O harness corrigido separa `nodeRss`, `electronRss` e `totalRss`, com fases `startup`, `steady-state` e `shutdown`. Ao observar o evento de saída, invalida imediatamente a memória Electron; mensagens atrasadas não a reativam. Perda do canal ou amostra com mais de 2 segundos produz valor desconhecido, não zero inventado. A soma fica nula se faltar uma parcela. O limite anterior de `min(4 GiB, 70% da RAM física)` permanece registrado. **Não há conclusão de memory leak nesta tarefa**: `leakAssessment=NOT_MEASURED`.

`READY_FOR_SCALE_BETA` exige 100/500/1000 concluídos na mesma versão de produção, sem crash/erro, etapas reais medidas, RAM controlada sem crescimento sinalizado, cold/warm/invalidação corretos, warm pelo menos 2× mais rápido, retomada em novo processo, exportação idêntica, integridade SQLite e ausência de duplicatas. `NEEDS_OPTIMIZATION` indica execução com falhas nos critérios. `BLOCKED` indica pré-requisito impedindo medição ou evidência obrigatória ausente. Nunca aprovar com campos nulos.

Na correção do harness, `allComplete` exige todas as etapas requeridas PASS. FAIL nunca conta como sucesso. BLOCKED/NOT_RUN/NOT_MEASURED em qualquer requisito mantém a classificação BLOCKED, incluindo retomada. A conclusão de leak continua pendente e impede aprovação global, sem converter ausência de medição em falha funcional.

## Validação restrita do harness: 3 → 10 → 100

```powershell
npm run benchmark:face-smoke
# Somente se o anterior for PASS:
npm run benchmark:harness -- --count 10
# Somente se o anterior for PASS:
npm run benchmark:harness -- --count 100
```

O smoke usa três arquivos existentes de `.test-tmp/scale-data-100`, com a mesma receita de preview da produção, um host e um modelo persistentes. O protocolo usa canal IPC local dedicado (named pipe no Windows), independente de stdin: HELLO autenticado, READY, ANALYZE_FACE/RESPONSE por ID, SHUTDOWN/SHUTDOWN_ACK. Timeout explícito de 60 segundos por resposta. Eventos de inferência vêm do renderer; logs stdout/stderr, ciclo interno e eventos do cliente são preservados no workspace.

As etapas 10/100 usam cópias byte a byte dos primeiros arquivos do mesmo manifesto e pipeline cold real, com dois workers, sem modificar modelos, resolução ou cache. Exigem PASS da etapa anterior e fingerprints iguais de harness/produção. Não fazem warm, invalidação, retomada ou novas escalas nessa sequência. Nunca lançam 500/1000. Evidências: `scale-face-smoke.json`, `scale-harness-10.json` e `scale-harness-100.json`.

Contadores ficam em `counters`: indexed, prepared, analysisStarted, done e failed. `analysisStarted` observa o evento existente de início do processamento nativo de cada foto; prepared observa `onPrepared`; DONE/FAILED finais vêm do Store. Progresso imprime DONE+FAILED como tentativas encerradas. Vazão de sucesso usa somente DONE; médias sem chamadas concluídas são nulas/NOT_MEASURED.

Saídas separam processError, controlledFailure, unexpectedExit, nativeCrash e timeout. Código 0 só é normal após encerramento solicitado/confirmado; sozinho não é erro nem evidência de sucesso. Código 1 com relatório de falha é controlledFailure. Crash nativo exige sinal de falha nativa, evento explícito de crash do renderer ou fatal nativo capturado; nunca somente `exitCode != 0`.

## Artefatos

Em `docs/evidence/`: `scale-dataset-manifest.json` (manifesto da última escala executada), `scale-benchmark-100.json`, `scale-benchmark-500.json`, `scale-benchmark-1000.json`, `scale-cache.json`, `scale-resume.json`, `scale-export.json` e `scale-summary.json`. O manifesto individual de cada dataset e o hash correspondente no benchmark permitem rastrear todas as escalas. Logs, bancos, configurações e relatórios de cada processo ficam nos workspaces isolados.

Campos não medidos permanecem nulos ou `NOT_RUN`/`BLOCKED`. Os dados de testes unitários do harness não são usados como evidência de inferência ou performance.
