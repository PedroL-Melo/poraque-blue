#pragma once

#include <ArduinoJson.h>
#include "sensors/PZEM017Sensor.h"
#include "sensors/RPMSensor.h"

class SensorsService {
private:
    PZEM017Sensor pzem;
    RPMSensor rpm;

public:
    SensorsService();

    void begin();
    JsonDocument read();
};