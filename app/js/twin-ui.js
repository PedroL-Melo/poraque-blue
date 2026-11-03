/**
 * ============================================================================
 * PURAQUÊ BLUE TWIN - TwinUIManager
 * Gerenciador de Interface, Máquina de Estados, Cartões HUD e Controles
 * ============================================================================
 */

import { CAMERA_TARGETS } from './camera.js';

// Módulo de áudio sintético para feedback futurista (Web Audio API)
class FuturisticSoundFX {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }
  playBeep(freq = 880, duration = 0.06, type = 'sine') {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }
  click() { this.playBeep(920, 0.04, 'triangle'); }
  zoom() { this.playBeep(440, 0.12, 'sine'); }
  toggleOn() { this.playBeep(680, 0.08, 'sine'); }
  toggleOff() { this.playBeep(320, 0.08, 'sine'); }
}

export class TwinUIManager {
  constructor(camera, telemetry, svgRenderer) {
    this.camera = camera;
    this.telemetry = telemetry;
    this.svgRenderer = svgRenderer;
    this.sound = new FuturisticSoundFX();

    this.chartData = {
      voltage: [],
      current: [],
      power: [],
      maxPoints: 40
    };

    this.initDOM();
    this.initEventListeners();
    this.bindCameraEvents();
    this.bindTelemetryEvents();
  }

  initDOM() {
    // Cache de elementos de KPIs Globais
    this.kpiRpm = document.getElementById('kpi-rpm');
    this.kpiFreq = document.getElementById('kpi-freq');
    this.kpiVoltage = document.getElementById('kpi-voltage');
    this.kpiCurrent = document.getElementById('kpi-current');
    this.kpiPower = document.getElementById('kpi-power');
    this.kpiJoules = document.getElementById('kpi-joules');
    this.kpiWh = document.getElementById('kpi-wh');
    this.kpiKcal = document.getElementById('kpi-kcal');

    // Badges de Status
    this.connectionBadge = document.getElementById('connection-badge');
    this.wifiRssiEl = document.getElementById('wifi-rssi-val');

    // HUD Side Panel
    this.hudSideCard = document.getElementById('hud-side-card');
    this.hudCardTitle = document.getElementById('hud-card-title');
    this.hudCardSubtitle = document.getElementById('hud-card-subtitle');
    this.hudCardBadge = document.getElementById('hud-card-badge');
    this.hudFormulaBox = document.getElementById('hud-formula-box');
    this.hudDynamicContent = document.getElementById('hud-dynamic-content');
    this.hudCloseBtn = document.getElementById('hud-close-btn');

    // Botões de Navegação Superior
    this.navPills = document.querySelectorAll('.nav-pill-target');

    // Sliders e Controles da Bancada
    this.cadenceSlider = document.getElementById('cadence-slider');
    this.cadenceDisplay = document.getElementById('cadence-display-val');

    // Botões de Cargas
    this.btnLoad1 = document.getElementById('btn-load-1');
    this.btnLoad2 = document.getElementById('btn-load-2');
    this.btnLoad3 = document.getElementById('btn-load-3');

    // Barra de Torque de Lenz
    this.lenzBar = document.getElementById('lenz-torque-bar');
    this.lenzLabel = document.getElementById('lenz-torque-label');

    // Canvas do Mini Osciloscópio
    this.sparkCanvas = document.getElementById('telemetry-sparkline');
    if (this.sparkCanvas) {
      this.sparkCtx = this.sparkCanvas.getContext('2d');
    }
  }

