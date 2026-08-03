#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <time.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <DHT.h>
#include "config.h"

Adafruit_ST7789 tft(PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);
DHT dht(PIN_DHT, DHT_TYPE);
Preferences prefs;
WebServer server(80);

RTC_DATA_ATTR uint32_t bootCount = 0;
RTC_DATA_ATTR uint32_t totalSamples = 0;
RTC_DATA_ATTR float lastTemp = NAN;
RTC_DATA_ATTR float lastHumidity = NAN;
RTC_DATA_ATTR int lastMoisture = -1;

struct PetState {
  uint32_t xp = 0;
  uint16_t ageDays = 0;
  uint16_t healthyStreak = 0;
  uint8_t stage = 0;
  bool sleeping = false;
};

PetState pet;
uint16_t C_BG, C_PANEL, C_GREEN, C_DARKGREEN, C_BROWN, C_YELLOW, C_BLUE, C_WHITE, C_RED;

void setupColours() {
  C_BG = tft.color565(18, 27, 32);
  C_PANEL = tft.color565(32, 48, 54);
  C_GREEN = tft.color565(87, 205, 110);
  C_DARKGREEN = tft.color565(34, 126, 70);
  C_BROWN = tft.color565(135, 84, 45);
  C_YELLOW = tft.color565(247, 210, 73);
  C_BLUE = tft.color565(74, 164, 232);
  C_WHITE = ST77XX_WHITE;
  C_RED = tft.color565(235, 82, 82);
}

int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

int readSoilPercent() {
  digitalWrite(PIN_SOIL_PWR, HIGH);
  delay(120);
  int sum = 0;
  for (int i = 0; i < 12; ++i) { sum += analogRead(PIN_SOIL_ADC); delay(8); }
  digitalWrite(PIN_SOIL_PWR, LOW);
  int raw = sum / 12;
  return clampi(map(raw, SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100), 0, 100);
}

bool currentNight() {
  struct tm ti;
  if (getLocalTime(&ti, 30)) return ti.tm_hour >= NIGHT_START_HOUR || ti.tm_hour < NIGHT_END_HOUR;
  return (bootCount % 4) == 0;
}

void loadPet() {
  prefs.begin("pokeplant", false);
  pet.xp = prefs.getUInt("xp", 0);
  pet.ageDays = prefs.getUShort("days", 0);
  pet.healthyStreak = prefs.getUShort("streak", 0);
  pet.stage = prefs.getUChar("stage", 0);
}

void savePet() {
  prefs.putUInt("xp", pet.xp);
  prefs.putUShort("days", pet.ageDays);
  prefs.putUShort("streak", pet.healthyStreak);
  prefs.putUChar("stage", pet.stage);
}

void evolveIfReady() {
  uint8_t newStage = 0;
  if (pet.xp >= 120) newStage = 1;
  if (pet.xp >= 450) newStage = 2;
  if (pet.xp >= 1100) newStage = 3;
  if (newStage > pet.stage) pet.stage = newStage;
}

void updatePet(int moisture, float temp, float hum) {
  int healthy = (moisture >= 35 && moisture <= 75) + (!isnan(temp) && temp >= 18 && temp <= 34) + (!isnan(hum) && hum >= 25 && hum <= 85);
  if (healthy == 3) { pet.xp += 8; pet.healthyStreak++; }
  else if (healthy == 2) pet.xp += 3;
  else pet.healthyStreak = 0;
  totalSamples++;
  pet.ageDays = totalSamples / ((24UL * 60UL) / SAMPLE_INTERVAL_MINUTES);
  evolveIfReady();
  savePet();
}

void drawCloud(int x, int y) {
  tft.fillCircle(x, y, 10, C_WHITE);
  tft.fillCircle(x + 13, y - 3, 13, C_WHITE);
  tft.fillCircle(x + 28, y, 10, C_WHITE);
  tft.fillRoundRect(x - 2, y, 34, 10, 5, C_WHITE);
}

