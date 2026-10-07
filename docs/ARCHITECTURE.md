# ClickIT — arquitetura e inventário

## Inventário inicial

A raiz continha somente `ID VISUAL 01.png` (1.489.098 bytes), `ID VISUAL 02.png` (1.893.618 bytes) e `LOGO CLICK IT.png` (253.521 bytes). Os três foram abertos visualmente antes da interface. Não havia código, repositório Git ou AGENTS.md. Os originais foram preservados; `public/logo.png` é uma cópia byte a byte da logo oficial.

Identidade: Inter, Azure #3B82F6, Violet #8B5CF6, Charcoal #0B0F17, Slate #1A1F2B, Cloud #E5E7EB. Gradiente azul → violeta reservado a ações primárias e destaques; bordas finas, raio moderado, fotografias dominantes. A segunda referência orienta biblioteca lateral, grade central e inspetor direito. Não foram adicionadas fotografias de demonstração.

## Responsabilidades

```text
React UI → preload com métodos explícitos → IPC validado → Electron Main
                                                    ├── SQLite / histórico
                                                    ├── indexação / exportação
                                                    ├── fila limitada de Worker Threads
                                                    │    ├── Sharp / ExifTool
                                                    │    └── DINOv2 / ONNX Runtime CPU
                                                    ├── worker de agrupamento
                                                    └── renderer isolado de inferência facial
                                                         └── MediaPipe CPU / WASM local
```

O renderer de inferência é uma janela invisível separada, com sandbox e sem Node, dedicada a executar MediaPipe sem bloquear a interface. Nenhum processamento facial acontece dentro de componentes React. Uma fila serial limita sua memória; workers de imagens têm concorrência independente (1–4, limitada por CPU/RAM). O renderer principal recebe somente resultados e progresso. A interface virtualiza linhas com duas linhas extras de margem.

SQLite nativo de Node 24 evita recompilação de um binding adicional para Electron. Banco, previews, thumbnails e logs ficam em `app.getPath('userData')/storage`. WAL + transações protegem resultados individuais; projetos em processamento são marcados interrompidos na abertura. Fotos não modificadas reutilizam resultados e arquivos de cache, identificados por caminho/tamanho/mtime. O hash SHA-256 em streaming identifica duplicatas exatas; embeddings reais DINOv2 identificam similares.

Os limites temporais e semânticos estão centralizados em `src/lib/config.ts`. O agrupamento compara candidatos a representantes dentro de uma janela limitada para evitar O(N²) e correntes transitivas. Isso é adequado a sequências próximas; não constitui busca global exaustiva de todos os pares de 5.000 imagens. Os thresholds precisam de calibração com ensaios reais.

Scores combinam nitidez regional, exposição, rostos e olhos quando disponíveis. Estética permanece `null`: nenhum modelo estético foi implementado e não há número fictício. O classificador é conservador: baixa nitidez sem contexto vira incerteza; comparações no grupo podem indicar possível perda de foco. Não há segmentação foreground/background ou reconhecimento de identidade. Blink blendshapes são indícios de olhos fechados, não certeza; rostos pequenos são incertos. Não há rejeição automática.

## Segurança e integridade

- `contextIsolation: true`, `nodeIntegration: false`, sandbox e CSP.
- Métodos IPC explícitos, verificação de remetente/frame/origem e validação de argumentos.
- Protocolo local resolve fotografias por IDs persistidos; o renderer não fornece caminhos arbitrários.
- Navegação, janelas externas, permissões e requisições HTTP de renderers bloqueadas.
- Originais somente lidos. Exportação usa cópia temporária e reserva exclusiva do destino; nunca move os originais.
- Pastas exportadas recebem marcador para serem ignoradas em futuras indexações; originais exportados mantêm extensão e bytes, com sufixo de nome para colisões.
- Logs rotativos registram versão, eventos e IDs; não registram EXIF ou fotografias.
- Erros detalhados por arquivo ficam no banco local. Decisões humanas registram ranking/score/representante no momento da escolha.

## Dependências e compatibilidade

Verificação documental em 05/10/2026; resolução e validação binária NÃO concluídas porque a rede do npm retornou EACCES. Os intervalos no package.json são candidatos, não um lock reproduzível. Gerar e revisar package-lock.json quando a instalação estiver disponível.

- [Electron 44.5.1](https://releases.electronjs.org/): linha com Node 24 e Windows x64. Node local observado: 24.21.0; SQLite local observado: 3.53.4.
- [Vite 8.3 e plugin-react 6](https://vite.dev/blog/announcing-vite8): Node 24 satisfaz os requisitos publicados; 8.3 é a linha de patches regulares na [política de releases](https://vite.dev/releases). Verificar resolução de engines/peers durante a instalação. React/TypeScript/Tailwind compilam para o renderer.
- [Sharp](https://sharp.pixelplumbing.com/install/): binários Windows x64; módulos nativos fora do ASAR.
- [ONNX Runtime Node](https://onnxruntime.ai/docs/get-started/with-javascript/node.html): provider CPU Windows x64; uma thread interna por worker.
- [ExifTool vendored](https://photostructure.github.io/exiftool-vendored.js/): suporte Windows e extração de JPEG embutido. RAW sem preview compatível falha explicitamente, sem decodificação integral silenciosa.
- [DINOv2 small ONNX](https://huggingface.co/onnx-community/dinov2-small): CLS de 384 dimensões, normalizado. [Pré-processamento](https://huggingface.co/onnx-community/dinov2-small/blob/main/preprocessor_config.json): menor lado 256, crop central 224, RGB e normalização ImageNet.
- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js): modelo local, landmarks temporários e blendshapes. Persistimos apenas caixas, nitidez e indícios de olhos, sem identidade.

O instalador de modelos registra revisão do repositório, URLs e SHA-256 em manifesto. Deve-se revisar as licenças e empacotar os modelos testados na distribuição final. Não há download em tempo de uso.

## Plano incremental e situação

1. Shell / identidade / SQLite / projetos: código escrito; execução Electron pendente.
2. Indexação / metadados / previews / cache: código escrito; indexação e cache testados; Sharp/ExifTool pendentes de integração.
3. Grade / viewer / decisões / atalhos: código escrito; decisões persistentes testadas; verificação visual pendente.
4. ONNX / agrupamento: adaptador real escrito; agrupamento testado; modelo e inferência pendentes.
5. Foco / exposição / rostos / olhos: métricas testadas; integração MediaPipe e validação fotográfica pendentes.
6. Ranking / picks: regras e persistência testadas; calibração com conjuntos reais pendente.
7. Pós-seleção / comparação / filtros: código escrito; UI pendente de execução.
8. Exportação / cancelamento / retomada: testes automatizados de I/O e pipeline, usando worker fixture somente nos testes.
9. Lint / typecheck / build / empacotamento / desempenho: comandos configurados; ferramentas externas indisponíveis. Não declarar MVP pronto até passar por todas essas etapas.
