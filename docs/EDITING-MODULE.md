# Módulo Editar — Planejamento Técnico

> **Status: SOMENTE PLANEJAMENTO.** Nenhuma linha de código foi escrita.
> Este documento define arquitetura, schema, interfaces, fluxo, riscos e o
> plano dividido em fases para a futura aba **Editar** do ClickIT.
> Base congelada: Beta 0.1.0 (`tag clickit-beta-0.1.0`, commit `cd7f079`).

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
- Export atual: cópia byte a byte do original com verificação de integridade
  (`src/services/export.ts`). **Não pode ser tocada** — o Editar só adiciona
  caminhos próprios (planos, XMP) e nunca reescreve original.
- Preview/thumbs reutilizam o cache existente (`src/services/preview.ts`);
  o Editar não deve criar novo pipeline de imagem.

## 3. Vocabulário da aba Editar

- **ClickIT Picks**: fotos com decisão `AI_SELECTED` ou `SELECTED`.
- **Selecionadas**: decisão `SELECTED` (escolha hu mana no fluxo atual).
- **Favoritas**: `favorite = true` em `photo_decisions`.
- **Conjunto manual**: seleção explícita feita pelo usuário dentro da aba.
- **Fotos alvo**: união/tomando entre os conjuntos acima, escolhida na UI.

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
- **Determinístico**: o mesmo perfil + mesmas fotos produzem o mesmo plano
  (importante para auditar e para testes).
- **Não destrutivo**: originais nunca são modificados; exportações futuras de
  XMP vão para a pasta de destino como sidecar `<nome>.xmp`.
- **Leve**: sem novo componente de IA pesada; sem paralelismo novo (RAM 8 GB).

## 5. Tipos e interfaces (proposta TypeScript)

> Estes tipos são a especificação. Serão criados em `src/editing/types.ts`
> apenas na Fase A.

```ts
// Escala única: valores inteiros -100..+100 (0 = neutro), como no Lightroom.
export type SliderValue = number; // -100..+100, step 1

export interface EditingProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: 'QUESTIONNAIRE' | 'PRESET' | 'MANUAL';
  presetPath: string | null;           // quando originado de preset XMP
  // --- quantitativos (neutro = null) ---
  temperaturePreference: SliderValue | null;  // K, neg=mais azul, pos=mais âmbar
  tintPreference: SliderValue | null;
  exposurePreference: SliderValue | null;     // EV x 10, ex.: +35 = +0.35 EV
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
  grainPreference: SliderValue | null;        // 0..+100 somente
  vignettePreference: SliderValue | null;     // -100..+100 (neg=clareia, pos=escurece)
  // --- conceituais (sem representação direta em XMP v1) ---
  skinToneStyle: 'NEUTRAL' | 'WARM' | 'COOL' | 'NATURAL' | null;
  greensStyle: 'NATURAL' | 'SOFT' | 'DESATURATED' | 'JUICY' | null;
  bluesStyle: 'NATURAL' | 'MUTED' | 'DEEP' | null;
  blackPointStyle: 'WASHED' | 'NATURAL' | 'DEEP' | null;
  highlightStyle: 'SOFT' | 'NATURAL' | 'BRIGHT' | null;
  overallMood: 'CLEAN' | 'EDITORIAL' | 'FILM' | 'DRAMATIC' | 'NATURAL' | null;
}

export interface QuestionnaireAction {
  param: keyof EditingProfile;
  amount: number; // delta aplicado ao valor vigente (determinístico)
  when: Record<string, string | boolean | number>; // condição opcional (ex.: tipo de cena)
}

export interface QuestionnaireItem {
  id: string;
  question: string;
  options: { label: string; actions: QuestionnaireAction[] }[];
}

// Sinais que já existem hoje (Assessment). Campos opcionais/null = indisponível.
export interface SceneSignals {
  exposure: number;                 // 0..1 (exists)
  sharpness: number;                // exists
  blur: 'CLEAR' | 'DOF_POSSIBLE' | 'POSSIBLE_BLUR' | 'UNCERTAIN';
  faceCount: number;                // exists (faces[])
  faceScore: number | null;         // exists
  overall: number;                  // exists
  confidence: number;               // exists
  isPortraitLike: boolean;          // derivado (um rosto grande/central)
  // futuros (hoje null — NUNCA inventar valores):
  outdoorIndoor: 'OUTDOOR' | 'INDOOR' | null;
  temperatureK: number | null;      // estimativa de balanço de branco
  skyPresence: number | null;       // 0..1
  greenPresence: number | null;     // 0..1
}

export interface EditingAdjustment {
  param: string;                     // ex.: 'temperature', 'exposure', 'greens.saturation'
  value: SliderValue;
  reason: 'PROFILE' | 'SCENE' | 'USER';
  note: string;                      // legível para auditoria
}

export interface EditingPlan {
  id: string;                        // planId (uuid) — rastro
  profileId: string;
  photoId: string;
  createdAt: string;
  updatedAt: string;
  inputFingerprint: string;          // hash(ANALYSIS_VERSION + photo.hash + profile.hash)
                                     // -> invalida o plano quando entradas mudam
  baseStyle: EditingAdjustment[];    // derivado do perfil (determinístico)
  sceneCorrection: EditingAdjustment[]; // derivado de SceneSignals (conservador)
  finalAdjustment: EditingAdjustment[]; // ajustes manuais do usuário
  status: 'DRAFT' | 'REVIEWED' | 'EXPORTED';
  xmpPath: string | null;            // preenchido na Fase E
}

export interface ReferenceImage {
  id: string;
  profileId: string;
  photoId: string | null;            // foto do projeto, se aplicável
  externalPath: string;              // caminho do arquivo de referência
  role: 'GOAL' | 'BEFORE_AFTER';     // antes/depois = par com beforeOf
  beforeOf: string | null;           // id da referência 'after' correspondente
  notes: string;
}

export interface XmpExportResult {
  ok: boolean;
  written: string[];                 // caminhos dos .xmp criados
  skipped: string[];                 // fotos sem plano aprovado
  errors: string[];
}
```