void drawFace(int x, int y, int scale, bool asleep) {
  if (asleep) {
    tft.drawLine(x - 10*scale, y, x - 3*scale, y, C_BG);
    tft.drawLine(x + 3*scale, y, x + 10*scale, y, C_BG);
    tft.setTextColor(C_WHITE); tft.setTextSize(1); tft.setCursor(x + 18*scale, y - 12*scale); tft.print("zZ");
  } else {
    tft.fillCircle(x - 7*scale, y, 2*scale, C_BG);
    tft.fillCircle(x + 7*scale, y, 2*scale, C_BG);
    tft.drawArc(x, y + 5*scale, 8*scale, 5*scale, 20, 160, C_BG, C_BG);
  }
}

void drawCreature(uint8_t stage, bool sleeping) {
  int cx = 120, cy = 139;
  tft.fillEllipse(cx, cy + 54, 62, 12, tft.color565(12, 18, 20));
  if (stage == 0) {
    tft.fillEllipse(cx, cy + 15, 43, 48, C_BROWN);
    tft.drawEllipse(cx, cy + 15, 43, 48, C_YELLOW);
    tft.fillTriangle(cx - 12, cy - 28, cx, cy - 55, cx + 5, cy - 22, C_GREEN);
    drawFace(cx, cy + 13, 1, sleeping);
  } else if (stage == 1) {
    tft.fillRoundRect(cx - 38, cy - 20, 76, 88, 35, C_GREEN);
    tft.fillEllipse(cx - 25, cy - 47, 29, 15, C_DARKGREEN);
    tft.fillEllipse(cx + 25, cy - 47, 29, 15, C_DARKGREEN);
    tft.fillRect(cx - 5, cy - 54, 10, 28, C_DARKGREEN);
    drawFace(cx, cy + 5, 1, sleeping);
  } else if (stage == 2) {
    tft.fillEllipse(cx, cy + 5, 47, 58, C_GREEN);
    tft.fillCircle(cx, cy - 55, 30, C_YELLOW);
    for (int a = 0; a < 360; a += 60) { float r = a * PI / 180.0f; tft.fillCircle(cx + cos(r)*34, cy - 55 + sin(r)*34, 14, C_RED); }
    drawFace(cx, cy + 7, 1, sleeping);
  } else {
    tft.fillRoundRect(cx - 48, cy - 36, 96, 105, 40, C_DARKGREEN);
    tft.fillTriangle(cx - 44, cy - 25, cx - 72, cy - 55, cx - 20, cy - 40, C_GREEN);
    tft.fillTriangle(cx + 44, cy - 25, cx + 72, cy - 55, cx + 20, cy - 40, C_GREEN);
    tft.fillCircle(cx, cy - 48, 28, C_YELLOW);
    drawFace(cx, cy + 3, 1, sleeping);
  }
}

const char* stageName() {
  switch (pet.stage) { case 0: return "Seedling Egg"; case 1: return "Leafling"; case 2: return "Bloomon"; default: return "Garden Guardian"; }
}

void drawBar(int x, int y, int w, int pct, uint16_t colour) {
  tft.drawRoundRect(x, y, w, 10, 4, C_WHITE);
  int inner = map(clampi(pct, 0, 100), 0, 100, 0, w - 4);
  tft.fillRoundRect(x + 2, y + 2, inner, 6, 3, colour);
}

void renderScreen() {
  digitalWrite(PIN_TFT_BL, HIGH);
  tft.fillScreen(C_BG);
  tft.fillRoundRect(8, 8, 224, 36, 12, C_PANEL);
  tft.setTextColor(C_WHITE); tft.setTextSize(2); tft.setCursor(18, 18); tft.print(stageName());
  tft.setTextSize(1); tft.setCursor(182, 21); tft.printf("Lv%u", pet.stage + 1);
  drawCloud(18, 62); tft.fillCircle(205, 67, 17, C_YELLOW); drawCreature(pet.stage, pet.sleeping);
  tft.fillRoundRect(8, 214, 224, 58, 12, C_PANEL);
  tft.setTextSize(1); tft.setTextColor(C_WHITE); tft.setCursor(16, 223); tft.printf("Soil %d%%", lastMoisture);
  drawBar(72, 222, 62, lastMoisture, lastMoisture < 30 ? C_RED : C_GREEN);
  tft.setCursor(145, 223); if (!isnan(lastTemp)) tft.printf("%.1fC", lastTemp); else tft.print("--C");
  tft.setCursor(16, 243); if (!isnan(lastHumidity)) tft.printf("Air %.0f%%", lastHumidity); else tft.print("Air --%");
  tft.setCursor(95, 243); tft.printf("XP %lu", (unsigned long)pet.xp);
  tft.setCursor(163, 243); tft.printf("Day %u", pet.ageDays);
  tft.setCursor(16, 259);
  if (pet.sleeping) tft.print("Sleeping... good night");
  else if (lastMoisture < 30) tft.print("Thirsty! Please water me");
  else if (lastMoisture > 80) tft.print("Too wet - let roots breathe");
  else tft.print("Happy and exploring!");
}

