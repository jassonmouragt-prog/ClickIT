// Shared NIMA runtime preprocessing. Must stay numerically equivalent to
// tf.keras load_img(target_size=(224,224), color_mode='rgb', interpolation='nearest')
// + MobileNet preprocess_input (RGB [0,255] -> [-1,1]) used in Keras/ONNX validation.

export const NIMA_INPUT_SIZE = 224;

/** PIL/Keras nearest mapping: floor((i + 0.5) * srcSize / dstSize), clamped. */
export function nimaSourceIndex(dstIndex, srcSize) {
  const raw = Math.floor((dstIndex + 0.5) * srcSize / NIMA_INPUT_SIZE);
  if (raw < 0) return 0;
  if (raw > srcSize - 1) return srcSize - 1;
  return raw;
}

/**
 * Build NHWC float32 [1,224,224,3] from raw RGB8 (channels=3, no alpha).
 * Mirrors Keras img_to_array + mobilenet.preprocess_input.
 */
export function nimaPreprocessRaw(data, width, height) {
  if (width < 1 || height < 1) throw new Error(`Dimensão de imagem inválida: ${width}x${height}`);
  const tensorData = new Float32Array(NIMA_INPUT_SIZE * NIMA_INPUT_SIZE * 3);
  for (let y = 0; y < NIMA_INPUT_SIZE; y++) {
    const sourceY = nimaSourceIndex(y, height);
    for (let x = 0; x < NIMA_INPUT_SIZE; x++) {
      const sourceX = nimaSourceIndex(x, width);
      const sourceOffset = (sourceY * width + sourceX) * 3;
      const targetOffset = (y * NIMA_INPUT_SIZE + x) * 3;
      for (let channel = 0; channel < 3; channel++) {
        tensorData[targetOffset + channel] = data[sourceOffset + channel] / 127.5 - 1;
      }
    }
  }
  return tensorData;
}

export function nimaDistributionStats(distribution) {
  const mean = distribution.reduce((sum, p, index) => sum + p * (index + 1), 0);
  const variance = distribution.reduce((sum, p, index) => sum + p * ((index + 1) - mean) ** 2, 0);
  return { nimaMean: mean, nimaStd: Math.sqrt(variance), aestheticScore: ((mean - 1) / 9) * 100 };
}
