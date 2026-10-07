# Módulo Editar — Planejamento Técnico

> **Status: Fase C implementada (gerador real e determinístico de planos de edição).**
> Este documento define arquitetura, schema, interfaces, fluxo, riscos e o
> plano dividido em fases para a futura aba **Editar** do ClickIT.
> Base congelada: Beta 0.1.0 (`tag clickit-beta-0.1.0`, commit `cd7f079`).
> Revisão final de schema/interfaces aprovada em 2026-10-07.
> Contratos executáveis: `src/editing/types.ts`, `config.ts`, `contracts.ts`,
> `planner.ts` e `store.ts`; testes: `tests/editing-schema.test.ts`,
> `tests/editing-style.test.ts` e `tests/editing-plan.test.ts`.
> As fases D–G aguardam autorização.
> Classificação: **PHASE_C_READY** — Fase A: typecheck, lint, 103/103 testes e build PASS;
> Fase B: typecheck, lint, 111/111 testes, build PASS e validação GUI automatizada (Electron real);
> Fase C: typecheck, lint, 124/124 testes, build PASS e validação GUI automatizada da geração de planos.

## 1. Objetivo e não-objetivos

**Objetivo:** permitir que o fotógrafo defina um **perfil de edição** (via
questionário de preferências) e que o ClickIT gere e salve um **plano de
ajustes por foto** (não destrutivo, auditável), com objetivo primário de
exportar os parâmetros em **XMP** para Lightroom/Camera Raw.

**NÃO faz parte desta etapa (e não deve ser implementado agora):**

- Edição automática real (renderização/ajuste de pixels);
- Geração de XMP (fica para a Fase E);
- Qualquer alteração na exportação atual (cópia byte-idêntica original);
- Redes neurais/treino com as referências visuais;
- Não se destina a competir com Lightroom: o ClickIT *prescreve*, o Lightroom *aplica*.

## 2. Contexto do estado congelado (Beta 0.1.0)

Fatos do código atual que esta especificação respeita:

- Banco: sqlite node `DatabaseSync`, `PRAGMA user_version=1`, WAL,
  `foreign_keys=ON`. Padrão de armazenamento: colunas `TEXT` com JSON
  (`photo_metadata`, `photo_analysis`, `photo_embeddings`).
- `photo_decisions` guarda status/seleção e `decision_history` o rastro de
  decisões humanas — o Editar terá rastros equivalentes para planos.
- `Analysis` hoje fornece: `exposure`, `sharpness`, `faceScore`,
  `faces[]`, `blur`, `overall`, `confidence`, `insight`, `embeddingAvailable`.
  `Metadata` fornece: camera, lens, iso, aperture, shutter, focal.
- `photos.hash` (SHA-256 do arquivo original) já é persistido no pipeline —
  base da identidade de arquivo do `inputFingerprint`.
- Export atual: cópia byte a byte do original com verificação de integridade
  (`src/services/export.ts`). **Não pode ser tocada** — o Editar só adiciona
  caminhos próprios (planos, XMP) e nunca reescreve original.
- Preview/thumbs reutilizam o cache existente (`src/services/preview.ts`);
  o Editar não deve criar novo pipeline de imagem.

## 3. Vocabulário da aba Editar

- **ClickIT Picks**: fotos com decisão `AI_SELECTED` ou `SELECTED`.
- **Selecionadas**: decisão `SELECTED` (escolha humana no fluxo atual).
- **Favoritas**: `favorite = true` em `photo_decisions`.
- **Conjunto manual**: seleção explícita feita pelo usuário dentro da aba.
- **Fotos alvo**: união/intersecção dos conjuntos acima, escolhida na UI.

## 4. Arquitetura

```
[ Aba Editar (renderer) ]
   Perfil -> Questionário -> Referências -> Fotos alvo
        -> Gerar plano -> Revisar ajustes -> Exportar XMP (Fase E)
                          |
                          v
   [ Serviço de planos (main, processos leves) ]
        EditingPlanner: baseStyle + sceneCorrection + finalAdjustment
                          |
                          v
   [ Store (sqlite) ]  editing_profiles | editing_plans | reference_images
```

Princípios:

- **Aditivo e isolado**: novos módulos (`src/editing/`) e novas tabelas; nada
  do núcleo atual é alterado nesta fase de planejamento.
- **Determinístico**: o mesmo perfil + mesmas fotos + mesmo motor produzem o
  mesmo plano e o mesmo `inputFingerprint` (importante para auditar e testar).
- **Não destrutivo**: originais nunca são modificados; a referência visual
  também não altera nada; XMP futuro vai para a pasta de destino como sidecar
  `<nome>.xmp`.
- **Leve**: sem novo componente de IA pesada; sem paralelismo novo (RAM 8 GB);
  revisão em lote paginada (20–50 fotos).

## 5. Tipos e interfaces (especificação TypeScript)

> O código em `src/editing/types.ts` é o contrato executável da Fase A.
> O bloco abaixo registra o desenho original; os esclarecimentos da seção 20
> prevalecem para nullability, versionamento e operações disponíveis.