Detalhe de mapeamento quantitativo (v1):

- `exposurePreference`: armazenado em décimos de EV (ex.: `35` = `+0.35 EV`),
  convertido para `Exposure2012` na exportação;
- `temperaturePreference`: em unidades relativas (-100..+100), convertidas para
  `Temperature` (Lightroom) dentro de uma faixa documentada (ex.: ± 40);
- `contrast/highlights/shadows/whites/blacks/saturation/vibrance/clarity/
  texture/sharpening/grain/vignette`: 1:1 para os campos XMP correspondentes.

**Conceituais (skinToneStyle, greensStyle, bluesStyle, blackPointStyle,
highlightStyle, overallMood) NÃO têm campo direto em XMP.** Eles são usados
para *derivar* um subconjunto dos ajustes quantitativos (ex.: `blackPointStyle:
'DEEP'` => `blacks: -18`, `shadows: -8`) de forma determinística e documentada
tabela acima — no plano, sempre aparecem como `reason: 'PROFILE'`.

## 6. Schema proposto (migração segura da base existente)

Mesmo padrão do Store atual: `CREATE TABLE IF NOT EXISTS`, colunas `TEXT` com
JSON, FKs para `photos`. **Nenhuma tabela existente é alterada.** O
`PRAGMA user_version` sobe para `2` (guard de habilitação das novas telas).

```sql
-- roda no construtor, junto das demais
PRAGMA user_version=2;

CREATE TABLE IF NOT EXISTS editing_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,             -- EditingProfile (JSON)
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS editing_plans (
  id TEXT PRIMARY KEY,
  profileId TEXT NOT NULL REFERENCES editing_profiles(id),
  photoId TEXT NOT NULL REFERENCES photos(id),
  inputFingerprint TEXT NOT NULL,
  data TEXT NOT NULL,             -- EditingPlan (JSON)
  status TEXT NOT NULL DEFAULT 'DRAFT',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(profileId, photoId)
);

CREATE TABLE IF NOT EXISTS reference_images (
  id TEXT PRIMARY KEY,
  profileId TEXT NOT NULL REFERENCES editing_profiles(id),
  photoId TEXT REFERENCES photos(id),
  externalPath TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'GOAL',
  beforeOf TEXT,
  data TEXT NOT NULL              -- ReferenceImage (JSON)
);

CREATE INDEX IF NOT EXISTS editing_plans_profile ON editing_plans(profileId);
CREATE INDEX IF NOT EXISTS editing_plans_photo ON editing_plans(photoId);
CREATE INDEX IF NOT EXISTS reference_images_profile ON reference_images(profileId);
```

Regras da migração:

- Executar dentro de transação no construtor, como o `CREATE TABLE IF NOT
  EXISTS` atual; banco v1 existente continua válido (tabelas novas apenas).
- `inputFingerprint` permite detectar planos desatualizados (análise refeita,
  arquivo substituído) sem apagar histórico: a UI marca "desatualizado" e
  permite regenerar.
- Teste obrigatório na Fase A: copiar um banco v1 real, abrir com o novo
  código, conferir que nada quebrou e que `user_version` vira 2.

## 7. Reaproveitamento de sinais (nenhum classificador inventado)

