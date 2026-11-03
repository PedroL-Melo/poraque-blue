#include "services/WebAppService.h"

WebAppService::WebAppService(WebServer& webServer) {
    server = &webServer;
}


void WebAppService::begin() {

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
    Serial.println("Servidor HTTP iniciado!");  

}

void WebAppService::handleClient() {

    server->handleClient();

}