String dashboardHtml() {
  String s = "<!doctype html><meta name='viewport' content='width=device-width'><style>body{font-family:sans-serif;background:#122028;color:#fff;padding:20px}.c{max-width:520px;margin:auto;background:#203036;padding:20px;border-radius:18px}b{color:#75d98a}</style><div class='c'>";
  s += "<h1>" DEVICE_NAME "</h1><h2>" + String(stageName()) + "</h2>";
  s += "<p>Soil: <b>" + String(lastMoisture) + "%</b></p>";
  s += "<p>Temperature: <b>" + String(lastTemp, 1) + " C</b></p>";
  s += "<p>Humidity: <b>" + String(lastHumidity, 0) + "%</b></p>";
  s += "<p>XP: <b>" + String(pet.xp) + "</b> &nbsp; Age: <b>" + String(pet.ageDays) + " days</b></p>";
  return s + "<p>The creature evolves when the plant remains healthy.</p></div>";
}

bool connectWifi() {
  if (strlen(WIFI_SSID) == 0) return false;
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) delay(150);
  return WiFi.status() == WL_CONNECTED;
}

void startShortDashboard() {
  server.on("/", [](){ server.send(200, "text/html", dashboardHtml()); });
  server.on("/json", [](){
    String j = "{\"soil\":" + String(lastMoisture) + ",\"temp\":" + String(lastTemp,1) + ",\"humidity\":" + String(lastHumidity,0) + ",\"xp\":" + String(pet.xp) + ",\"stage\":\"" + String(stageName()) + "\"}";
    server.send(200, "application/json", j);
  });
  server.begin();
}

void goToSleep() {
  digitalWrite(PIN_TFT_BL, LOW);
  tft.writeCommand(ST77XX_SLPIN);
  WiFi.disconnect(true); WiFi.mode(WIFI_OFF);
  esp_sleep_enable_timer_wakeup((uint64_t)SAMPLE_INTERVAL_MINUTES * 60ULL * 1000000ULL);
  esp_sleep_enable_ext0_wakeup((gpio_num_t)PIN_BUTTON, 0);
  delay(50); esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200); bootCount++;
  pinMode(PIN_SOIL_PWR, OUTPUT); digitalWrite(PIN_SOIL_PWR, LOW);
  pinMode(PIN_TFT_BL, OUTPUT); digitalWrite(PIN_TFT_BL, HIGH);
  pinMode(PIN_BUTTON, INPUT_PULLUP); analogReadResolution(12);
  SPI.begin(PIN_TFT_SCK, -1, PIN_TFT_MOSI, PIN_TFT_CS);
  tft.init(TFT_WIDTH, TFT_HEIGHT); tft.setRotation(0); setupColours(); dht.begin(); loadPet();
  lastMoisture = readSoilPercent(); lastHumidity = dht.readHumidity(); lastTemp = dht.readTemperature();
  bool wifi = connectWifi();
  if (wifi) { configTime(19800, 0, "pool.ntp.org", "time.google.com"); startShortDashboard(); Serial.print("Dashboard: http://"); Serial.println(WiFi.localIP()); }
  pet.sleeping = currentNight(); updatePet(lastMoisture, lastTemp, lastHumidity); renderScreen();
  uint32_t until = millis() + SCREEN_ON_SECONDS * 1000UL;
  while ((int32_t)(until - millis()) > 0) { if (wifi) server.handleClient(); delay(5); }
  goToSleep();
}

void loop() {}
