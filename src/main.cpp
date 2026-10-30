#include <Arduino.h>
#include <Wire.h>
#include "MovingAverage.h"

// Comente a linha abaixo para utilizar o sensor analógico ACS712 no GPIO 35
#define USE_INA219

#ifdef USE_INA219
#include <Adafruit_INA219.h>
#endif

// ============================================================================
// Mapeamento de Pinos (Apenas ADC1: GPIO 32 a 39 para evitar conflito com Wi-Fi)
// ============================================================================
constexpr uint8_t PIN_VOLTAGE_ADC = 34; // Entrada de tensão (ADC1_CH6)
constexpr uint8_t PIN_ACS712_ADC  = 35; // Entrada de corrente ACS712 (ADC1_CH7)
constexpr uint8_t PIN_I2C_SDA     = 21; // I2C SDA para INA219
constexpr uint8_t PIN_I2C_SCL     = 22; // I2C SCL para INA219

// ============================================================================
// Parâmetros de Temporização Não-Bloqueante (millis)
// ============================================================================
constexpr uint32_t SAMPLE_INTERVAL_MS = 10;  // Taxa rápida de amostragem (100 Hz)
constexpr uint32_t SERIAL_INTERVAL_MS = 500; // Taxa lenta de telemetria Serial (2 Hz)

// ============================================================================
// Parâmetros de Calibração Elétrica
// ============================================================================
// Fator do divisor resistivo da tensão no GPIO 34: V_real = V_adc * ((R1 + R2) / R2)
// Ajuste conforme os resistores reais utilizados no circuito (1.0f = leitura direta no pino)
constexpr float VOLTAGE_DIVIDER_RATIO = 11.0f; // Exemplo: R1 = 100k, R2 = 10k -> (100+10)/10 = 11.0

// Parâmetros para o ACS712 (quando USE_INA219 não estiver definido)
// Ponto quiescente (0A) em mV no pino do ESP32 (ex: 1650 mV após divisor 5V->3.3V, ou 2500 mV direto)
constexpr float ACS712_ZERO_MV        = 1650.0f;
// Sensibilidade efetiva em mV/A no pino do ADC (ex: ACS712-20A = 100 mV/A * (3.3/5.0) = 66.0 mV/A)
constexpr float ACS712_MV_PER_AMP     = 66.0f;

// ============================================================================
// Instâncias do Filtro de Média Móvel O(1) (padrão: 30 amostras = 300 ms a 100 Hz)
// ============================================================================
MovingAverage<> voltageFilter;
MovingAverage<> currentFilter;

#ifdef USE_INA219
Adafruit_INA219 ina219;
bool ina219Ready = false;
#endif

uint32_t lastSampleTimeMs = 0;
uint32_t lastSerialTimeMs = 0;

// ============================================================================
// Funções Auxiliares de Leitura Modular
// ============================================================================

/**
 * Lê a tensão no GPIO 34 usando analogReadMilliVolts (calibrado de fábrica no eFuse)
 * e converte para Volts considerando o divisor resistivo.
 */
float readVoltageVolts() {
    uint32_t mv = analogReadMilliVolts(PIN_VOLTAGE_ADC);
    return (static_cast<float>(mv) / 1000.0f) * VOLTAGE_DIVIDER_RATIO;
}

/**
 * Lê a corrente em Amperes de forma modular:
 * - Via barramento I2C (INA219 nos pinos 21 e 22) se USE_INA219 estiver ativo
 * - Via porta analógica (ACS712 no GPIO 35) caso contrário
 */
float readCurrentAmps() {
#ifdef USE_INA219
    if (!ina219Ready) {
        return 0.0f;
    }
    return ina219.getCurrent_mA() / 1000.0f;
#else
    uint32_t mv = analogReadMilliVolts(PIN_ACS712_ADC);
    return (static_cast<float>(mv) - ACS712_ZERO_MV) / ACS712_MV_PER_AMP;
#endif
}

// ============================================================================
// Setup e Loop Principal
// ============================================================================

void setup() {
    Serial.begin(115200);

    // Configuração do ADC1: 12 bits (0-4095) e atenuação de 11 dB (~0 a 3100 mV linear)
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    analogSetPinAttenuation(PIN_VOLTAGE_ADC, ADC_11db);
    pinMode(PIN_VOLTAGE_ADC, INPUT);

#ifdef USE_INA219
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    ina219Ready = ina219.begin();
    if (!ina219Ready) {
        Serial.println("[ERRO] Sensor INA219 nao encontrado no barramento I2C (SDA=21, SCL=22)!");
    } else {
        Serial.println("[INFO] Sensor de corrente INA219 inicializado via I2C (SDA=21, SCL=22).");
    }
#else
    analogSetPinAttenuation(PIN_ACS712_ADC, ADC_11db);
    pinMode(PIN_ACS712_ADC, INPUT);
    Serial.println("[INFO] Sensor de corrente ACS712 configurado no GPIO 35 (ADC1).");
#endif
}

void loop() {
    const uint32_t now = millis();

    // 1. Tarefa rápida: Amostragem dos sensores e atualização O(1) do filtro circular
    if (now - lastSampleTimeMs >= SAMPLE_INTERVAL_MS) {
        lastSampleTimeMs = now;

        voltageFilter.update(readVoltageVolts());
        currentFilter.update(readCurrentAmps());
    }

    // 2. Tarefa lenta: Impressão da telemetria no monitor Serial
    if (now - lastSerialTimeMs >= SERIAL_INTERVAL_MS) {
        lastSerialTimeMs = now;

        const float voltageV = voltageFilter.getAverage();
        const float currentA = currentFilter.getAverage();
        const float powerW   = voltageV * currentA;

#ifdef USE_INA219
        const char* currentSensorName = "INA219 (I2C)";
#else
        const char* currentSensorName = "ACS712 (GPIO 35)";
#endif

        Serial.printf(
            "[TELEMETRIA] Sensor: %s | Tensao: %.2f V | Corrente: %.3f A | Potencia: %.2f W\n",
            currentSensorName,
            voltageV,
            currentA,
            powerW
        );
    }
}

