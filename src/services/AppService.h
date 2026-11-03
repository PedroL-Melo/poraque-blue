#pragma once

#include <Arduino.h>
#include <WebServer.h>
#include <LittleFS.h>

class AppService {
private:
    WebServer* server;

public:
    explicit AppService(WebServer& webServer);

    void begin();

    void handleClient();

};
