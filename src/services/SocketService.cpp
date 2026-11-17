#include "services/SocketService.h"

SocketService::SocketService(AsyncWebServer& server)
    : server(&server), ws("/ws") {
}

void SocketService::begin() {
    ws.onEvent(
        [this](
            AsyncWebSocket* server,
            AsyncWebSocketClient* client,
            AwsEventType type,
            void* arg,
            uint8_t* data,
            size_t len
        ) {
            onEvent(server, client, type, arg, data, len);
        }
    );

    server->addHandler(&ws);
    Serial.println("WebSocket inicializado!");
}

void SocketService::onEvent(
    AsyncWebSocket* server,
    AsyncWebSocketClient* client,
    AwsEventType type,
    void* arg,
    uint8_t* data,
    size_t len
) {}

void SocketService::sendData(JsonDocument& data) {
    String json;

    serializeJson(data, json);

    ws.textAll(json);
}