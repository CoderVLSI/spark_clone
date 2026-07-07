# Architecture

## Overview

The nRF5340 application core runs a real-time, frame-based audio pipeline and a
BLE peripheral. Audio comes from a digital MEMS microphone, is cleaned by an
FFT-domain noise-reduction stage, and is handed to the DB01 processor.

```
                 nRF5340 application core (Cortex-M33 + FPU)
 ┌──────────────────────────────────────────────────────────────────────┐
 │  audio_capture_*   dsp/          ai/                 main.c            │
 │  ┌──────────┐   ┌────────┐   ┌───────────────┐   ┌──────────────────┐ │
 │  │ PDM/I2S  │──▶│ window │──▶│ FFT (CMSIS)   │──▶│ noise reduction  │ │
 │  │ capture  │   │ +RFFT  │   │ magnitude     │   │ (model/fallback) │ │
 │  └──────────┘   └────────┘   └───────────────┘   └────────┬─────────┘ │
 │        ▲                                                   │ gains     │
 │        │                     ┌────────┐   ┌────────┐       ▼           │
 │        └── overlap-add ◀──── │ IFFT   │◀──│ apply  │◀──────┘           │
 │                              └────────┘   │ gain   │                   │
 │                                           └────────┘                   │
 │  ble/  ── control + level telemetry (GATT) ──▶ companion app          │
 └────────────────────────────────┬─────────────────────────────────────┘
                                   │ IPC
                 nRF5340 network core: BLE LE controller (hci_ipc)
```

## Frame geometry

| Parameter    | Default | Kconfig                     |
|--------------|---------|-----------------------------|
| Sample rate  | 16 kHz  | `AUDIO_SAMPLE_RATE_HZ`      |
| Frame        | 256     | `AUDIO_FRAME_SAMPLES`       |
| Hop          | 128     | `AUDIO_HOP_SAMPLES`         |
| FFT bins     | 129     | derived (`N/2 + 1`)         |

50% overlap + periodic Hann window → constant-overlap-add, so windowing on
analysis alone reconstructs cleanly. Per-frame latency ≈ one frame (16 ms).

## Modules

- **`audio/`** — capture behind a single interface. `audio_capture_pdm.c`
  (MP34DT01/IMP34DT05 via DMIC) and `audio_capture_i2s.c` (INMP441 via I2S)
  are compiled mutually exclusively by Kconfig; both yield normalized floats.
- **`dsp/`** — `window.c` (Hann) and `fft.c` (CMSIS-DSP `arm_rfft_fast_f32`
  wrappers with a conventional `N/2 + 1` bin layout).
- **`ai/`** — `noise_reduction.c` computes a per-bin suppression mask, either
  from a TF-Lite Micro model or a spectral-subtraction fallback.
- **`ble/`** — custom GATT service for control (enable/disable) and level
  telemetry. Controller lives on the net core via sysbuild's `hci_ipc`.

## Threading

The pipeline runs in `main()` as a single tight loop; capture blocks the loop
on `audio_capture_read_hop()`, which paces it to real time. If model inference
grows heavy, split capture (ISR/driver thread) from DSP (dedicated thread) via
a `k_msgq` of hops — the capture interface is already isolated for this.

## Open hardware integration points (`TODO(hw)` / `TODO(model)`)

1. Mic pin map in `boards/*.overlay` — confirm against the DB01 net list.
2. Output link `main.c` → DB01 processor over SAI/SSI.
3. TF-Lite model embedding + `Invoke()` glue in `ai/noise_reduction.c`.
