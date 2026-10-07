# Suporte a arquivos RAW

Status desta rodada: **NOT_TESTED (nenhum arquivo RAW real disponível nesta máquina).**

## 1. Formatos alvo

| Formato | Extensões | Magic bytes esperados | Status |
| --- | --- | --- | --- |
| Canon CR2 | `.cr2` | TIFF (II* ou MM\0*) + marcador `CR` em bytes 8-9 | `NOT_TESTED` |
| Canon CR3 | `.cr3` | `ftyp` (bytes 4-7) + brand `crx ` (bytes 8-11) | `NOT_TESTED` |
| Nikon NEF | `.nef` | TIFF (II* ou MM\0*) | `NOT_TESTED` |
| Sony ARW | `.arw` | TIFF (II* ou MM\0*) | `NOT_TESTED` |
| Adobe DNG | `.dng` | TIFF (II* ou MM\0*) | `NOT_TESTED` |

A aplicação também reconhece RAF (`src/lib/files.ts`): `RAW = ['.cr2','.cr3','.nef','.arw','.raf','.dng']`.

Nesta máquina não havia **nenhum arquivo RAW real** para validar. Busca feita
(somente leitura, por extensão, com `dir /s /b`) em:

- `C:\Users\jasso\Pictures`, `OneDrive\Pictures`, `Desktop`, `Documents`, `Downloads`
- `C:\dev` (projeto) e todo o volume `E:\`

O único `.CR3` encontrado (`C:\dev\ClickIT\.test-tmp\run-*/original.CR3`) é um
fixture sintético de 30 bytes com conteúdo ASCII ("RAW Original imm...") usado
no teste de exportação byte-a-byte — não é um RAW real (falha no magic check).

Por regra da validação, `NOT_TESTED` **não** reprova: formatos sem arquivo real
não geram `FAIL`, e nada foi simulado/conversão de JPEG para extensão RAW.

## 2. Como rodar quando houver arquivos reais

```powershell
npm.cmd run raw:validate -- --dir "CAMINHO\para\seus\raws"
```

Por arquivo o harness registra: `format`, `camera` (Model), `bytes`, `preview`
(tag e bytes embutidos), `previewDimensions`, `previewMs`, `analysis` (status do
pipeline), `export` (sha idêntico), `sourceSha256`/`exportSha256` e `status`.
Evidência em `docs/evidence/raw-validation-<timestamp>.json`. Classificação por
formato: `PASS` / `FAIL` / `NOT_TESTED`.

O harness nunca toca os arquivos de origem: cria workspace próprio sob
`.test-tmp`, faz staging via hardlink (ou cópia), usa banco e cache isolados e
aplica SHA-256 antes e depois de cada arquivo (intocabilidade).

## 3. Caminho de código (verificado por inspeção; sem dados reais)

**Detecção/indexação** — `src/lib/files.ts`: `walk` aceita extensões RAW; o
item é indexado com `originalPath` inalterado (`src/services/pipeline.ts` e
`src/database/store.ts`).

**Preview embutido** — `src/services/preview.ts` (`generatePreview`): para RAW,
extrai o JPEG embutido com ExifTool nas tags `JpgFromRaw` → `PreviewImage` →
`OtherImage` (mesma ordem do harness), grava em cache
`cacheKey(originalPath, size, mtime)-preview.jpg`/`-thumb.jpg`, e aplica
`rotate()` + resize (LIMITS preview 1600 / thumbnail 420) e JPEG. O preview é
apenas representação para análise/UI; `photo.originalPath` nunca é substituído.
Se não houver preview compatível: erro explícito, original preservado.

**Análise** — o worker `src/workers/analysis.ts` consome o **preview** (não o
RAW em resolução total): DINOv2 (embedding), foco/exposição, EAR/rostos via
preview, NIMA (aplicado ao preview), grouping/ranking sobre embeddings e hash.

**Exportação (requisito crítico)** — `src/services/export.ts`: modo `COPY` faz
`copyFile` do `originalPath` (byte a byte), verifica tamanho+mtime do original
antes E depois, usa `.partial` + rename atômico e reserva exclusiva do destino
(`wx`). O arquivo exportado é o original, sem revelar/recomprimir/reescrever
metadata. O nome de destino preserva o basename original com sufixo de
colisão/exclusão explícito (`nome_<id8>_<batch8>.<ext>`), nunca uma
renomeação silenciosa arbitrária. O harness exige SHA-256 orig = export.

**Pares RAW + JPEG** — não há emparelhamento automático por basename:
`IMG_1234.CR3` e `IMG_1234.JPG` são indexados como fotos distintas. A única
deduplicação (`duplicate`) é por **hash exato de bytes** do original
(`src/ai/grouping.ts`). Comportamento atual documentado; nenhuma regra foi
alterada nesta etapa (não havia necessidade comprovada sem dados reais).

**UI** — thumbnail/preview servidos do cache (`clickit://photo/<id>/...`);
nome e extensão exibidos são os do arquivo original; o visor lateral usa o
preview (e no zoom indica "Zoom do preview RAW, não do sensor", para não
decodificar o RAW em resolução total); seleção/favorito/estrelas são decisões
independentes da origem; exportação usa o original.

## 4. Limitações desta rodada

- Nenhum formato foi exercitado com arquivo real: `preview`, `previewMs`,
  `analysis` e `export` não tiveram medição real. O pipeline já possui o
  caminho de preview embutido, mas ele só será validado de fato quando houver
  arquivos RAW autênticos.
- Sem isso, **não é possível declarar `RAW_READY_FOR_BETA`**. Reclassificar
  quando `npm run raw:validate -- --dir "<raws>"` retornar `PASS` para todos
  os formatos disponíveis.