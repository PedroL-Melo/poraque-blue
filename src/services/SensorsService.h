#pragma once

#include <ArduinoJson.h>

class SensorsService {
public:
    SensorsService();

    void begin();
    JsonDocument read();
};