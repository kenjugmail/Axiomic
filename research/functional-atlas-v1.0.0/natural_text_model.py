from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Sequence

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

CONCEPT_NAMES = [
    "question_form",
    "explicit_negation",
    "quoted_speech",
    "numeric_quantity",
    "code_fragment",
    "causal_connective",
    "past_tense",
    "plural_subject",
]

_TOKEN_RE = re.compile(r"[A-Za-z_]+|\d+|==|!=|<=|>=|[{}()=+\-*/?:;,.\"']")


@dataclass
class TextSplit:
    texts: list[str]
    tokens: torch.Tensor
    labels: torch.Tensor


class SimpleTokenizer:
    def __init__(self, texts: Sequence[str], max_length: int = 40) -> None:
        self.max_length = max_length
        vocab = {"<pad>": 0, "<unk>": 1}
        pieces = sorted({tok.lower() for text in texts for tok in _TOKEN_RE.findall(text)})
        for piece in pieces:
            if piece not in vocab:
                vocab[piece] = len(vocab)
        self.vocab = vocab

    def encode(self, text: str) -> list[int]:
        ids = [self.vocab.get(tok.lower(), 1) for tok in _TOKEN_RE.findall(text)][: self.max_length]
        return ids + [0] * (self.max_length - len(ids))

    def batch_encode(self, texts: Sequence[str]) -> torch.Tensor:
        return torch.tensor([self.encode(text) for text in texts], dtype=torch.long)


def _render(bits: np.ndarray, rng: np.random.Generator, deterministic: bool = False) -> str:
    question, negation, quoted, numeric, code, causal, past, plural = [bool(v) for v in bits]
    if deterministic:
        singular_subjects = ["the analyst"]
        plural_subjects = ["the analysts"]
        objects = ["the report"]
        reasons = ["the evidence changed"]
        code_snippets = ["x = total + 3"]
        number = 7
    else:
        singular_subjects = ["the analyst", "the engineer", "the teacher", "the doctor", "the researcher"]
        plural_subjects = ["the analysts", "the engineers", "the teachers", "the doctors", "the researchers"]
        objects = ["the report", "the model", "the lesson", "the schedule", "the experiment"]
        reasons = ["the evidence changed", "the test failed", "the deadline moved", "the signal weakened"]
        code_snippets = ["x = total + 3", "if score >= 5", "return value * 2", "count != 0"]
        number = int(rng.integers(2, 20))
    subject = rng.choice(plural_subjects if plural else singular_subjects)
    obj = rng.choice(objects)
    if past:
        verb = rng.choice(["reviewed", "checked", "updated", "measured"])
        auxiliary = "did"
    else:
        verb = rng.choice(["reviews", "checks", "updates", "measures"])
        if plural:
            verb = {"reviews": "review", "checks": "check", "updates": "update", "measures": "measure"}[verb]
        auxiliary = "do" if plural else "does"
    not_word = " not" if negation else ""
    quantity = f" {number} times" if numeric else ""
    reason = f" because {rng.choice(reasons)}" if causal else ""
    snippet = f"; code: {rng.choice(code_snippets)}" if code else ""
    if question:
        core = f"{auxiliary.capitalize()}{not_word} {subject} {verb if past else obj}{quantity}{reason}{snippet}?"
        if past:
            core = f"Did{not_word} {subject} review {obj}{quantity}{reason}{snippet}?"
    else:
        core = f"{subject.capitalize()}{not_word} {verb} {obj}{quantity}{reason}{snippet}."
    if quoted:
        core = f'"{core}" said the observer.'
    return core


def generate_texts(n: int, seed: int, *, deterministic: bool = False) -> tuple[list[str], np.ndarray]:
    rng = np.random.default_rng(seed)
    if deterministic:
        labels = np.array([[int((i >> bit) & 1) for bit in range(8)] for i in range(256)], dtype=np.float32)
    else:
        labels = rng.integers(0, 2, size=(n, 8), dtype=np.int64).astype(np.float32)
    texts = [_render(bits, rng, deterministic=deterministic) for bits in labels]
    return texts, labels


