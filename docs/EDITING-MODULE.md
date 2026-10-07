# Módulo Editar — Planejamento Técnico

> **Status: SOMENTE PLANEJAMENTO.** Nenhuma linha de código foi escrita.
> Este documento define arquitetura, schema, interfaces, fluxo, riscos e o
> plano dividido em fases para a futura aba **Editar** do ClickIT.
> Base congelada: Beta 0.1.0 (`tag clickit-beta-0.1.0`, commit `cd7f079`).
> Revisão final de schema/interfaces: **SCHEMA_READY_FOR_PHASE_A**
> (2026-10-07). A Fase A **não** foi iniciada.

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

> Estes tipos são a especificação. Serão criados em `src/editing/types.ts`
> apenas na Fase A.

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
  exposurePreference: SliderValue | null;    // decimos de EV (35 = +0.35 EV)
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
  generatedAt: string;                // quando o conteudo foi (re)gerado
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
  sha256(canonicalJson(EditingProfile)) ; // CONTEUDO do perfil (q+c ordenados)
  ANALYSIS_VERSION                  ;  // versao da analise (ja existe em config)
  photos.hash                       ;  // hash sha-256 do ARQUIVO de origem persistido

inputFingerprint = sha256(joinsComPipeDasEntradasAcima)
```

- `canonicalJson` = `JSON.stringify` com chaves recursivamente ordenadas,
  sem espaços, usando apenas os campos do perfil (nada gerado em runtime).
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
- A conversão (curvas/faixas documentadas por parâmetro, ex.: temperatura ±40,
  exposição em décimos de EV) acontece **somente na Fase E**, dentro de
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
  profile_version INTEGER NOT NULL DEFAULT 1,
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
- Persistência de `profile_version` e `status`/`fingerprint` também em coluna
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

## 17. Testes de compatibilidade schema/interfaces (implementar na Fase A)

`tests/editing-schema.test.ts` — casos obrigatórios:

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