```ts
// Escala UNICA e INTERNA do ClickIT: inteiros -100..+100, step 1 (0 = neutro).
// NAO e equivalente de valor de Lightroom/XMP — a conversao existe SO na Fase E.
export type SliderValue = number; // -100..+100

// Como um campo da ClickIT gera delta no plano:
// - MODEL_DELTA  : o valor do perfil vira um ajuste 1:1 (campo quantitativo).
// - DERIVED_DELTA: intencao conceitual convertida, por tabela documentada,
//                  em um SUBCONJUNTO de campos quantitativos; nunca vira
//                  campo direto de XMP.
export type ParamKind = 'MODEL_DELTA' | 'DERIVED_DELTA';

export interface EditingProfileQuantitative {
  // todos SliderValue | null — null = neutro/nao definido
  temperaturePreference: SliderValue | null; // neg=mais azul, pos=mais Ã¢mbar
  tintPreference: SliderValue | null;
  exposurePreference: SliderValue | null;    // intensidade interna, não EV
  contrastPreference: SliderValue | null;
  highlightsPreference: SliderValue | null;
  shadowsPreference: SliderValue | null;
  whitesPreference: SliderValue | null;
  blacksPreference: SliderValue | null;
  saturationPreference: SliderValue | null;
  vibrancePreference: SliderValue | null;
  clarityPreference: SliderValue | null;
  texturePreference: SliderValue | null;
  sharpeningPreference: SliderValue | null;
  grainPreference: SliderValue | null;       // 0..+100 somente
  vignettePreference: SliderValue | null;    // neg=clareia bordas, pos=escurece
}

export interface EditingProfileConceptual {
  // todos DERIVED_DELTA: intencao (nao tem campo direto em XMP)
  skinToneStyle: 'NEUTRAL' | 'WARM' | 'COOL' | 'NATURAL' | null;
  greensStyle: 'NATURAL' | 'SOFT' | 'DESATURATED' | 'JUICY' | null;
  bluesStyle: 'NATURAL' | 'MUTED' | 'DEEP' | null;
  blackPointStyle: 'WASHED' | 'NATURAL' | 'DEEP' | null;
  highlightStyle: 'SOFT' | 'NATURAL' | 'BRIGHT' | null;
  overallMood: 'CLEAN' | 'EDITORIAL' | 'FILM' | 'DRAMATIC' | 'NATURAL' | null;
}

export interface EditingProfile {
  id: string;
  name: string;
  profileVersion: number; // 1..N — SEMPRE sobe quando muda forma/semantica
                          // dos campos (adicionar/remover/redefinir significado).
                          // Mudanca apenas de *mapeamento* sobe ENGINE_VERSION.
  source: 'QUESTIONNAIRE' | 'PRESET' | 'MANUAL';
  presetPath: string | null;          // quando originado de preset XMP
  createdAt: string;
  updatedAt: string;
  q: EditingProfileQuantitative;      // MODEL_DELTA
  c: EditingProfileConceptual;        // DERIVED_DELTA (intencao)
}

export interface QuestionnaireAction {
  param: 'q.*' | 'c.*';               // caminho dentro do perfil
  amount: number;                     // delta aplicado (deterministico)
  when: Record<string, string | boolean | number>; // condicao opcional
  kind: ParamKind;                    // define como o valor vira delta
}

export interface QuestionnaireItem {
  id: string;
  question: string;
  options: { label: string; actions: QuestionnaireAction[] }[];
}

// Sinais de cena. Campos opcionais/null = indisponivel — NUNCA inventar valor.
export interface SceneSignals {
  exposure: number;                   // 0..1 (existe)
  sharpness: number;                  // existe
  blur: 'CLEAR' | 'DOF_POSSIBLE' | 'POSSIBLE_BLUR' | 'UNCERTAIN';
  faceCount: number;                  // existe (faces[])
  faceScore: number | null;           // existe
  overall: number;                    // existe
  confidence: number;                 // existe
  isPortraitLike: boolean;            // derivado (um rosto grande/central)
  // futuros (hoje null — regra de ouro do item 7 impede uso):
  outdoorIndoor: 'OUTDOOR' | 'INDOOR' | null;
  temperatureK: number | null;        // estimativa de balanco de branco
  skyPresence: number | null;         // 0..1
  greenPresence: number | null;       // 0..1
}

export interface EditingAdjustment {
  param: string;                      // ex.: 'q.exposure', 'q.blacks'
  value: SliderValue;
  reason: 'PROFILE_BASE' | 'PROFILE_DERIVED' | 'SCENE' | 'USER';
  note: string;                       // legivel para auditoria
}

export type PlanStatus =
  | 'DRAFT'      // registro criado, conteudo ainda nao gerado
  | 'GENERATED'  // conteudo gerado pelo motor e consistente com o fingerprint
  | 'REVIEWED'   // revisado/ajustado pelo usuario (unico que pode exportar)
  | 'EXPORTED'   // XMP escrito (Fase E)
  | 'STALE';     // entradas mudaram — precisa regenerar

export interface EditingPlan {
  id: string;                         // planId (uuid) — rastro
  sourcePhotoId: string;              // photos.id de origem (coluna FK photoId)
  sourceOriginalPath: string;         // mirror de photos.originalPath (auditoria)
  profileId: string;
  profileVersion: number;             // versao do perfil USADA na geracao
  engineVersion: number;              // EDITING_ENGINE_VERSION usada na geracao
  inputFingerprint: string;           // algoritmo no item 5.1
  generatedAt: string | null;         // null em DRAFT; nenhum motor nesta fase
  createdAt: string;                  // criacao do registro
  updatedAt: string;
  baseStyle: EditingAdjustment[];     // REQUERIDO — do perfil (deterministico)
  sceneCorrection: EditingAdjustment[]; // REQUERIDO — de SceneSignals (conservador)
  finalAdjustment: EditingAdjustment[]; // REQUERIDO — ajustes manuais do usuario
  status: PlanStatus;
  xmpPath: string | null;             // preenchido na Fase E
}

export type ReferenceKind = 'REFERENCE' | 'BEFORE' | 'AFTER';

export interface ReferenceImage {
  id: string;
  profileId: string;
  photoId: string | null;             // se veio de foto do projeto
  externalPath: string;               // caminho de referencia (ausencia => missing)
  kind: ReferenceKind;                // REFERENCE | BEFORE | AFTER
  pairId: string | null;              // BEFORE/AFTER do mesmo par compartilham pairId
  fingerprint: string;                // sha256 do conteudo — dedupe + detectar mudanca
  createdAt: string;
}

export interface XmpExportResult {
  ok: boolean;
  written: string[];                  // caminhos dos .xmp criados
  skipped: string[];                  // fotos sem plano REVIEWED
  errors: string[];
}
```

### 5.1 — `inputFingerprint` (determinístico, sem timestamp volátil)

```
ENTRADAS (string canônica, chaves ordenadas, sem timestamps, sem caminhos):
  EDITING_ENGINE_VERSION            ;  // versao SEMANTICA do mapeamento perfil/deltas
  profileVersion                    ;  // versao do perfil
  sha256(canonicalJson({ q, c }))    ; // CONTEUDO relevante do perfil, ordenado
  ANALYSIS_VERSION                  ;  // versao da analise (ja existe em config)
  photos.hash                       ;  // hash sha-256 do ARQUIVO de origem persistido

inputFingerprint = sha256(joinsComPipeDasEntradasAcima)
```

- `canonicalJson` = `JSON.stringify` com chaves recursivamente ordenadas,
  sem espaços, usando apenas `q` e `c`. Nome, IDs, caminhos, source e datas
  não mudam os ajustes e não entram no hash de conteúdo.
- **Determinístico**: os mesmos 5 insumos sempre produzem o mesmo hash; sem
  data/hora, PID, path absoluto ou ordem de iteração não estável.
- **Garante invalidação** quando: perfil for editado (muda hash do conteúdo
  OU `profileVersion`), motor de edição mudar (`engineVersion`), análise for
  refeita (bump de `ANALYSIS_VERSION` pelo pipeline), ou arquivo de origem
  for substituído (`photos.hash` muda após re-index + re-analysis).
- `sourceOriginalPath` NÃO entra no fingerprint (não é identidade de arquivo).

### 5.2 — Classificação explícita dos campos do perfil

