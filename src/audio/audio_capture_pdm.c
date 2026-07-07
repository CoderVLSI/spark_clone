/*
 * PDM capture backend for the MP34DT01 / IMP34DT05 microphones, using the
 * Zephyr DMIC (Digital MIC) API. The DMIC driver performs PDM demodulation and
 * decimation, handing back PCM which we normalize to float.
 *
 * Selected when CONFIG_MIC_MP34DT01_PDM=y.
 */
#include "audio/audio_capture.h"

#include <zephyr/audio/dmic.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(audio_pdm, CONFIG_LOG_DEFAULT_LEVEL);

#define PDM_DEV DEVICE_DT_GET(DT_CHOSEN(zephyr_mic_pdm))

/* Two blocks in flight so the driver always has one to fill. */
#define BLOCK_SAMPLES  AUDIO_HOP_SAMPLES
#define BLOCK_BYTES    (BLOCK_SAMPLES * sizeof(int16_t))
#define BLOCK_COUNT    4

K_MEM_SLAB_DEFINE_STATIC(pdm_slab, BLOCK_BYTES, BLOCK_COUNT, 4);

static const struct device *const dmic = PDM_DEV;

int audio_capture_start(void)
{
	if (!device_is_ready(dmic)) {
		LOG_ERR("PDM device not ready");
		return -ENODEV;
	}

	struct pcm_stream_cfg stream = {
		.pcm_rate = AUDIO_SAMPLE_RATE_HZ,
		.pcm_width = 16,
		.block_size = BLOCK_BYTES,
		.mem_slab = &pdm_slab,
	};
	struct dmic_cfg cfg = {
		.io = {
			/* Match the MP34DT01 clock window (datasheet: 1.2–3.25 MHz). */
			.min_pdm_clk_freq = 1000000,
			.max_pdm_clk_freq = 3500000,
			.min_pdm_clk_dc = 40,
			.max_pdm_clk_dc = 60,
		},
		.streams = &stream,
		.channel = {
			.req_num_chan = 1,
			.req_num_streams = 1,
			.req_chan_map_lo = dmic_build_channel_map(0, 0, PDM_CHAN_LEFT),
		},
	};

	int err = dmic_configure(dmic, &cfg);

	if (err) {
		LOG_ERR("dmic_configure failed (%d)", err);
		return err;
	}

	err = dmic_trigger(dmic, DMIC_TRIGGER_START);
	if (err) {
		LOG_ERR("dmic start failed (%d)", err);
	}
	return err;
}

int audio_capture_stop(void)
{
	return dmic_trigger(dmic, DMIC_TRIGGER_STOP);
}

int audio_capture_read_hop(audio_sample_t out[AUDIO_HOP_SAMPLES],
			   k_timeout_t timeout)
{
	void *block;
	size_t size;
	int err = dmic_read(dmic, 0, &block, &size, k_ticks_to_ms_floor32(
					  timeout.ticks));

	if (err) {
		return err == -EAGAIN ? -EAGAIN : err;
	}

	const int16_t *pcm = block;
	size_t n = MIN(size / sizeof(int16_t), (size_t)AUDIO_HOP_SAMPLES);

	for (size_t i = 0; i < n; i++) {
		out[i] = (audio_sample_t)pcm[i] / 32768.0f;
	}

	k_mem_slab_free(&pdm_slab, block);
	return 0;
}
