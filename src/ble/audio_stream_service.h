/*
 * BLE control / telemetry service for the hearing aid.
 *
 * A minimal custom GATT service exposing:
 *   - Control  (write) : enable/disable processing, pick a profile.
 *   - Level    (notify): post-processing output level, for a companion app.
 *
 * This is intentionally small — bulk audio streaming, if needed, should use a
 * dedicated high-throughput path (e.g. LE Audio / ISO), not this service.
 */
#ifndef BLE_AUDIO_STREAM_SERVICE_H_
#define BLE_AUDIO_STREAM_SERVICE_H_

#include <stdint.h>

/* Start BLE, register the GATT service, and begin advertising. */
int ble_service_init(void);

/* Push a new output level (0–255) to a subscribed central. */
void ble_service_notify_level(uint8_t level);

/* True while processing is enabled by the central (defaults to enabled). */
bool ble_service_processing_enabled(void);

#endif /* BLE_AUDIO_STREAM_SERVICE_H_ */
