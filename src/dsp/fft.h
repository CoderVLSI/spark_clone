/*
 * Real FFT / inverse FFT and windowing helpers built on CMSIS-DSP.
 *
 * Spectra are stored in the CMSIS "RFFT" packed layout: an array of
 * AUDIO_FFT_BINS interleaved {real, imag} pairs (DC and Nyquist have zero
 * imaginary parts). Magnitude/phase helpers operate on that layout.
 */
#ifndef DSP_FFT_H_
#define DSP_FFT_H_

#include "app_config.h"

/* Precompute FFT twiddle tables + the analysis window. Call once at startup. */
int dsp_fft_init(void);

/* Apply the analysis (Hann) window to a frame in place. */
void dsp_window_apply(audio_sample_t frame[AUDIO_FRAME_SAMPLES]);

/*
 * Forward real FFT.
 *   in  : AUDIO_FRAME_SAMPLES real, windowed samples
 *   out : AUDIO_FFT_BINS interleaved complex pairs (2*AUDIO_FFT_BINS floats)
 */
void dsp_rfft_forward(const audio_sample_t in[AUDIO_FRAME_SAMPLES],
		      float out[2 * AUDIO_FFT_BINS]);

/* Inverse real FFT. Produces AUDIO_FRAME_SAMPLES real samples (unwindowed). */
void dsp_rfft_inverse(const float in[2 * AUDIO_FFT_BINS],
		      audio_sample_t out[AUDIO_FRAME_SAMPLES]);

/* Per-bin magnitude from a packed complex spectrum. */
void dsp_spectrum_magnitude(const float spec[2 * AUDIO_FFT_BINS],
			    float mag[AUDIO_FFT_BINS]);

/* Scale each complex bin by a real gain (applies the noise-reduction mask). */
void dsp_spectrum_apply_gain(float spec[2 * AUDIO_FFT_BINS],
			     const float gain[AUDIO_FFT_BINS]);

#endif /* DSP_FFT_H_ */