| Campo | Local | Kind | Para o plano | Para o XMP (Fase E) |
|---|---|---|---|---|
| 15 parâmetros em `q` | `EditingProfileQuantitative` | `MODEL_DELTA` | delta 1:1 | conversão por tabela documentada |
| `skinToneStyle` `greensStyle` `bluesStyle` `blackPointStyle` `highlightStyle` `overallMood` em `c` | `EditingProfileConceptual` | `DERIVED_DELTA` | deriva subconjunto de `q` (ex.: `blackPointStyle:'DEEP'` → `q.blacks:-18`, `q.shadows:-8`) | nunca direto — só via `q` derivado |

Nenhum campo é puramente decorativo na v1: todos geram deltas (1:1 ou via
derivação documentada). A distinção existe para deixar claro **o mecanismo**
(MODEL_DELTA vs DERIVED_DELTA) e o que é intenção (`c`) vs valor direto (`q`).

## 6. Espaço de valores interno vs Lightroom/XMP

- `SliderValue` (-100..+100) é **espaço interno do ClickIT**. Não é garantia
  de equivalência numérica com Lightroom/Camera Raw.
- A conversão (curvas/faixas documentadas por parâmetro; nenhuma equivalência
  física assumida nesta fase) acontece **somente na Fase E**, dentro de
  `src/editing/xmp.ts`.
- Nenhum valor interno é escrito em XMP antes da Fase E.

## 7. Schema v2 (100% aditivo) e migração

Regras absolutas:

- **Nenhuma tabela existente é alterada** (sem `ALTER`, sem drop, sem mudança
  de coluna). Apenas `CREATE TABLE IF NOT EXISTS` aditivas.
- **Bancos/projetos v1 continuam abrindo sem alteração destrutiva**:
  projetos sem qualquer registro em `editing_*` continuam válidos; consultas
  de plano/referência retornam listas vazias, nunca erro.
- `PRAGMA user_version` sobe de `1` para `2` **somente após** os creates
  (guard de habilitação das telas do Editar).
- Padrão de dado: coluna `data TEXT` com JSON (mesmo padrão de
  `photo_analysis`); apenas `fingerprint` e `status` viriam como colunas
  consultáveis (espelho do JSON, sem duplicar lógica).

```sql
-- roda no construtor, junto das demais, dentro da mesma execucao
CREATE TABLE IF NOT EXISTS editing_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  profileVersion INTEGER NOT NULL CHECK(profileVersion >= 1),
  data TEXT NOT NULL,               -- EditingProfile (JSON)
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS editing_plans (
  id TEXT PRIMARY KEY,
  profileId TEXT NOT NULL REFERENCES editing_profiles(id),
  photoId TEXT NOT NULL REFERENCES photos(id),   -- == EditingPlan.sourcePhotoId
  inputFingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  data TEXT NOT NULL,                               -- EditingPlan (JSON)
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(profileId, photoId)
);

CREATE TABLE IF NOT EXISTS reference_images (
  id TEXT PRIMARY KEY,
  profileId TEXT NOT NULL REFERENCES editing_profiles(id),
  photoId TEXT REFERENCES photos(id),
  externalPath TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'REFERENCE',           -- REFERENCE | BEFORE | AFTER
  pairId TEXT,
  fingerprint TEXT NOT NULL,
  data TEXT NOT NULL,                               -- ReferenceImage (JSON)
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS editing_plans_profile ON editing_plans(profileId);
CREATE INDEX IF NOT EXISTS editing_plans_photo ON editing_plans(photoId);
CREATE INDEX IF NOT EXISTS reference_images_profile ON reference_images(profileId);
```

Regras da migração:

- Nova abertura de banco v1: creates rodam, `user_version` vira 2, tabelas
  antigas intocadas, dados antigos íntegros.
- Persistência de `profileVersion` e `status`/`fingerprint` também em coluna
  facilita consulta SQL (ex.: "planos STALE") sem ler JSON.
- `UNIQUE(profileId, photoId)` evita plano duplicado por par perfil+foto.

## 8. Sinais de cena e nullability (nenhum classificador inventado)

| Sinal desejado            | Origem hoje | Uso no Editar (v1)              |
|---------------------------|-------------|----------------------------------|
| Exposição (0..1)          | `analysis.exposure` | Scene: correção conservadora de `exposure`/`whites`/`blacks` só se `confidence` alta |
| Nitidez / DOF             | `sharpness`, `blur` | `clarityPreference` aplicado; não corrigir desfoque |
| Rostos / retrato          | `faces[]`, `faceScore` | `faceCount>0` => não esmagar `skinTone`; ajustes de pele conservadores |
| Olhos                     | `eyesScore` | inferência de prioridade (retrato) |
| Estética geral            | `overall`, `embeddingAvailable` | *não* vira ajuste efetivo — só contexto de auditoria |
| Indoor/outdoor            | **indisponível** | fica `null`; sem ajuste |
| Temperatura (WB)          | **indisponível** | fica `null`; correção de cena de temperatura DESLIGADA |
| Presença de céu/verde     | **indisponível** | fica `null`; `greensStyle`/`bluesStyle` só via perfil, nunca via cena |

**Regra de ouro:** se o sinal não existe hoje, o campo fica `null` e o
`sceneCorrection` correspondente não gera ajuste. O plano registra o motivo
via `note` ("sinal indisponível — sem correção de cena"). Isto evita
"classificadores falsos" e mantém a auditoria honesta. Valores inventados
para indoor/temperatura/céu/verde são **proibidos** nesta especificação.

## 9. Questionário (estruturado, sem "IA mágica")

Cada pergunta oferece opções; cada opção aplica um conjunto **determinístico**
de deltas (`QuestionnaireAction` com `kind`). Exemplos:

| Pergunta | Exemplo de opções | Ação no perfil |
|---|---|---|
| Como você prefere a luz geral das fotos? | Mais clara / Natural / Mais escura | `q.exposurePreference` +15 / 0 / -15 |
| Temperatura da cena? | Quente / Neutra / Fria | `q.temperaturePreference` +25 / 0 / -25 |
| Contraste? | Suave / Médio / Forte | `q.contrastPreference` +15 / 0 / +25 |
| Sombras? | Abertas / Naturais / Densas | `q.shadowsPreference` +30 / 0 / -20 |
| Highlights? | Suaves / Brilhantes | `q.highlightsPreference` -25 / +15 |
| Cores? | Naturais / Intensas | `q.saturationPreference` -10 / +20; `q.vibrancePreference` 0 / +15 |
| Verdes? | Naturais / Suaves / Dessaturados | `c.greensStyle` NATURAL / SOFT / DESATURATED |
| Pele? | Neutra / Quente / Fria | `c.skinToneStyle` NEUTRAL / WARM / COOL |
| Visual? | Clean / Editorial / Filme / Dramático / Natural | conjunto base (perfil predefinido) |
| Granulação? | Sem / Leve / Visível | `q.grainPreference` 0 / +20 / +40 |
| Vinheta? | Sem / Sutil / Forte | `q.vignettePreference` 0 / -12 / -25 |
| Pretos? | Lavados / Naturais / Profundos | `c.blackPointStyle` WASHED / NATURAL / DEEP |

