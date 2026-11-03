/**
 * ============================================================================
 * PURAQUÊ BLUE TWIN - TelemetryService & Physics Engine
 * Motor de Simulação de Física Eletromecânica & Cliente WebSocket
 * ============================================================================
 */

export class TelemetryService {
  constructor() {
    this.isSimulating = true;
    this.wsUrl = 'ws://192.168.4.1:81';
    this.socket = null;
    this.connectionState = 'simulated'; // 'connected' | 'connecting' | 'disconnected' | 'simulated'
    this.listeners = [];

    // Estado dos Atuadores (Banco de Cargas)
    this.loads = {
      load_1_relay_25: false,
      load_2_mosfet_26: false,
      load_3_mosfet_32: false
    };

    // Parâmetros Físicos da Simulação
    this.targetRpm = 75; // Cadência configurável pelo usuário
    this.currentRpm = 75;
    this.pulsesPerRevolution = 5; // N de ímãs / fendas no sensor Hall (G1)
    this.timeSec = 0;

    // Acumuladores de Energia (Persistem mesmo em reconexões)
    this.joulesTotal = 0;
    this.wattHours = 0;
    this.caloriesKcal = 0;

    // Temporização do ciclo de telemetria (300 ms conforme especificação)
    this.intervalMs = 300;
    this.timerId = null;

    // Último pacote gerado/recebido
    this.latestPacket = null;

    this.startSimulationLoop();
  }

  // Ouvinte de telemetria
  onUpdate(callback) {
    this.listeners.push(callback);
  }

  notify(packet) {
    this.latestPacket = packet;
    this.listeners.forEach((fn) => fn(packet));
  }

  setCadence(rpm) {
    this.targetRpm = Math.max(0, Math.min(160, rpm));
  }

  getCadence() {
    return this.targetRpm;
  }

