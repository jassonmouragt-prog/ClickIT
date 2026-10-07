#!/usr/bin/env python3
"""Export Keras/ONNX-Python NIMA preprocessing reference for parity checks.

Runs inside the pinned conversion container (Python 3.7 + TF 2.0).
Writes:
  - raw float32 NHWC [1,224,224,3] tensor after Keras nearest resize + MobileNet preprocess
  - Keras and ONNX-Python NIMA distributions for the same image
  - metadata JSON (source path, sha256, formulas)
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import tensorflow as tf
import onnxruntime as ort


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--weights", default="resources/models/weights_mobilenet_aesthetic_0.07.hdf5")
    parser.add_argument("--onnx", default="resources/models/nima-mobilenet-aesthetic.onnx")
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    image_path = Path(args.image)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    img = tf.keras.preprocessing.image.load_img(
        str(image_path), target_size=(224, 224), color_mode="rgb", interpolation="nearest"
    )
    array = tf.keras.preprocessing.image.img_to_array(img)
    tensor = tf.keras.applications.mobilenet.preprocess_input(array.copy())[None, ...].astype(np.float32)

    base = tf.keras.applications.MobileNet(
        input_shape=(224, 224, 3), weights=None, include_top=False, pooling="avg"
    )
    pooled = tf.keras.layers.Dropout(0.75)(base.output)
    ratings = tf.keras.layers.Dense(units=10, activation="softmax")(pooled)
    model = tf.keras.Model(base.inputs, ratings)
    model.load_weights(args.weights)
    keras_dist = model(tensor, training=False).numpy()[0].astype(np.float64)

    session = ort.InferenceSession(args.onnx, providers=["CPUExecutionProvider"])
    inp, out = session.get_inputs()[0], session.get_outputs()[0]
    onnx_python_dist = session.run([out.name], {inp.name: tensor})[0][0].astype(np.float64)

    stem = "nima-preprocess-reference"
    tensor_bytes = out_dir / f"{stem}.f32"
    tensor_bytes.write_bytes(tensor.tobytes())
    distributions = out_dir / f"{stem}-distributions.json"
    distributions.write_text(
        json.dumps(
            {
                "image": str(image_path),
                "imageSha256": sha256(image_path),
                "keras": keras_dist.tolist(),
                "onnxPython": onnx_python_dist.tolist(),
                "inputName": inp.name,
                "outputName": out.name,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    meta = out_dir / f"{stem}-meta.json"
    meta.write_text(
        json.dumps(
            {
                "image": str(image_path),
                "imageSha256": sha256(image_path),
                "resize": [224, 224],
                "interpolation": "nearest",
                "pilFormula": "src = floor((dst + 0.5) * srcSize / 224)",
                "colorMode": "rgb",
                "dtype": "float32",
                "preprocess": "tf.keras.applications.mobilenet.preprocess_input; RGB [0,255] -> [-1,1]",
                "tensorShape": list(tensor.shape),
                "tensorBytes": tensor.nbytes,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"tensor={tensor_bytes} bytes={tensor.nbytes}")
    print(f"distributions={distributions}")
    print(f"meta={meta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