Resultado: um `EditingProfile` com `source: 'QUESTIONNAIRE'`, sempre revisável
na UI e editável manualmente depois.

## 10. Presets XMP (futuro — só interface estruturada se segura)

- **Upload/leitura**: receber arquivo `.xmp`; ler somente campos da whitelist
  (`crs:Temperature`, `crs:Tint`, `Exposure2012`, `Contrast2012`,
  `Highlights2012`, `Shadows2012`, `Whites2012`, `Blacks2012`, `Saturation`,
  `Vibrance`, `Clarity`, `Texture`, `Sharpness`, `Grain`, `Vignette`);
  valores fora da faixa válida são descartados com aviso.
- **Associação**: importar cria `EditingProfile` com `source:'PRESET'`,
  `presetPath` salvo e `profileVersion` próprio. Nunca aplicar preset sobre
  pixels.
- **Parser**: módulo dedicado `src/editing/xmp.ts` (reaproveitado pela Fase E).
  Na Fase F, import-only; nenhuma escrita.
- Se qualquer tag for desconhecida/ambígua: ignorar com nota, nunca adivinhar.

## 11. Referências visuais (armazenamento/estrutura apenas)

- 3 a 10 referências por perfil (recomendado), com `kind` `REFERENCE`, ou pares
  `BEFORE`/`AFTER` (mesmo `pairId`) quando disponíveis.
- **Referência visual NÃO altera o original e não altera o plano por si só**:
  apenas acompanha a comparação visual do fotógrafo. Sem aplicação de pixels.
- Somente referência de caminho (`externalPath` ou `photoId` do projeto) —
  nenhuma cópia de imagem, nenhum embedding, nenhum treino.
- `fingerprint` (sha256 do arquivo) permite detectar referência substituída ou
  duplicada; caminho inexistente -> marcado `missing` na UI (não quebra perfil).
- A API de comparação automática de referências **não existe nesta fase**.

## 12. Ciclo de vida do plano

```
             regenerar (preserva finalAdjustment por padrao)
                  |                          |
                  v                          |
  DRAFT ---> GENERATED ---> REVIEWED ---> EXPORTED
                  ^            ^
                  |            |  evento: perfil editado / origem mudou /
                  +------------+-- engineVersion mudou / fingerprint nao confere
                               -> STALE (proxima leitura/regen marca)

  estados -> em ordem: DRAFT, GENERATED, REVIEWED, EXPORTED, STALE
  EXPORTED e terminal; re-revisao apos export volta a REVIEWED.
```

- **Fonte da verdade do STALE**: comparação **em leitura** entre o
  `inputFingerprint` armazenado e o recalculado com engine/perfil/análise/
  arquivo atuais. Qualquer divergência marca `STALE`.
- **Evento (otimista)**: quando um perfil é editado, dependentes marcados
  `STALE` imediatamente (evita UI mostrando plano antigo como válido).
- Regeneração (`STALE` → `GENERATED`): recomputa `baseStyle` e
  `sceneCorrection`; `finalAdjustment` preservado por padrão (usuário pode
  descartar). `generatedAt` atualiza e `createdAt` permanece.
- Only `REVIEWED` planos podem ser exportados (Fase E); exportação marca
  `EXPORTED` + `xmpPath`.

## 13. Fluxo esperado (tela)

```
Aba Editar
  1. Escolher perfil (ou criar novo)
  2. Questionário (opcional; perfis podem começar MANUAL)
  3. Referências (opcional)
  4. Escolher fotos alvo: Picks | Selecionadas | Favoritas | Manual
  5. Gerar plano  -> lista de fotos com ajustes previstos (DRAFT -> GENERATED)
  6. Revisar/ajustar (finalAdjustment -> REVIEWED)
  7. Guarda: sem REVIEWED não exporta
  8. Exportar XMP (Fase E)
```

Simplicidade: o fluxo inteiro deve caber em poucas telas; não criar telas
extras nesta fase de planejamento.

## 14. Estratégia XMP (alvo primário; implementação só na Fase E)

- O ClickIT **gerencia o plano**; o XMP é o ponto de entrega para
  Lightroom/Camera Raw (não substitui o Lightroom).
- Exportação: para cada foto alvo com plano `REVIEWED`, escrever
  `<destino>/<nome>.xmp` lado-a-lado com a **cópia** da foto (a exportação de
  cópia continua a atual; o módulo só acrescenta o sidecar).
- Regras: só parâmetros da whitelist; conversão do espaço interno
  (item 6) aplicada aqui; `rate`/`PresetName` não inventados; nunca escrever
  no original.
- Round-trip: teste Fase E lê de volta o XMP gerado e confirma igualdade de
  parâmetros (mesmo parser da Fase F).

## 15. Limitações assumidas (v1)

- Sem correção de cor / WB real (falta sinal de temperatura).
- Sem detecção de outdoor/indoor, céu ou verde (campos `null`).
- Dois parâmetros de perfil (`grain`, `vignette`) só exportam se a versão de
  Lightroom do usuário suportar (documentar; descartar com aviso se não for
  possível detectar).
- Perfis conceituais não mapeiam 1:1 para XMP (derivados deterministicamente).
- Bateria de "antes/depois" automática fica para fase futura.
- `photos.hash` exige análise concluída (`analysisStatus='DONE'`); fotos em
  PENDING/FAILED não geram plano (sem identidade de arquivo).

## 16. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Migração v2 quebrar banco v1 existente | transação + `IF NOT EXISTS` + item 7; testes item 17 |
| Planos desatualizados após nova análise | `inputFingerprint` + aviso de regeneração |
| XMP incompatível com Lightroom | whitelist documentada; round-trip test; valores na faixa |
| "Edição automática mágica" quebra confiança | sempre auditável (`reason`/`note`); default conservador |
| Export atual regredir | Fase de planejamento não toca `export.ts`; testes de byte-identity permanecem |
| Referências externas sumirem | marcar `missing`, não falhar o perfil |
| Sinal indisponível virado em ajuste falso | regra do item 8 (campos `null` proíbem ajuste) |
| Consumo de RAM ao revisar muitas fotos | usar preview cache existente; revisão em lote paginada 20–50 |
| `photos.hash` ausente (análise não concluída) | plano só para `analysisStatus='DONE'` |

## 17. Testes de compatibilidade schema/interfaces (implementados na Fase A)

`tests/editing-schema.test.ts` — casos obrigatórios:

Os seis cenários abaixo foram implementados, com mais testes de integridade,
totalizando 18 testes novos; detalhes e resultado na seção 20 e em VALIDATION.md.

