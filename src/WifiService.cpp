#include "WifiService.h"

WifiService::WifiService(const char* ssid, const char* password) {
    this->ssid = ssid;
    this->password = password;
}

bool WifiService::connect() {

    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);

    Serial.print("Conectando ao Wi-Fi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nConectado!\n");

    Serial.print("IP: ");
    Serial.print(WiFi.localIP().toString());

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