/*
 * Microphone capture abstraction. Two backends implement this interface —
 * PDM (MP34DT01 / IMP34DT05) and I2S (INMP441) — selected at build time via
 * Kconfig. main.c only sees normalized float frames and never the peripheral.
 */
#ifndef AUDIO_CAPTURE_H_
#define AUDIO_CAPTURE_H_

#include "app_config.h"

/* Start the microphone and its DMA/stream. Blocks only during setup. */
int audio_capture_start(void);

/* Stop streaming and release the peripheral. */
int audio_capture_stop(void);

/*
 * Block until the next hop of audio is available, copying AUDIO_HOP_SAMPLES
 * normalized samples (float, [-1.0, 1.0)) into `out`.
 *
 * Returns 0 on success, -EAGAIN on timeout, or a negative errno on error.
 */
int audio_capture_read_hop(audio_sample_t out[AUDIO_HOP_SAMPLES],
			   k_timeout_t timeout);

#endif /* AUDIO_CAPTURE_H_ */
