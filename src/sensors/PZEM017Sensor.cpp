#include "sensors/PZEM017Sensor.h"

PZEM017Sensor* PZEM017Sensor::activeInstance = nullptr;

PZEM017Sensor::PZEM017Sensor(
    HardwareSerial& serial,
    uint8_t rxPin,
    uint8_t txPin,
    uint8_t deRePin,
    uint8_t address,
    uint32_t baudRate,
    uint32_t serialConfig
) :
    serial(serial),
    rxPin(rxPin),
    txPin(txPin),
    deRePin(deRePin),
    address(address),
    baudRate(baudRate),
    serialConfig(serialConfig) {

    activeInstance = this;
}

void PZEM017Sensor::begin() {
    pinMode(deRePin, OUTPUT);
    digitalWrite(deRePin, LOW);

    serial.begin(
        baudRate,
        serialConfig,
        rxPin,
        txPin
    );

    modbus.begin(address, serial);
    modbus.preTransmission(preTransmission);
    modbus.postTransmission(postTransmission);
}

void PZEM017Sensor::preTransmission() {
    if (activeInstance == nullptr) {
        return;
    }
    digitalWrite(activeInstance->deRePin, HIGH);
}

void PZEM017Sensor::postTransmission() {
    if (activeInstance == nullptr) {
        return;
    }
    digitalWrite(activeInstance->deRePin, LOW);
}

PZEM017Data PZEM017Sensor::read() {
    PZEM017Data data;

    uint8_t result = modbus.readInputRegisters(0x0000, 8);
    if (result != modbus.ku8MBSuccess) {
        return data;
    }

    uint32_t rawPower = ((uint32_t) modbus.getResponseBuffer(3) << 16) | modbus.getResponseBuffer(2);
    uint32_t rawEnergy =  ((uint32_t) modbus.getResponseBuffer(5) << 16) | modbus.getResponseBuffer(4);

    data.voltage = modbus.getResponseBuffer(0) * 0.01;
    data.current = modbus.getResponseBuffer(1) * 0.01;
    data.power = rawPower * 0.1;
    data.energy = rawEnergy;
    data.valid = true;

    return data;
}
