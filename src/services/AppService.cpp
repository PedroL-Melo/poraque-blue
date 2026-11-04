#include <LittleFS.h>
#include "services/AppService.h"

AppService::AppService(uint16_t port) {
    server = new WebServer(port);
}

void AppService::begin() {
    if (!LittleFS.begin(true)) {
        Serial.println("Erro ao inicializar LittleFS!");
        return;
    }
    Serial.println("LittleFS inicializado!");

    server->on("/", HTTP_GET, [this]() {
        server->sendHeader("Location", "/index.html");
        server->send(302, "text/plain", "");
    });
    server->serveStatic("/", LittleFS, "/");

    server->begin();
    Serial.println("\nServidor HTTP iniciado!");
}

void AppService::handleClient() {
    server->handleClient();
}