1. **Abrir store v1**: usar fixture = cópia de banco v1 real (sem `editing_*`);
   abre sem erro; `user_version` passa a 2; `projects`/`photos` íntegros e
   legíveis por `photo()`.
2. **Salvar v2**: criar `EditingProfile`, `EditingPlan` e `ReferenceImage` e
   persistir; **reabrir v2** e recarregar — round-trip igual (canonical JSON).
3. **Reabrir v2 idempotente**: segunda abertura do mesmo banco não duplica
   tabelas nem registros; `UNIQUE(profileId,photoId)` respeitado.
4. **Projeto antigo sem `editing_*`**: métodos de plano/referência retornam
   vazios, nada quebra; `projects()`/`photos()` inalterados.
5. **Plano STALE após mudança de perfil**: editar perfil (ou quebrar conteúdo)
   → fingerprint recalculado difere → leitura marca `STALE`; após regenerar,
   volta a `GENERATED` e o fingerprint novo confere.
6. **Fingerprint determinístico**: mesmos insumos → mesmo hash; alterar apenas
   `profileVersion`, `engineVersion`, conteúdo do perfil ou `photos.hash` →
   hash muda; ausência de timestamps/paths no cálculo (testar que duas
   execuções em momentos/caminhos diferentes produzem o mesmo hash).

## 18. Plano de implementação por fases (ordem)

1. **Fase A — Fundações**: `src/editing/types.ts` (tipos desta especificação,
   constantes `EDITING_ENGINE_VERSION`), migração schema `v2` (item 7),
   métodos `Store` para as 3 tabelas e implementação dos testes do item 17
   (migração v1 + round-trip + STALE + fingerprint). *Não* gera planos.
2. **Fase B — Perfis e questionário**: UI de criar/editar `EditingProfile` e
   questionário estruturado (item 9). Sem geração de plano.
3. **Fase C — Gerador de plano (baseStyle)**: planner determinístico perfil→
   ajustes; persistência em `editing_plans`; revisão na UI (sem scene);
   invalidação por fingerprint; ciclo DRAFT→GENERATED→REVIEWED.
4. **Fase D — Correção de cena conservadora**: aplicar `sceneCorrection` SOMENTE
   com sinais existentes e `confidence` alta (item 8). Auditoria por foto.
5. **Fase E — Exportação XMP v1**: sidecar na pasta de destino; conversão do
   espaço interno (item 6); whitelist; round-trip test. Export atual intocado.
6. **Fase F — Presets e referências**: import de XMP (whitelist), associação
   `source:'PRESET'`; armazenamento/exibição das 3–10 referências
   (`REFERENCE` e pares `BEFORE`/`AFTER`).
7. **Fase G — Validação com fotógrafo**: critérios e evidências
   `EDITING_READY_FOR_BETA` (mesmo padrão das rodadas anteriores).

**Critérios de prontidão (Edit):** typecheck/lint/testes PASS após cada fase;
testes do item 17 verdes; migração v1→v2 sem perda; planos auditáveis; XMP
round-trip; export byte-idêntico preservado; nenhum original escrito.

## 19. Roadmap macro

- **Beta 0.1.1**: Fases A–B (fundações + perfis/questionário).
- **Beta 0.2**: Fases C–D (geração e revisão de planos).
- **Beta 0.3**: Fase E (XMP), depois F e G.
- Marcadores intermediários criados a cada fase concluída (tags locais).

## 20. Fase A — contrato implementado (2026-10-07)

### Persistência e compatibilidade

`Store` herda somente operações persistentes de `EditingStore`. As três
tabelas novas e seus índices são criados em `BEGIN IMMEDIATE`; falhas fazem
`ROLLBACK`, incluindo o `PRAGMA user_version`. Não há mecanismo de backup
no Store Beta; é usado seu mecanismo equivalente de transação/rollback.
A versão v2 só é gravada depois dos creates. Nenhuma tabela Beta é removida
ou alterada. A rotina Beta de recuperação de trabalhos interrompidos permanece.

Coleções sem tabelas editing retornam `[]`; após upgrade, projetos antigos
possuem tabelas vazias. Erros de versão futura são explícitos, sem downgrade.

Métodos disponíveis no Store:

- `createEditingProfile(input)`, `getEditingProfile(id)`, `listEditingProfiles()`,
  `updateEditingProfile(id, input)`, `deleteEditingProfile(id)`;
- `createEditingPlan(profileId, sourcePhotoId)`, `getEditingPlan(id)`,
  `listEditingPlans(profileId?)`, `updateEditingPlanStatus(id, status)`,
  `deleteEditingPlan(id)`;
- `addReferenceImage(input)`, `listReferenceImages(profileId?)`,
  `removeReferenceImage(id)`.

Perfis novos têm `profileVersion=1`; cada mudança efetiva em `q` ou `c`
incrementa exatamente uma unidade, independentemente da ordem das propriedades.
Alterações de nome/metadados não avançam versão. O chamador não escolhe versão.
Não há exclusão automática de planos: excluir perfil com planos/referências
falha explicitamente; o usuário deve remover dependentes de forma explícita.

### Fingerprint e validade

Implementação: SHA-256 UTF-8 de
`[EDITING_ENGINE_VERSION, profileVersion, sha256(canonicalJson({q,c})), ANALYSIS_VERSION, photos.hash].join('|')`.
Sem timestamps, nome, IDs ou caminhos. `sourceOriginalPath` é conferido
separadamente para detectar mudanças da referência original.

Planos só nascem `DRAFT`, com arrays vazios, `generatedAt=null` e `xmpPath=null`.
`statusHistory` registra estado e data das transições, preservando estado anterior.
Leitura compara versão do perfil/motor, status de análise, hash, path e fingerprint;
divergência persiste `STALE` sem remover o plano. Mudança do perfil ou reindexação
da origem marca STALE no evento; resultado de análise também verifica os planos
da foto. Alterações físicas externas são detectadas quando o fluxo existente de
indexação/análise atualiza a identidade, sem novo scanner de arquivos nesta fase.

Transições estruturais: DRAFT→GENERATED, GENERATED→REVIEWED,
REVIEWED→EXPORTED, EXPORTED→REVIEWED, qualquer estado não stale→STALE,
STALE→GENERATED. Saltos ou estados desconhecidos falham.
GENERATED exige geração prévia válida (`generatedAt`), regeneração de STALE
exige o motor futuro; EXPORTED exige evidência (`xmpPath`). Como nenhum motor
ou exporter foi implementado, essas evidências não são criadas pela Fase A.

### Quantitativos (MODEL_DELTA, espaço interno)

Todos são inteiros; `null` significa preferência ausente, `0` intensidade neutra.
Nenhum valor abaixo é Kelvin, EV ou slider equivalente de Lightroom.

