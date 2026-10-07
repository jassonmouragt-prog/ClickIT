# ClickIT

Aplicação desktop para seleção local de fotografias. A logo e os dois materiais visuais originais foram preservados.

**Estado: implementação inicial, ainda não validada como MVP executável.** Há código real para Electron/React, SQLite, indexação, cache, análise local, revisão e exportação. O ambiente desta sessão bloqueou o npm (`EACCES`); não foi possível instalar dependências, baixar modelos, executar Electron ou concluir lint/typecheck/build. Não há executável gerado nem inferência de IA validada. Os testes do núcleo usam Node 24 e SQLite reais.

## Executar no Windows x64

Guia completo de instalação, modelos, diagnóstico e empacotamento: [docs/LOCAL-SETUP.md](docs/LOCAL-SETUP.md). Execute `npm run doctor` para verificar o ambiente sem baixar dependências ou modelos.

Pré-requisito: Node 24 LTS e acesso à rede durante a instalação.

```powershell
npm install
npm run models
npm run check
npm start
```

`npm run dev` refaz o build e abre o desktop. O renderer usa a mesma origem local segura no desenvolvimento e na distribuição. Depois da instalação, fotografias e inferência permanecem locais. Sem os modelos, a aplicação permite criar/indexar projetos, mas bloqueia a análise com mensagem explícita.

```powershell
npm test                 # Executável sem dependências externas, em Node 24
npm run package:win      # Check + distribuição portátil Windows x64
```

## Fluxo

1. Novo projeto → nome → selecionar pasta real.
2. Analisar fotografias → previews, metadados, embeddings, rostos/olhos e ranking.
3. Revisar seleção → selecionar/desmarcar, revisar, rejeitar, favoritar e dar estrelas.
4. Marcar 2–6 quadrados na grade → comparar. Espaço/duplo clique → viewer.
5. Exportar seleção → cópias dos originais ou lista JSON. O destino pode ser uma subpasta; será excluído das próximas indexações.

Atalhos: ←/→ navegar; A selecionar/desmarcar; R revisar; X rejeitar; F favorita; 0–5 estrelas; Espaço viewer; G grade; C comparação. Zoom 100% usa os pixels do original JPEG/PNG; RAW mostra o preview embutido, explicitamente identificado.

## Limitações registradas

- Os testes de regras não demonstram acurácia fotográfica. Foco, olhos e agrupamento precisam de avaliação em sessões reais, incluindo motion blur, retratos de grupo e pouca luz.
- Não existe score estético nem treinamento personalizado. Não há rejeição automática.
- RAW depende de um JPEG embutido que ExifTool consiga extrair. Os bytes RAW originais são copiados na exportação.
- Agrupamento visual compara uma janela de sequências; duplicatas exatas são identificadas globalmente por SHA-256.
- Cancelamento encerra na fronteira segura de um arquivo; operações em andamento têm limite de tempo.
- Falta executar lint/typecheck/build, testes de integração com os modelos, verificação visual, benchmark real de 500–5.000 fotos e empacotamento Windows.

Arquitetura, inventário, referências de compatibilidade e plano: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Resultados e gates restantes: [docs/VALIDATION.md](docs/VALIDATION.md).
