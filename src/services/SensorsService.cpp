#include "services/SensorsService.h"
#include "config.h"

SensorsService::SensorsService() : pzem(
    Serial2,
    PIN_PZEM_RX,
    PIN_PZEM_TX,
    PIN_PZEM_DE_RE,
    PZEM_ADDRESS,
    PZEM_BAUD_RATE
) {}

void SensorsService::begin() {
    pzem.begin();
}

JsonDocument SensorsService::read() {
    JsonDocument json;

    PZEM017Data data = pzem.read();
    JsonObject battery = json["battery"].to<JsonObject>();
    battery["voltage"] = data.voltage;
    battery["current"] = data.current;
    battery["power"] = data.power;
    battery["energy"] = data.energy;
    battery["valid"] = data.valid;

    return json;
}