| Sinal desejado            | Origem hoje | Uso no Editar (v1)              |
|---------------------------|-------------|----------------------------------|
| Exposição (0..1)          | `analysis.exposure` | Scene: correção conservadora de `exposure`/`whites`/`blacks` só se `confidence` alta |
| Nitidez / DOF             | `sharpness`, `blur` | `clarityPreference` aplicado; não corrigir desfoque |
| Rostos / retrato          | `faces[]`, `faceScore` | `faceCount>0` => não esmagar `skinTone`; ajustes de pele conservadores |
| Olhos                     | `eyesScore` | inferência de prioridade (retrato) |
| Estética geral            | `overall`, `embeddingAvailable` | *não* vira ajuste efetivo — só contexto de auditoria |
| Indoor/outdoor            | **indisponível** | `null` — não usar |
| Temperatura (WB)          | **indisponível** | `null` — correção de cena de temperatura fica DESLIGADA até existir sinal confiável |
| Presença de céu/verde     | **indisponível** | `null` — `greensStyle`/`bluesStyle` aplicados via perfil, não via cena |

**Regra de ouro:** se o sinal não existe hoje, o campo fica `null` e o
`sceneCorrection` correspondente não gera ajuste. O plano registra o motivo
via `note` ("sinal indisponível — sem correção de cena"). Isto evita
"classificadores falsos" e mantém a auditoria honesta.

## 8. Questionário (estruturado, sem "IA mágica")

Cada pergunta oferece opções; cada opção aplica um conjunto **determinístico**
de deltas (`QuestionnaireAction`) sobre o perfil. Exemplos:

| Pergunta | Exemplo de opções | Ação no perfil |
|---|---|---|
| Como você prefere a luz geral das fotos? | Mais clara / Natural / Mais escura | `exposurePreference` +15 / 0 / -15 |
| Temperatura da cena? | Quente / Neutra / Fria | `temperaturePreference` +25 / 0 / -25 |
| Contraste? | Suave / Médio / Forte | `contrastPreference` +15 / 0 / +25 |
| Sombras? | Abertas / Naturais / Densas | `shadowsPreference` +30 / 0 / -20 |
| Highlights? | Suaves / Brilhantes | `highlightsPreference` -25 / +15 |
| Cores? | Naturais / Intensas | `saturationPreference` -10 / +20; `vibrancePreference` 0/+15 |
| Verdes? | Naturais / Suaves / Dessaturados | `greensStyle` NATURAL / SOFT / DESATURATED |
| Pele? | Neutra / Quente / Fria | `skinToneStyle` NEUTRAL / WARM / COOL |
| Visual? | Clean / Editorial / Filme / Dramático / Natural | conjunto base (perfil predefinido por opção) |
| Granulação? | Sem / Leve / Visível | `grainPreference` 0 / +20 / +40 |
| Vinheta? | Sem / Sutil / Forte | `vignettePreference` 0 / -12 / -25 |
| Pretos? | Lavados / Naturais / Profundos | `blackPointStyle` WASHED / NATURAL / DEEP |

Resultado: um `EditingProfile` com `source: 'QUESTIONNAIRE'`, sempre revisável
na UI e editável manualmente depois.

## 9. Presets XMP (futuro — só interface estruturada se segura)

- **Upload/leitura**: receber arquivo `.xmp`; ler somente campos da whitelist
  (`crs:Temperature`, `crs:Tint`, `Exposure2012`, `Contrast2012`,
  `Highlights2012`, `Shadows2012`, `Whites2012`, `Blacks2012`, `Saturation`,
  `Vibrance`, `Clarity`, `Texture`, `Sharpness`, `Grain`, `Vignette`);
  valores fora da faixa válida são descartados com aviso.
- **Associação**: importar cria `EditingProfile` com `source:'PRESET'` e
  `presetPath` salvo. Nunca aplicar preset sobre pixels.
- **Parser**: módulo dedicado `src/editing/xmp.ts` (também reaproveitado pela
  exportação da Fase E). NA Fase F, import-only; nenhuma escrita.
- Se qualquer tag for desconhecida/ambígua: ignorar com nota, nunca adivinhar.

## 10. Referências visuais (armazenamento/estrutura apenas)

- 3 a 10 fotos de referência por perfil (recomendado), com `role GOAL` ou par
  `BEFORE_AFTER` (antes/depois) quando disponível.
- Somente referência de caminho (`externalPath` ou `photoId` do projeto) —
  nenhuma cópia de imagem, nenhum embedding, nenhum treino.
- A UI mostra a referência ao lado do plano gerado para o fotógrafo comparar
  visualmente; a API de comparação **não existe nesta fase**.
