#ifndef APPSERVICE_H
#define APPSERVICE_H

#include <WebServer.h>

class AppService {
private:
    WebServer* server;

public:
    explicit AppService(WebServer& server);

    void begin();
    void handleClient();
};

#endif