#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include "WifiConfig.h"
#include "services/WifiService.h"
#include "services/AppService.h"

WifiService wifi(WIFI_SSID, WIFI_PASSWORD);

AsyncWebServer server(80);
AppService webApp(server);

void setup() {

    Serial.begin(115200);
    
    wifi.connect();
    webApp.begin();
    
}

void loop() {

}