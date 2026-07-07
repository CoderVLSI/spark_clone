# SPDX-License-Identifier: Apache-2.0
cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(db01_hearingaid LANGUAGES C)

target_sources(app PRIVATE
  src/main.c
  src/dsp/window.c
  src/dsp/fft.c
  src/ai/noise_reduction.c
  src/ble/audio_stream_service.c
)

# Microphone backend is selected via Kconfig (see ./Kconfig).
target_sources_ifdef(CONFIG_MIC_MP34DT01_PDM  app PRIVATE src/audio/audio_capture_pdm.c)
target_sources_ifdef(CONFIG_MIC_INMP441_I2S   app PRIVATE src/audio/audio_capture_i2s.c)

target_include_directories(app PRIVATE src)
