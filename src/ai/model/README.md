# Noise-reduction model

Drop the trained TF-Lite Micro model here as `noise_reduction.tflite`, then
build with `-DCONFIG_NOISE_REDUCTION_USE_MODEL=y`.

## Expected I/O contract

The firmware calls the model once per audio frame with the FFT magnitude
spectrum and expects a suppression mask back:

| Tensor  | Shape                 | Meaning                                    |
|---------|-----------------------|--------------------------------------------|
| input   | `[1, AUDIO_FFT_BINS]` | Per-bin magnitude (match training scaling: log1p + per-bin normalization recommended) |
| output  | `[1, AUDIO_FFT_BINS]` | Per-bin gain in `[0, 1]`                    |

`AUDIO_FFT_BINS = AUDIO_FRAME_SAMPLES/2 + 1` (129 for the default 256-pt FFT).
If you change the frame size in Kconfig, retrain to match.

## Suggested architecture

A small recurrent or causal-conv mask estimator (RNNoise-style) keeps latency
and RAM low enough for the nRF5340 app core. Keep the tensor arena under the
budget in `prj.conf`.

## Wiring checklist (see `TODO(model)` in `../noise_reduction.c`)

1. Convert the `.tflite` to a C array (`xxd -i`) or link it as a binary blob.
2. Provide a `tflite::MicroMutableOpResolver` covering your layers.
3. Size the static tensor arena and call `Invoke()` per frame.

> Models are git-ignored by default (`*.tflite`). Store the real artifact via
> Git LFS or a fetch script so large binaries stay out of the source history.
