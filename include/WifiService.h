#pragma once

#include <WiFi.h>

class WifiService {

private:
    const char* ssid;
    const char* password;

public:
    WifiService(const char* ssid, const char* password);

    bool connect();

    void disconnect();

    bool isConnected();

    String getIP();

    int getRSSI();
};