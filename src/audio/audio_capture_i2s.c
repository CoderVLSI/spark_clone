/*
 * I2S capture backend for the INMP441 microphone, using the Zephyr I2S API.
 * The INMP441 is a 24-bit-in-32-bit-frame device; we read 32-bit words and
 * normalize the top 24 bits to float.
 *
 * Selected when CONFIG_MIC_INMP441_I2S=y.
 */
#include "audio/audio_capture.h"

#include <zephyr/drivers/i2s.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(audio_i2s, CONFIG_LOG_DEFAULT_LEVEL);

#define I2S_DEV DEVICE_DT_GET(DT_CHOSEN(zephyr_mic_i2s))

#define WORD_BYTES     sizeof(int32_t)
#define BLOCK_BYTES    (AUDIO_HOP_SAMPLES * WORD_BYTES)
#define BLOCK_COUNT    4

K_MEM_SLAB_DEFINE_STATIC(i2s_slab, BLOCK_BYTES, BLOCK_COUNT, WORD_BYTES);

static const struct device *const i2s = I2S_DEV;

int audio_capture_start(void)
{
	if (!device_is_ready(i2s)) {
		LOG_ERR("I2S device not ready");
		return -ENODEV;
	}

	struct i2s_config cfg = {
		.word_size = 32,          /* INMP441: 24-bit data in 32-bit slots */
		.channels = 1,            /* mono; L/R pin ties the active channel */
		.format = I2S_FMT_DATA_FORMAT_I2S,
		.options = I2S_OPT_FRAME_CLK_MASTER | I2S_OPT_BIT_CLK_MASTER,
		.frame_clk_freq = AUDIO_SAMPLE_RATE_HZ,
		.mem_slab = &i2s_slab,
		.block_size = BLOCK_BYTES,
		.timeout = 100,
	};

	int err = i2s_configure(i2s, I2S_DIR_RX, &cfg);

	if (err) {
		LOG_ERR("i2s_configure failed (%d)", err);
		return err;
	}

	err = i2s_trigger(i2s, I2S_DIR_RX, I2S_TRIGGER_START);
	if (err) {
		LOG_ERR("i2s start failed (%d)", err);
	}
	return err;
}

int audio_capture_stop(void)
{
	return i2s_trigger(i2s, I2S_DIR_RX, I2S_TRIGGER_DRAIN);
}

int audio_capture_read_hop(audio_sample_t out[AUDIO_HOP_SAMPLES],
			   k_timeout_t timeout)
{
	void *block;
	size_t size;
	int err = i2s_read(i2s, &block, &size);

	ARG_UNUSED(timeout); /* i2s_config.timeout governs the RX wait */
	if (err) {
		return err == -EAGAIN ? -EAGAIN : err;
	}

	const int32_t *raw = block;
	size_t n = MIN(size / WORD_BYTES, (size_t)AUDIO_HOP_SAMPLES);

	for (size_t i = 0; i < n; i++) {
		/* 24-bit sample is left-justified in the 32-bit word. */
		out[i] = (audio_sample_t)(raw[i] >> 8) / 8388608.0f;
	}

	k_mem_slab_free(&i2s_slab, block);
	return 0;
}
