/*
 * Central audio/DSP constants, derived from Kconfig so the whole pipeline
 * agrees on frame geometry. Include this instead of hard-coding sizes.
 */
#ifndef APP_CONFIG_H_
#define APP_CONFIG_H_

#include <zephyr/kernel.h>

#define AUDIO_SAMPLE_RATE_HZ   CONFIG_AUDIO_SAMPLE_RATE_HZ
#define AUDIO_FRAME_SAMPLES    CONFIG_AUDIO_FRAME_SAMPLES
#define AUDIO_HOP_SAMPLES      CONFIG_AUDIO_HOP_SAMPLES

/* Real FFT of a length-N real frame yields N/2 + 1 complex bins. */
#define AUDIO_FFT_BINS         ((AUDIO_FRAME_SAMPLES / 2) + 1)

BUILD_ASSERT((AUDIO_FRAME_SAMPLES & (AUDIO_FRAME_SAMPLES - 1)) == 0,
	     "AUDIO_FRAME_SAMPLES must be a power of two for arm_rfft_fast_f32");
BUILD_ASSERT(AUDIO_HOP_SAMPLES > 0 && AUDIO_HOP_SAMPLES <= AUDIO_FRAME_SAMPLES,
	     "AUDIO_HOP_SAMPLES must be within (0, AUDIO_FRAME_SAMPLES]");

/* Samples are processed as normalized floats in [-1.0, 1.0). */
typedef float audio_sample_t;

#endif /* APP_CONFIG_H_ */
