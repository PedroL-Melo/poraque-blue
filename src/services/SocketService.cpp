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
    Serial.println("\nWebSocket inicializado");
}

void SocketService::onEvent(
    AsyncWebSocket* server,
    AsyncWebSocketClient* client,
    AwsEventType type,
    void* arg,
    uint8_t* data,
    size_t len
) {
    if (type == WS_EVT_CONNECT) {
        Serial.println("WEBSOCKET: Cliente conectado!");
        return;
    }

    if (type == WS_EVT_DISCONNECT) {
        Serial.println("WEBSOCKET: Cliente desconectado!");
        return;
    }

    if (type == WS_EVT_DATA) {
        Serial.println("WEBSOCKET: Mensagem recebida!");
        client->text("{\"status\":\"received\"}");
        return;
    }
}