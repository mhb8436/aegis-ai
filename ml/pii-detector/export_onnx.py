"""
Export trained PII NER detector to ONNX format.

Converts the PyTorch NER model to ONNX with dynamic axes.
Exports vocab.txt and label_map.json for TypeScript inference.

Usage:
  python export_onnx.py --model_dir ../checkpoints/pii-detector --output_dir ../../packages/aegis-core/ml-models/pii-detector
"""
import argparse
import json
from pathlib import Path

import torch
import onnx
import onnxruntime as ort
import numpy as np
from transformers import AutoTokenizer, AutoModelForTokenClassification

from dataset import LABELS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export PII NER detector to ONNX")
    parser.add_argument(
        "--model_dir",
        type=str,
        default="../checkpoints/pii-detector",
        help="Directory with trained PyTorch model",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="../../packages/aegis-core/ml-models/pii-detector",
        help="Output directory for ONNX model",
    )
    parser.add_argument("--max_length", type=int, default=512, help="Max sequence length")
    parser.add_argument("--opset", type=int, default=14, help="ONNX opset version")
    return parser.parse_args()


def export_onnx(model, tokenizer, output_dir: Path, max_length: int, opset: int) -> None:
    """Export NER model to ONNX."""
    model.eval()
    device = next(model.parameters()).device

    dummy_text = ["홍길동", "은", "서울", "에", "산다"]
    inputs = tokenizer(
        dummy_text,
        is_split_into_words=True,
        max_length=max_length,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    ).to(device)

    onnx_path = output_dir / "model.onnx"

    torch.onnx.export(
        model,
        (inputs["input_ids"], inputs["attention_mask"], inputs.get("token_type_ids", inputs["attention_mask"])),
        str(onnx_path),
        input_names=["input_ids", "attention_mask", "token_type_ids"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "token_type_ids": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size", 1: "sequence_length"},
        },
        opset_version=opset,
        do_constant_folding=True,
    )

    print(f"ONNX model exported: {onnx_path}")

    onnx_model = onnx.load(str(onnx_path))
    onnx.checker.check_model(onnx_model)
    print("ONNX validation passed")


def export_vocab(tokenizer, output_dir: Path) -> None:
    """Export vocab.txt."""
    vocab = tokenizer.get_vocab()
    sorted_vocab = sorted(vocab.items(), key=lambda x: x[1])

    vocab_path = output_dir / "vocab.txt"
    with open(vocab_path, "w", encoding="utf-8") as f:
        for token, _ in sorted_vocab:
            f.write(f"{token}\n")

    print(f"Vocab exported ({len(sorted_vocab)} tokens): {vocab_path}")


def export_label_map(output_dir: Path, max_length: int) -> None:
    """Export label_map.json for TypeScript runtime."""
    label_map = {
        "name": "pii-detector",
        "labels": LABELS,
        "maxLength": max_length,
        "threshold": 0.5,
    }

    label_map_path = output_dir / "label_map.json"
    with open(label_map_path, "w", encoding="utf-8") as f:
        json.dump(label_map, f, ensure_ascii=False, indent=2)

    print(f"Label map exported: {label_map_path}")


def verify_onnx(model, tokenizer, output_dir: Path, max_length: int, device) -> None:
    """Verify ONNX output matches PyTorch."""
    model.eval()

    test_tokens = ["김철수", "는", "부산", "에서", "일한다"]
    inputs = tokenizer(
        test_tokens,
        is_split_into_words=True,
        max_length=max_length,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    ).to(device)

    with torch.no_grad():
        pt_outputs = model(**inputs)
        pt_logits = pt_outputs.logits.cpu().numpy()

    onnx_path = str(output_dir / "model.onnx")
    session = ort.InferenceSession(onnx_path)

    ort_inputs = {
        "input_ids": inputs["input_ids"].cpu().numpy(),
        "attention_mask": inputs["attention_mask"].cpu().numpy(),
        "token_type_ids": inputs.get("token_type_ids", inputs["attention_mask"]).cpu().numpy(),
    }
    ort_outputs = session.run(None, ort_inputs)
    ort_logits = ort_outputs[0]

    diff = np.abs(pt_logits - ort_logits).max()
    print(f"Max PyTorch vs ONNX difference: {diff:.6f}")

    if diff < 1e-4:
        print("Verification PASSED")
    else:
        print(f"WARNING: Difference {diff:.6f} exceeds threshold 1e-4")


def main() -> None:
    args = parse_args()

    model_dir = Path(args.model_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    print(f"Loading model from: {model_dir}")
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
    model = AutoModelForTokenClassification.from_pretrained(str(model_dir)).to(device)

    export_onnx(model, tokenizer, output_dir, args.max_length, args.opset)
    export_vocab(tokenizer, output_dir)
    export_label_map(output_dir, args.max_length)
    verify_onnx(model, tokenizer, output_dir, args.max_length, device)

    print(f"\nAll files exported to: {output_dir}")
    print("Files: model.onnx, vocab.txt, label_map.json")


if __name__ == "__main__":
    main()
