#pragma once

#include <WiFi.h>

class WifiService {

private:
    const char* ssid;
    const char* password;

    IPAddress localIP;
    IPAddress gateway;
    IPAddress subnet;

public:
    WifiService(
        const char* ssid,
        const char* password,
        IPAddress localIP = IPAddress(192, 168, 4, 1),
        IPAddress gateway = IPAddress(192, 168, 4, 1),
        IPAddress subnet = IPAddress(255, 255, 255, 0)
    );

    bool connect();
    void disconnect();

    bool isConnected();

    String getIP();
    int getClientsCount();
    
};