#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include "config.h"
#include "services/WifiService.h"
#include "services/AppService.h"
#include "services/SocketService.h"
#include "services/SensorsService.h"

WifiService wifi(WIFI_SSID, WIFI_PASSWORD);

AsyncWebServer server(80);
AppService webApp(server);
SocketService webSocket(server);

SensorsService sensorsManager;

unsigned long lastBroadcastTime = 0;
const unsigned long BROADCAST_INTERVAL_MS = 300;

void setup() {
    Serial.begin(115200);
    
    wifi.connect();
    
    webApp.begin();
    webSocket.begin();

    sensorsManager.begin();

    Serial.println();
}

void loop() {
    unsigned long now = millis();
    if (now - lastBroadcastTime >= BROADCAST_INTERVAL_MS) {
        lastBroadcastTime = now;
        JsonDocument data = sensorsManager.read();
        webSocket.sendData(data);
    }
}
