#pragma once

#include <ESPAsyncWebServer.h>

class SocketService {
private:
    AsyncWebServer* server;
    AsyncWebSocket ws;

    void onEvent(
        AsyncWebSocket* server,
        AsyncWebSocketClient* client,
        AwsEventType type,
        void* arg,
        uint8_t* data,
        size_t len
    );

public:
    explicit SocketService(AsyncWebServer& server);

    void begin();
    void sendData(String data);
};