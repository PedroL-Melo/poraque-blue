#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include "MovingAverage.h"

// ============================================================================
// CHAVES DE MODO DE OPERAÇÃO
// ============================================================================
// true  -> Gera senoides de pedalada (12V-18V e 0.5A-2.5A) com ruído branco de ±8%
// false -> Lê os sensores físicos nos pinos do ESP32 (ADC1 / I2C)
#define SIMULATION_MODE true

// Comente a linha abaixo para usar o sensor analógico ACS712 (PIN_I) em vez do INA219 (I2C)
#define USE_INA219

#ifdef USE_INA219
#include <Adafruit_INA219.h>
#endif

// ============================================================================
// CONSTANTES DE AJUSTE RÁPIDO DE HARDWARE NA BANCADA (CHECKPOINT 1)
// ============================================================================

// 1) Mapeamento de Pinos (Apenas ADC1: GPIO 32 a 39 para evitar conflito com Wi-Fi)
constexpr uint8_t PIN_V       = 34; // Pino ADC de leitura de tensão (GPIO 34 / ADC1_CH6)
constexpr uint8_t PIN_I       = 35; // Pino ADC de leitura de corrente ACS712 (GPIO 35 / ADC1_CH7)
constexpr uint8_t PIN_I2C_SDA = 21; // Pino SDA do barramento I2C (INA219)
constexpr uint8_t PIN_I2C_SCL = 22; // Pino SCL do barramento I2C (INA219)

// 2) Divisor de Tensão e Calibração Fina (Entrada até 25V -> Saída máx ~3.205V no ADC)
constexpr float R1      = 68000.0f; // Resistor superior do divisor (68 kOhm)
constexpr float R2      = 10000.0f; // Resistor inferior do divisor (10 kOhm)
float CALIB_V           = 1.000f;   // Fator de calibração fina da tensão (ajuste com multímetro)

// 3) Parâmetros de Corrente e Offset de Zero Configurável
float ACS_OFFSET        = 1650.0f;  // Offset de zero (0A) do ACS712 em mV no pino PIN_I (após divisor)
float ACS_SENSITIVITY   = 66.0f;    // Sensibilidade efetiva do ACS712 em mV/A no pino ADC
float INA219_OFFSET_MA  = 0.0f;     // Offset de zero configurável para o INA219 (em mA)
float CALIB_I           = 1.000f;   // Fator de calibração fina da corrente

// 4) Temporização Não-Bloqueante (millis)
constexpr uint32_t SAMPLE_INTERVAL_MS = 10;  // Amostragem dos sensores e filtro O(1) a cada 10 ms (100 Hz)
constexpr uint32_t SERIAL_INTERVAL_MS = 300; // Impressão no Monitor/Plotter Serial a cada 300 ms

// 5) Parâmetros do Simulador de Pedalada (usados quando SIMULATION_MODE == true)
constexpr float SIM_V_MIN        = 12.0f; // Tensão mínima da pedalada (V)
constexpr float SIM_V_MAX        = 18.0f; // Tensão máxima da pedalada (V)
constexpr float SIM_I_MIN        = 0.5f;  // Corrente mínima da pedalada (A)
constexpr float SIM_I_MAX        = 2.5f;  // Corrente máxima da pedalada (A)
constexpr float SIM_FREQUENCY_HZ = 0.5f;  // Frequência da oscilação da pedalada (0.5 Hz = ciclo de 2s)
constexpr float SIM_NOISE_PCT    = 0.08f; // Ruído branco aleatório de ±8%

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
float lastRawVoltageMv    = 0.0f;

// ============================================================================
// Funções Auxiliares de Simulação, Aquisição Bruta e Conversão Física
// ============================================================================

/**
 * Retorna um fator multiplicativo com ruído branco uniforme em [1 - SIM_NOISE_PCT, 1 + SIM_NOISE_PCT] (±8%).
 */
float applyWhiteNoise(float cleanValue) {
    // Sorteia inteiro entre -8000 e +8000 -> divide por 100000.0f -> [-0.08, +0.08]
    const int32_t maxRand = static_cast<int32_t>(SIM_NOISE_PCT * 100000.0f);
    const float noiseRatio = static_cast<float>(random(-maxRand, maxRand + 1)) / 100000.0f;
    return cleanValue * (1.0f + noiseRatio);
}

/**
 * Lê a tensão bruta no pino PIN_V (GPIO 34) em milivolts:
 * - Se SIMULATION_MODE for true: gera senoide entre 12V e 18V + ±8% de ruído branco,
 *   convertida para mV equivalentes na entrada do ADC.
 * - Se SIMULATION_MODE for false: lê o ADC físico via analogReadMilliVolts(PIN_V).
 */
float readRawVoltageMv() {
#if SIMULATION_MODE
    const float timeSec   = static_cast<float>(millis()) / 1000.0f;
    const float vMid      = 0.5f * (SIM_V_MIN + SIM_V_MAX); // 15.0 V
    const float vAmp      = 0.5f * (SIM_V_MAX - SIM_V_MIN); // 3.0 V
    const float cleanV    = vMid + vAmp * sinf(2.0f * PI * SIM_FREQUENCY_HZ * timeSec);
    const float noisyV    = applyWhiteNoise(cleanV);

    const float dividerRatio = (R1 + R2) / R2;
    return (noisyV / (dividerRatio * CALIB_V)) * 1000.0f;
#else
    return static_cast<float>(analogReadMilliVolts(PIN_V));
#endif
}

