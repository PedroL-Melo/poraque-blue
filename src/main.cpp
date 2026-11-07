#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include "WifiConfig.h"
#include "services/WifiService.h"
#include "services/AppService.h"
#include "services/SocketService.h"

WifiService wifi(WIFI_SSID, WIFI_PASSWORD);

AsyncWebServer server(80);
AppService webApp(server);
SocketService webSocket(server);

void setup() {
    Serial.begin(115200);
    
    wifi.connect();
    
    webApp.begin();
    webSocket.begin();

    Serial.println();
}

void loop() {
    JsonDocument json;
    json["message"] = "Hello World!";
    
    webSocket.sendData(json);

    delay(5000);
}