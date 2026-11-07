#pragma once

#include <ESPAsyncWebServer.h>

class AppService {
private:
    AsyncWebServer* server;

public:
    explicit AppService(AsyncWebServer& server);

    void begin();
};