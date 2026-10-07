import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectedComponents, connection, group } from '../src/ai/grouping.ts';
import type { Candidate } from '../src/ai/grouping.ts';
import { makeAnalysis } from '../src/ai/quality.ts';

function node(id: string, angle: number): Candidate {
  return { id, date: null, hash: id, embedding: [Math.cos(angle), Math.sin(angle)], analysis: makeAnalysis(80, 80, 80, [], true, true) };
}
test('visual chains connect without a representative or temporal metadata; unrelated scenes remain isolated', () => {
  const nodes = [node('a', 0), node('b', .2), node('c', .4), node('d', .6), node('other', 2)];
  assert.equal(connection(nodes[0]!, nodes[3]!).connected, false);
  const normalize = (items: Candidate[][]) => items.map(component => component.map(c => c.id).sort().join(',')).sort();
  assert.deepEqual(normalize(connectedComponents(nodes)), ['a,b,c,d', 'other']);
  assert.deepEqual(normalize(connectedComponents([...nodes].reverse())), ['a,b,c,d', 'other']);
  const scores = nodes.map(c => c.analysis.overall);
  assert.equal(group(nodes)[0]!.ids.length, 4);
  assert.deepEqual(nodes.map(c => c.analysis.overall), scores);
});
test('time is secondary, invalid dates use visual threshold; no edge from time alone', () => {
  const a = node('a', 0), b = node('b', .35);
  assert.equal(connection(a, b).connected, false);
  a.date = b.date = '2026-10-06T12:00:00Z';
  assert.equal(connection(a, b).connected, true);
  b.embedding = [0, 1];
  assert.equal(connection(a, b).connected, false);
  b.date = 'invalid';
  assert.equal(connection(a, b).threshold, .965);
});
test('connectivity never uses focus or eye labels and does not truncate at a representative window', () => {
  const nodes = Array.from({ length: 30 }, (_, i) => node(String(i), i === 29 ? .01 : i === 0 ? 0 : 2));
  nodes[29]!.analysis.overall = 1;
  assert.deepEqual(connectedComponents(nodes).map(c => c.length).sort((a, b) => a - b), [2, 28]);
  nodes[0]!.embedding = null; nodes[29]!.embedding = null;
  nodes[29]!.hash = nodes[0]!.hash;
  assert.equal(connection(nodes[0]!, nodes[29]!).exactDuplicate, true);
});
