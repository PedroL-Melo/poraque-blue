#pragma once

#include <Arduino.h>
#include "ISensor.h"
#include <ModbusMaster.h>

struct PZEM017Data {
    float voltage = 0.0;
    float current = 0.0;
    float power = 0.0;
    uint32_t energy = 0;

    bool valid = false;
};

class PZEM017Sensor : public ISensor<PZEM017Data> {
private:
    HardwareSerial& serial;
    ModbusMaster modbus;

    uint8_t rxPin;
    uint8_t txPin;
    uint8_t deRePin;
    uint8_t address;

    uint32_t baudRate;
    uint32_t serialConfig;

    static PZEM017Sensor* activeInstance;

    static void preTransmission();
    static void postTransmission();

public:
    PZEM017Sensor(
        HardwareSerial& serial,
        uint8_t rxPin,
        uint8_t txPin,
        uint8_t deRePin,
        uint8_t address = 1,
        uint32_t baudRate = 9600,
        uint32_t serialConfig = SERIAL_8N2
    );

    void begin() override;
    PZEM017Data read() override;
};
