#pragma once

#include <Arduino.h>
#include <WebServer.h>
#include <LittleFS.h>

class WebAppService {
private:
    WebServer* server;

public:
    explicit WebAppService(WebServer& webServer);

    void begin();

    void handleClient();

};