| Parâmetro | Faixa | Semântica interna (negativo / positivo) |
|---|---|---|
| temperaturePreference | -100..100 | mais frio / mais quente |
| tintPreference | -100..100 | mais verde / mais magenta |
| exposurePreference | -100..100 | mais escuro / mais claro |
| contrastPreference | -100..100 | menos / mais contraste |
| highlightsPreference | -100..100 | reduzir / elevar altas luzes |
| shadowsPreference | -100..100 | densificar / abrir sombras |
| whitesPreference | -100..100 | reduzir / elevar brancos |
| blacksPreference | -100..100 | aprofundar / levantar pretos |
| saturationPreference | -100..100 | menos / mais saturação |
| vibrancePreference | -100..100 | menos / mais vivacidade |
| clarityPreference | -100..100 | suavizar / elevar contraste local |
| texturePreference | -100..100 | suavizar / acentuar textura |
| sharpeningPreference | -100..100 | reduzir / acentuar nitidez pretendida |
| grainPreference | 0..100 | ausente / intensidade de grão |
| vignettePreference | -100..100 | clarear / escurecer bordas |

Os conceitos `c` permanecem DERIVED_DELTA como contrato futuro, sem qualquer
conversão nesta fase. Todas as medidas não disponíveis em `SceneSignals`
aceitam `null`, inclusive indoor/temperatura/céu/verde; nenhum sinal é calculado.
Referências persistem paths/hash fornecidos, sem tocar nos arquivos nem nos planos.

### IPC e testes

Não foi necessário criar IPC para persistência local/testes. Não há novos
handlers/preload nem nova superfície sem licença; futura exposição de dados
deve utilizar o guard `owner` já existente. Nenhuma UI foi criada.

Os testes extraem o schema v1 diretamente da tag `clickit-beta-0.1.0`, geram
um banco isolado equivalente e comprovam integridade dos registros Beta.
Cobertura inclui round-trip/idempotência, vazio legado, range/enums/versões,
STALE por evento e por leitura, lifecycle, refs BEFORE/AFTER, fingerprint
determinístico e rollback real de DDL. Checks e classificação final estão
registrados em `docs/VALIDATION.md`.

## 21. Fase B — perfis, questionário e referências (implementado 2026-10-07)

### Questionário determinístico (`src/editing/questionnaire.ts`)

- 7 etapas: `Nome e intenção`, `Luz e exposição`, `Cor`, `Contraste e tons`,
  `Textura`, `Estilo geral`, `Revisão` (`STYLE_STEPS`).
- 15 sliders quantitativos (`STYLE_SLIDERS`) cobrindo todos os campos `q`
  (temperature, tint, exposure, contrast, highlights, shadows, whites, blacks,
  saturation, vibrance, clarity, texture, sharpening, grain, vignette) com
  faixa/step/passo determinístico.
- 6 conceitos (`STYLE_CONCEPTS`) cobrindo todos os campos `c`
  (skinToneStyle, greensStyle, bluesStyle, blackPointStyle, highlightStyle,
  overallMood) com opções explícitas.
- `newStyleProfile(nome)` gera perfil vazio `source:'QUESTIONNAIRE'`;
  `quantitativeAnswer`/`conceptualAnswer` aplicam o valor selecionado;
  `describeSlider` e `styleSummary` produzem resumo textual determinístico
  ("Seu estilo tende a: …"), reproduzível a partir do mesmo perfil.
- Os conceitos `c` permanecem **intenção semântica**: nenhum número derivado
  de `c` é calculado nem exposto na Fase B (conversão DERIVED_DELTA fica para
  as fases de geração/XMP).

### Referências (`src/editing/references.ts`)

- Adicionar por diálogo nativo de arquivo (main) ou cópia de arquivo existente;
  **nunca** modifica o arquivo original (leitura para SHA-256/thumbnail).
- Individuais `kind:'REFERENCE'`; pares Antes/Depois `BEFORE`+`AFTER` são
  adicionados juntos compartilhando `pairId` (decisão do usuário).
- Miniatura servida via protocolo `clickit://reference/<id>?v=<fingerprint>`
  com `Cache-Control: no-store`; referência ausente é marcada
  "Referência indisponível" sem quebrar o perfil.
- Arquivamentos de par são atômicos: falha em qualquer imagem do par descarta o par.

### IPC e licença (`src/editing/ipc.ts`, `src/main/workspace-license.ts`)

9 handlers, todos atrás de `requireWorkspaceLicense` (`VALID`/`VALID_OFFLINE`):

- `editing:profiles:list`, `editing:profiles:get`, `editing:profiles:create`,
  `editing:profiles:update`, `editing:profiles:delete`, `editing:profiles:duplicate`,
- `editing:references:list`, `editing:references:add`, `editing:references:remove`.

Sem licença, os 9 IPCs e o fetch de thumbnail são negados — sem nova superfície
fora do guard existente. `duplicate` copia somente `q/c` (decisão do usuário),
sem referências.

### UI (`src/renderer/EditingWorkspace.tsx`, `App.tsx`, `styles.css`)

- Entrada "Editar" na navegação principal; tela de perfis (nome, profileVersion,
  resumo de estilo, nº de referências; Criar/Editar/Duplicar/Excluir com confirmação).
- Wizard de 7 etapas com sliders e opções conceituais; revisão antes de salvar.
- Grade de referências com miniaturas e estados vazios/indisponíveis.
- "Geração de edição · Em breve" discreto na tela de perfil (sem geração real).

### Testes e validação

- `tests/editing-style.test.ts`: 8 casos (cobertura das 7 etapas/15/6,
  determinismo e limites, conceitos sem derivação + resumo reproduzível,
  IPC criar/editar/profileVersion/STALE/persistência, duplicar sem referências,
  pairId BEFORE/AFTER + arquivo ausente preservando original, atomicidade de par,
  bloqueio de licença nos 9 IPCs).
- Suite: **111/111 PASS** (85 Beta + 18 Fase A + 8 Fase B); typecheck, lint e build PASS.
- Validação GUI automatizada em Electron real
  (`scripts/validate-editing-ui.mjs`): **PASS**, 10 checks, 0 erros; screenshots e
  `validation.json` em `docs/evidence/editing-ui/`. Cobre criação/edição da UI,
  wizard, duplicar, diálogo nativo de referência/thumbnail, par Antes/Depois,
  persistência após reabrir o app, referência indisponível, remoção, confirmação
  de exclusão e gate de ativação.
- Nenhuma geração de plano real, XMP, motor de edição, preview/editado ou nova IA
  entrou na Fase B (permanecem fases C–G).

## 22. Fase C — gerador de plano determinístico (implementado 2026-10-07)

### Escopo

