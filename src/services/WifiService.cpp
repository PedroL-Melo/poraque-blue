#include "services/WifiService.h"

WifiService::WifiService(
    const char* ssid,
    const char* password,
    IPAddress localIP,
    IPAddress gateway,
    IPAddress subnet
) {
    this->ssid = ssid;
    this->password = password;

    this->localIP = localIP;
    this->gateway = gateway;
    this->subnet = subnet;
}

bool WifiService::connect() {

    WiFi.mode(WIFI_AP);

    if (!WiFi.softAPConfig(localIP, gateway, subnet)) {
        Serial.println("Erro ao configurar IP da rede!");
        return false;
    }

    if (!WiFi.softAP(ssid, password)) {
        Serial.println("Erro ao iniciar Access Point!");
        return false;
    }

    Serial.println("\nPonto de acesso iniciado!\n");

    Serial.print("REDE: ");
    Serial.println(ssid);
    Serial.print("IP: ");
    Serial.println(getIP());
    Serial.println();

    Serial.printf("Link do Site: http://%s/app/\n", getIP().c_str());
    Serial.printf("Link da API: http://%s/api/\n", getIP().c_str());

    return true;
}

void WifiService::disconnect() {
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_OFF);
}

bool WifiService::isConnected() {
    return WiFi.getMode() == WIFI_AP &&
           WiFi.softAPgetStationNum() > 0;
}

String WifiService::getIP() {
    return WiFi.softAPIP().toString();
}

int WifiService::getClientsCount() {
    return WiFi.softAPgetStationNum();
}