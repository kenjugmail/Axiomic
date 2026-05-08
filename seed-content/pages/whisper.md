---
title: Whisper
category: multimodal
---
<!-- tier:intro -->
# Whisper

The canonical open-source speech recognition (ASR) model. OpenAI 2022, Radford et al. Encoder-decoder transformer trained on 680,000 hours of multilingual web audio.

Robust to noise, accents, background music. Supports 50+ languages. Multiple sizes from tiny (39M params) to large-v3 (1.5B). Near-human quality at large size.

<!-- tier:undergrad -->
# Whisper (Undergrad)

## Architecture

```
audio → log-mel spectrogram (80 mel bins, 30s chunks)
     → conv stem (2 layers) → spectrogram tokens
     → transformer encoder (6-32 layers depending on size)
     → encoder hidden states

text → tokenize (BPE-like)
    → transformer decoder (6-32 layers, cross-attends to encoder)
    → text logits → sample/argmax → next token
```

Standard encoder-decoder, similar to T5. Two key adaptations for audio:
- Conv stem to process the spectrogram and reduce sequence length.
- Sinusoidal position embeddings on the encoder side.

## Training data

680,000 hours scraped from the web. Diverse — speech recognition data, podcasts, lectures, multilingual content. Weak labels: transcripts paired with audio, sometimes auto-generated.

The data scale is what gives Whisper its robustness. Trained on enough variety that it handles real-world audio (background noise, accents, low quality recordings) far better than older ASR systems trained on clean studio data.

## Multitask conditioning

The decoder is conditioned on **task tokens** at the start:

```
<|startoftranscript|><|en|><|transcribe|><|notimestamps|>
```

Tokens specify:
- Language: 50+ supported (en, zh, es, fr, de, ...).
- Task: 'transcribe' (same language) or 'translate' (to English).
- Timestamps: include word-level timing or not.

This is how a single model handles multiple tasks. The conditioning tokens at the decoder's start inject the task setup; the decoder generates accordingly.

## Sizes and quality

- **Tiny (39M)**: real-time on CPU; lower accuracy.
- **Base (74M)**: good for mobile.
- **Small (244M)**: decent quality, GPU-friendly.
- **Medium (769M)**: production sweet spot.
- **Large-v3 (1.55B)**: SOTA for many languages.

WER (word error rate) on LibriSpeech: tiny ~10%, base ~7%, medium ~3-4%, large-v3 ~2%. Near-human on read speech; somewhat worse on conversational + noisy.

<!-- tier:grad -->
# Whisper (Grad)

## Hallucination

Whisper hallucinates. On silence or ambient noise, it sometimes produces full sentences (often 'thank you for watching' from training data with closing remarks). Mitigations:

- **Voice activity detection** (VAD) preprocessing: skip audio without speech.
- **Confidence thresholding**: discard outputs with low log-probability.
- **Distil-Whisper or whisper.cpp's no-speech detection**: improved silence handling.
- **Faster-whisper's word-level timestamps**: catch low-confidence segments.

For production: pair Whisper with a VAD front-end. Critical for podcast transcription, voice assistants, anywhere the audio includes silence.

## Variants and ecosystem

- **Whisper-large-v3** (OpenAI 2023): improved over v2 on multilingual.
- **Distil-Whisper**: knowledge-distilled smaller version. 6× faster, comparable quality.
- **Faster-whisper**: optimized inference (CTranslate2 backend). 4× faster on GPU; lower memory.
- **whisper.cpp**: C++ port; runs on CPU, mobile, edge devices. Quantized variants enable real-time on phones.
- **WhisperX**: adds word-level timestamps via forced alignment with phoneme model.

For most applications: faster-whisper or distil-whisper for inference. Whisper-large-v3 if you need maximum accuracy and have GPU budget.

## Beyond ASR — Whisper for general audio

Whisper's encoder is a strong general audio feature extractor. Used as the audio backbone in:

- **Audio-language models**: Whisper encoder + LLM via the same adapter pattern as VLMs. Powers 'understand this audio + reason' systems.
- **Music classification**: fine-tune Whisper's encoder on music-specific tasks.
- **Voice analysis**: emotion detection, speaker identification.

The 'pretrain on huge audio, fine-tune on task' recipe that worked for vision (CLIP) and text (BERT) is now happening for audio (Whisper). Whisper is the audio equivalent.
