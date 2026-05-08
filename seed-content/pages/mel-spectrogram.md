---
title: Mel Spectrogram
category: multimodal
---
<!-- tier:intro -->
# Mel Spectrogram

The standard input representation for audio in modern ML. Convert raw 1D audio (e.g., 16kHz waveform = 16,000 samples per second) into a 2D 'image' of frequency vs time.

Three steps:
1. **STFT (Short-Time Fourier Transform)**: slide a window across the audio, compute FFT per window.
2. **Mel scale**: warp the frequency axis to match human perception (logarithmic in pitch).
3. **Log magnitude**: log-transform amplitudes to match human perception of loudness.

Result: a roughly image-shaped 2D matrix. Models (CNNs, transformers) process it like an image.

<!-- tier:undergrad -->
# Mel Spectrogram (Undergrad)

## Step 1 — STFT

Slide a small window (typically 25ms = 400 samples at 16kHz) across the audio. Stride by 10ms = 160 samples. For each window, compute the FFT.

Result: a 2D matrix.
- **Time axis**: number of windows. For 10s audio at 10ms stride: ~1000 frames.
- **Frequency axis**: FFT bins. For a 25ms window: 200+ bins covering DC to Nyquist (8kHz at 16kHz sample rate).

Each cell is a complex number (magnitude + phase). Most models discard phase; magnitude carries the spectral content.

## Step 2 — Mel scaling

Human pitch perception is logarithmic: a doubling of frequency = one octave. The **mel scale** is a frequency warping that's roughly linear at low frequencies and logarithmic at high.

```
mel(f) = 2595 · log10(1 + f / 700)
```

Apply a triangular filterbank with mel-spaced filters (typically 80 or 128 filters). Each filter sums STFT magnitudes within a frequency band; the band widths grow with frequency.

Result: instead of 200+ STFT bins, you get 80-128 mel bins. Captures the perceptually-relevant content.

## Step 3 — Log magnitude

```
log_mel = log(mel_spectrogram + ε)
```

The log compresses the dynamic range. Loud sounds and quiet sounds are now on similar scales. Matches human perception of loudness (also logarithmic, hence dB).

## Final shape

For 10 seconds of 16kHz audio with 25ms windows + 10ms stride + 80 mel bins: a `(80, ~1000)` 2D matrix. Standard input to Whisper, music tagging models, audio classifiers.

<!-- tier:grad -->
# Mel Spectrogram (Grad)

## Hyperparameter choices

- **Sample rate**: 16kHz for speech (Whisper), 22.05kHz or 44.1kHz for music, 48kHz for high-fidelity.
- **Window size**: 25-50ms typical. Shorter = finer time resolution; longer = finer frequency resolution. The Heisenberg uncertainty.
- **Stride / hop**: 10ms (Whisper) or 12.5ms (some TTS systems). Smaller hop = more time frames; bigger hop = compression.
- **Number of mel bins**: 80 (standard for speech), 128 (more detail), 64 (compressed).

These hyperparameters affect what the model can resolve. Speech recognition wants fine time resolution (phonemes are short); music wants finer frequency resolution (chord identification).

## Inverse: mel-to-audio

Given a mel-spectrogram, reconstruct audio:
1. **Mel inversion**: estimate the linear-frequency spectrum from the mel filterbank output (lossy; multiple linear spectra map to the same mel).
2. **Phase reconstruction**: phase information was discarded; estimate it (Griffin-Lim algorithm) or generate it (neural vocoder).

Modern TTS uses **neural vocoders** (HiFi-GAN, WaveNet, BigVGAN) for step 2 — train a network to generate waveform from mel. Quality is near-perfect; phase is no longer the limiting factor.

## Beyond mel-spectrograms

- **MFCC (Mel-Frequency Cepstral Coefficients)**: discrete cosine transform of log-mel. Smaller (13 coefficients), used in older speech recognition. Mostly replaced by raw mel-spectrograms in deep learning.
- **CQT (Constant-Q Transform)**: logarithmic frequency spacing; better for music. Used in some music-tagging models.
- **Raw waveform** (wav2vec 2.0, HuBERT): bypass spectrograms entirely; use 1D conv layers on raw audio. More compute; can recover phase information.

For most applications: mel-spectrogram is the right default. Whisper, audio classifiers, music tagging, voice cloning all use them. Raw-waveform models are competitive but more computationally expensive.
