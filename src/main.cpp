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
// Parâmetros de Conversão Física e Calibração Elétrica
// ============================================================================
// 1) Divisor de tensão no GPIO 34 (suporta até 25V na entrada -> ~3.205V no ADC)
constexpr float R1 = 68000.0f; // Resistor superior (68 kOhm)
constexpr float R2 = 10000.0f; // Resistor inferior (10 kOhm)
float CALIB_V      = 1.000f;   // Fator de calibração fina da tensão (ajuste empírico com multímetro)

// 2) Conversão de corrente e Offset de Zero configurável
float CALIB_I      = 1.000f;   // Fator de calibração fina da corrente
#ifdef USE_INA219
// Offset de zero configurável para o INA219 (em mA) para compensar deriva residual sem carga
float CURRENT_ZERO_OFFSET = 0.0f;
#else
// Offset de zero configurável para o ACS712 no GPIO 35 (em mV no pino do ADC com I = 0A)
float CURRENT_ZERO_OFFSET = 1650.0f;
// Sensibilidade efetiva em mV/A no pino do ADC (ex: ACS712-20A = 100 mV/A * (3.3/5.0) = 66.0 mV/A)
constexpr float ACS712_MV_PER_AMP = 66.0f;
#endif

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
// Funções de Aquisição Bruta e Conversão Física das Leituras Filtradas
// ============================================================================

/**
 * Lê a tensão bruta no pino do ADC (GPIO 34) em milivolts (calibrado via eFuse).
 */
float readRawVoltageMv() {
    return static_cast<float>(analogReadMilliVolts(PIN_VOLTAGE_ADC));
}

/**
 * Lê o sinal bruto de corrente:
 * - Em mA via I2C (INA219) se USE_INA219 estiver ativo
 * - Em mV via ADC (ACS712 no GPIO 35) caso contrário
 */
float readRawCurrentSignal() {
#ifdef USE_INA219
    if (!ina219Ready) {
        return 0.0f;
    }
    return ina219.getCurrent_mA();
#else
    return static_cast<float>(analogReadMilliVolts(PIN_ACS712_ADC));
#endif
}

/**
 * 1) Converte a leitura filtrada de tensão (em mV no pino ADC) para Volts (V) reais
 *    aplicando a equação do divisor resistivo (R1 = 68k, R2 = 10k) e o fator CALIB_V.
 */
float convertFilteredVoltageToVolts(float filteredPinMv) {
    const float pinVolts     = filteredPinMv / 1000.0f;
    const float dividerRatio = (R1 + R2) / R2;
    return pinVolts * dividerRatio * CALIB_V;
}

/**
 * 2) Converte a leitura filtrada de corrente para Amperes (A) reais
 *    descontando o offset de zero configurável (CURRENT_ZERO_OFFSET).
 */
float convertFilteredCurrentToAmps(float filteredRawCurrent) {
#ifdef USE_INA219
    const float correctedMa = filteredRawCurrent - CURRENT_ZERO_OFFSET;
    return (correctedMa / 1000.0f) * CALIB_I;
#else
    const float deltaMv = filteredRawCurrent - CURRENT_ZERO_OFFSET;
    return (deltaMv / ACS712_MV_PER_AMP) * CALIB_I;
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

    // 1. Tarefa rápida: Amostragem bruta dos sensores e atualização O(1) do filtro circular
    if (now - lastSampleTimeMs >= SAMPLE_INTERVAL_MS) {
        lastSampleTimeMs = now;

        voltageFilter.update(readRawVoltageMv());
        currentFilter.update(readRawCurrentSignal());
    }

    // 2. Tarefa lenta: Conversão física das leituras filtradas e telemetria Serial
    if (now - lastSerialTimeMs >= SERIAL_INTERVAL_MS) {
        lastSerialTimeMs = now;

        const float filteredVoltageMv  = voltageFilter.getAverage();
        const float filteredCurrentRaw = currentFilter.getAverage();

        const float voltageV = convertFilteredVoltageToVolts(filteredVoltageMv);
        const float currentA = convertFilteredCurrentToAmps(filteredCurrentRaw);
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

