#include "services/SensorsService.h"
#include "config.h"

SensorsService::SensorsService()
    : pzem(
        Serial2,
        PIN_PZEM_RX,
        PIN_PZEM_TX,
        PIN_PZEM_DE_RE,
        PZEM_ADDRESS,
        PZEM_BAUD_RATE
    ),
    rpm(
        PIN_RPMSENSOR,
        WHEEL_CIRCUMFERENCE_CM
    ) {}

void SensorsService::begin() {
    pzem.begin();
    rpm.begin();
}

JsonDocument SensorsService::read() {
    JsonDocument json;

    PZEM017Data batteryData = pzem.read();
    JsonObject battery = json["battery"].to<JsonObject>();
    battery["voltage"] = batteryData.voltage;
    battery["current"] = batteryData.current;
    battery["power"] = batteryData.power;
    battery["energy"] = batteryData.energy;
    battery["valid"] = batteryData.valid;

    json["rpm"] = rpm.read();

    return json;
}