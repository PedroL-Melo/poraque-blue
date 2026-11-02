#pragma once

#include <Arduino.h>
#include <WebServer.h>
#include <LittleFS.h>

class WebAppService {
private:
    WebServer* server;

    String getContentType(const String& filename);

    void handleFile(const String& filepath);

public:
    explicit WebAppService(WebServer& webServer);

    void begin();

    void registerRoutes(
        const String& route,
        const String& type,
        const String& filepath
    );
};
