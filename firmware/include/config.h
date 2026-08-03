#pragma once

// XIAO ESP32-C6 pin labels. Change only if you wire differently.
#define PIN_TFT_CS   D1
#define PIN_TFT_DC   D2
#define PIN_TFT_RST  D3
#define PIN_TFT_BL   D4
#define PIN_TFT_SCK  D8
#define PIN_TFT_MOSI D10

#define PIN_DHT      D6
#define PIN_SOIL_PWR D7
#define PIN_SOIL_ADC D0
#define PIN_BUTTON   D5

#define TFT_WIDTH  240
#define TFT_HEIGHT 280
#define DHT_TYPE DHT22

// Set after calibrating your own capacitive sensor.
#define SOIL_RAW_DRY  3000
#define SOIL_RAW_WET  1300

// Battery-first schedule.
#define SAMPLE_INTERVAL_MINUTES 15
#define SCREEN_ON_SECONDS       25
#define NIGHT_START_HOUR        22
#define NIGHT_END_HOUR           7

// Optional Wi-Fi dashboard. Leave empty to run fully offline.
#define WIFI_SSID ""
#define WIFI_PASS ""

// Device creates this simple local web dashboard when Wi-Fi connects.
#define DEVICE_NAME "PokePlant"
