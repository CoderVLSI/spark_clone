/*
 * Analysis window. A periodic Hann window paired with 50% overlap gives the
 * constant-overlap-add property, so windowing on analysis alone reconstructs
 * cleanly after inverse FFT and overlap-add.
 */
#include "dsp/fft.h"

#include <arm_math.h>

static float hann[AUDIO_FRAME_SAMPLES];
static bool built;

static void build_window(void)
{
	for (int n = 0; n < AUDIO_FRAME_SAMPLES; n++) {
		/* Periodic (not symmetric): divide by N, not N-1. */
		hann[n] = 0.5f * (1.0f - arm_cos_f32(
			2.0f * PI * (float)n / (float)AUDIO_FRAME_SAMPLES));
	}
	built = true;
}

void dsp_window_apply(audio_sample_t frame[AUDIO_FRAME_SAMPLES])
{
	if (!built) {
		build_window();
	}
	arm_mult_f32(frame, hann, frame, AUDIO_FRAME_SAMPLES);
}
