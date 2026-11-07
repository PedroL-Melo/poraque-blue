#include <Arduino.h>
#include "services/SensorsService.h"

SensorsService::SensorsService() {
}

void SensorsService::begin() {
    //...
    
    Serial.println("\nSensores inicializados");
}

JsonDocument SensorsService::read() {
    JsonDocument json;

    // ...

    return json;
}