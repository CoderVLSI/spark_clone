/*
 * DB01 hearing-aid firmware — pipeline orchestration.
 *
 *   capture(hop) ─▶ slide frame ─▶ window ─▶ FFT ─▶ magnitude
 *        ▲                                             │
 *        │                                             ▼
 *   overlap-add ◀─ IFFT ◀─ apply gain ◀── noise-reduction mask
 *        │
 *        └──▶ output to DB01 processor (SAI/SSI link)   TODO(hw)
 *
 * Frames advance by AUDIO_HOP_SAMPLES with 50% overlap; the Hann window plus
 * overlap-add reconstructs the time signal after masking.
 */
#include "app_config.h"
#include "audio/audio_capture.h"
#include "dsp/fft.h"
#include "ai/noise_reduction.h"
#include "ble/audio_stream_service.h"

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <math.h>
#include <string.h>

LOG_MODULE_REGISTER(main, CONFIG_LOG_DEFAULT_LEVEL);

/* Sliding analysis frame: old samples shift left, a fresh hop is appended. */
static audio_sample_t frame[AUDIO_FRAME_SAMPLES];
/* Overlap-add accumulator for reconstruction. */
static audio_sample_t ola[AUDIO_FRAME_SAMPLES];

static void process_frame(void)
{
	audio_sample_t windowed[AUDIO_FRAME_SAMPLES];
	float spec[2 * AUDIO_FFT_BINS];
	float mag[AUDIO_FFT_BINS];
	float gain[AUDIO_FFT_BINS];
	audio_sample_t recon[AUDIO_FRAME_SAMPLES];

	memcpy(windowed, frame, sizeof(windowed));
	dsp_window_apply(windowed);
	dsp_rfft_forward(windowed, spec);

	if (ble_service_processing_enabled()) {
		dsp_spectrum_magnitude(spec, mag);
		noise_reduction_process(mag, gain);
		dsp_spectrum_apply_gain(spec, gain);
	}

	dsp_rfft_inverse(spec, recon);

	/* Overlap-add: accumulate this frame, emit the oldest hop, then shift. */
	for (int n = 0; n < AUDIO_FRAME_SAMPLES; n++) {
		ola[n] += recon[n];
	}

	/* TODO(hw): stream ola[0 .. AUDIO_HOP_SAMPLES) to the DB01 processor
	 * over the SAI/SSI link. For now we only report an output level. */
	float peak = 0.0f;

	for (int n = 0; n < AUDIO_HOP_SAMPLES; n++) {
		peak = fmaxf(peak, fabsf(ola[n]));
	}
	ble_service_notify_level((uint8_t)(fminf(peak, 1.0f) * 255.0f));

	memmove(ola, ola + AUDIO_HOP_SAMPLES,
		(AUDIO_FRAME_SAMPLES - AUDIO_HOP_SAMPLES) * sizeof(ola[0]));
	memset(ola + (AUDIO_FRAME_SAMPLES - AUDIO_HOP_SAMPLES), 0,
	       AUDIO_HOP_SAMPLES * sizeof(ola[0]));
}

int main(void)
{
	LOG_INF("DB01 hearing aid starting (fs=%d Hz, N=%d, hop=%d)",
		AUDIO_SAMPLE_RATE_HZ, AUDIO_FRAME_SAMPLES, AUDIO_HOP_SAMPLES);

	if (dsp_fft_init() || noise_reduction_init() || ble_service_init()) {
		LOG_ERR("init failed; halting");
		return -EIO;
	}

	if (audio_capture_start()) {
		LOG_ERR("microphone start failed; halting");
		return -EIO;
	}

	for (;;) {
		/* Append a new hop at the tail of the sliding frame. */
		memmove(frame, frame + AUDIO_HOP_SAMPLES,
			(AUDIO_FRAME_SAMPLES - AUDIO_HOP_SAMPLES) * sizeof(frame[0]));

		int err = audio_capture_read_hop(
			frame + (AUDIO_FRAME_SAMPLES - AUDIO_HOP_SAMPLES),
			K_MSEC(100));

		if (err == -EAGAIN) {
			LOG_WRN("capture underrun");
			continue;
		}
		if (err) {
			LOG_ERR("capture error (%d); stopping", err);
			break;
		}

		process_frame();
	}

	audio_capture_stop();
	return 0;
}
