# Correções do fluxo visual — 07/10/2026

Status: código corrigido; pipeline e renderer isolado validados. **Fluxo nativo Electron ainda bloqueado pelo ambiente, sem PASS end-to-end.** Nenhuma mudança em ranking, modelos, grouping, critérios de IA ou identidade visual.

## Causas e correções

1. **Previews:** `Pipeline.index()` apenas inseria registros. Sharp só era chamado por `Pipeline.analyze()`, depois da inicialização dos modelos/serviço facial. Importar PNG ou JPEG não disparava geração. Agora a indexação chama uma fila limitada de workers de preview, independente da análise. A implementação Sharp existente foi extraída e compartilhada: rotação, tamanhos, qualidade JPEG e chave de cache preservados. O teste de paridade existente confirma os mesmos bytes e resultados de qualidade no worker de análise.
2. **Área vazia:** `PhotoGrid.onScroll` lia `e.currentTarget.scrollTop` dentro do atualizador funcional do React. Ao executar depois do evento, `currentTarget` já era `null`; a exceção desmontava a árvore sem ErrorBoundary. Reproduzido no Chrome com o handler antigo e os componentes reais: `TypeError: Cannot read properties of null (reading 'scrollTop')`, stack em `PhotoGrid → updateReducerImpl → renderWithHooks`. Agora `scrollTop` é capturado durante o evento. Também faltava `display:grid` em `.photo-grid`, tornando inoperantes as colunas/linhas usadas pela virtualização. Corrigido esse estilo e limitado o intervalo virtual à altura atual após reduzir a lista. A virtualização permanece ativa.

## Auditoria do preview

| Etapa | Resultado |
| --- | --- |
| Original/indexação | As mesmas sete imagens de `C:\dev\ClickIT\Imagens Teste`; importação nova em SQLite isolado. Originais preservados. |
| Disparo/fila | Importação agora enfileira previews faltantes, inclusive cache removido. Cancelamento e retomada testados. |
| Sharp | Executado em workers reais, com PNG/JPG/JPEG, sem modelos nem análise. |
| Cache | Aplicação: `%APPDATA%\clickit\storage\cache`. Validação: `.test-tmp/visual-regression/cache`. Escrita em `.partial` seguida de rename. |
| Arquivos físicos | Sete previews JPEG e sete thumbnails existentes e decodificados novamente pelo Sharp. Previews de 167.963 a 362.327 bytes. |
| SQLite | Paths persistidos apenas após verificar ambos os arquivos e conferir que o original não mudou. `analysisStatus=PENDING`, `analysis=null`; nenhuma foto marcada como analisada por gerar preview. |
| IPC | `photos:list` entrega os campos persistidos; progresso `PREVIEW` provoca refresh. Erros IPC agora registram canal e stack. Código auditado; transporte Electron não executado neste ambiente. |
| URL | Renderer usa `clickit://photo/<id>/thumbnail?v=<mtime>` e `/preview?v=<mtime>`. IDs resolvem os paths pelo banco, não por concatenação do caminho original na URL. |
| Protocolo | Handler usa `Store.asset`, verifica existência e converte com `pathToFileURL`. `net.fetch` agora é aguardado dentro do try/catch, incluindo rejeições assíncronas. Serviço nativo `clickit://` **não validado em execução**, devido ao bloqueio de inicialização do Electron. |
| Renderer/img | No teste isolado, sete `<img>` de thumbnail carregaram com `naturalWidth=420`, `naturalHeight=315`; painel lateral com preview 1448×1086. Nenhum “Aguardando preview” ao concluir. Assets foram servidos por HTTP local apenas no harness, não no código da aplicação. |
| Falhas | Entrada corrompida mantém paths nulos e erro real; não recebe preview pronto. Falhas não interrompem as demais imagens. |

A cópia somente para inspeção do banco atual do usuário já mostrava as sete fotos como `DONE`, com os 14 arquivos em cache existentes. Isso corresponde a uma análise anterior; não prova que a importação original gerava previews. O teste de importação acima usa outro banco, sem alterar o projeto do usuário.

## Diagnóstico adicionado

