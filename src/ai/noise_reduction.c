/*
 * Noise-reduction gain computation.
 *
 * Fallback path (always built): a classic decision-directed spectral
 * subtraction. A minima-tracked noise floor per bin drives a Wiener-style
 * gain. It is cheap, stable, and gives a working pipeline before any model
 * is trained.
 *
 * Model path (CONFIG_NOISE_REDUCTION_USE_MODEL): the magnitude spectrum is
 * fed to a TF-Lite Micro network that outputs the per-bin mask directly.
 * Drop the trained model at src/ai/model/noise_reduction.tflite and enable
 * the option. The invoke glue is stubbed with clear TODO(model) markers.
 */
#include "ai/noise_reduction.h"

#include <zephyr/logging/log.h>
#include <math.h>

LOG_MODULE_REGISTER(noise_reduction, CONFIG_LOG_DEFAULT_LEVEL);

/* Noise-floor tracker shared by the fallback (and used to seed the model). */
static float noise_est[AUDIO_FFT_BINS];
static bool  primed;

/* Smoothing + floor constants. Tune per acoustic environment. */
#define NOISE_ADAPT_UP     0.02f   /* rise slowly when noise grows            */
#define NOISE_ADAPT_DOWN   0.50f   /* fall fast toward new minima             */
#define OVERSUBTRACT       1.5f    /* aggressiveness of subtraction           */
#define GAIN_FLOOR         0.10f   /* residual gain: avoids musical-noise holes */

static void spectral_subtraction(const float mag[AUDIO_FFT_BINS],
				 float gain[AUDIO_FFT_BINS])
{
	for (int k = 0; k < AUDIO_FFT_BINS; k++) {
		float m = mag[k];

		if (!primed) {
			noise_est[k] = m;
		} else if (m < noise_est[k]) {
			noise_est[k] += NOISE_ADAPT_DOWN * (m - noise_est[k]);
		} else {
			noise_est[k] += NOISE_ADAPT_UP * (m - noise_est[k]);
		}

		/* Wiener-form gain from the a-posteriori SNR estimate. */
		float noise = OVERSUBTRACT * noise_est[k];
		float snr_power = (m * m) - (noise * noise);
		float g = snr_power > 0.0f ? snr_power / (m * m + 1e-9f) : 0.0f;

		gain[k] = fmaxf(GAIN_FLOOR, fminf(1.0f, g));
	}
	primed = true;
}

#if defined(CONFIG_NOISE_REDUCTION_USE_MODEL)
/*
 * TODO(model): wire TF-Lite Micro here.
 *   1. Embed the flatbuffer (xxd -> const array, or link a section) and pass
 *      it to tflite::GetModel().
 *   2. Build a MicroInterpreter with an op resolver covering the layers your
 *      network uses, and a static tensor arena sized to the model.
 *   3. In model_process(): copy `mag` (optionally log-compressed / normalized
 *      to match training) into input tensor, Invoke(), read the mask out.
 * Until that is filled in, fall back so the build stays runnable.
 */
static int model_init(void)
{
	LOG_WRN("TF-Lite model backend selected but not yet wired; "
		"using spectral-subtraction fallback (see TODO(model))");
	return 0;
}

static void model_process(const float mag[AUDIO_FFT_BINS],
			  float gain[AUDIO_FFT_BINS])
{
	spectral_subtraction(mag, gain); /* placeholder until Invoke() is added */
}
#endif /* CONFIG_NOISE_REDUCTION_USE_MODEL */

int noise_reduction_init(void)
{
	primed = false;
#if defined(CONFIG_NOISE_REDUCTION_USE_MODEL)
	return model_init();
#else
	LOG_INF("noise reduction: spectral-subtraction backend");
	return 0;
#endif
}

void noise_reduction_process(const float mag[AUDIO_FFT_BINS],
			     float gain[AUDIO_FFT_BINS])
{
#if defined(CONFIG_NOISE_REDUCTION_USE_MODEL)
	model_process(mag, gain);
#else
	spectral_subtraction(mag, gain);
#endif
}
