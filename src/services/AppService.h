#pragma once

#include <WebServer.h>

class AppService {
private:
    WebServer* server;

public:
    explicit AppService(WebServer& server);

    void begin();
    void handleClient();
};