#include <LittleFS.h>
#include "services/AppService.h"

AppService::AppService(AsyncWebServer& server) {
    this->server = &server;
}

void AppService::begin() {
    if (!LittleFS.begin(true)) {
        Serial.println("Erro ao inicializar LittleFS!");
        return;
    }

    Serial.println("LittleFS inicializado!");

    server->onNotFound([](AsyncWebServerRequest *request) {
        request->redirect("/app/index.html");
    });

    server->serveStatic("/app/", LittleFS, "/");

    server->begin();
    Serial.println("\nServidor HTTP iniciado!");
}