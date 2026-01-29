"""
Evaluate trained injection classifier.

Runs evaluation on test data and prints detailed classification report.

Usage:
  python evaluate.py --model_dir ../checkpoints/injection-classifier --data sample_data.jsonl
"""
import argparse

import torch
from torch.utils.data import DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from sklearn.metrics import classification_report, confusion_matrix

from dataset import LABELS, InjectionDataset, load_jsonl, split_data


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate injection classifier")
    parser.add_argument("--model_dir", type=str, required=True, help="Model directory")
    parser.add_argument("--data", type=str, required=True, help="JSONL data file")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size")
    parser.add_argument("--max_length", type=int, default=512, help="Max sequence length")
    parser.add_argument("--split", type=str, default="test", choices=["train", "val", "test"], help="Data split")
    return parser.parse_args()


@torch.no_grad()
def evaluate(model, dataloader, device) -> tuple:
    model.eval()
    all_preds = []
    all_labels = []

    for batch in dataloader:
        input_ids = batch["input_ids"].to(device)
        attention_mask = batch["attention_mask"].to(device)
        labels = batch["labels"]

        outputs = model(input_ids=input_ids, attention_mask=attention_mask)
        preds = torch.argmax(outputs.logits, dim=-1).cpu().tolist()

        all_preds.extend(preds)
        all_labels.extend(labels.tolist())

    return all_preds, all_labels


def main() -> None:
    args = parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Load model
    tokenizer = AutoTokenizer.from_pretrained(args.model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(args.model_dir).to(device)

    # Load data
    all_data = load_jsonl(args.data)
    train_data, val_data, test_data = split_data(all_data)

    split_map = {"train": train_data, "val": val_data, "test": test_data}
    eval_data = split_map[args.split]

    print(f"Evaluating on {args.split} split: {len(eval_data)} samples")

    dataset = InjectionDataset(eval_data, tokenizer, args.max_length)
    dataloader = DataLoader(dataset, batch_size=args.batch_size)

    # Evaluate
    preds, labels = evaluate(model, dataloader, device)

    # Classification Report
    print("\n=== Classification Report ===")
    print(classification_report(labels, preds, target_names=LABELS, zero_division=0))

    # Confusion Matrix
    print("=== Confusion Matrix ===")
    cm = confusion_matrix(labels, preds)
    print(f"{'':>20s}", end="")
    for label in LABELS:
        print(f"{label:>18s}", end="")
    print()
    for i, row in enumerate(cm):
        print(f"{LABELS[i]:>20s}", end="")
        for val in row:
            print(f"{val:>18d}", end="")
        print()


if __name__ == "__main__":
    main()