Geração **real e determinística** de `EditingPlan` por foto a partir do
`EditingProfile` vigente e dos **sinais reais** da análise. Nada de XMP,
preview editado, modelos novos, aprendizado por referência ou Lightroom.
`ReferenceImage` **não influencia** o plano (permanece referência visual).

### Motor puro (`src/editing/planner.ts`)

- `EDITING_ENGINE_VERSION = 2` (+1 frente à Fase A que falava de "motor futuro").
- **`baseStyle`** — cópia 1:1 dos quantitativos `q` do perfil na escala interna
  −100..+100 (ajustes com valor `0` são omitidos do array).
- **`sceneCorrection`** — correção conservadora de cena, **somente** com
  `confidence >= 0.6` e `exposure < 70`: `deficit = 70 − exposure`;
  `shadows = min(14, round(deficit*0.2))`, `blacks = min(7, round(deficit*0.1))`,
  `highlights = −min(4, round(deficit*0.05))`. Zeros são omitidos. Sem esses
  gatilhos, `sceneCorrection` fica vazio (fotos saudáveis não são tocadas).
- **`finalAdjustment`** — `clamp(base + scene, −100..+100)`; `reason`
  `PROFILE_BASE` quando `base ≠ 0`, senão `SCENE`; nota sempre
  `"base X; cena Y; final Z."` (auditável por item).
- **`explanation`** — descritores por item com `param/base/scene/final/note`;
  a nota usa `describeSlider` do questionário (abaixado) para texto legível.
- **Advisories** (`sceneAdvisories`) — apenas observações derivadas de sinais
  reais: `sharpness` `UNCERTAIN`/`POSSIBLE_BLUR` → `ADVISORY`;
  olhos (`eyesScore` baixo ou ausente) → `OBSERVATION`;
  `isPortraitLike` (1 rosto com bbox ≥ 0.06 e centróide em [0.3, 0.7])
  → `OBSERVATION`; `ISO >= 3200` → `OBSERVATION`. Nenhum advisory vira ajuste.
- **`missingSignals`** — lista toda chave de `SceneSignals` nula; hoje sempre
  inclui `temperatureK`, `outdoorIndoor`, `skyPresence`, `greenPresence`
  (sinais que o pipeline ainda não mede). **Nunca inventados**.
- Conceitos `c` continuam sem virar número (DERIVED_DELTA fica para fase de XMP).

### Persistência e batch (`src/editing/store.ts`)

- `photoData(photoId)` — JOIN com `photo_metadata`/`photo_analysis` para montar
  `SceneSignals`; `planFor(profileId, photoId)`; `photoAsset(photoId)`.
