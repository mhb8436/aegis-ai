"""
Dataset loader for injection classifier training.
Reads JSONL files with format: {"text": "...", "label": "direct_injection"}
"""
import json
from pathlib import Path
from typing import List, Dict, Tuple

from torch.utils.data import Dataset
from transformers import PreTrainedTokenizerFast

LABELS = ["normal", "direct_injection", "indirect_injection", "jailbreak", "data_exfiltration"]
LABEL2ID = {label: idx for idx, label in enumerate(LABELS)}
ID2LABEL = {idx: label for idx, label in enumerate(LABELS)}


class InjectionDataset(Dataset):
    """PyTorch dataset for injection classification."""

    def __init__(
        self,
        data: List[Dict],
        tokenizer: PreTrainedTokenizerFast,
        max_length: int = 512,
    ):
        self.data = data
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.data)

    def __getitem__(self, idx: int) -> Dict:
        item = self.data[idx]
        encoding = self.tokenizer(
            item["text"],
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )
        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "token_type_ids": encoding.get("token_type_ids", encoding["attention_mask"]).squeeze(0),
            "labels": LABEL2ID[item["label"]],
        }


def load_jsonl(path: str) -> List[Dict]:
    """Load data from JSONL file."""
    data = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                item = json.loads(line)
                if item.get("label") in LABEL2ID:
                    data.append(item)
    return data


def split_data(
    data: List[Dict],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """Split data into train/val/test (80/10/10 by default)."""
    import random
    random.shuffle(data)

    n = len(data)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    return data[:train_end], data[train_end:val_end], data[val_end:]


def create_datasets(
    data_path: str,
    tokenizer: PreTrainedTokenizerFast,
    max_length: int = 512,
) -> Tuple[InjectionDataset, InjectionDataset, InjectionDataset]:
    """Load JSONL and create train/val/test datasets."""
    all_data = load_jsonl(data_path)
    train_data, val_data, test_data = split_data(all_data)

    print(f"Data split: train={len(train_data)}, val={len(val_data)}, test={len(test_data)}")

    return (
        InjectionDataset(train_data, tokenizer, max_length),
        InjectionDataset(val_data, tokenizer, max_length),
        InjectionDataset(test_data, tokenizer, max_length),
    )
