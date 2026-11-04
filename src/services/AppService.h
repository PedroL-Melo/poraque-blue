#pragma once

#include <Arduino.h>
#include <WebServer.h>
#include <LittleFS.h>

class AppService {
private:
    WebServer* server;

public:
    explicit AppService(uint16_t port);

    void begin();

    void handleClient();

};
