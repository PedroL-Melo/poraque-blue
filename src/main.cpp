#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include "WifiConfig.h"
#include "services/WifiService.h"
#include "services/AppService.h"
#include "services/SocketService.h"
#include "services/SensorsService.h"

WifiService wifi(WIFI_SSID, WIFI_PASSWORD);

AsyncWebServer server(80);
AppService webApp(server);
SocketService webSocket(server);

SensorsService sensorsManager;

void setup() {
    Serial.begin(115200);
    
    wifi.connect();
    
    webApp.begin();
    webSocket.begin();

    sensorsManager.begin();

    Serial.println();
}

void loop() {
    JsonDocument data = sensorsManager.read();
    
    webSocket.sendData(data);
}