- Caminho inexistente -> marcado `missing` na UI (não quebra o perfil).

## 11. Fluxo esperado (tela)

```
Aba Editar
  1. Escolher perfil (ou criar novo)
  2. Questionário (opcional; perfis podem começar MANUAL)
  3. Referências (opcional)
  4. Escolher fotos alvo: Picks | Selecionadas | Favoritas | Manual
  5. Gerar plano  -> lista de fotos com ajustes previstos (DRAFT)
  6. Revisar/ajustar (finalAdjustment)
  7. Marcar como REVISED (guarda: sem REVISED não exporta)
  8. Exportar XMP (Fase E)
```

Simplicidade: o fluxo inteiro deve caber em poucas telas; não criar telas
extras nesta fase de planejamento.

## 12. Estratégia XMP (alvo primário; implementação só na Fase E)

- O ClickIT **gerencia o plano**; o XMP é o ponto de entrega para
  Lightroom/Camera Raw (não substitui o Lightroom).
- Exportação: para cada foto alvo com plano `REVIEWED`, escrever
  `<destino>/<nome>.xmp` lado-a-lado com a **cópia** da foto (a exportação de
  cópia continua a atual; o módulo só acrescenta o sidecar).
- Regras: só parâmetros da whitelist; valores arredondados para inteiros;
  `rate`/`PresetName` não inventados; nunca escrever no original.
- Round-trip: teste Fase E lê de volta o XMP gerado e confirma igualdade de
  parâmetros (mesmo parser da Fase F).

## 13. Limitações assumidas (v1)

- Sem correção de cor / WB real (falta sinal de temperatura).
- Sem detecção de outdoor/indoor, céu ou verde (campos `null`).
- Dois parâmetros de perfil (`grain`, `vignette`) só exportam se a versão de
  Lightroom do usuário suportar (documentar; descartar com aviso se não for
  possível detectar).
- Perfis conceituais não mapeiam 1:1 para XMP (derivados deterministicamente).
- Bateria de "antes/depois" automática fica para fase futura.

## 14. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Migração v2 quebrar banco v1 existente | transação + `IF NOT EXISTS`; teste com cópia de banco v1 real |
| Planos desatualizados após nova análise | `inputFingerprint` + aviso de regeneração |
| XMP incompatível com Lightroom | whitelist documentada; round-trip test; valores na faixa |
| "Edição automática mágica" quebra confiança | sempre auditável (`reason`/`note`); default conservador |
| Export atual regredir | Fase de planejamento não toca `export.ts`; testes de byte-identity permanecem |
| Referências externas sumirem | marcar `missing`, não falhar o perfil |
| Sinal indisponível virado em ajuste falso | regra do item 7 (campos `null` proíbem ajuste) |
| Consumo de RAM ao revisar muitas fotos | usar preview cache existente; revisão em lote com pagina |
ção de 20–50 |

## 15. Plano de implementação por fases (ordem)

1. **Fase A — Fundações**: `src/editing/types.ts`, migração schema `v2`,
   métodos `Store` para as 3 tabelas, testes de migração sobre banco v1 + 85/85
   atuais intactos. *Não* gera planos.
2. **Fase B — Perfis e questionário**: UI de criar/editar `EditingProfile` e
   questionário estruturado (item 8). Sem geração de plano.
3. **Fase C — Gerador de plano (baseStyle)**: planner determinístico perfil→
   ajustes; persistência em `editing_plans`; revisão na UI (sem scene);
   invalidação por fingerprint.
4. **Fase D — Correção de cena conservadora**: aplicar `sceneCorrection` SOMENTE
   com sinais existentes e `confidence` alta (item 7). Auditoria por foto.
5. **Fase E — Exportação XMP v1**: sidecar na pasta de destino; whitelist;
   round-trip test. Export atual intocado.
6. **Fase F — Presets e referências**: import de XMP (whitelist), associação
   `source:'PRESET'`; armazenamento e exibição das 3–10 referências.
7. **Fase G — Validação com fotógrafo**: critérios e evidências
   `EDITING_READY_FOR_BETA` (mesmo padrão das rodadas anteriores).

**Critérios de prontidão (Edit):** typecheck/lint/testes PASS após cada fase;
migração v1→v2 sem perda; planos auditáveis; XMP round-trip; export byte-idêntico
preservado; nenhum original escrito.

## 16. Roadmap macro

- **Beta 0.1.1**: Fases A–B (fundações + perfis/questionário).
- **Beta 0.2**: Fases C–D (geração e revisão de planos).
- **Beta 0.3**: Fase E (XMP), depois F e G.
- Marcadores intermediários criados a cada fase concluída (tags locais).