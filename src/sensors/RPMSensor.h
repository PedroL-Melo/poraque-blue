#pragma once

#include "ISensor.h"

class RPMSensor : public ISensor<float> {
private:
    int pin;
    float circumference;
    
    float rpm;
    unsigned long lastBlackReadTime;
    bool lastState;

public:
    explicit RPMSensor(int pin, float circumference);

    void begin() override;
    float read() override;
};