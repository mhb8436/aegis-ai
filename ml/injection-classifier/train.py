"""
Injection Classifier Training Script.

Fine-tunes klue/roberta-base for 5-label injection classification:
  - normal
  - direct_injection
  - indirect_injection
  - jailbreak
  - data_exfiltration

Usage:
  python train.py --data sample_data.jsonl --epochs 5 --output ../checkpoints/injection-classifier
"""
import argparse
import os

import torch
from torch.utils.data import DataLoader
from torch.optim import AdamW
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup
from sklearn.metrics import classification_report

from dataset import LABELS, LABEL2ID, ID2LABEL, create_datasets


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train injection classifier")
    parser.add_argument("--data", type=str, required=True, help="Path to JSONL training data")
    parser.add_argument("--model_name", type=str, default="klue/roberta-base", help="Base model name")
    parser.add_argument("--output", type=str, default="../checkpoints/injection-classifier", help="Output directory")
    parser.add_argument("--epochs", type=int, default=5, help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size")
    parser.add_argument("--lr", type=float, default=2e-5, help="Learning rate")
    parser.add_argument("--max_length", type=int, default=512, help="Max sequence length")
    parser.add_argument("--warmup_ratio", type=float, default=0.1, help="Warmup ratio")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    return parser.parse_args()


def set_seed(seed: int) -> None:
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def train_epoch(model, dataloader, optimizer, scheduler, device) -> float:
    model.train()
    total_loss = 0.0

    for batch in dataloader:
        optimizer.zero_grad()

        input_ids = batch["input_ids"].to(device)
        attention_mask = batch["attention_mask"].to(device)
        labels = batch["labels"].to(device)

        outputs = model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            labels=labels,
        )
        loss = outputs.loss
        loss.backward()

        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()

        total_loss += loss.item()

    return total_loss / len(dataloader)


@torch.no_grad()
def evaluate(model, dataloader, device) -> dict:
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

    report = classification_report(
        all_labels,
        all_preds,
        target_names=LABELS,
        output_dict=True,
        zero_division=0,
    )
    return report


def main() -> None:
    args = parse_args()
    set_seed(args.seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Load tokenizer and model
    print(f"Loading model: {args.model_name}")
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=len(LABELS),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    ).to(device)

    # Create datasets
    train_dataset, val_dataset, test_dataset = create_datasets(
        args.data, tokenizer, args.max_length
    )

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size)
    test_loader = DataLoader(test_dataset, batch_size=args.batch_size)

    # Optimizer and scheduler
    total_steps = len(train_loader) * args.epochs
    warmup_steps = int(total_steps * args.warmup_ratio)

    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    scheduler = get_linear_schedule_with_warmup(optimizer, warmup_steps, total_steps)

    # Training loop
    best_val_f1 = 0.0
    for epoch in range(args.epochs):
        avg_loss = train_epoch(model, train_loader, optimizer, scheduler, device)
        val_report = evaluate(model, val_loader, device)
        val_f1 = val_report["weighted avg"]["f1-score"]

        print(f"Epoch {epoch + 1}/{args.epochs} - Loss: {avg_loss:.4f} - Val F1: {val_f1:.4f}")

        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            # Save best model
            os.makedirs(args.output, exist_ok=True)
            model.save_pretrained(args.output)
            tokenizer.save_pretrained(args.output)
            print(f"  Saved best model (F1: {val_f1:.4f})")

    # Final evaluation on test set
    print("\n--- Test Set Evaluation ---")
    test_report = evaluate(model, test_loader, device)
    print(classification_report(
        [0], [0],  # placeholder - will rerun properly
        target_names=LABELS,
        zero_division=0,
    ))
    print(f"Test F1 (weighted): {test_report['weighted avg']['f1-score']:.4f}")

    print(f"\nModel saved to: {args.output}")
    print("Next step: Run export_onnx.py to convert to ONNX format")


if __name__ == "__main__":
    main()
