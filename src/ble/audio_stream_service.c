/*
 * Custom GATT service (control + level telemetry) and connectable advertising.
 * The BLE controller runs on the nRF5340 network core (hci_ipc); this code
 * runs the host + GATT layer on the application core.
 */
#include "ble/audio_stream_service.h"

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/settings/settings.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(ble_svc, CONFIG_LOG_DEFAULT_LEVEL);

/* 128-bit UUIDs (randomly generated base for this product). */
#define BT_UUID_HA_SVC_VAL \
	BT_UUID_128_ENCODE(0x0db01000, 0x1a2b, 0x4c3d, 0x8e5f, 0x00a0b0c0d0e0)
#define BT_UUID_HA_CTRL_VAL \
	BT_UUID_128_ENCODE(0x0db01001, 0x1a2b, 0x4c3d, 0x8e5f, 0x00a0b0c0d0e0)
#define BT_UUID_HA_LEVEL_VAL \
	BT_UUID_128_ENCODE(0x0db01002, 0x1a2b, 0x4c3d, 0x8e5f, 0x00a0b0c0d0e0)

static struct bt_uuid_128 ha_svc   = BT_UUID_INIT_128(BT_UUID_HA_SVC_VAL);
static struct bt_uuid_128 ha_ctrl  = BT_UUID_INIT_128(BT_UUID_HA_CTRL_VAL);
static struct bt_uuid_128 ha_level = BT_UUID_INIT_128(BT_UUID_HA_LEVEL_VAL);

static bool processing_enabled = true;
static uint8_t level_value;

static ssize_t ctrl_write(struct bt_conn *conn,
			  const struct bt_gatt_attr *attr, const void *buf,
			  uint16_t len, uint16_t offset, uint8_t flags)
{
	ARG_UNUSED(conn); ARG_UNUSED(attr); ARG_UNUSED(offset); ARG_UNUSED(flags);
	if (len < 1) {
		return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
	}
	processing_enabled = ((const uint8_t *)buf)[0] != 0;
	LOG_INF("processing %s by central",
		processing_enabled ? "enabled" : "disabled");
	return len;
}

static void level_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
	ARG_UNUSED(attr);
	LOG_DBG("level notifications %s",
		(value == BT_GATT_CCC_NOTIFY) ? "on" : "off");
}

/* clang-format off */
BT_GATT_SERVICE_DEFINE(ha_service,
	BT_GATT_PRIMARY_SERVICE(&ha_svc),
	BT_GATT_CHARACTERISTIC(&ha_ctrl.uuid,
			       BT_GATT_CHRC_WRITE,
			       BT_GATT_PERM_WRITE,
			       NULL, ctrl_write, NULL),
	BT_GATT_CHARACTERISTIC(&ha_level.uuid,
			       BT_GATT_CHRC_NOTIFY,
			       BT_GATT_PERM_NONE,
			       NULL, NULL, &level_value),
	BT_GATT_CCC(level_ccc_changed,
		    BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
);
/* clang-format on */

/* Level characteristic value attribute sits right after its declaration. */
#define LEVEL_ATTR (&ha_service.attrs[4])

static const struct bt_data adv[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BLE_DEVICE_NAME,
		sizeof(CONFIG_BLE_DEVICE_NAME) - 1),
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, BT_UUID_HA_SVC_VAL),
};

static void on_connected(struct bt_conn *conn, uint8_t err)
{
	if (err) {
		LOG_WRN("connection failed (0x%02x)", err);
		return;
	}
	LOG_INF("central connected");
}

static void on_disconnected(struct bt_conn *conn, uint8_t reason)
{
	ARG_UNUSED(conn);
	LOG_INF("central disconnected (0x%02x)", reason);
}

BT_CONN_CB_DEFINE(conn_cbs) = {
	.connected = on_connected,
	.disconnected = on_disconnected,
};

static int start_advertising(void)
{
	int err = bt_le_adv_start(BT_LE_ADV_CONN_FAST_1, adv, ARRAY_SIZE(adv),
				  NULL, 0);
	if (err) {
		LOG_ERR("advertising start failed (%d)", err);
	}
	return err;
}

int ble_service_init(void)
{
	int err = bt_enable(NULL);

	if (err) {
		LOG_ERR("bt_enable failed (%d)", err);
		return err;
	}
	if (IS_ENABLED(CONFIG_SETTINGS)) {
		settings_load();
	}
	return start_advertising();
}

void ble_service_notify_level(uint8_t level)
{
	level_value = level;
	/* Silently no-ops when no central has subscribed to the CCC. */
	(void)bt_gatt_notify(NULL, LEVEL_ATTR, &level_value, sizeof(level_value));
}

bool ble_service_processing_enabled(void)
{
	return processing_enabled;
}