  toggleLoad(loadKey) {
    if (this.loads.hasOwnProperty(loadKey)) {
      this.loads[loadKey] = !this.loads[loadKey];

      // Se estiver conectado via WebSocket, envia comando ao hardware ESP32
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          const cmd = {
            command: 'set_loads',
            loads: this.loads,
            timestamp: Date.now()
          };
          this.socket.send(JSON.stringify(cmd));
        } catch (e) {
          console.error('[TelemetryService] Erro ao enviar comando de carga:', e);
        }
      }
    }
    return this.loads;
  }

  setLoadState(loadKey, state) {
    if (this.loads.hasOwnProperty(loadKey)) {
      this.loads[loadKey] = Boolean(state);
    }
  }

  resetEnergyTotals() {
    this.joulesTotal = 0;
    this.wattHours = 0;
    this.caloriesKcal = 0;
  }

  /**
   * Cálculo de conjugado eletromagnético resistente (Lei de Lenz)
   */
  getLenzTorque() {
    let addedWatts = 0;
    if (this.loads.load_1_relay_25) addedWatts += 10;
    if (this.loads.load_2_mosfet_26) addedWatts += 15;
    if (this.loads.load_3_mosfet_32) addedWatts += 25;

    let label = 'Livre (0W adicionais)';
    let level = 0;
    let color = '#00F59B';

    if (addedWatts >= 50) {
      label = 'Freio de Potência (+50W)';
      level = 3;
      color = '#FF3366';
    } else if (addedWatts >= 25) {
      label = 'Pesado (+25W a +40W)';
      level = 2;
      color = '#FF9500';
    } else if (addedWatts > 0) {
      label = 'Médio (+10W a +15W)';
      level = 1;
      color = '#00E5FF';
    }

    return {
      addedWatts,
      label,
      level,
      color,
      percent: Math.min(100, Math.round((addedWatts / 50) * 100))
    };
  }

  /**
   * Gera pacote de simulação com física contínua
   */
  generateSimulatedPacket() {
    const dtSec = this.intervalMs / 1000.0;
    this.timeSec += dtSec;

    // Suaviza RPM em direção ao alvo (inércia do volante da bike)
    const inertia = 0.15;
    this.currentRpm += (this.targetRpm - this.currentRpm) * inertia;

    // Se RPM for muito baixo, desacelera a zero
    if (this.currentRpm < 1.0) {
      this.currentRpm = 0;
    }

    // Ondulação de pedalada: 2 pulsos de potência por revolução do pedal (pernas alternadas)
    const pedalFreq = (this.currentRpm / 60.0);
    const strokeFactor = this.currentRpm > 5
      ? 1.0 + 0.12 * Math.sin(2.0 * Math.PI * (pedalFreq * 2.0) * this.timeSec)
      : 0;

    // Ruído branco gaussiano suave (+/- 3%)
    const whiteNoise = 1.0 + (Math.random() - 0.5) * 0.05;

    // Frequência do Sensor Hall no movimento central: f = (n / dt) = (RPM/60) * N_pulsos
    const frequencyHz = Number(((this.currentRpm / 60.0) * this.pulsesPerRevolution).toFixed(2));

    // Curva de Tensão do Alternador (12V a 18V CC dependendo da rotação)
    let voltageV = 0;
    if (this.currentRpm > 5) {
      // Saturação progressiva de 12.0V até ~17.8V
      const vCurve = 11.8 + Math.min(6.0, (this.currentRpm / 100.0) * 4.5);
      voltageV = Number((vCurve * strokeFactor * whiteNoise).toFixed(2));
    }

    // Resistência Equivalente (1/Req = 1/Rbase + soma 1/Ri)
    const R_base = 28.0; // Consumo base ESP32 + instrumentação ~ 0.45A
    const R_load1 = 14.4; // 12V 10W
    const R_load2 = 9.6;  // 12V 15W
    const R_load3 = 5.76; // 12V 25W

    let invReq = 1.0 / R_base;
    if (this.loads.load_1_relay_25) invReq += 1.0 / R_load1;
    if (this.loads.load_2_mosfet_26) invReq += 1.0 / R_load2;
    if (this.loads.load_3_mosfet_32) invReq += 1.0 / R_load3;

    const rEq = 1.0 / invReq;

    // Corrente Total (I = U / Req)
    let currentA = 0;
    if (voltageV > 0) {
      currentA = Number(((voltageV / rEq) * whiteNoise).toFixed(2));
    }

    // Potência Instantânea P = U * I [W]
    const powerW = Number((voltageV * currentA).toFixed(2));

    // Integração Numérica de Trabalho / Energia
    if (powerW > 0) {
      const deltaJoules = powerW * dtSec;
      this.joulesTotal += deltaJoules;
      this.wattHours = this.joulesTotal / 3600.0;
      this.caloriesKcal = this.joulesTotal / 4184.0;
    }

    // Monta o pacote de acordo com a Seção 6 da Especificação
    const packet = {
      timestamp: Date.now(),
      rpm: Math.round(this.currentRpm),
      frequency_hz: frequencyHz,
      voltage_v: voltageV,
      current_a: currentA,
      power_w: powerW,
      joules_total: Number(this.joulesTotal.toFixed(1)),
      watt_hours: Number(this.wattHours.toFixed(3)),
      calories_kcal: Number(this.caloriesKcal.toFixed(2)),
      loads: { ...this.loads },
      status: {
        simulation: this.connectionState === 'simulated',
        wifi_rssi: -55 - Math.floor(Math.random() * 8),
        buck_5v_ok: voltageV >= 6.5
      }
    };

    return packet;
  }

  startSimulationLoop() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => {
      if (this.connectionState === 'simulated' || this.connectionState === 'disconnected') {
        const packet = this.generateSimulatedPacket();
        this.notify(packet);
      }
    }, this.intervalMs);
  }

  /**
   * Conecta ao WebSocket do ESP32 ou Broker MQTT via WS
   */
  connectWebSocket(url = null) {
    if (url) this.wsUrl = url;

    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
    }

    this.connectionState = 'connecting';
    console.log(`[TelemetryService] Conectando a ${this.wsUrl}...`);

    try {
      this.socket = new WebSocket(this.wsUrl);

      this.socket.onopen = () => {
        console.log(`[TelemetryService] Conectado ao hardware com sucesso!`);
        this.connectionState = 'connected';
      };

      this.socket.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          // Atualiza acumuladores persistentes se o hardware enviar
          if (packet.joules_total !== undefined) this.joulesTotal = packet.joules_total;
          if (packet.watt_hours !== undefined) this.wattHours = packet.watt_hours;
          if (packet.calories_kcal !== undefined) this.caloriesKcal = packet.calories_kcal;
          if (packet.loads) this.loads = { ...this.loads, ...packet.loads };

          this.notify(packet);
        } catch (err) {
          console.warn('[TelemetryService] Pacote inválido:', event.data);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[TelemetryService] Erro no WebSocket:', err);
      };

      this.socket.onclose = () => {
        console.log('[TelemetryService] Conexão WebSocket encerrada. Retornando ao modo simulação...');
        this.connectionState = 'simulated';
      };
    } catch (e) {
      console.warn('[TelemetryService] Falha ao iniciar WebSocket:', e);
      this.connectionState = 'simulated';
    }
  }

  disconnectWebSocket() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connectionState = 'simulated';
  }
}
