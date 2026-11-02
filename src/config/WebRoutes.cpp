#include "WebRoutes.h"

void WebRoutes::registerRoutes(WebAppService& webApp) {

    webApp.registerRoutes(
        "/", 
        "STATIC", 
        "/index.html"
    );

    webApp.registerRoutes(
        "/style.css",
        "STATIC",
        "/style.css"
    );

    webApp.registerRoutes(
        "/app.js",
        "STATIC",
        "/app.js"
    );
    
}
