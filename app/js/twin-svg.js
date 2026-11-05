/**
 * ============================================================================
 * PURAQUÊ BLUE TWIN - TwinSvgRenderer
 * Controle Dinâmico dos Elementos Gráficos SVG, Animações e Efeitos Físicos
 * ============================================================================
 */

export class TwinSvgRenderer {
  constructor(svgId) {
    this.svg = document.getElementById(svgId);
    this.crankAngle = 0;
    this.altAngle = 0;
    this.beltOffset = 0;
    this.lastTimestamp = performance.now();

    // Cache de elementos do DOM SVG
    this.elements = {
      crankRotating: document.getElementById('crank-rotating'),
      pedalRight: document.getElementById('pedal-right'),
      pedalLeft: document.getElementById('pedal-left'),
      altRotor: document.getElementById('alt-rotor'),
      altFluxRings: document.querySelectorAll('.alt-flux-ring'),
      driveBelt: document.getElementById('drive-belt'),
      powerBusLine: document.getElementById('power-bus-line'),
      usb5vLine: document.getElementById('usb-5v-line'),
      espLed: document.getElementById('esp32-status-led'),
      hallLed: document.getElementById('hall-sensor-led'),
      resistor1Glow: document.getElementById('resistor-1-glow'),
      resistor2Glow: document.getElementById('resistor-2-glow'),
      resistor3Glow: document.getElementById('resistor-3-glow'),
      resistor1Body: document.getElementById('resistor-1-body'),
      resistor2Body: document.getElementById('resistor-2-body'),
      resistor3Body: document.getElementById('resistor-3-body'),
      currentFluxEffect: document.getElementById('current-flux-line'),
      hudCallouts: document.getElementById('hud-callouts')
    };

    this.currentPacket = null;
    this.isPanoramic = true;
    this.animationLoopId = null;

    this.startRenderLoop();
  }

  setPanoramicState(isPanoramic) {
    this.isPanoramic = isPanoramic;
    if (this.elements.hudCallouts) {
      if (isPanoramic) {
        this.elements.hudCallouts.style.opacity = '0';
        this.elements.hudCallouts.style.pointerEvents = 'none';
      } else {
        this.elements.hudCallouts.style.opacity = '1';
        this.elements.hudCallouts.style.pointerEvents = 'auto';
      }
    }
  }

  /**
   * Atualização com os dados do pacote de telemetria a cada 300ms
   */
  updateTelemetry(packet) {
    this.currentPacket = packet;

    // 1. Pulso luminoso no LED de telemetria do ESP32 a cada frame recebido (sem filter pesado)
    if (this.elements.espLed) {
      this.elements.espLed.setAttribute('fill', '#00E5FF');
      setTimeout(() => {
        if (this.elements.espLed) {
          this.elements.espLed.setAttribute('fill', '#0d47a1');
        }
      }, 90);
    }

    // 2. Pulso no sensor Hall (G1)
    if (this.elements.hallLed && packet.rpm > 0) {
      this.elements.hallLed.setAttribute('fill', '#00F59B');
      setTimeout(() => {
        if (this.elements.hallLed) {
          this.elements.hallLed.setAttribute('fill', '#064e3b');
        }
      }, 70);
    }

    // 3. Espessura do feixe condutor proporcional à corrente elétrica (A)
    if (this.elements.powerBusLine) {
      const baseWidth = 2.5;
      const currentFactor = Math.min(8, Math.max(0, packet.current_a * 2.0));
      const strokeWidth = (baseWidth + currentFactor).toFixed(1);
      this.elements.powerBusLine.setAttribute('stroke-width', strokeWidth);

      // Cor proporcional à corrente e potência
      if (packet.power_w > 35) {
        this.elements.powerBusLine.setAttribute('stroke', '#00F59B');
      } else if (packet.power_w > 10) {
        this.elements.powerBusLine.setAttribute('stroke', '#00E5FF');
      } else {
        this.elements.powerBusLine.setAttribute('stroke', '#1D63FF');
      }
    }

    // 4. Linha USB 5,0V estável (verde esmeralda se regulador estiver ativo)
    if (this.elements.usb5vLine) {
      if (packet.status && packet.status.buck_5v_ok) {
        this.elements.usb5vLine.setAttribute('stroke', '#00F59B');
        this.elements.usb5vLine.setAttribute('stroke-opacity', '0.9');
      } else {
        this.elements.usb5vLine.setAttribute('stroke', '#64748b');
        this.elements.usb5vLine.setAttribute('stroke-opacity', '0.4');
      }
    }

    // 5. Estado térmico e incandescência dos 3 resistores de carga (G5)
    this.updateResistorThermalVisuals(packet.loads);
  }