def make_split(tokenizer: SimpleTokenizer, n: int, seed: int) -> TextSplit:
    texts, labels = generate_texts(n, seed)
    return TextSplit(texts=texts, tokens=tokenizer.batch_encode(texts), labels=torch.tensor(labels, dtype=torch.float32))


class NaturalTextAtlasModel(nn.Module):
    def __init__(self, vocab_size: int, max_length: int = 40, d_model: int = 32, d_ff: int = 64) -> None:
        super().__init__()
        self.max_length = max_length
        self.d_model = d_model
        self.d_ff = d_ff
        self.embedding = nn.Embedding(vocab_size, d_model, padding_idx=0)
        self.position = nn.Parameter(torch.zeros(1, max_length, d_model))
        self.ln1 = nn.LayerNorm(d_model)
        self.attention = nn.MultiheadAttention(d_model, 4, batch_first=True)
        self.ln2 = nn.LayerNorm(d_model)
        self.ff1 = nn.Linear(d_model, d_ff)
        self.classifier = nn.Linear(d_ff, len(CONCEPT_NAMES))
        nn.init.normal_(self.position, std=0.02)

    def forward(self, tokens: torch.Tensor, *, return_features: bool = False):
        mask = tokens.ne(0)
        x = self.embedding(tokens) + self.position[:, : tokens.shape[1]]
        query = self.ln1(x)
        attended, _ = self.attention(query, query, query, key_padding_mask=~mask, need_weights=False)
        x = self.ln2(x + attended)
        features_by_token = torch.relu(self.ff1(x))
        weights = mask.unsqueeze(-1).to(features_by_token.dtype)
        pooled = (features_by_token * weights).sum(dim=1) / weights.sum(dim=1).clamp_min(1.0)
        logits = self.classifier(pooled)
        return (logits, pooled) if return_features else logits


def train_model(
    model: NaturalTextAtlasModel,
    train: TextSplit,
    validation: TextSplit,
    *,
    seed: int,
    epochs: int = 18,
    batch_size: int = 256,
    learning_rate: float = 2e-3,
) -> None:
    torch.manual_seed(seed)
    loader = DataLoader(
        TensorDataset(train.tokens, train.labels),
        batch_size=batch_size,
        shuffle=True,
        generator=torch.Generator().manual_seed(seed),
    )
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=1e-4)
    best_loss = float("inf")
    best_state: dict[str, torch.Tensor] | None = None
    for _ in range(epochs):
        model.train()
        for tokens, labels in loader:
            optimizer.zero_grad(set_to_none=True)
            loss = nn.functional.binary_cross_entropy_with_logits(model(tokens), labels)
            loss.backward()
            optimizer.step()
        val_loss = evaluate(model, validation)["bce"]
        if val_loss < best_loss:
            best_loss = val_loss
            best_state = {key: value.detach().clone() for key, value in model.state_dict().items()}
    if best_state is not None:
        model.load_state_dict(best_state)


def collect_features(model: NaturalTextAtlasModel, split: TextSplit) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    with torch.no_grad():
        logits, features = model(split.tokens, return_features=True)
    return features.cpu().numpy().astype(np.float64), logits.cpu().numpy().astype(np.float64)


def evaluate(model: NaturalTextAtlasModel, split: TextSplit) -> dict[str, float]:
    model.eval()
    with torch.no_grad():
        logits = model(split.tokens)
        bce = nn.functional.binary_cross_entropy_with_logits(logits, split.labels).item()
        prediction = logits.gt(0).to(torch.float32)
    return {
        "bce": float(bce),
        "bit_accuracy": float(prediction.eq(split.labels).to(torch.float32).mean()),
        "exact_match": float(prediction.eq(split.labels).all(dim=1).to(torch.float32).mean()),
    }
