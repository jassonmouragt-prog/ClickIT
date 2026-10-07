import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cosine, pairThreshold, connection, connectedComponents } from '../src/ai/grouping.ts';
import { LIMITS } from '../src/lib/config.ts';
import { root } from './models.mjs';

function parseArgs(args) {
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--workspaces' || !args[1] || args[1].startsWith('--'))) throw new Error('Uso: npm run grouping:audit [-- --workspaces "C:\\dev\\ClickIT\\.test-tmp\\ranking-validate"]');
  return args.length === 2 ? path.resolve(args[1]) : path.join(root, '.test-tmp', 'ranking-validate');
}

function readCandidates(dbFile) {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const rows = db.prepare(`SELECT p.id id, p.fileName fileName, p.captureDate captureDate, p.hash hash, a.data analysis, e.data embedding, gp.groupId groupId
      FROM photos p LEFT JOIN photo_analysis a ON a.photoId=p.id LEFT JOIN photo_embeddings e ON e.photoId=p.id LEFT JOIN group_photos gp ON gp.photoId=p.id
      WHERE p.projectId IN (SELECT id FROM projects) AND p.analysisStatus='DONE'`).all();
    return rows.map(row => ({
      id: String(row.id), fileName: String(row.fileName), date: row.captureDate ? String(row.captureDate) : null,
      hash: String(row.hash ?? ''), embedding: row.embedding ? JSON.parse(String(row.embedding)) : null,
      analysis: row.analysis ? JSON.parse(String(row.analysis)) : null,
      groupId: row.groupId ? String(row.groupId) : null
    }));
  } finally { db.close(); }
}

function fileNameSets(groups) {
  return groups.map(files => [...files].sort((a, b) => a.localeCompare(b))).sort((a, b) => a[0].localeCompare(b[0]));
}

async function auditDataset(directory) {
  const started = performance.now();
  const dbFile = path.join(directory, 'ranking.sqlite');
  if (!existsSync(dbFile)) return { name: path.basename(directory), status: 'NOT_TESTED', errors: [`Banco ausente: ${dbFile}`] };
  const candidates = readCandidates(dbFile);
  const pairs = [];
  let nearMissCount = 0, temporalCount = 0, connectedCount = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i], b = candidates[j];
      const similarity = a.embedding && b.embedding ? cosine(a.embedding, b.embedding) : null;
      const threshold = pairThreshold(a, b);
      const deltaSeconds = a.date && b.date ? Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 1000 : null;
      const link = connection(a, b);
      if (deltaSeconds !== null && deltaSeconds <= LIMITS.temporalSeconds) temporalCount++;
      if (link.connected) connectedCount++;
      const nearMiss = !link.connected && similarity !== null && similarity >= LIMITS.similarity && threshold === LIMITS.visualOnlySimilarity;
      if (nearMiss) nearMissCount++;
      pairs.push({
        a: a.fileName, b: b.fileName,
        similarity: similarity === null ? null : Number(similarity.toFixed(6)),
        captureTimeDeltaSeconds: deltaSeconds === null ? null : Number(deltaSeconds.toFixed(3)),
        threshold, connected: link.connected, exactDuplicate: link.exactDuplicate,
        reason: link.exactDuplicate ? 'exact-duplicate' : link.connected ? 'similarity>=threshold' : nearMiss ? 'near-miss (conectaria com proximidade temporal <= 12s)' : 'below-threshold',
        nearMiss
      });
    }
  }
  const recomputed = connectedComponents(candidates).map(members => members.map(member => member.fileName));
  const storedMap = new Map();
  for (const candidate of candidates) {
    const key = candidate.groupId ?? `ungrouped-${candidate.id}`;
    if (!storedMap.has(key)) storedMap.set(key, []);
    storedMap.get(key).push(candidate.fileName);
  }
  const stored = fileNameSets([...storedMap.values()]);
  const recomputedSets = fileNameSets(recomputed);
  const consistent = JSON.stringify(stored) === JSON.stringify(recomputedSets);
  return {
    name: path.basename(directory), status: consistent ? 'PASS' : 'FAIL',
    photos: candidates.length, pairsEvaluated: pairs.length,
    connectedPairs: connectedCount, temporalPairs: temporalCount, nearMissPairs: nearMissCount,
    groupsStored: stored.length, groupsRecomputed: recomputedSets.length,
    groups: { stored, recomputed: recomputedSets },
    thresholds: { similarity: LIMITS.similarity, visualOnlySimilarity: LIMITS.visualOnlySimilarity, temporalSeconds: LIMITS.temporalSeconds },
    thresholdNote: 'Datas ausentes (datasets sem EXIF) => todo par usa visualOnlySimilarity (0.965). nearMiss = par com similaridade >= 0.91 e < 0.965 que conectaria apenas houvesse proximidade temporal <= 12s. Auditoria é somente leitura; nenhum threshold foi alterado.',
    pairs,
    errors: [], wallMs: performance.now() - started
  };
}

async function main() {
  let workspaces;
  try { workspaces = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; return; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    const entries = await readdir(workspaces, { withFileTypes: true }).catch(() => []);
    const directories = entries.filter(entry => entry.isDirectory()).map(entry => path.join(workspaces, entry.name)).sort();
    if (!directories.length) throw new Error(`Nenhum workspace encontrado em ${workspaces}`);
    const datasets = [];
    for (const directory of directories) {
      console.log(`\n=== Auditoria: ${path.basename(directory)} ===`);
      const report = await auditDataset(directory);
      datasets.push(report);
      console.log(`${report.name}: ${report.status} | fotos=${report.photos} pares=${report.pairsEvaluated} conectados=${report.connectedPairs} nearMiss=${report.nearMissPairs} | grupos ${report.groupsStored} guardados vs ${report.groupsRecomputed} recalculados`);
      if (report.groupsStored) console.log(`Grupos guardados: ${report.groups.stored.map(files => `[${files.join(', ')}]`).join(' | ')}`);
    }
    const evidence = {
      generatedAt: new Date().toISOString(), mode: 'grouping-audit (read-only; production thresholds untouched)',
      workspaces,
      status: datasets.every(dataset => dataset.status === 'PASS') ? 'PASS' : 'FAIL',
      datasets
    };
    await mkdir(path.join(root, 'docs/evidence'), { recursive: true });
    const file = path.join(root, 'docs/evidence', `grouping-audit-${stamp}.json`);
    await writeFile(file, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`\nStatus: ${evidence.status}`);
    console.log(`Evidência: ${path.relative(root, file)}`);
    console.log('GROUPING_AUDIT_DONE');
    if (evidence.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    console.error(error.stack ?? String(error));
    console.log('GROUPING_AUDIT_DONE_WITH_ERROR');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
