"""
Dataset loader for PII NER detector training.
Reads JSONL files with BIO-tagged NER format:
  {"tokens": ["홍길동", "은", "서울", "에", "산다"], "labels": ["B-PER", "O", "B-LOC", "O", "O"]}
"""
import json
from pathlib import Path
from typing import List, Dict, Tuple

import torch
from torch.utils.data import Dataset
from transformers import PreTrainedTokenizerFast

LABELS = ["O", "B-PER", "I-PER", "B-LOC", "I-LOC", "B-ORG", "I-ORG"]
LABEL2ID = {label: idx for idx, label in enumerate(LABELS)}
ID2LABEL = {idx: label for idx, label in enumerate(LABELS)}


def align_labels_with_tokens(
    labels: List[str],
    word_ids: List[int | None],
) -> List[int]:
    """
    Align token-level labels with subword tokens.
    - First subword of a word gets the original label
    - Subsequent subwords get I- version of the label (or same O)
    - Special tokens ([CLS], [SEP], [PAD]) get -100 (ignored in loss)
    """
    aligned = []
    previous_word_id = None

    for word_id in word_ids:
        if word_id is None:
            # Special token
            aligned.append(-100)
        elif word_id != previous_word_id:
            # First subword of a new word
            label_str = labels[word_id] if word_id < len(labels) else "O"
            aligned.append(LABEL2ID.get(label_str, 0))
        else:
            # Continuation subword
            label_str = labels[word_id] if word_id < len(labels) else "O"
            if label_str.startswith("B-"):
                # Convert B- to I- for continuation
                i_label = "I-" + label_str[2:]
                aligned.append(LABEL2ID.get(i_label, 0))
            else:
                aligned.append(LABEL2ID.get(label_str, 0))
        previous_word_id = word_id

    return aligned


class NERDataset(Dataset):
    """PyTorch dataset for NER PII detection."""

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
        tokens = item["tokens"]
        labels = item["labels"]

        encoding = self.tokenizer(
            tokens,
            is_split_into_words=True,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )

        word_ids = encoding.word_ids(batch_index=0)
        aligned_labels = align_labels_with_tokens(labels, word_ids)

        # Pad labels to max_length
        while len(aligned_labels) < self.max_length:
            aligned_labels.append(-100)
        aligned_labels = aligned_labels[:self.max_length]

        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "token_type_ids": encoding.get("token_type_ids", encoding["attention_mask"]).squeeze(0),
            "labels": torch.tensor(aligned_labels, dtype=torch.long),
        }


def load_jsonl(path: str) -> List[Dict]:
    """Load NER data from JSONL file."""
    data = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                item = json.loads(line)
                if "tokens" in item and "labels" in item:
                    data.append(item)
    return data


def split_data(
    data: List[Dict],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """Split data into train/val/test."""
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
) -> Tuple[NERDataset, NERDataset, NERDataset]:
    """Load JSONL and create train/val/test NER datasets."""
    all_data = load_jsonl(data_path)
    train_data, val_data, test_data = split_data(all_data)

    print(f"Data split: train={len(train_data)}, val={len(val_data)}, test={len(test_data)}")

    return (
        NERDataset(train_data, tokenizer, max_length),
        NERDataset(val_data, tokenizer, max_length),
        NERDataset(test_data, tokenizer, max_length),
    )
