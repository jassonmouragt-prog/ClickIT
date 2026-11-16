# ClickIT

Aplicação desktop para seleção local de fotografias. A logo e os dois materiais visuais originais foram preservados.

**Estado: beta público (0.1.4).** O app abre para desktop (Electron 44 + React 19), indexa
pastas reais, analisa com DINOv2 + MediaPipe Face Landmarker, apoia a revisão humana e exporta
a seleção. Fotografias e inferência permanecem na máquina: a única saída de rede é o servidor
de licenciamento, para ativar e revalidar a chave.

## Instalar

- Windows x64: `ClickIT Setup 0.1.4.exe` (NSIS) ou `ClickIT 0.1.4.exe` (portátil, sem
  instalação). Ambos pedem a chave de licença na primeira abertura.
- Modelos: o instalador já embute DINOv2-small e Face Landmarker (verificados por SHA-256
  no manifesto local). `npm run models` refaz o download para quem compila do fonte.

## Licença

O app abre bloqueado até a ativação. Cole a chave `CLICKIT-XXXX-XXXX-XXXX` na tela de
ativação; a validação acontece contra a **License API**, que assina tokens Ed25519. O desktop
nunca conhece a chave privada.

- Reativação na mesma máquina não consome vaga; a licença padrão comporta 2 dispositivos.
- Depois da ativação, o app funciona offline por 30 dias (revalidação a cada ~7 dias).
- `LICENSE_ADMIN_KEY` protege as rotas administrativas; a chave privada só existe no servidor.
- Operação do servidor, CLI e banco: [docs/LICENSING.md](docs/LICENSING.md).

## Compilar do fonte

Guia completo de instalação, modelos, diagnóstico e empacotamento: [docs/LOCAL-SETUP.md](docs/LOCAL-SETUP.md).
Execute `npm run doctor` para verificar o ambiente sem baixar dependências ou modelos.

Pré-requisito: Node 24 LTS e acesso à rede durante a instalação.

```powershell
npm install
npm run models
npm run check
npm start
```

`npm run dev` refaz o build e abre o desktop. O renderer usa a mesma origem local segura no
desenvolvimento e na distribuição. Sem os modelos, a aplicação permite criar/indexar projetos,
mas bloqueia a análise com mensagem explícita.

```powershell
npm test                 # 146 testes, Node 24 + SQLite reais, sem dependências externas
npm run package:win      # Check + NSIS e portátil Windows x64
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
- O módulo Editar cobre perfis, referência e planos; a geração estética (NIMA) está desligada e o score estético permanece nulo.

Arquitetura, inventário, referências de compatibilidade e plano: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Resultados e gates restantes: [docs/VALIDATION.md](docs/VALIDATION.md).
