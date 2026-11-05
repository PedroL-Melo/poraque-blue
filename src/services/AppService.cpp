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

    server->onNotFound([this]() {
        server->sendHeader("Location", "/app/index.html");
        server->send(302, "text/plain", "");
    }); 
    server->serveStatic("/app/", LittleFS, "/");

    server->begin();
    Serial.println("\nServidor HTTP iniciado!");
}

void AppService::handleClient() {
    server->handleClient();
}