/**
 * Lê o sinal bruto de corrente:
 * - Se SIMULATION_MODE for true: gera senoide entre 0.5A e 2.5A + ±8% de ruído branco,
 *   convertida para a unidade bruta esperada pelo modo selecionado (mA para INA219 ou mV para ACS712).
 * - Se SIMULATION_MODE for false: lê o barramento I2C (INA219) ou o pino analógico PIN_I (ACS712).
 */
float readRawCurrentSignal() {
#if SIMULATION_MODE
    const float timeSec   = static_cast<float>(millis()) / 1000.0f;
    const float iMid      = 0.5f * (SIM_I_MIN + SIM_I_MAX); // 1.5 A
    const float iAmp      = 0.5f * (SIM_I_MAX - SIM_I_MIN); // 1.0 A
    const float cleanA    = iMid + iAmp * sinf(2.0f * PI * SIM_FREQUENCY_HZ * timeSec);
    const float noisyA    = applyWhiteNoise(cleanA);

    #ifdef USE_INA219
    return ((noisyA / CALIB_I) * 1000.0f) + INA219_OFFSET_MA;
    #else
    return ((noisyA / CALIB_I) * ACS_SENSITIVITY) + ACS_OFFSET;
    #endif
#else
    #ifdef USE_INA219
    if (!ina219Ready) {
        return 0.0f;
    }
    return ina219.getCurrent_mA();
    #else
    return static_cast<float>(analogReadMilliVolts(PIN_I));
    #endif
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
 *    descontando o offset de zero configurável (INA219_OFFSET_MA ou ACS_OFFSET).
 */
float convertFilteredCurrentToAmps(float filteredRawCurrent) {
#ifdef USE_INA219
    const float correctedMa = filteredRawCurrent - INA219_OFFSET_MA;
    return (correctedMa / 1000.0f) * CALIB_I;
#else
    const float deltaMv = filteredRawCurrent - ACS_OFFSET;
    return (deltaMv / ACS_SENSITIVITY) * CALIB_I;
#endif
}

/**
 * Imprime o cabeçalho inicial de validação de bancada (Checkpoint 1).
 */
void printSerialHeader() {
    Serial.println("==========================================================================");
#if SIMULATION_MODE
    Serial.println("  CHECKPOINT 1 - TELEMETRIA ESP32 [MODO SIMULACAO: 12-18V | 0.5-2.5A | +-8% Ruido]");
#else
    Serial.println("  CHECKPOINT 1 - TELEMETRIA ESP32 [MODO HARDWARE FISICO | 115200 baud | 300 ms]");
#endif
    Serial.println("  Leitura Bruta (mV) | Tensao Filtrada (V) | Corrente Filtrada (A) | Potencia Instantanea (W)");
    Serial.println("==========================================================================");
}

/**
 * Imprime os dados de telemetria formatados com 2 casas decimais no formato
 * "Label:Valor" separado por tabulação (\t), legível no Monitor Serial e
 * diretamente compatível com o Serial Plotter do Arduino/PlatformIO.
 */
void printSerialTelemetry(float rawVoltageMv, float voltageV, float currentA, float powerW) {
    Serial.printf(
        "Bruta_mV:%.2f\tTensao_V:%.2f\tCorrente_A:%.2f\tPotencia_W:%.2f\n",
        rawVoltageMv,
        voltageV,
        currentA,
        powerW
    );
}

// ============================================================================
// Setup e Loop Principal
// ============================================================================

void setup() {
    Serial.begin(115200);

#if SIMULATION_MODE
    randomSeed(micros());
    Serial.println("[SIMULACAO] Gerador de pedalada ativo (Tensao: 12V-18V, Corrente: 0.5A-2.5A, Ruido: +-8%).");
#else
    // Configuração do ADC1 físico: 12 bits (0-4095) e atenuação de 11 dB (~0 a 3100 mV linear)
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    analogSetPinAttenuation(PIN_V, ADC_11db);
    pinMode(PIN_V, INPUT);

    #ifdef USE_INA219
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    ina219Ready = ina219.begin();
    if (!ina219Ready) {
        Serial.println("[ERRO] Sensor INA219 nao encontrado no barramento I2C (SDA=21, SCL=22)!");
    } else {
        Serial.println("[INFO] Sensor de corrente INA219 inicializado via I2C (SDA=21, SCL=22).");
    }
    #else
    analogSetPinAttenuation(PIN_I, ADC_11db);
    pinMode(PIN_I, INPUT);
    Serial.println("[INFO] Sensor de corrente ACS712 configurado no GPIO 35 (ADC1).");
    #endif
#endif

    printSerialHeader();
}

void loop() {
    const uint32_t now = millis();

    // 1. Tarefa rápida (10 ms): Amostragem bruta (física ou simulada) e atualização O(1) do filtro
    if (now - lastSampleTimeMs >= SAMPLE_INTERVAL_MS) {
        lastSampleTimeMs = now;

        lastRawVoltageMv = readRawVoltageMv();
        voltageFilter.update(lastRawVoltageMv);
        currentFilter.update(readRawCurrentSignal());
    }

    // 2. Tarefa de telemetria (300 ms): Conversão física e impressão Serial / Serial Plotter
    if (now - lastSerialTimeMs >= SERIAL_INTERVAL_MS) {
        lastSerialTimeMs = now;

        const float filteredVoltageMv  = voltageFilter.getAverage();
        const float filteredCurrentRaw = currentFilter.getAverage();

        const float voltageV = convertFilteredVoltageToVolts(filteredVoltageMv);
        const float currentA = convertFilteredCurrentToAmps(filteredCurrentRaw);
        const float powerW   = voltageV * currentA;

        printSerialTelemetry(lastRawVoltageMv, voltageV, currentA, powerW);
    }
}
