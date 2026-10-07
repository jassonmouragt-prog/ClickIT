import { readFile, writeFile, copyFile, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Store } from '../src/database/store.ts';
import { rank, cosine } from '../src/ai/grouping.ts';
import { makeAnalysis } from '../src/ai/quality.ts';
import { focusUtility, technicalScore } from '../src/ai/technical-score.ts';
import { thresholds, analysisWeights } from '../src/lib/config.ts';
import { contributions } from './selection-report.mjs';

const replayPath = process.argv[2] ?? 'docs/evidence/selection-grouping-replay.json';
const replay = JSON.parse(await readFile(replayPath, 'utf8'));
const sourceBytes = await readFile(replay.source);
const source = JSON.parse(sourceBytes);
const dir = await mkdtemp(path.resolve('.test-tmp/saturation-'));
await copyFile(path.join(source.workspace, 'selection.sqlite'), path.join(dir, 'selection.sqlite'));
const store = new Store(path.join(dir, 'selection.sqlite'));
try {
  const projectId = store.photo(source.images[0].id).projectId;
  const candidates = store.candidates(projectId);
  const prior = new Map(candidates.map(c => [c.id, JSON.parse(JSON.stringify(c.analysis))]));
  for (const c of candidates) {
    const a = c.analysis;
    c.analysis = makeAnalysis(a.sharpness, a.regionalSharpness, a.exposure, a.faces, a.facesAvailable, a.embeddingAvailable);
    // Preserve pre-existing group-relative review annotation; only technical score changes.
    c.analysis.blur = a.blur;
    assert.deepEqual(c.analysis.faces, a.faces);
    assert.equal(c.analysis.eyesScore, a.eyesScore);
  }
  // Membership is frozen from the actual prior replay, never reclustered here.
  const groups = replay.groups.map(g => {
    const members = g.ids.map(id => candidates.find(c => c.id === id));
    assert.ok(members.every(Boolean));
    const representative = [...members].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id))[0];
    const ordered = rank(members);
    return { ids: ordered.map(c => c.id), similarities: ordered.map(c => cosine(c.embedding, representative.embedding)), duplicate: members.length > 1 && members.every(c => c.hash === members[0].hash) };
  });
  store.saveGroups(projectId, groups, candidates);
  const photos = store.photos(projectId);
  const principal = [...replay.groups].sort((a, b) => b.ids.length - a.ids.length)[0];
  const rows = principal.ids.map(id => {
    const photo = photos.find(p => p.id === id), before = prior.get(id), after = photo.analysis;
    const oldParts = contributions(before), score = technicalScore(after.regionalSharpness, after.exposure, after.faceScore, after.eyesScore);
    return { id, fileName: photo.fileName, sha256: source.images.find(i => i.id === id).sha256,
      globalSharpness: before.sharpness, regionalSharpness: before.regionalSharpness, subjectSharpness: before.faceScore ?? before.regionalSharpness,
      before: { contributions: oldParts, sharpnessContribution: oldParts.sharpness + (oldParts.face ?? 0), score: before.overall, rank: principal.ids.indexOf(id) + 1 },
      after: { transformedSharpness: focusUtility(after.faceScore ?? after.regionalSharpness), ...score, sharpnessContribution: score.contributions.sharpness + (score.contributions.face ?? 0), rank: photo.rank, decision: photo.decision },
      eyes: after.faces.map(f => f.eyes), blur: after.blur, aestheticScore: after.aestheticScore };
  });
  const fixture = JSON.parse(await readFile('scripts/selection-expectations.json', 'utf8'));
  const soft = rows.find(r => fixture.images.some(label => label.soft && label.sha256 === r.sha256));
  const closed = rows.filter(r => r.eyes.includes('CLOSED'));
  const openSharp = rows.filter(r => r !== soft && r.eyes.length && r.eyes.every(state => state === 'OPEN'));
  assert.ok(soft && closed.length && openSharp.length);
  assert.ok(openSharp.every(r => r.after.rank < soft.after.rank));
  assert.ok(closed.every(c => openSharp.every(r => r.after.rank < c.after.rank)));
  assert.ok(rows.every(r => r.after.decision !== 'REJECTED' && r.aestheticScore === null));
  const membership = groups.map(g => [...g.ids].sort().join(',')).sort();
  assert.deepEqual(membership, replay.groups.map(g => [...g.ids].sort().join(',')).sort());
  const report = { generatedAt: new Date().toISOString(), source: replay.source, sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'), membershipSource: replayPath,
    mode: 'Real saved analyses replay, production scoring and Store decisions, frozen membership; not new end-to-end inference',
    formula: 'T(s)=(100+k)*clamp(s,0,100)/(clamp(s,0,100)+k)', k: thresholds.softFocus, weights: analysisWeights,
    curve: [0, 20, 27, 35, 48, 50, 70, 90, 100].map(s => ({ sharpness: s, utility: focusUtility(s) })),
    checks: { closedLowerPriority: true, softLowerPriority: true, noneRejected: true, membershipUnchanged: true, eyesUnchanged: true },
    rows, pick: rows.find(r => r.after.decision === 'AI_SELECTED')?.fileName ?? null,
    limitation: 'Technical layer only. No composition, expression, pose, moment or aesthetic signal. This small set cannot calibrate focus sufficiency universally.' };
  const target = `docs/evidence/focus-saturation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(target, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.table(rows.map(r => ({ photo: r.fileName, sharpness: r.subjectSharpness, beforeContribution: r.before.sharpnessContribution, beforeScore: r.before.score, beforeRank: r.before.rank, transformed: r.after.transformedSharpness, afterContribution: r.after.sharpnessContribution, afterScore: r.after.overall, afterRank: r.after.rank, decision: r.after.decision })));
  console.table(report.curve); console.log('PASS replay checks; Pick:', report.pick, '\nEvidence:', target);
} finally { store.close(); }
