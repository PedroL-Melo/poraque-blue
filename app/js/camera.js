/**
 * ============================================================================
 * PURAQUÊ BLUE TWIN - CameraController
 * Gerenciador de Câmera e Interpolação Não-Linear de ViewBox no SVG
 * ============================================================================
 */

export const CAMERA_TARGETS = {
  TARGET_GLOBAL: {
    id: 'TARGET_GLOBAL',
    name: 'Visão Panorâmica',
    subtitle: 'Overview do Sistema Eletromecânico Completo',
    x: 0,
    y: 0,
    w: 1000,
    h: 600,
    centerX: 500,
    centerY: 300,
    moduleId: null
  },
  TARGET_HALL: {
    id: 'TARGET_HALL',
    name: 'Módulo 1 (G1) — Eixo & Sensor Hall',
    subtitle: 'Sensor Hall / Rotação & Indução de Faraday',
    x: 340,
    y: 280,
    w: 260,
    h: 220,
    centerX: 460,
    centerY: 390,
    moduleId: 'G1'
  },
  TARGET_ALT: {
    id: 'TARGET_ALT',
    name: 'Módulo 3 (G3) — Alternador Automotivo',
    subtitle: 'Geração por Indução Eletromagnética & Retificação CC',
    x: 100,
    y: 270,
    w: 280,
    h: 240,
    centerX: 230,
    centerY: 390,
    moduleId: 'G3'
  },
  TARGET_ESP: {
    id: 'TARGET_ESP',
    name: 'Módulo 2 (G2) — Buck LM2596 & ESP32',
    subtitle: 'Regulação DC-DC 5.0V, Proteção e Unidade de Telemetria',
    x: 380,
    y: 180,
    w: 260,
    h: 220,
    centerX: 500,
    centerY: 290,
    moduleId: 'G2'
  },
  TARGET_LOADS: {
    id: 'TARGET_LOADS',
    name: 'Módulo 5 (G5) — Banco de Cargas Resistivas',
    subtitle: 'Resistores Cerâmicos, Efeito Joule & Torque Opositor de Lenz',
    x: 560,
    y: 70,
    w: 260,
    h: 220,
    centerX: 680,
    centerY: 180,
    moduleId: 'G5'
  }
};

export class CameraController {
  constructor(svgElementId) {
    this.svg = document.getElementById(svgElementId);
    if (!this.svg) {
      console.warn(`[CameraController] SVG com ID "${svgElementId}" não encontrado.`);
    }

    this.currentViewBox = { x: 0, y: 0, w: 1000, h: 600 };
    this.currentTargetId = 'TARGET_GLOBAL';
    this.animationFrame = null;
    this.isTransitioning = false;
    this.listeners = [];

    // Lê viewBox inicial do elemento se existir
    if (this.svg && this.svg.getAttribute('viewBox')) {
      const parts = this.svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && !parts.some(isNaN)) {
        this.currentViewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
      }
    }
  }

  // Interpolação linear escalar
  lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  // Registra ouvinte para mudanças de câmera
  onChange(callback) {
    this.listeners.push(callback);
  }

  notifyChange(targetId, isFinished) {
    this.listeners.forEach((fn) => fn(targetId, isFinished, this.currentViewBox));
  }

  getCurrentTarget() {
    return CAMERA_TARGETS[this.currentTargetId] || CAMERA_TARGETS.TARGET_GLOBAL;
  }

  isGlobal() {
    return this.currentTargetId === 'TARGET_GLOBAL';
  }

  /**
   * Transiciona suavemente para as coordenadas alvo
   */
  transitionTo(targetX, targetY, targetW, targetH, targetId = null, onComplete = null) {
    if (!this.svg) return;

    cancelAnimationFrame(this.animationFrame);
    this.isTransitioning = true;
    if (targetId) {
      this.currentTargetId = targetId;
      this.notifyChange(targetId, false);
    }

    const speed = 0.088; // Easing suave
    const threshold = 0.35;

    const animate = () => {
      this.currentViewBox.x = this.lerp(this.currentViewBox.x, targetX, speed);
      this.currentViewBox.y = this.lerp(this.currentViewBox.y, targetY, speed);
      this.currentViewBox.w = this.lerp(this.currentViewBox.w, targetW, speed);
      this.currentViewBox.h = this.lerp(this.currentViewBox.h, targetH, speed);

      this.svg.setAttribute(
        'viewBox',
        `${this.currentViewBox.x.toFixed(2)} ${this.currentViewBox.y.toFixed(2)} ${this.currentViewBox.w.toFixed(2)} ${this.currentViewBox.h.toFixed(2)}`
      );

      const dx = Math.abs(this.currentViewBox.x - targetX);
      const dy = Math.abs(this.currentViewBox.y - targetY);
      const dw = Math.abs(this.currentViewBox.w - targetW);
      const dh = Math.abs(this.currentViewBox.h - targetH);

      if (dx > threshold || dy > threshold || dw > threshold || dh > threshold) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        // Encerramento preciso no ponto final
        this.currentViewBox = { x: targetX, y: targetY, w: targetW, h: targetH };
        this.svg.setAttribute('viewBox', `${targetX} ${targetY} ${targetW} ${targetH}`);
        this.isTransitioning = false;
        if (targetId) {
          this.notifyChange(targetId, true);
        }
        if (onComplete) onComplete();
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  /**
   * Atalho para transicionar utilizando uma chave de CAMERA_TARGETS
   */
  goTo(targetKey, onComplete = null) {
    const target = CAMERA_TARGETS[targetKey];
    if (!target) {
      console.warn(`[CameraController] Alvo desconhecido: ${targetKey}`);
      return;
    }
    this.transitionTo(target.x, target.y, target.w, target.h, targetKey, onComplete);
  }

  resetOverview(onComplete = null) {
    this.goTo('TARGET_GLOBAL', onComplete);
  }
}
