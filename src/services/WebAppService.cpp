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
}

String WebAppService::getContentType(const String& filename) {

    if (filename.endsWith(".html")) {
        return "text/html";
    }

    if (filename.endsWith(".css")) {
        return "text/css";
    }

    if (filename.endsWith(".js")) {
        return "application/javascript";
    }

    return "text/plain";
}

void WebAppService::handleFile(const String& filepath) {

    if (!LittleFS.exists(filepath)) {
        server->send(404, "text/plain", "Arquivo não encontrado");
        return;
    }

    File file = LittleFS.open(filepath, "r");

    if (!file) {
        server->send(500, "text/plain", "Erro ao abrir arquivo");
        return;
    }

    String contentType = getContentType(filepath);

    server->streamFile(file, contentType);

    file.close();

}

void WebAppService::registerRoutes(
    const String& route,
    const String& type,
    const String& filepath
) {

    if (type == "STATIC") {

        server->on(route.c_str(), HTTP_GET, [this, filepath]() {
            handleFile(filepath);
        });

    } else {
        Serial.println("Tipo de rota desconhecido: " + type);
    }
}
