#include <Arduino.h>
#include <WebServer.h>
#include "WifiConfig.h"
#include "services/WifiService.h"
#include "services/AppService.h"

WifiService wifi(WIFI_SSID, WIFI_PASSWORD);

WebServer server(80);
AppService webApp(server);

void setup() {

    Serial.begin(115200);
    
    wifi.connect();
    webApp.begin();
    
}

void loop() {

    webApp.handleClient();

}