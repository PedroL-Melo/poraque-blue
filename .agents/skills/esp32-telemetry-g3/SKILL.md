---
name: esp32-telemetry-g3
description: Regras de instrumentação elétrica, calibração de ADC, I2C e filtro de média móvel no ESP32 para a bicicleta geradora.
---
# Instruções para ESP32 Telemetry (Grupo 3)
1. **Pinos ADC:** Utilize apenas pinos do ADC1 (GPIO 32 a 39) para evitar conflito com o Wi-Fi.
2. **Leitura Analógica:** Prefira `analogReadMilliVolts(pin)` com `analogSetAttenuation(ADC_11db)` e `analogReadResolution(12)` para corrigir a não-linearidade do ADC do ESP32.
3. **Filtro Digital:** Implemente buffers circulares com soma acumulada O(1) (`soma = soma - buffer[i] + nova_leitura`) em vez de percorrer o array inteiro com laço `for` a cada amostra.
4. **Temporização Não-Bloqueante:** Nunca use `delay()` longo no `loop()`. Use `millis()` com duas taxas: amostragem rápida dos sensores (ex: 5ms a 10ms) e impressão lenta no Serial (ex: 250ms a 500ms). 