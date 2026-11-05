/**
 * ============================================================================
 * PURAQUÊ BLUE TWIN - TwinUIManager
 * Gerenciador de Interface, Máquina de Estados, Cartões HUD Pré-Montados e Controles
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

    // HUD Side Panel (Pré-montado para Zero-Allocation DOM Switch)
    this.hudSideCard = document.getElementById('hud-side-card');
    this.hudCardTitle = document.getElementById('hud-card-title');
    this.hudCardSubtitle = document.getElementById('hud-card-subtitle');
    this.hudCloseBtn = document.getElementById('hud-close-btn');
    this.hudReturnBtn = document.getElementById('hud-return-overview-btn');
    this.hudPeekBtn = document.getElementById('hud-peek-btn');
    this.hudModulePanels = document.querySelectorAll('.hud-module-panel');

    // Elementos de telemetria cacheados dentro dos painéis do HUD
    this.hudRpmVal = document.getElementById('hud-rpm-val');
    this.hudFreqVal = document.getElementById('hud-freq-val');
    this.hudPeriodVal = document.getElementById('hud-period-val');
    this.hudVVal = document.getElementById('hud-v-val');
    this.hudIVal = document.getElementById('hud-i-val');
    this.hudPVal = document.getElementById('hud-p-val');
    this.hudJoulesVal = document.getElementById('hud-joules-val');
    this.hudWhVal = document.getElementById('hud-wh-val');
    this.hudKcalVal = document.getElementById('hud-kcal-val');
    this.hudLenzVal = document.getElementById('hud-lenz-val');
    this.hudLenzBar = document.getElementById('hud-lenz-bar');

    // Botões de Cargas dentro do HUD Lateral
    this.hudLoadBtn1 = document.getElementById('hud-load-btn-1');
    this.hudLoadBtn2 = document.getElementById('hud-load-btn-2');
    this.hudLoadBtn3 = document.getElementById('hud-load-btn-3');

    // Botões de Navegação Superior
    this.navPills = document.querySelectorAll('.nav-pill-target');

    // Sliders e Controles da Bancada
    this.cadenceSlider = document.getElementById('cadence-slider');
    this.cadenceDisplay = document.getElementById('cadence-display-val');

    // Botões de Cargas da Barra Inferior
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
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        this.sound.zoom();
        this.camera.goTo(targetId);
      });
    });

    // Clique nos botões Fechar / Retornar do painel lateral
    const handleReturnOverview = () => {
      this.sound.click();
      this.camera.resetOverview();
    };

    if (this.hudCloseBtn) {
      this.hudCloseBtn.addEventListener('click', handleReturnOverview);
    }
    if (this.hudReturnBtn) {
      this.hudReturnBtn.addEventListener('click', handleReturnOverview);
    }

    // Aba lateral "Espiar" (recolhe/expande o card na lateral da tela)
    if (this.hudPeekBtn && this.hudSideCard) {
      this.hudPeekBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.sound.click();
        const isCollapsed = this.hudSideCard.classList.toggle('peek-collapsed');
        this.hudPeekBtn.textContent = isCollapsed ? '‹' : '›';
        this.camera.setCardPeeked(isCollapsed);
      });
    }

    // Suporte a Gestos de Deslizar (Swipe) no HUD Lateral (Mobile & Touch)
    if (this.hudSideCard) {
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;

      this.hudSideCard.addEventListener(
        'touchstart',
        (e) => {
          if (e.touches && e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = performance.now();
          }
        },
        { passive: true }
      );

      this.hudSideCard.addEventListener(
        'touchend',
        (e) => {
          if (!e.changedTouches || e.changedTouches.length === 0) return;
          const touchEndX = e.changedTouches[0].clientX;
          const touchEndY = e.changedTouches[0].clientY;
          const deltaX = touchEndX - touchStartX;
          const deltaY = touchEndY - touchStartY;
          const elapsed = performance.now() - touchStartTime;

          // Se o movimento foi predominantemente horizontal (|deltaX| > 1.5 * |deltaY|)
          if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3 && elapsed < 500) {
            // Deslizar para a direita (swipe right): recolhe o card para o canto da tela
            if (deltaX > 0) {
              if (!this.hudSideCard.classList.contains('peek-collapsed')) {
                this.sound.click();
                this.hudSideCard.classList.add('peek-collapsed');
                if (this.hudPeekBtn) this.hudPeekBtn.textContent = '‹';
                this.camera.setCardPeeked(true);
              }
            }
            // Deslizar para a esquerda (swipe left): expande o card de volta
            else if (deltaX < 0) {
              if (this.hudSideCard.classList.contains('peek-collapsed')) {
                this.sound.click();
                this.hudSideCard.classList.remove('peek-collapsed');
                if (this.hudPeekBtn) this.hudPeekBtn.textContent = '›';
                this.camera.setCardPeeked(false);
              }
            }
          }
        },
        { passive: true }
      );
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

    // Botões de Cargas Resistivas (Barra Inferior + Painel HUD)
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

    setupLoadBtn(this.hudLoadBtn1, 'load_1_relay_25');
    setupLoadBtn(this.hudLoadBtn2, 'load_2_mosfet_26');
    setupLoadBtn(this.hudLoadBtn3, 'load_3_mosfet_32');

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
    const viewportContainer = document.getElementById('viewport-container');

    this.camera.onChange((targetId, isFinished) => {
      // Atualiza a UI imediatamente no início da transição (isFinished === false)
      if (isFinished) return;

      const isGlobal = targetId === 'TARGET_GLOBAL';

      if (viewportContainer) {
        viewportContainer.classList.toggle('inspection-mode', !isGlobal);
      }

      // Atualiza botões do topo e centraliza a pílula ativa no scroll mobile
      this.navPills.forEach((btn) => {
        if (btn.dataset.target === targetId) {
          btn.classList.add('active');
          if (typeof btn.scrollIntoView === 'function') {
            btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }
        } else {
          btn.classList.remove('active');
        }
      });

      // Avisa renderizador do SVG
      this.svgRenderer.setPanoramicState(isGlobal);

      // Mostra ou esconde cartão lateral HUD (com reset do estado peek)
      if (this.hudSideCard) {
        this.hudSideCard.classList.remove('peek-collapsed');
        if (this.hudPeekBtn) this.hudPeekBtn.textContent = '›';

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
      const nextState = p.status.simulation ? 'simulated' : 'online';
      if (this.connectionBadge.dataset.state !== nextState) {
        this.connectionBadge.dataset.state = nextState;
        this.connectionBadge.className = `status-pill ${nextState}`;
      }
      const labelText = p.status.simulation
        ? 'SIMULAÇÃO DE BANCADA'
        : `ESP32 ONLINE (${p.status.wifi_rssi} dBm)`;
      if (this.connectionBadge.dataset.label !== labelText) {
        this.connectionBadge.dataset.label = labelText;
        this.connectionBadge.innerHTML = `<span class="dot"></span> ${labelText}`;
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
    if (!loads) return;
    const updateBtn = (btn, active) => {
      if (!btn) return;
      btn.classList.toggle('active', Boolean(active));
    };
    updateBtn(this.btnLoad1, loads.load_1_relay_25);
    updateBtn(this.btnLoad2, loads.load_2_mosfet_26);
    updateBtn(this.btnLoad3, loads.load_3_mosfet_32);

    updateBtn(this.hudLoadBtn1, loads.load_1_relay_25);
    updateBtn(this.hudLoadBtn2, loads.load_2_mosfet_26);
    updateBtn(this.hudLoadBtn3, loads.load_3_mosfet_32);
  }

  /**
   * Alterna instantaneamente os painéis pré-montados via classe CSS (.active)
   * Zero reconstrução de DOM (innerHTML) = Zero micro-travamentos!
   */
  renderInspectionCard(targetId) {
    const target = CAMERA_TARGETS[targetId];
    if (!target) return;

    if (this.hudCardTitle) this.hudCardTitle.textContent = target.name;
    if (this.hudCardSubtitle) this.hudCardSubtitle.textContent = target.subtitle;

    const activePanelId = `panel-${targetId}`;
    this.hudModulePanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === activePanelId);
    });

    if (this.telemetry.latestPacket) {
      this.updateInspectionValues(this.telemetry.latestPacket);
    }
  }

  /**
   * Atualização ultra-rápida dos nós de texto cacheados enquanto o painel HUD está aberto
   */
  updateInspectionValues(p) {
    if (this.hudRpmVal) this.hudRpmVal.textContent = `${p.rpm}`;
    if (this.hudFreqVal) this.hudFreqVal.textContent = `${p.frequency_hz.toFixed(1)}`;
    if (this.hudPeriodVal) {
      this.hudPeriodVal.textContent = `${p.frequency_hz > 0 ? (1000 / p.frequency_hz).toFixed(1) : 0} ms`;
    }

    if (this.hudVVal) this.hudVVal.textContent = `${p.voltage_v.toFixed(2)} V`;
    if (this.hudIVal) this.hudIVal.textContent = `${p.current_a.toFixed(2)} A`;
    if (this.hudPVal) this.hudPVal.textContent = `${p.power_w.toFixed(1)} W`;

    if (this.hudJoulesVal) this.hudJoulesVal.textContent = `${p.joules_total.toFixed(0)} J`;
    if (this.hudWhVal) this.hudWhVal.textContent = `${p.watt_hours.toFixed(3)} Wh`;
    if (this.hudKcalVal) this.hudKcalVal.textContent = `${p.calories_kcal.toFixed(2)} kcal`;

    const torque = this.telemetry.getLenzTorque();
    if (this.hudLenzVal) {
      this.hudLenzVal.textContent = torque.label;
      this.hudLenzVal.style.color = torque.color;
    }
    if (this.hudLenzBar) {
      this.hudLenzBar.style.width = `${torque.percent}%`;
      this.hudLenzBar.style.backgroundColor = torque.color;
    }

    if (p.loads) {
      this.renderLoadToggles(p.loads);
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
