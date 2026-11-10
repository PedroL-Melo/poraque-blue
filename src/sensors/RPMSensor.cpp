#include <Arduino.h>
#include "sensors/RPMSensor.h"

RPMSensor::RPMSensor(int pin, float circumference) {
    this->pin = pin;
    this->circumference = circumference;
}

void RPMSensor::begin() {
    pinMode(pin, INPUT);

    rpm = 0;
    lastBlackReadTime = millis();
    lastState = false;
}

float RPMSensor::read() {
    bool currentState = digitalRead(pin);

    if (currentState && !lastState) {
        unsigned long currentTime = millis();
        unsigned long deltaTime = currentTime - lastBlackReadTime;

        if (deltaTime > 0) {
            rpm = (circumference * 36.0f) / deltaTime;
        }
        lastBlackReadTime = currentTime;
    }
    lastState = currentState;

    return rpm;
}