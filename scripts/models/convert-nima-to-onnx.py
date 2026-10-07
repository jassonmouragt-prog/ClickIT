#!/usr/bin/env python3
"""Build and verify official idealo NIMA MobileNet AVA from the local HDF5.

This development-time tool never downloads or checks out the HDF5/model repo.
The architecture is transcribed from the pinned upstream model_builder.py and
config_aesthetic_cpu.json; local HDF5 bytes must match the official Git object.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys


REPO = "https://github.com/idealo/image-quality-assessment"
COMMIT = "dceaf7c2d218bc6e80b21d6e147e3b56a21b7f31"
WEIGHTS = "models/MobileNet/weights_mobilenet_aesthetic_0.07.hdf5"
LOCAL_WEIGHTS = "resources/models/weights_mobilenet_aesthetic_0.07.hdf5"
GIT_BLOB_SHA1 = "003fb321ce92445e41d708144a3656589f9214e7"
WEIGHT_BYTES = 13174216
PROVENANCE = "scripts/models/nima-source.lock.json"
ONNX_NAME = "nima-mobilenet-aesthetic.onnx"
TOLERANCE = {"rtol": 0.0001, "atol": 0.00001, "maxAbs": 0.0001}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def git_blob_sha1(path: Path) -> str:
    size = path.stat().st_size
    digest = hashlib.sha1()
    digest.update(f"blob {size}\0".encode("ascii"))
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def has_hdf5_signature(path: Path) -> bool:
    # HDF5 may include a user block; its signature is at byte 0 or a power-of-two offset.
    signature = bytes.fromhex("894844460d0a1a0a")
    with path.open("rb") as stream:
        for offset in (0, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536):
            stream.seek(offset)
            if stream.read(8) == signature:
                return True
    return False


def load_image(path: Path, tf):
    # Match upstream TestDataGenerator: Keras load_img(target_size=(224,224)),
    # RGB, upstream Keras load_img's nearest resize, then MobileNet preprocess_input.
    image = tf.keras.preprocessing.image.load_img(
        str(path), target_size=(224, 224), color_mode="rgb", interpolation="nearest"
    )
    array = tf.keras.preprocessing.image.img_to_array(image)
    array = tf.keras.applications.mobilenet.preprocess_input(array)
    return array[None, ...]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--images", nargs="+", required=True, help="real image files for equivalence and sample scoring")
    parser.add_argument("--weights", type=Path, default=Path(LOCAL_WEIGHTS), help="existing official HDF5; never downloaded by this tool")
    parser.add_argument("--models-dir", type=Path, default=Path("resources/models"))
    parser.add_argument("--evidence", type=Path, default=Path("docs/evidence/nima-equivalence.json"))
    parser.add_argument("--tolerance", type=float, default=TOLERANCE["maxAbs"])
    args = parser.parse_args()

    try:
        import numpy as np
        import tensorflow as tf
        import tf2onnx
        import onnxruntime as ort
    except ImportError as exc:
        raise RuntimeError(
            "Conversion dependencies unavailable. Use the pinned Python 3.7 environment; "
            "this tool does not add TensorFlow to ClickIT runtime."
        ) from exc

    repo_root = Path(__file__).resolve().parents[2]
    weights_path = args.weights.resolve() if args.weights.is_absolute() else (repo_root / args.weights).resolve()
    provenance = json.loads((repo_root / PROVENANCE).read_text(encoding="utf-8"))
    if provenance["sourceCommit"] != COMMIT:
        raise RuntimeError("NIMA provenance lock commit mismatch")
    locked_artifact = provenance["localSourceArtifact"]
    dropout_rate = provenance["configuration"]["dropout_rate"]
    num_classes = provenance["configuration"]["n_classes"]
    if provenance["configuration"]["base_model_name"] != "MobileNet" or num_classes != 10:
        raise RuntimeError("Pinned official NIMA model configuration is invalid")
    if not weights_path.is_file():
        raise RuntimeError(f"Expected local HDF5 is missing: {weights_path}; no download will be attempted")
    if (weights_path.name != locked_artifact["file"] or weights_path.stat().st_size != WEIGHT_BYTES or
            weights_path.stat().st_size != locked_artifact["bytes"] or
            git_blob_sha1(weights_path) != GIT_BLOB_SHA1 or
            git_blob_sha1(weights_path) != locked_artifact["gitBlobSha1"] or
            sha256(weights_path) != locked_artifact["sha256"] or not has_hdf5_signature(weights_path)):
        raise RuntimeError("Official HDF5 size, Git blob SHA-1, or HDF5 signature validation failed")

    # Equivalent inference graph from the pinned upstream Nima.build():
    # MobileNet(input_shape=(224,224,3), include_top=False, pooling='avg'),
    # Dropout(config_aesthetic_cpu.json), Dense(10, softmax).
    base = tf.keras.applications.MobileNet(
        input_shape=(224, 224, 3), weights=None, include_top=False, pooling="avg"
    )
    pooled = tf.keras.layers.Dropout(dropout_rate)(base.output)
    ratings = tf.keras.layers.Dense(units=num_classes, activation="softmax")(pooled)
    model = tf.keras.Model(base.inputs, ratings)
    model.load_weights(str(weights_path))
    if tuple(model.input_shape) != (None, 224, 224, 3) or tuple(model.output_shape) != (None, 10):
        raise RuntimeError(f"Unexpected official Keras contract: {model.input_shape} -> {model.output_shape}")

    images = [Path(p).resolve() for p in args.images]
    if not images or any(not p.is_file() for p in images):
        raise RuntimeError("Every --images input must be an existing image file")
    batches = [load_image(path, tf) for path in images]
    keras_distributions = [model(batch, training=False).numpy()[0] for batch in batches]

    models_dir = args.models_dir.resolve()
    models_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = models_dir / ONNX_NAME
    temp_onnx = onnx_path.with_suffix(onnx_path.suffix + ".partial")
    signature = (tf.TensorSpec((1, 224, 224, 3), tf.float32, name="image"),)
    proto, _ = tf2onnx.convert.from_keras(model, input_signature=signature, opset=13, output_path=str(temp_onnx))
    del proto
    session = ort.InferenceSession(str(temp_onnx), providers=["CPUExecutionProvider"])
    if len(session.get_inputs()) != 1 or len(session.get_outputs()) != 1:
        raise RuntimeError("ONNX graph must expose one input and one distribution output")
    inp, out = session.get_inputs()[0], session.get_outputs()[0]
    if inp.type != "tensor(float)" or inp.shape != [1, 224, 224, 3]:
        raise RuntimeError(f"Unexpected ONNX input contract: {inp.name} {inp.type} {inp.shape}")
    if out.type != "tensor(float)" or out.shape != [1, 10]:
        raise RuntimeError(f"Unexpected ONNX output contract: {out.name} {out.type} {out.shape}")

    comparisons = []
    for path, batch, expected in zip(images, batches, keras_distributions):
        actual = session.run([out.name], {inp.name: batch.astype(np.float32)})[0][0]
        delta = np.abs(actual - expected)
        max_abs = float(delta.max())
        if not np.all(np.isfinite(actual)) or not np.allclose(actual, expected, rtol=TOLERANCE["rtol"], atol=TOLERANCE["atol"]):
            raise RuntimeError(f"Keras/ONNX mismatch on {path.name}: maxAbs={max_abs:.8g}")
        if max_abs > args.tolerance:
            raise RuntimeError(f"Keras/ONNX maxAbs {max_abs:.8g} exceeds {args.tolerance}")
        probabilities = actual.astype(np.float64)
        if np.any(probabilities < -1e-6) or not np.isclose(probabilities.sum(), 1.0, atol=1e-4):
            raise RuntimeError(f"ONNX output is not a probability distribution for {path.name}")
        ratings = np.arange(1, 11, dtype=np.float64)
        mean = float(np.sum(probabilities * ratings))
        std = float(np.sqrt(np.sum(probabilities * np.square(ratings - mean))))
        comparisons.append({
            "file": str(path), "distributionKeras": expected.astype(float).tolist(),
            "distributionOnnx": actual.astype(float).tolist(), "maxAbsDifference": max_abs,
            "nimaMean1to10": mean, "nimaStd": std,
            "aestheticScore0to100": (mean - 1.0) / 9.0 * 100.0,
        })

    weights_sha256 = sha256(weights_path)
    onnx_sha256 = sha256(temp_onnx)
    manifest_path = models_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"version": 1, "models": {}}
    manifest.setdefault("models", {})["nimaAesthetic"] = {
        "name": "NIMA MobileNet Aesthetic AVA", "file": ONNX_NAME,
        "type": "aesthetic-distribution", "version": COMMIT,
        "source": f"{REPO}/tree/{COMMIT}", "sourceCommit": COMMIT,
        "sourceWeights": WEIGHTS, "sourceWeightsBytes": WEIGHT_BYTES,
        "sourceWeightsGitBlobSha1": GIT_BLOB_SHA1, "sourceWeightsSha256": weights_sha256,
        "sha256": onnx_sha256, "bytes": temp_onnx.stat().st_size,
        "license": "Apache-2.0", "licenseSource": f"{REPO.replace('.git','')}/blob/{COMMIT}/LICENSE",
        "conversionScript": "scripts/models/convert-nima-to-onnx.py",
        "input": {"name": inp.name, "dtype": "float32", "shape": [1, 224, 224, 3], "color": "RGB",
                  "resize": [224, 224], "resizeMethod": "Keras load_img interpolation=nearest",
                  "preprocessing": "tf.keras.applications.mobilenet.preprocess_input; RGB [0,255] -> [-1,1]"},
        "output": {"name": out.name, "dtype": "float32", "shape": [1, 10],
                   "meaning": "AVA rating probability distribution, indices 1..10"},
        "score": {"mean": "sum(p_i * i), i=1..10", "std": "sqrt(sum(p_i * (i-mean)^2))",
                  "presentationNormalization": "(mean-1)/9*100"},
        "equivalence": {**TOLERANCE, "imagesCompared": len(comparisons), "maxAbsObserved": max(x["maxAbsDifference"] for x in comparisons)},
    }
    manifest["sourceArtifacts"] = {
        **manifest.get("sourceArtifacts", {}),
        "nimaAestheticWeights": {
            "name": "NIMA MobileNet Aesthetic AVA original weights",
            "file": weights_path.name,
            "bytes": weights_path.stat().st_size,
            "sha256": weights_sha256,
            "gitBlobSha1": GIT_BLOB_SHA1,
            "source": f"{REPO}/blob/{COMMIT}/{WEIGHTS}",
            "license": "Apache-2.0",
        },
    }
    # Only publish after artifact and equivalence validation have succeeded.
    temp_onnx.replace(onnx_path)
    manifest_temp = manifest_path.with_suffix(".json.partial")
    manifest_temp.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    manifest_temp.replace(manifest_path)
    evidence = {"status": "PASS", "sourceCommit": COMMIT, "sourceWeights": WEIGHTS,
                "sourceWeightsGitBlobSha1": GIT_BLOB_SHA1, "sourceWeightsSha256": weights_sha256,
                "onnxSha256": onnx_sha256, "tolerance": TOLERANCE, "comparisons": comparisons}
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    args.evidence.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(f"NIMA MobileNet AVA converted and verified: {len(comparisons)} images")
    print(f"Weights SHA-256: {weights_sha256}")
    print(f"ONNX SHA-256: {onnx_sha256}")
    for item in comparisons:
        print(f"{Path(item['file']).name}: mean={item['nimaMean1to10']:.6f}, std={item['nimaStd']:.6f}, maxAbs={item['maxAbsDifference']:.8g}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # visible failure; no silent fallback
        print(f"NIMA conversion failed: {error}", file=sys.stderr)
        raise
