# DB01 Hearing Aid — nRF5340 Firmware

Real-time audio processing firmware for a cochlear-implant / hearing-aid front end
built around the **Manjeera DB01** board, with a **Nordic nRF5340** for
Bluetooth Low Energy connectivity and on-device **FFT + AI noise reduction**.

## Signal chain

```
 MEMS mic(s)                nRF5340 (app core, Cortex-M33)                 DB01
┌───────────┐   PDM/I2S   ┌───────────────────────────────────────────┐  audio
│ MP34DT01  │────────────▶│ capture ─▶ window ─▶ FFT ─▶ AI noise   ─▶  │─────▶ MDS_DB01p
│  (PDM)    │             │  (DMIC)             (RFFT) reduction  IFFT │       processor
│  ── or ── │             │                            (model/       │
│ INMP441   │────────────▶│                             spectral sub) │
│  (I2S)    │   I2S       └───────────────────┬───────────────────────┘
└───────────┘                                 │ BLE (net core)
                                              ▼
                                        Companion app
                                     (control / telemetry)
```

## Hardware (from `DB01.kicad_sch`, Rev A)

| Ref      | Part            | Role                                   |
|----------|-----------------|----------------------------------------|
| U1       | MDS_DB01p       | DB01 processor (ADC mux, JTAG, UART, I²C, SAI) |
| U6, U7   | IMP34DT05       | PDM MEMS microphones                    |
| U5       | AT25QL321       | 32-Mbit QSPI flash (model / config storage) |
| U8       | ECS-2018-240    | 24 MHz reference oscillator             |
| J1       | 10-pin header   | JTAG + UART debug                       |

The nRF5340 is added as the BLE + DSP host. It captures mic audio, runs the
noise-reduction pipeline, and hands cleaned audio to the DB01 processor over
the SAI/SSI link.

## Layout

```
├── west.yml                # nRF Connect SDK manifest (pins the SDK revision)
├── CMakeLists.txt          # Zephyr application
├── prj.conf                # Base Kconfig (BLE, audio, DSP, TFLite)
├── Kconfig                 # App options (mic type, frame size, gains)
├── sysbuild.conf           # Multi-image build (app + BLE net core)
├── boards/                 # Devicetree overlays + per-board config
├── src/
│   ├── main.c              # Pipeline orchestration
│   ├── app_config.h        # Audio/DSP constants
│   ├── audio/              # PDM (MP34DT01) and I2S (INMP441) capture
│   ├── dsp/                # Windowing + CMSIS-DSP FFT
│   ├── ai/                 # Noise-reduction model interface + fallback
│   └── ble/               # BLE control / telemetry service
└── docs/                   # Architecture + hardware notes
```

## Build

Requires the [nRF Connect SDK](https://docs.nordicsemi.com/bundle/ncs-latest/)
(v2.6+ recommended) and its toolchain.

```sh
# One-time: fetch the pinned SDK next to this repo
west init -l .
west update

# Build for the nRF5340 DK application core (net core built via sysbuild)
west build -b nrf5340dk/nrf5340/cpuapp --sysbuild

# Flash
west flash
```

Select the microphone at build time:

```sh
# PDM (MP34DT01 / IMP34DT05) — default
west build -b nrf5340dk/nrf5340/cpuapp --sysbuild

# I2S (INMP441)
west build -b nrf5340dk/nrf5340/cpuapp --sysbuild -- -DCONFIG_MIC_INMP441_I2S=y
```

> **Status:** scaffold. The pipeline is wired end-to-end but pin maps, the DB01
> audio-out link, and the AI model are placeholders — see the `TODO(hw)` and
> `TODO(model)` markers. Not yet built against a specific NCS checkout.

## Bringing your own board

`nrf5340dk/nrf5340/cpuapp` is used as the base board so this builds against a
stock NCS install. For the real DB01+nRF5340 hardware, add a board definition
under `boards/` and move the overlay pin map there. See `docs/hardware.md`.