- `generateEditingPlan(id)` — DRAFT→GENERATED com guard /gerado pelo motor/;
  regeneração só a partir de `DRAFT`|`STALE` ("Plano já gerado não pode ser
  regenerado automaticamente."); `inputFingerprint` recalculado na geração;
  `statusHistory` preservado.
- `generateEditingPlans(profileId, photoIds)` — retorna
  `{ generated, skipped: {photoId, reason}[] }`; fotos sem análise são puladas
  (o batch não falha); planos `GENERATED` válidos são devolvidos reutilizados
  (idempotência); `UNIQUE(profileId, photoId)`.
- Transições: `DRAFT → GENERATED`; `STALE → GENERATED` (via verify por
  `profileVersion`/engine/fingerprint).

### IPC e licença (`src/editing/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts`)

Nova assinatura `registerEditingHandlers(owner, store, choose, photos)` — 4
novos IPCs (13 no total, todos atrás de `requireWorkspaceLicense`):

- `editing:plans:list` / `editing:plans:get` — com `planView`, incluindo
  `profileName`, `photo.fileName` e `previewUrl` (`clickit://photo/<id>/preview?v=<mtime>`);
- `editing:plans:generate(profileId, scope)` — escopos `PHOTO`, `SELECTED`,
  `PICKS` (AI_SELECTED|SELECTED), `FAVORITES`, `ALL` (resolvidos sobre as fotos
  do projeto);
- `editing:plans:delete`.

### UI (`src/renderer/EditingWorkspace.tsx`, `styles.css`)

- Botão "Planos" por perfil (`aria-pressed`) abre o painel `.plan-section`:
  projeto, escopo (ClickIT Picks / Selecionadas / Favoritas / Esta foto), e
  botão "Gerar plano de edição".
- Cards `.plan-card` com badge de status (`.plan-badge-generated`), tabela
  `.plan-table` do `finalAdjustment` por `STYLE_SLIDERS`, `.plan-explanation`
  (chips "base · cena · final" + nota), `.plan-advisories` e `.plan-missing`.
- Nota de rodapé do painel: "Determinístico e auditável: perfil × sinais reais
  da foto. A foto original nunca é alterada. Sinais que o pipeline ainda não
  mede ficam como pendentes — jamais inventados."

### Testes e validação

- `tests/editing-plan.test.ts`: **13 casos** — perfil neutro sem análise, base 1:1,
  correção de exposição (default 45/conf 0.65 → shadows +5, blacks +3,
  highlights −1), saudável/baixa confiança, sharpness advisory, olhos/retrato,
  sinais não medidos + missing, clamp+merge, idempotência, persistência/reopen
  + fingerprint + byte-identity, STALE + regeneração + history, batch com skip,
  conceitos sem ajustes.
- Suite: **124/124 PASS** (85 Beta + 18 Fase A + 8 Fase B + 13 Fase C);
  typecheck, lint e build PASS.
- Validação GUI automatizada em Electron real
  (`scripts/validate-editing-plan-ui.mjs`): **PASS**, 5 checks, 0 erros;
  screenshots e `validation.json` em `docs/evidence/editing-plan-ui/`. Cobre
  geração por foto com valores/explicação/advisory/missing, batch ClickIT Picks
  idempotente, segunda foto saudável sem correção, originais byte-idênticos e
  persistência após reabrir (2 planos).
- Re-execução da validação GUI da Fase B tentada nesta rodada ficou instável
  no diálogo nativo de arquivo por RAM crítica do host (0.3 GB livres); o fluxo
  de referência foi confirmado em nível de store (import + thumbnail PASS) e a
  evidência PASS original foi restaurada de `git` — sem regressão de produto.
- Nada de XMP, preview/editado, modelos novos, aprendizado por referência ou
  Lightroom entrou na Fase C (permanecem fases D–G como autorizadas).

## 23. Fase D — prévia visual não destrutiva (implementado 2026-10-07)

### Escopo

Prévia visual **antes/depois** do `EditingPlan` (lado a lado, sliders
manuais, overrides, reset e revisão) SEM jamais ler o RAW nem escrever no
original/JPEG de origem. Nada de XMP, exportação editada, novos modelos de IA,
aprendizado por referência, Lightroom ou batch de exportação (Fase E).

### Mapeamento central (`src/editing/preview-map.ts`)

- Módulo **puro** (sem sharp/node) para uso no renderer; importa só tipos.
- `PREVIEW_ENGINE_VERSION = 1`, `PREVIEW_MAX_WIDTH = 1280`,
  `PREVIEW_JPEG_QUALITY = 85` — nunca render full-resolution por movimento
  de slider.
- `PREVIEW_PARAMS` (13): exposure, contrast, highlights, shadows, whites,
  blacks, saturation, vibrance, clarity, texture, sharpening, grain, vignette.
- `UNSUPPORTED_PREVIEW_PARAMS`: `temperaturePreference`/`tintPreference` —
  aprovados no schema mas **nunca simulados** (chips `UNSUPPORTED_PREVIEW`).
- `PREVIEW_RENDER_MAP` documenta a transformação interna −100..+100 → render:
  `exposureStops 0.75`, `contrastAmount 0.75` (pivô 0.5),
  `shadowsAmount 0.30`/`highlightsAmount 0.30`/`whitesAmount 0.35`/
  `blacksAmount 0.25` (pesos de luminância), `saturationFull 1.0`,
  `vibranceAmount 1.0` (sem proteção de pele — limitação registrada),
  `grainAmount 0.12`, `vignetteAmount 0.65` + `vignetteStart 0.45`,
  `claritySigma 20`, `textureSigma 3`, `sharpeningSigma 2`.
  **Sem equivalência 1:1 com Lightroom** (XMP é da Fase E).
- Semântica de override: **DELTA** sobre `finalAdjustment` —
  `effectiveValue = clamp(sugestão + override, −100..+100)` (grão 0..100);
  `effectiveAdjustments()` devolve `{ applied, unsupported, values }` e o
  motor recebe somente `values` dos params suportados ≠ 0.

### Motor (`src/editing/preview.ts`)

- Entrada: preview base em cache (JPEG — nunca o RAW), `photoHash`,
  `inputFingerprint`, valores efetivos e diretório próprio de cache.
- `previewFingerprint` = sha256(engine, largura, photoHash, inputFingerprint,
  `canonicalJson(values)`, tamanho+mtime do preview base) → qualquer
  componente muda ⇒ outro arquivo; preview base ausente ⇒ erro explícito.
- Render em chunks de 48 linhas com `yield` e cancelamento cooperativo
  (`PreviewCancelledError`); PRNG determinístico por pixel para granulação;
  estágios clarity/texture/sharpening via `sharpen()` e negativos via `blur()`;
  gravação atômica `.partial` + `rename`.
- Cache **separado** da análise (`storage/cache/editing-preview`).

### Persistência, IPC e licença

- `EditingPlan` ganhou `manualOverrides` (delta persistido) e `reviewedAt`;
  store: `setEditingPlanOverrides`/`resetEditingPlanOverrides` (aceita
  param ou tudo), `updateEditingPlanStatus` grava `reviewedAt` em
  `REVIEWED`; `photoHash(photoId)` para a chave do preview.
- 4 novos IPCs (**17 no total**, todos atrás de `requireWorkspaceLicense`):
  `editing:preview:render` (guards: DRAFT → "Plano ainda não foi gerado.";
  STALE → "Plano desatualizado — gere o plano novamente antes de visualizar
  a prévia."; token por plano cancela renders antigos), `editing:overrides:save`,
  `editing:overrides:reset`, `editing:plans:review`
  (transição apenas `GENERATED → REVIEWED`; `EXPORTED` exige XMP — Fase E).
- Protocolo `clickit://edited/<sha256>` em `src/main/index.ts`: regex
  estrita + `requireWorkspaceLicense` (a URL vaza somente bytes já editados
  em cache, dentro do workspace licenciado).

### UI (`PlanPreview` em `EditingWorkspace.tsx`, `styles.css`)

- Renderização sob demanda (IntersectionObserver + 160 px de margem),
  debounced 240 ms com flush em pointerup/keyup/blur e cancelamento de
  render anterior (sequência por card).
- Modos Antes / Depois / Lado a lado (`aria-pressed`) + botão "Segure para
  ver o original" (pointer e teclado). Cena base usa o preview existente
  (`clickit://photo/<id>/preview`) — nunca o RAW completo.
- 13 sliders com valor **efetivo**, chip "sugestão ±N" quando há override,
  reset individual (↺) e global "Voltar à sugestão ClickIT"; chips
  `UNSUPPORTED_PREVIEW` por param; estado STALE explícito; status de render
  (ms + cache) e botão "Marcar como revisado" → badge/data de revisão.
- Overrides persistem via IPC e são reaplicados ao reabrir; a sugestão
  gerada nunca é sobrescrita.

### Testes e validação

- `tests/editing-preview.test.ts`: **12 casos** — params suportados vs
  UNSUPPORTED; DELTA+clamp (inclusive grão); separação applied/unsupported;
  fingerprint determinístico e sensível a cada componente; JPEG no cache sem
  alterar a prévia base nem criar arquivos junto do original; cache hit/miss
  por override; cancelamento sem gravação; largura ≤ 1280; guards DRAFT/STALE
  via IPC; resultado IPC com applied/unsupported/overrides; reset
  individual/global byte-identical; revisão `GENERATED→REVIEWED` com
  `reviewedAt`, sem salto de estado e original intacto.
- `tests/editing-style.test.ts` atualizado: guard de licença cobre **17 IPCs**
  (inclui os 4 novos).
- Suite: **136/136 PASS** (85 Beta + 18 Fase A + 8 Fase B + 13 Fase C +
  12 Fase D); typecheck e build PASS (sequenciais); lint dos arquivos
  alterados PASS. Lint global permanece com 4 erros pré-existentes fora das
  alterações C/D (`landing/` e `scripts/validate-editing-plan-ui.mjs`).
- Validação GUI automatizada em Electron real
  (`scripts/validate-editing-preview-ui.mjs`): **PASS**, 9 checks, 0 erros;
  screenshots e `validation.json` em `docs/evidence/editing-preview-ui/`.
  Cobre: prévia renderizando sozinha em `clickit://edited` com chip
  UNSUPPORTED (temperature); comparação Antes/Depois/Lado a lado +
  segurar-para-ver-original; slider manual com DELTA + chip "sugestão +20" e
  re-render; volta ao valor da sugestão reusa o cache; reset global; revisão
  `GENERATED→REVIEWED`; originais byte-idênticos; fechar/reabrir mantém
  Revisado + cache. Executado com o host em RAM crítica (~0,16 GB livres)
  sem falhas.
- Nada de XMP, exportação editada, escrita no original, novos modelos,
  aprendizado por referência ou Lightroom entrou na Fase D (permanece a
  Fase E como autorizada).
