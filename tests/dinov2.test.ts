import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Embedder, dinov2Contract, validateDinov2Metadata, validateEmbedding } from '../src/ai/embedding.ts';

const model = 'resources/models/dinov2-small.onnx', photo = 'FOTO A.png';
test('installed DINOv2 contract and real photo inference use the production Embedder', { skip: !existsSync(model) || !existsSync(photo) ? 'Requires installed real DINOv2 and FOTO A.png; inference not executed' : false }, async () => {
  const embedder = new Embedder();
  try {
    await embedder.load(model);
    const metadata = embedder.metadata();
    assert.deepEqual(metadata.outputNames, [dinov2Contract.output.name]);
    const embedding = await embedder.run(photo);
    assert.equal(validateEmbedding(embedding).dimensions, dinov2Contract.output.embeddingDimensions);
    assert.deepEqual(embedder.lastOutputShape, dinov2Contract.output.shape);
    assert.ok(embedder.lastInferenceMs! > 0);
    // Regression: reject incompatible metadata; accepting last_hidden_state is not disabling validation.
    assert.throws(() => validateDinov2Metadata({ ...metadata, outputNames: ['pooler_output'] }), /incompatível/);
    assert.throws(() => validateDinov2Metadata({ ...metadata, inputMetadata: [{ name: dinov2Contract.input.name, isTensor: true, type: 'int64', shape: dinov2Contract.input.metadataShape }] }), /incompatível/);
    assert.throws(() => validateEmbedding(embedding.slice(1)), /inválido/);
    assert.throws(() => validateEmbedding(embedding.map((value, index) => index ? value : NaN)), /inválido/);
  } finally { await embedder.close(); }
});
