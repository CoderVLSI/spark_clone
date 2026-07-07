/*
 * Frequency-domain noise reduction.
 *
 * The core operation is a spectral mask: given the magnitude spectrum of a
 * frame, produce a per-bin gain in [0, 1] that attenuates noise-dominated
 * bins and passes speech-dominated ones. Two implementations sit behind this
 * interface, chosen by CONFIG_NOISE_REDUCTION_USE_MODEL:
 *
 *   - a TF-Lite Micro model (trained offline, stored in src/ai/model), or
 *   - a statistical spectral-subtraction fallback (always available).
 *
 * The caller applies the returned gains with dsp_spectrum_apply_gain() and
 * runs the inverse FFT + overlap-add.
 */
#ifndef AI_NOISE_REDUCTION_H_
#define AI_NOISE_REDUCTION_H_

#include "app_config.h"

/* Allocate model/estimator state. Call once after dsp_fft_init(). */
int noise_reduction_init(void);

/*
 * Compute suppression gains for one frame.
 *   mag  : AUDIO_FFT_BINS magnitudes from dsp_spectrum_magnitude()
 *   gain : AUDIO_FFT_BINS output gains, each in [0, 1]
 */
void noise_reduction_process(const float mag[AUDIO_FFT_BINS],
			     float gain[AUDIO_FFT_BINS]);

#endif /* AI_NOISE_REDUCTION_H_ */
