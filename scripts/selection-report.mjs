import { analysisWeights } from '../src/lib/config.ts';
import { technicalScore } from '../src/ai/technical-score.ts';

// Explanation only; production makeAnalysis/group/Store determine scores and picks.
export function contributions(analysis) {
  if (!analysis) return null;
  if (analysis.version.endsWith('-focus-saturation1')) return technicalScore(analysis.regionalSharpness, analysis.exposure, analysis.faceScore, analysis.eyesScore).contributions;
  const values = { sharpness: analysis.faceScore ?? analysis.regionalSharpness, exposure: analysis.exposure, face: analysis.faceScore, eyes: analysis.eyesScore };
  const denominator = Object.entries(values).reduce((sum, [key, value]) => sum + (value === null ? 0 : analysisWeights[key]), 0);
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? null : value * analysisWeights[key] / denominator]));
}

export function explainRanking(photo, other) {
  if (!photo.analysis) return 'Sem análise completa; ranking não disponível.';
  if (!other) return 'Sem concorrente no grupo; não comprova superioridade relativa.';
  if (photo.analysis.overall === other.analysis.overall) return 'Empate no score arredondado; desempate de produção por ID, não preferência estética.';
  const a = contributions(photo.analysis), b = contributions(other.analysis);
  const differences = Object.keys(a).map(key => ({ metric: key, delta: (a[key] ?? 0) - (b[key] ?? 0) }));
  const direction = Math.sign(photo.analysis.overall - other.analysis.overall);
  differences.sort((x, y) => direction * (y.delta - x.delta));
  const main = differences[0];
  return `${direction > 0 ? 'Vantagem' : 'Desvantagem'} relativa em ${main.metric}: ${main.delta.toFixed(3)} pontos ponderados vs ${other.fileName}. Composição/expressão estética não avaliada.`;
}

export function validateScenario(photos, groups, expectations) {
  if (!expectations) return [{ criterion: 'known-fixture', status: 'NOT_EVALUATED', detail: 'Conjunto sem rótulos conferidos por hash; inspecione os resultados.' }];
  const byHash = new Map(photos.map(photo => [photo.sha256, photo]));
  const rows = expectations.images.map(label => ({ ...label, photo: byHash.get(label.sha256) }));
  const sequence = rows.filter(row => row.role === 'sequence');
  const outsiders = rows.filter(row => row.role === 'different');
  const group = groups.find(g => sequence.every(row => g.ids.includes(row.photo?.id)));
  const checks = [];
  const add = (criterion, status, detail) => checks.push({ criterion, status, detail });
  const sequenceComplete = sequence.length > 0 && sequence.every(row => row.photo?.analysis && row.photo?.groupId);
  add('five-similar-together', !sequenceComplete ? 'NOT_EVALUATED' : group ? 'PASS' : 'FAIL', !sequenceComplete ? 'Pipeline incompleto; agrupamento ainda não pode ser validado.' : group ? group.id : 'As cinco imagens rotuladas não estão juntas em um grupo de produção.');
  add('different-outside', group ? (outsiders.every(row => !group.ids.includes(row.photo?.id)) ? 'PASS' : 'FAIL') : 'NOT_EVALUATED', 'As duas imagens distintas devem ficar fora do grupo das cinco.');
  add('sequence-not-rejected', !sequenceComplete ? 'NOT_EVALUATED' : sequence.every(row => row.photo.decision !== 'REJECTED') ? 'PASS' : 'FAIL', 'Nenhuma fotografia da sequência deve ser rejeitada automaticamente.');
  for (const tag of ['closed', 'soft']) {
    const target = rows.find(row => row[tag])?.photo;
    const alternatives = sequence.map(row => row.photo).filter(photo => photo?.analysis?.faces.some(face => face.eyes === 'OPEN') && !rows.some(row => row.soft && row.photo?.id === photo.id));
    const sameGroup = target?.groupId && alternatives.filter(photo => photo.groupId === target.groupId);
    const lower = sameGroup?.some(photo => photo.rank < target.rank);
    add(`${tag}-lower-priority`, !target?.analysis || !sameGroup?.length ? 'NOT_EVALUATED' : lower ? 'PASS' : 'FAIL', `${target?.fileName ?? tag}: deve perder prioridade para alternativa aberta no mesmo grupo.`);
    if (tag === 'closed') add('closed-eyes-detected', !target?.analysis ? 'NOT_EVALUATED' : target.analysis.faces.some(face => face.eyes === 'CLOSED') ? 'PASS' : 'FAIL', 'A imagem rotulada fechada deve ser medida como CLOSED.');
    if (tag === 'soft') add('soft-not-rejected', !target?.analysis ? 'NOT_EVALUATED' : target.decision !== 'REJECTED' && target.rank !== null ? 'PASS' : 'FAIL', 'Desfoque pode reduzir prioridade, mas a imagem permanece no ranking.');
  }
  const acceptable = rows.filter(row => row.acceptablePick).map(row => row.photo?.id);
  add('pick-acceptable', !group ? 'NOT_EVALUATED' : acceptable.includes(group.clickitPick?.id) ? 'PASS' : 'FAIL', 'Pick entre alternativas rotuladas tecnicamente boa ou composição/expressão preferida; o algoritmo não mede estética.');
  return checks;
}
