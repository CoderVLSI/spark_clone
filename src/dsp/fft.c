/*
 * CMSIS-DSP real-FFT wrappers. Kept deliberately thin: state (twiddle tables)
 * lives in a single instance initialised once, and all buffers are caller
 * owned so this stays reentrant-friendly for a single DSP thread.
 */
#include "dsp/fft.h"

#include <zephyr/logging/log.h>
#include <arm_math.h>

LOG_MODULE_REGISTER(dsp_fft, CONFIG_LOG_DEFAULT_LEVEL);

static arm_rfft_fast_instance_f32 rfft;
static bool initialised;

int dsp_fft_init(void)
{
	arm_status st = arm_rfft_fast_init_f32(&rfft, AUDIO_FRAME_SAMPLES);

	if (st != ARM_MATH_SUCCESS) {
		LOG_ERR("rfft init failed for N=%d (status %d)",
			AUDIO_FRAME_SAMPLES, st);
		return -EINVAL;
	}
	initialised = true;
	return 0;
}

void dsp_rfft_forward(const audio_sample_t in[AUDIO_FRAME_SAMPLES],
		      float out[2 * AUDIO_FFT_BINS])
{
	__ASSERT(initialised, "dsp_fft_init() not called");

	/*
	 * arm_rfft_fast_f32 packs N/2 complex bins into N floats, folding the
	 * Nyquist bin into out[1]. Unpack to the conventional (N/2 + 1) layout
	 * so downstream code can treat DC and Nyquist as ordinary real bins.
	 */
	float packed[AUDIO_FRAME_SAMPLES];

	arm_rfft_fast_f32(&rfft, (float *)in, packed, 0 /* forward */);

	out[0] = packed[0];                 /* DC real  */
	out[1] = 0.0f;                      /* DC imag  */
	for (int k = 1; k < AUDIO_FRAME_SAMPLES / 2; k++) {
		out[2 * k]     = packed[2 * k];
		out[2 * k + 1] = packed[2 * k + 1];
	}
	out[2 * (AUDIO_FRAME_SAMPLES / 2)]     = packed[1]; /* Nyquist real */
	out[2 * (AUDIO_FRAME_SAMPLES / 2) + 1] = 0.0f;      /* Nyquist imag */
}

void dsp_rfft_inverse(const float in[2 * AUDIO_FFT_BINS],
		      audio_sample_t out[AUDIO_FRAME_SAMPLES])
{
	__ASSERT(initialised, "dsp_fft_init() not called");

	/* Re-fold the (N/2 + 1) layout back into the CMSIS packed form. */
	float packed[AUDIO_FRAME_SAMPLES];

	packed[0] = in[0];                                  /* DC real      */
	packed[1] = in[2 * (AUDIO_FRAME_SAMPLES / 2)];      /* Nyquist real */
	for (int k = 1; k < AUDIO_FRAME_SAMPLES / 2; k++) {
		packed[2 * k]     = in[2 * k];
		packed[2 * k + 1] = in[2 * k + 1];
	}

	arm_rfft_fast_f32(&rfft, packed, (float *)out, 1 /* inverse */);
}

void dsp_spectrum_magnitude(const float spec[2 * AUDIO_FFT_BINS],
			    float mag[AUDIO_FFT_BINS])
{
	arm_cmplx_mag_f32((float *)spec, mag, AUDIO_FFT_BINS);
}

void dsp_spectrum_apply_gain(float spec[2 * AUDIO_FFT_BINS],
			     const float gain[AUDIO_FFT_BINS])
{
	for (int k = 0; k < AUDIO_FFT_BINS; k++) {
		spec[2 * k]     *= gain[k];
		spec[2 * k + 1] *= gain[k];
	}
}
