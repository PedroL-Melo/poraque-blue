/**
 * ============================================================================
 * PURAQUÊ BLUE TWIN - TelemetryService & Physics Engine
 * Motor de Simulação de Física Eletromecânica & Cliente WebSocket com Auto-Connect
 * ============================================================================
 */

export class TelemetryService {
  constructor() {
    this.wsUrl = this.resolveWsUrl();
    this.socket = null;
    this.connectionState = 'simulated'; // 'connected' | 'connecting' | 'disconnected' | 'simulated'
    this.listeners = [];

    // Reconnection timer
    this.reconnectTimer = null;
    this.autoConnectEnabled = true;

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
    this.lastPacketTime = performance.now();

    // Temporização do ciclo de telemetria (300 ms conforme especificação)
    this.intervalMs = 300;
    this.timerId = null;

    // Último pacote gerado/recebido
    this.latestPacket = null;

    this.startSimulationLoop();

    // Inicia conexão automática ao WebSocket (caso não esteja com parâmetro ?mock=true)
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('mock')) {
      this.connectWebSocket();
    } else {
      console.log('[TelemetryService] Modo MOCK explícito (?mock). Simulação ativa sem WebSocket.');
    }
  }

  /**
   * Resolve a URL do WebSocket dinamicamente:
   * 1. Parâmetro na query string (?ws=ws://192.168.4.1/ws)
   * 2. Se rodando servido pelo ESP32 (ex: http://192.168.4.1/app/), usa o host atual: ws://192.168.4.1/ws
   * 3. Fallback para 'ws://192.168.4.1/ws'
   */
  resolveWsUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('ws')) {
        return params.get('ws');
      }
      if (window.location && window.location.host && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/ws`;
      }
    } catch (e) {}
    return 'ws://192.168.4.1/ws';
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
   * Normaliza pacote recebido do ESP32, preenchendo campos ausentes e calculando
   * potências/energias derivadas caso o backend envie apenas valores brutos.
   */
  normalizePacket(raw) {
    const now = performance.now();
    const dtSec = Math.max(0.1, Math.min(2.0, (now - this.lastPacketTime) / 1000.0));
    this.lastPacketTime = now;

    const rpm = Number(raw.rpm !== undefined ? raw.rpm : 0);
    const frequencyHz = Number(
      raw.frequency_hz !== undefined
        ? raw.frequency_hz
        : ((rpm / 60.0) * this.pulsesPerRevolution)
    );
    const voltageV = Number(raw.voltage_v !== undefined ? raw.voltage_v : (raw.voltage !== undefined ? raw.voltage : 0));
    const currentA = Number(raw.current_a !== undefined ? raw.current_a : (raw.current !== undefined ? raw.current : 0));

    // Potência instantânea P = V * I
    const powerW = Number(
      raw.power_w !== undefined
        ? raw.power_w
        : (voltageV * currentA)
    );

    // Acúmulo de energia (integração numérica caso não venha pronta do ESP32)
    if (raw.joules_total !== undefined) {
      this.joulesTotal = Number(raw.joules_total);
    } else if (powerW > 0) {
      this.joulesTotal += powerW * dtSec;
    }

    if (raw.watt_hours !== undefined) {
      this.wattHours = Number(raw.watt_hours);
    } else {
      this.wattHours = this.joulesTotal / 3600.0;
    }

    if (raw.calories_kcal !== undefined) {
      this.caloriesKcal = Number(raw.calories_kcal);
    } else {
      this.caloriesKcal = this.joulesTotal / 4184.0;
    }

    // Cargas
    if (raw.loads && typeof raw.loads === 'object') {
      this.loads = {
        load_1_relay_25: Boolean(raw.loads.load_1_relay_25),
        load_2_mosfet_26: Boolean(raw.loads.load_2_mosfet_26),
        load_3_mosfet_32: Boolean(raw.loads.load_3_mosfet_32)
      };
    }

    // Status
    const statusObj = raw.status || {};
    const buckOk = statusObj.buck_5v_ok !== undefined
      ? Boolean(statusObj.buck_5v_ok)
      : (voltageV >= 6.5);

    return {
      timestamp: raw.timestamp || Date.now(),
      rpm: Math.round(rpm),
      frequency_hz: Number(frequencyHz.toFixed(1)),
      voltage_v: Number(voltageV.toFixed(2)),
      current_a: Number(currentA.toFixed(2)),
      power_w: Number(powerW.toFixed(1)),
      joules_total: Number(this.joulesTotal.toFixed(0)),
      watt_hours: Number(this.wattHours.toFixed(3)),
      calories_kcal: Number(this.caloriesKcal.toFixed(2)),
      loads: { ...this.loads },
      status: {
        simulation: false,
        wifi_rssi: Number(statusObj.wifi_rssi || -50),
        buck_5v_ok: buckOk
      }
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
   * Conecta ao WebSocket do ESP32
   */
  connectWebSocket(url = null) {
    if (url) this.wsUrl = url;

    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
    }

    clearTimeout(this.reconnectTimer);
    this.connectionState = 'connecting';
    console.log(`[TelemetryService] Conectando a ${this.wsUrl}...`);

    try {
      this.socket = new WebSocket(this.wsUrl);

      this.socket.onopen = () => {
        console.log(`[TelemetryService] Conectado ao hardware ESP32 com sucesso!`);
        this.connectionState = 'connected';
      };

      this.socket.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          const normalized = this.normalizePacket(raw);
          this.notify(normalized);
        } catch (err) {
          console.warn('[TelemetryService] Pacote inválido:', event.data);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[TelemetryService] Erro no WebSocket (tentando reconectar em 3s)...');
      };

      this.socket.onclose = () => {
        if (this.connectionState === 'connected') {
          console.log('[TelemetryService] Conexão WebSocket encerrada. Retornando ao modo simulação...');
        }
        this.connectionState = 'simulated';

        // Tenta reconectar a cada 3 segundos silenciosamente
        if (this.autoConnectEnabled) {
          this.reconnectTimer = setTimeout(() => {
            this.connectWebSocket();
          }, 3000);
        }
      };
    } catch (e) {
      console.warn('[TelemetryService] Falha ao iniciar WebSocket:', e);
      this.connectionState = 'simulated';
      if (this.autoConnectEnabled) {
        this.reconnectTimer = setTimeout(() => {
          this.connectWebSocket();
        }, 3000);
      }
    }
  }

  disconnectWebSocket() {
    this.autoConnectEnabled = false;
    clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connectionState = 'simulated';
  }
}
