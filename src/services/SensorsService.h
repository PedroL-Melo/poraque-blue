#pragma once

#include <ArduinoJson.h>
#include "sensors/PZEM017Sensor.h"

class SensorsService {
private:
    PZEM017Sensor pzem;

public:
    SensorsService();

    void begin();
    JsonDocument read();
};