Eventos `PREVIEW_QUEUED`, `PREVIEW_STARTED`, `PREVIEW_WRITTEN`, `PREVIEW_DB_SAVED`, `PREVIEW_URL_CREATED`, `PREVIEW_RENDERED` e `PREVIEW_FAILED`, com ID, origem, paths e erro/stack quando aplicável. Logs locais em `%APPDATA%\clickit\storage\logs\clickit.log`, usando a rotação existente. Instrumentação temporária de diagnóstico, sem telemetria externa.

Captura adicional: eventos globais `error` e `unhandledrejection`, `console.error`, ErrorBoundary principal com mensagem/stack reais, erros IPC/asset, `render-process-gone`, renderer não responsivo e eventos de carregamento. O ErrorBoundary é diagnóstico, não um placeholder de conteúdo.

## Evidências e limites

- [Pipeline das sete imagens](../.test-tmp/visual-regression/pipeline-evidence.json): 7 QUEUED, 7 STARTED, 7 WRITTEN, 7 DB_SAVED, 0 FAILED; dimensões, bytes, IDs e caminhos por foto.
- [Eventos do renderer](../.test-tmp/visual-regression/renderer-events.json): inclui a reprodução intencional do handler antigo (stacks com `before.js`) e os carregamentos reais de imagem. Esse erro de comparação não pertence à aba corrigida.
- [Harness isolado](../.test-tmp/visual-regression.mjs): componentes reais, bridge de teste e assets HTTP locais. Não substitui nem comprova IPC/protocolo Electron.
- Aba corrigida observada de 08:00:22 UTC até depois de 08:04:54 UTC, incluindo scroll, filtros vazios, busca que reduz a lista para uma foto, restauração das sete fotos, grade 170/340, painel lateral e visualização individual. Verificação final: 1 app-shell, sidebar com altura positiva, topo visível, display grid, 8 imagens carregadas (7 thumbnails + lateral), nenhum alerta, nenhum texto de espera e nenhum erro nos logs de console da aba corrigida. Navegação adicional percorreu todas as sete fotos sem erro.
- [Build](../.test-tmp/visual-bugs-build.log) executado com sucesso.
- [Tentativa nativa](../.test-tmp/visual-bugs-dev.log): `npm.cmd run dev` executa o script `npm run dev` no PowerShell sem depender de `npm.ps1`, bloqueado pela política local. O build conclui, mas Electron encerra antes de abrir a janela: `Sandboxed processes cannot read C:\dev\ClickIT\node_modules\electron\dist`, por ACL incompatível com o sandbox. Também não foi possível conectar o serviço nativo Computer Use. Não foram desabilitadas proteções nem alteradas ACLs.

Verificações: lint e typecheck aprovados; **56/56 testes aprovados**; build aprovado. Ainda falta executar o roteiro completo dentro do Electron em um ambiente onde ele consiga iniciar, incluindo `clickit://`, IPC e observação de `render-process-gone`. Portanto, **não há PASS visual nativo completo**.

## Arquivos alterados

- `src/services/preview.ts`, `src/workers/preview.ts`: extração compartilhada e worker de preview.
- `src/services/pipeline.ts`, `src/database/store.ts`: disparo na importação, persistência independente da análise, recuperação e logs.
- `src/workers/analysis.ts`: reutilização da mesma rotina de preview, sem mudança de cálculos/modelos.
- `scripts/build.mjs`: empacota o worker de preview.
- `src/types/domain.ts`, `src/preload/index.ts`, `src/main/index.ts`: progresso de preview e diagnósticos IPC/protocolo/processo.
- `src/renderer/App.tsx`: refresh após progresso de preview.
- `src/components/PhotoGrid.tsx`, `src/renderer/styles.css`: scroll, limites virtuais e display grid.
- `src/components/Inspector.tsx`, `src/components/PhotoViewer.tsx`: eventos load/error das imagens.
- `src/renderer/diagnostics.ts`, `src/components/ErrorBoundary.tsx`, `src/renderer/main.tsx`: diagnóstico do renderer.
- `tests/preview.test.ts`: geração real PNG/JPG/JPEG, corrupção, persistência, recuperação de cache, cancelamento e retomada.
- `docs/visual-flow-fixes.md`: este relatório. `dist` foi regenerado pelo build.

Resultado esperado na aplicação nativa: importar gera miniaturas sem pressionar “Analisar”; clicar mostra preview lateral; scroll, filtros e mudanças de tamanho mantêm sidebar, topo e grid íntegros. Falhas reais permanecem visíveis e registradas.