  /**
   * Atualiza a cor e incandescência dos resistores cerâmicos usando gradientes radiais GPU
   */
  updateResistorThermalVisuals(loads) {
    if (!loads) return;

    // Resistor 1 (10W - Relé GPIO 25)
    this.applyThermalState(
      loads.load_1_relay_25,
      this.elements.resistor1Body,
      this.elements.resistor1Glow,
      '#FF9500'
    );

    // Resistor 2 (15W - MOSFET GPIO 26)
    this.applyThermalState(
      loads.load_2_mosfet_26,
      this.elements.resistor2Body,
      this.elements.resistor2Glow,
      '#FF6F00'
    );

    // Resistor 3 (25W - MOSFET GPIO 32)
    this.applyThermalState(
      loads.load_3_mosfet_32,
      this.elements.resistor3Body,
      this.elements.resistor3Glow,
      '#FF3366'
    );
  }

  applyThermalState(isActive, bodyEl, glowEl, glowColor) {
    if (!bodyEl) return;
    if (isActive) {
      bodyEl.setAttribute('fill', glowColor);
      bodyEl.setAttribute('stroke', '#FFF');
      if (glowEl) {
        glowEl.setAttribute('opacity', '0.9');
      }
    } else {
      bodyEl.setAttribute('fill', '#334155');
      bodyEl.setAttribute('stroke', '#475569');
      if (glowEl) {
        glowEl.setAttribute('opacity', '0.0');
      }
    }
  }

  /**
   * Loop contínuo a 60 FPS desacoplado via requestAnimationFrame
   */
  startRenderLoop() {
    const loop = (now) => {
      const dt = (now - this.lastTimestamp) / 1000.0;
      this.lastTimestamp = now;

      const rpm = (this.currentPacket && this.currentPacket.rpm) ? this.currentPacket.rpm : 0;

      if (rpm > 0.5) {
        // Velocidade angular do movimento central: omega = (RPM / 60) * 360 graus/s
        const crankDegreesPerSec = (rpm / 60.0) * 360.0;
        this.crankAngle = (this.crankAngle + crankDegreesPerSec * dt) % 360;

        // Relação de transmissão mecânica coroa/catraca do alternador: ~ 1:3.2
        const altDegreesPerSec = crankDegreesPerSec * 3.2;
        this.altAngle = (this.altAngle + altDegreesPerSec * dt) % 360;

        // Movimento linear da correia de transmissão
        this.beltOffset = (this.beltOffset - crankDegreesPerSec * dt * 0.4) % 100;

        // 1. Rotaciona Pedivela e Coroa em torno do centro (460, 390)
        if (this.elements.crankRotating) {
          const angleStr = this.crankAngle.toFixed(1);
          const negAngleStr = (-this.crankAngle).toFixed(1);
          this.elements.crankRotating.setAttribute(
            'transform',
            `rotate(${angleStr} 460 390)`
          );
          if (this.elements.pedalRight) {
            this.elements.pedalRight.setAttribute(
              'transform',
              `rotate(${negAngleStr} 460 306)`
            );
          }
          if (this.elements.pedalLeft) {
            this.elements.pedalLeft.setAttribute(
              'transform',
              `rotate(${negAngleStr} 460 474)`
            );
          }
        }

        // 2. Rotaciona rotor do alternador em torno de (230, 390)
        if (this.elements.altRotor) {
          this.elements.altRotor.setAttribute(
            'transform',
            `rotate(${this.altAngle.toFixed(1)} 230 390)`
          );
        }

        // 3. Desloca traços da correia
        if (this.elements.driveBelt) {
          this.elements.driveBelt.style.strokeDashoffset = `${this.beltOffset.toFixed(1)}px`;
        }

        // 4. Fluxo de elétrons no barramento elétrico
        if (this.elements.currentFluxEffect) {
          const fluxSpeed = Math.max(1, (this.currentPacket?.current_a || 1) * 2.5);
          const fluxOffset = (now * 0.08 * fluxSpeed) % 100;
          this.elements.currentFluxEffect.style.strokeDashoffset = `${-fluxOffset.toFixed(1)}px`;
        }

        // 5. Pulso dos anéis de indução do alternador (apenas opacidade, zero re-layout)
        if (this.elements.altFluxRings) {
          const pulsePhase = (now * 0.005 * (rpm / 50.0)) % (Math.PI * 2);
          const opacity = (0.35 + 0.35 * Math.sin(pulsePhase)).toFixed(2);
          this.elements.altFluxRings.forEach((ring) => {
            ring.style.opacity = opacity;
          });
        }
      } else {
        if (this.elements.altFluxRings) {
          this.elements.altFluxRings.forEach((ring) => {
            ring.style.opacity = '0.15';
          });
        }
      }

      this.animationLoopId = requestAnimationFrame(loop);
    };

    this.animationLoopId = requestAnimationFrame(loop);
  }
}
