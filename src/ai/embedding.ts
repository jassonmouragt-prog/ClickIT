import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { performance } from 'node:perf_hooks';
import contract from './dinov2-contract.json' with { type: 'json' };
export { contract as dinov2Contract };

export function validateEmbedding(feature: number[]): { dimensions: number; norm: number; nonzero: boolean; finite: boolean } {
  const norm = Math.hypot(...feature);
  if (feature.length !== contract.output.embeddingDimensions || !feature.every(Number.isFinite) || !Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5 || !feature.some(value => value !== 0)) throw new Error('Embedding DINOv2 inválido: dimensão/valores/norma.');
  return { dimensions: feature.length, norm, nonzero: true, finite: true };
}

export function validateDinov2Metadata(session: Pick<ort.InferenceSession, 'inputNames' | 'outputNames' | 'inputMetadata' | 'outputMetadata'>): void {
  for (const [names, metadata, expected] of [[session.inputNames, session.inputMetadata, contract.input], [session.outputNames, session.outputMetadata, contract.output]] as const) {
    const actual = metadata[0];
    if (names.length !== 1 || names[0] !== expected.name || metadata.length !== 1 || !actual?.isTensor || actual.name !== expected.name || actual.type !== expected.dtype || JSON.stringify(actual.shape) !== JSON.stringify(expected.metadataShape)) {
      throw new Error(`Contrato DINOv2 incompatível: esperado ${JSON.stringify(expected)}; recebido ${JSON.stringify({ names, metadata })}`);
    }
  }
}
export class Embedder {
  private session: ort.InferenceSession | null = null;
  lastInferenceMs: number | null = null;
  lastOutputShape: readonly number[] | null = null;
  async load(file: string): Promise<void> {
    await this.close();
    const session = await ort.InferenceSession.create(file, { executionProviders: [contract.provider], intraOpNumThreads: 1, interOpNumThreads: 1 });
    try { validateDinov2Metadata(session); }
    catch (error) { await session.release(); throw error; }
    this.session = session;
  }
  metadata() {
    if (!this.session) throw new Error('Modelo não carregado.');
    return { inputNames: this.session.inputNames, inputMetadata: this.session.inputMetadata, outputNames: this.session.outputNames, outputMetadata: this.session.outputMetadata };
  }
  async run(preview: string): Promise<number[]> {
    if (!this.session) throw new Error('Modelo de similaridade não carregado.');
    // DINOv2: shortest edge 256 then 224 center crop, RGB, ImageNet normalization.
    const { cropSize: size, resizeShortestEdge: edge, mean, std, scale } = contract.input;
    const resized = await sharp(preview).rotate().toColourspace('srgb').resize(edge, edge, { fit: 'outside', kernel: contract.input.resizeKernel as keyof sharp.KernelEnum }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = await sharp(resized.data, { raw: resized.info }).extract({ left: Math.floor((resized.info.width - size) / 2), top: Math.floor((resized.info.height - size) / 2), width: size, height: size }).raw().toBuffer();
    const values = new Float32Array(3 * size * size);
    for (let i = 0; i < size * size; i++) for (let c = 0; c < 3; c++) values[c * size * size + i] = (pixels[i * 3 + c]! / scale - mean[c]!) / std[c]!;
    this.lastInferenceMs = null;
    const start = performance.now();
    const outputs = await this.session.run({ [contract.input.name]: new ort.Tensor('float32', values, contract.input.shape) });
    this.lastInferenceMs = performance.now() - start;
    const tensor = outputs[contract.output.name];
    if (!tensor || tensor.type !== contract.output.dtype || JSON.stringify(tensor.dims) !== JSON.stringify(contract.output.shape)) throw new Error(`Saída DINOv2 incompatível: esperado ${contract.output.name} ${JSON.stringify(contract.output.shape)}; recebido ${JSON.stringify(tensor?.dims)}`);
    this.lastOutputShape = tensor.dims;
    // CLS token, not classification probabilities or a synthetic descriptor.
    const dimensions = contract.output.embeddingDimensions;
    const offset = contract.output.tokenIndex * dimensions;
    const feature = Array.from((tensor.data as Float32Array).subarray(offset, offset + dimensions));
    const norm = Math.sqrt(feature.reduce((s, v) => s + v * v, 0));
    if (!Number.isFinite(norm) || !norm || feature.length !== dimensions || !feature.every(Number.isFinite)) throw new Error('Embedding DINOv2 inválido.');
    const embedding = feature.map(v => v / norm);
    validateEmbedding(embedding);
    return embedding;
  }
  async close(): Promise<void> { await this.session?.release(); this.session = null; }
}