  initEventListeners() {
    // Ativação de áudio no primeiro clique
    document.addEventListener('pointerdown', () => this.sound.init(), { once: true });

    // Navegação pelos botões do topo
    this.navPills.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetId = btn.dataset.target;
        this.sound.zoom();
        this.camera.goTo(targetId);
      });
    });

    // Clique no botão Fechar / Retornar do painel lateral
    if (this.hudCloseBtn) {
      this.hudCloseBtn.addEventListener('click', () => {
        this.sound.click();
        this.camera.resetOverview();
      });
    }

    // Atalhos de teclado
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === '0') {
        this.sound.click();
        this.camera.resetOverview();
      } else if (e.key === '1') {
        this.sound.zoom();
        this.camera.goTo('TARGET_HALL');
      } else if (e.key === '2') {
        this.sound.zoom();
        this.camera.goTo('TARGET_ALT');
      } else if (e.key === '3') {
        this.sound.zoom();
        this.camera.goTo('TARGET_ESP');
      } else if (e.key === '4') {
        this.sound.zoom();
        this.camera.goTo('TARGET_LOADS');
      }
    });

    // Controle de cadência do pedal
    if (this.cadenceSlider) {
      this.cadenceSlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        if (this.cadenceDisplay) this.cadenceDisplay.textContent = `${val} RPM`;
        this.telemetry.setCadence(val);
      });
    }

    // Botões de Cargas Resistivas
    const setupLoadBtn = (btn, key) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        const newState = this.telemetry.toggleLoad(key);
        if (newState[key]) {
          this.sound.toggleOn();
        } else {
          this.sound.toggleOff();
        }
        this.renderLoadToggles(newState);
      });
    };

    setupLoadBtn(this.btnLoad1, 'load_1_relay_25');
    setupLoadBtn(this.btnLoad2, 'load_2_mosfet_26');
    setupLoadBtn(this.btnLoad3, 'load_3_mosfet_32');

    // Hotspots Clicáveis no SVG
    const hotspots = [
      { id: 'hotspot-hall', target: 'TARGET_HALL' },
      { id: 'hotspot-alt', target: 'TARGET_ALT' },
      { id: 'hotspot-esp', target: 'TARGET_ESP' },
      { id: 'hotspot-loads', target: 'TARGET_LOADS' }
    ];

    hotspots.forEach(({ id, target }) => {
      const el = document.getElementById(id);
      if (el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.sound.zoom();
          this.camera.goTo(target);
        });
      }
    });

    // Clique no fundo do SVG retorna ao overview
    const svgEl = document.getElementById('bike-twin-svg');
    if (svgEl) {
      svgEl.addEventListener('click', (ev) => {
        // Se clicar em um elemento sem ação específica, volta ao panorama
        if (ev.target.id === 'svg-background-rect' || ev.target.id === 'bike-twin-svg') {
          if (!this.camera.isGlobal()) {
            this.sound.click();
            this.camera.resetOverview();
          }
        }
      });
    }

    // Botão de conexão WebSocket
    const wsConnectBtn = document.getElementById('btn-ws-connect');
    const wsUrlInput = document.getElementById('ws-url-input');
    if (wsConnectBtn && wsUrlInput) {
      wsConnectBtn.addEventListener('click', () => {
        if (this.telemetry.connectionState === 'connected') {
          this.telemetry.disconnectWebSocket();
          wsConnectBtn.textContent = 'Conectar';
        } else {
          this.telemetry.connectWebSocket(wsUrlInput.value.trim());
          wsConnectBtn.textContent = 'Desconectar';
        }
      });
    }
  }

  bindCameraEvents() {
    this.camera.onChange((targetId, isFinished) => {
      const isGlobal = targetId === 'TARGET_GLOBAL';

      // Atualiza botões do topo
      this.navPills.forEach((btn) => {
        if (btn.dataset.target === targetId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Avisa renderizador do SVG
      this.svgRenderer.setPanoramicState(isGlobal);

      // Mostra ou esconde cartão lateral HUD
      if (this.hudSideCard) {
        if (isGlobal) {
          this.hudSideCard.classList.remove('open');
        } else {
          this.hudSideCard.classList.add('open');
          this.renderInspectionCard(targetId);
        }
      }
    });
  }

  bindTelemetryEvents() {
    this.telemetry.onUpdate((packet) => {
      this.renderKPIs(packet);
      this.renderSparkline(packet);
      this.svgRenderer.updateTelemetry(packet);

      // Se o cartão lateral estiver aberto, atualiza suas métricas dinâmicas
      if (!this.camera.isGlobal()) {
        this.updateInspectionValues(packet);
      }
    });
  }

  renderKPIs(p) {
    if (this.kpiRpm) this.kpiRpm.textContent = `${p.rpm}`;
    if (this.kpiFreq) this.kpiFreq.textContent = `${p.frequency_hz.toFixed(1)} Hz`;
    if (this.kpiVoltage) this.kpiVoltage.textContent = `${p.voltage_v.toFixed(2)} V`;
    if (this.kpiCurrent) this.kpiCurrent.textContent = `${p.current_a.toFixed(2)} A`;
    if (this.kpiPower) this.kpiPower.textContent = `${p.power_w.toFixed(1)} W`;
    if (this.kpiJoules) this.kpiJoules.textContent = `${p.joules_total.toFixed(0)} J`;
    if (this.kpiWh) this.kpiWh.textContent = `${p.watt_hours.toFixed(2)} Wh`;
    if (this.kpiKcal) this.kpiKcal.textContent = `${p.calories_kcal.toFixed(2)} kcal`;

    // Atualiza estado do indicador de conexão
    if (this.connectionBadge) {
      if (p.status.simulation) {
        this.connectionBadge.className = 'status-pill simulated';
        this.connectionBadge.innerHTML = `<span class="dot"></span> SIMULAÇÃO DE BANCADA`;
      } else {
        this.connectionBadge.className = 'status-pill online';
        this.connectionBadge.innerHTML = `<span class="dot"></span> ESP32 ONLINE (${p.status.wifi_rssi} dBm)`;
      }
    }

    if (this.wifiRssiEl) {
      this.wifiRssiEl.textContent = `${p.status.wifi_rssi} dBm`;
    }

    // Atualiza botões de cargas
    this.renderLoadToggles(p.loads);

    // Atualiza barra de torque de Lenz
    const torque = this.telemetry.getLenzTorque();
    if (this.lenzBar) {
      this.lenzBar.style.width = `${torque.percent}%`;
      this.lenzBar.style.backgroundColor = torque.color;
    }
    if (this.lenzLabel) {
      this.lenzLabel.textContent = torque.label;
      this.lenzLabel.style.color = torque.color;
    }
  }

  renderLoadToggles(loads) {
    const updateBtn = (btn, active) => {
      if (!btn) return;
      if (active) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    };
    updateBtn(this.btnLoad1, loads.load_1_relay_25);
    updateBtn(this.btnLoad2, loads.load_2_mosfet_26);
    updateBtn(this.btnLoad3, loads.load_3_mosfet_32);
  }

  /**
   * Renderiza os dados físicos profundos do Módulo Ativo no HUD lateral
   */
  renderInspectionCard(targetId) {
    const target = CAMERA_TARGETS[targetId];
    if (!target) return;

    if (this.hudCardTitle) this.hudCardTitle.textContent = target.name;
    if (this.hudCardSubtitle) this.hudCardSubtitle.textContent = target.subtitle;

    let pinHtml = '';
    let formulaHtml = '';
    let dynamicHtml = '';

    const p = this.telemetry.latestPacket || {
      rpm: 0, frequency_hz: 0, voltage_v: 0, current_a: 0, power_w: 0,
      joules_total: 0, watt_hours: 0, calories_kcal: 0
    };

    switch (targetId) {
      case 'TARGET_HALL':
        pinHtml = `<span class="chip chip-blue">GPIO 27</span> <span class="chip">EXT_INT (IRAM_ATTR)</span> <span class="chip">Efeito Hall / Encoder</span>`;
        formulaHtml = `
          <div class="formula-block">
            <div class="formula-title">LEI DA INDUÇÃO DE FARADAY-LENZ & AMOSTRAGEM DE PULSOS</div>
            <div class="formula-math">
              $$\\text{RPM} = \\frac{n}{\\Delta t \\cdot N_{\\text{pulsos}}} \\times 60 \\qquad f = \\frac{n}{\\Delta t} \\text{ [Hz]}$$
            </div>
            <div class="formula-desc">A rotação dos ímãs de neodímio induz pulsos na bobina/sensor Hall, gerando interrupções no ESP32.</div>
          </div>
        `;
        dynamicHtml = `
          <div class="hud-stats-grid">
            <div class="hud-stat-item">
              <span class="label">CADÊNCIA (RPM)</span>
              <span class="val cyan" id="hud-rpm-val">${p.rpm}</span>
            </div>
            <div class="hud-stat-item">
              <span class="label">FREQUÊNCIA (Hz)</span>
              <span class="val blue" id="hud-freq-val">${p.frequency_hz.toFixed(1)}</span>
            </div>
            <div class="hud-stat-item">
              <span class="label">PERÍODO (T)</span>
              <span class="val" id="hud-period-val">${p.frequency_hz > 0 ? (1000 / p.frequency_hz).toFixed(1) : 0} ms</span>
            </div>
            <div class="hud-stat-item">
              <span class="label">PULSOS/VOLTA</span>
              <span class="val green">5 ÍMÃS</span>
            </div>
          </div>
          <div class="hud-info-alert">
            <i class="icon">ℹ️</i>
            <span>Interrupção rápida em RAM (IRAM_ATTR) sem latência de leitura analógica.</span>
          </div>
        `;
        break;

      case 'TARGET_ALT':
        pinHtml = `<span class="chip chip-blue">GPIO 34 (ADC1_CH6)</span> <span class="chip chip-cyan">INA219 (I2C: 21, 22)</span> <span class="chip">GPIO 35 (ACS712)</span>`;
        formulaHtml = `
          <div class="formula-block">
            <div class="formula-title">FORÇA ELETROMOTRIZ INDUZIDA & LEI DE OHM</div>
            <div class="formula-math">
              $$\\mathcal{E} = -\\frac{d\\Phi}{dt} \\qquad P = U \\cdot I \\qquad V_{\\text{real}} = V_{\\text{pino}} \\cdot \\left(\\frac{R_1 + R_2}{R_2}\\right)$$
            </div>
            <div class="formula-desc">Alternador automotivo trifásico retificado para 12V-18V CC. Divisor resistivo 68kΩ / 10kΩ.</div>
          </div>
        `;
        dynamicHtml = `
          <div class="hud-stats-grid">
            <div class="hud-stat-item">
              <span class="label">TENSÃO RETIFICADA</span>
              <span class="val cyan" id="hud-v-val">${p.voltage_v.toFixed(2)} V</span>
            </div>
            <div class="hud-stat-item">
              <span class="label">CORRENTE TOTAL</span>
              <span class="val blue" id="hud-i-val">${p.current_a.toFixed(2)} A</span>
            </div>
            <div class="hud-stat-item">
              <span class="label">POTÊNCIA ELÉTRICA</span>
              <span class="val green" id="hud-p-val">${p.power_w.toFixed(1)} W</span>
            </div>
            <div class="hud-stat-item">
              <span class="label">FILTRO DIGITAL</span>
              <span class="val">Média Móvel O(1)</span>
            </div>
          </div>
          <div class="hud-info-alert">
            <i class="icon">⚡</i>
            <span>Canal ADC1 puro ativo para operação simultânea com o rádio Wi-Fi do ESP32.</span>
          </div>
        `;
        break;

      case 'TARGET_ESP':
        pinHtml = `<span class="chip chip-green">LM2596 (Buck 5.0V)</span> <span class="chip chip-blue">ESP32 Dev Module</span> <span class="chip">USB 5V Estabilizada</span>`;
        formulaHtml = `
          <div class="formula-block">
            <div class="formula-title">EFICIÊNCIA BUCK & INTEGRAÇÃO NUMÉRICA DE ENERGIA</div>
            <div class="formula-math">
              $$\\eta = \\frac{P_{\\text{saida}}}{P_{\\text{entrada}}} \\quad E = \\int P\\,dt \\approx \\sum P_k \\cdot \\Delta t \\text{ [J]} \\quad E_{\\text{Wh}} = \\frac{E}{3600}$$
            </div>
            <div class="formula-desc">Conversão Step-Down com chaveamento de alta eficiência protegendo a carga USB.</div>
          </div>
        `;
        dynamicHtml = `
          <div class="hud-stats-grid">
            <div class="hud-stat-item">
              <span class="label">SAÍDA REGULADA</span>
              <span class="val green">5.00 V CC</span>
            </div>
            <div class="hud-stat-item">
              <span class="label">ENERGIA TOTAL</span>
              <span class="val cyan" id="hud-joules-val">${p.joules_total.toFixed(0)} J</span>
            </div>
            <div class="hud-stat-item">
              <span class="label">WATT-HORA</span>
              <span class="val blue" id="hud-wh-val">${p.watt_hours.toFixed(3)} Wh</span>
            </div>
            <div class="hud-stat-item">
              <span class="label">CALORIAS QUEIMADAS</span>
              <span class="val orange" id="hud-kcal-val">${p.calories_kcal.toFixed(2)} kcal</span>
            </div>
          </div>
          <div class="hud-info-alert">
            <i class="icon">🔋</i>
            <span>Circuito com diodo Schottky e fusível rearmável PTC contra sobretensão acidental.</span>
          </div>
        `;
        break;

      case 'TARGET_LOADS':
        pinHtml = `<span class="chip chip-orange">GPIO 25 (Relé 1)</span> <span class="chip chip-orange">GPIO 26 (MOSFET 2)</span> <span class="chip chip-orange">GPIO 32 (MOSFET 3)</span>`;
        formulaHtml = `
          <div class="formula-block">
            <div class="formula-title">ASSOCIAÇÃO EM PARALELO, EFEITO JOULE & LEI DE LENZ</div>
            <div class="formula-math">
              $$P_{\\text{dissipada}} = \\frac{U^2}{R_{\\text{eq}}} \\qquad \\frac{1}{R_{\\text{eq}}} = \\sum_{i=1}^n \\frac{1}{R_i}$$
            </div>
            <div class="formula-desc">Ao acionar mais resistores, a corrente induzida aumenta e o contra-torque magnético freia a pedalada!</div>
          </div>
        `;
        dynamicHtml = `
          <div class="hud-torque-box">
            <div class="torque-header">
              <span>CONJUGADO RESISTENTE (TORQUE DE LENZ):</span>
              <strong id="hud-lenz-val">Médio (+10W)</strong>
            </div>
            <div class="torque-meter">
              <div class="torque-bar-fill" id="hud-lenz-bar" style="width: 25%;"></div>
            </div>
          </div>

          <div class="hud-loads-panel">
            <div class="hud-load-btn-row">
              <button class="load-toggle-btn ${p.loads.load_1_relay_25 ? 'active' : ''}" id="hud-load-btn-1">
                <span class="lamp-indicator"></span>
                <span class="text">Carga 1 (10W - Relé)</span>
                <span class="code">GPIO 25</span>
              </button>
              <button class="load-toggle-btn ${p.loads.load_2_mosfet_26 ? 'active' : ''}" id="hud-load-btn-2">
                <span class="lamp-indicator"></span>
                <span class="text">Carga 2 (15W - MOSFET)</span>
                <span class="code">GPIO 26</span>
              </button>
              <button class="load-toggle-btn ${p.loads.load_3_mosfet_32 ? 'active' : ''}" id="hud-load-btn-3">
                <span class="lamp-indicator"></span>
                <span class="text">Carga 3 (25W - MOSFET)</span>
                <span class="code">GPIO 32</span>
              </button>
            </div>
          </div>
        `;
        break;
    }

    if (this.hudCardBadge) this.hudCardBadge.innerHTML = pinHtml;
    if (this.hudFormulaBox) this.hudFormulaBox.innerHTML = formulaHtml;
    if (this.hudDynamicContent) this.hudDynamicContent.innerHTML = dynamicHtml;

    // Se for o painel de cargas, reatacha os eventos dos botões no HUD
    if (targetId === 'TARGET_LOADS') {
      const b1 = document.getElementById('hud-load-btn-1');
      const b2 = document.getElementById('hud-load-btn-2');
      const b3 = document.getElementById('hud-load-btn-3');

      if (b1) b1.addEventListener('click', () => {
        const s = this.telemetry.toggleLoad('load_1_relay_25');
        b1.classList.toggle('active', s.load_1_relay_25);
        this.sound.toggleOn();
      });
      if (b2) b2.addEventListener('click', () => {
        const s = this.telemetry.toggleLoad('load_2_mosfet_26');
        b2.classList.toggle('active', s.load_2_mosfet_26);
        this.sound.toggleOn();
      });
      if (b3) b3.addEventListener('click', () => {
        const s = this.telemetry.toggleLoad('load_3_mosfet_32');
        b3.classList.toggle('active', s.load_3_mosfet_32);
        this.sound.toggleOn();
      });
    }

    // Renderiza MathJax / KaTeX se estiver disponível na página
    if (window.renderMathInElement) {
      window.renderMathInElement(this.hudFormulaBox, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ]
      });
    }
  }

  /**
   * Atualização leve dos valores numéricos enquanto o painel HUD está em foco
   */
  updateInspectionValues(p) {
    const elRpm = document.getElementById('hud-rpm-val');
    if (elRpm) elRpm.textContent = `${p.rpm}`;

    const elFreq = document.getElementById('hud-freq-val');
    if (elFreq) elFreq.textContent = `${p.frequency_hz.toFixed(1)}`;

    const elPeriod = document.getElementById('hud-period-val');
    if (elPeriod) elPeriod.textContent = `${p.frequency_hz > 0 ? (1000 / p.frequency_hz).toFixed(1) : 0} ms`;

    const elV = document.getElementById('hud-v-val');
    if (elV) elV.textContent = `${p.voltage_v.toFixed(2)} V`;

    const elI = document.getElementById('hud-i-val');
    if (elI) elI.textContent = `${p.current_a.toFixed(2)} A`;

    const elP = document.getElementById('hud-p-val');
    if (elP) elP.textContent = `${p.power_w.toFixed(1)} W`;

    const elJ = document.getElementById('hud-joules-val');
    if (elJ) elJ.textContent = `${p.joules_total.toFixed(0)} J`;

    const elWh = document.getElementById('hud-wh-val');
    if (elWh) elWh.textContent = `${p.watt_hours.toFixed(3)} Wh`;

    const elKcal = document.getElementById('hud-kcal-val');
    if (elKcal) elKcal.textContent = `${p.calories_kcal.toFixed(2)} kcal`;

    const torque = this.telemetry.getLenzTorque();
    const elTorque = document.getElementById('hud-lenz-val');
    if (elTorque) {
      elTorque.textContent = torque.label;
      elTorque.style.color = torque.color;
    }
    const elBar = document.getElementById('hud-lenz-bar');
    if (elBar) {
      elBar.style.width = `${torque.percent}%`;
      elBar.style.backgroundColor = torque.color;
    }
  }

  /**
   * Mini Osciloscópio / Gráfico de Telemetria em Tempo Real (Canvas 2D)
   */
  renderSparkline(packet) {
    if (!this.sparkCanvas || !this.sparkCtx) return;

    this.chartData.voltage.push(packet.voltage_v);
    this.chartData.power.push(packet.power_w);

    if (this.chartData.voltage.length > this.chartData.maxPoints) {
      this.chartData.voltage.shift();
      this.chartData.power.shift();
    }

    const ctx = this.sparkCtx;
    const w = this.sparkCanvas.width;
    const h = this.sparkCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Linhas de Grade
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
    ctx.moveTo(0, h * 0.25); ctx.lineTo(w, h * 0.25);
    ctx.moveTo(0, h * 0.75); ctx.lineTo(w, h * 0.75);
    ctx.stroke();

    const drawCurve = (data, maxVal, color) => {
      if (data.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const step = w / (this.chartData.maxPoints - 1);
      data.forEach((val, i) => {
        const x = i * step;
        const normalized = Math.max(0, Math.min(1, val / maxVal));
        const y = h - (normalized * (h - 8) + 4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    // Curva 1: Tensão (Escala máx 22V) - Ciano
    drawCurve(this.chartData.voltage, 22.0, '#00E5FF');

    // Curva 2: Potência (Escala máx 60W) - Verde Esmeralda
    drawCurve(this.chartData.power, 60.0, '#00F59B');
  }
}
