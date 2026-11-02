#include "WifiService.h"

WifiService::WifiService(const char* ssid, const char* password) {
    this->ssid = ssid;
    this->password = password;
}

bool WifiService::connect() {

    WiFi.mode(WIFI_STA);

    WiFi.begin(ssid, password);

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    Serial.println("Conectado!");

    return true;
    
}

void WifiService::disconnect() {
    WiFi.disconnect();
}

bool WifiService::isConnected() {
    return WiFi.status() == WL_CONNECTED;
}

String WifiService::getIP() {
    return WiFi.localIP().toString();
}

int WifiService::getRSSI() {
    return WiFi.RSSI();
}