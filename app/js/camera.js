/**
 * ============================================================================
 * PURAQUÊ BLUE TWIN - CameraController (GPU Transform Engine)
 * Zoom e Pan Acelerados por Hardware via CSS translate3d() + scale() no SVG
 * ============================================================================
 */

export const CAMERA_TARGETS = {
  TARGET_GLOBAL: {
    id: 'TARGET_GLOBAL',
    name: 'Visão Panorâmica',
    subtitle: 'Overview do Sistema Eletromecânico Completo',
    centerX: 500,
    centerY: 300,
    scaleDesktop: 1.0,
    scaleMobile: 1.26,
    moduleId: null
  },
  TARGET_HALL: {
    id: 'TARGET_HALL',
    name: 'G1 — Eixo & Sensor Hall',
    subtitle: 'Sensor Hall (GPIO 27) & Indução de Pulsos',
    centerX: 460,
    centerY: 390,
    scaleDesktop: 2.35,
    scaleMobile: 2.1,
    moduleId: 'G1'
  },
  TARGET_ALT: {
    id: 'TARGET_ALT',
    name: 'G3 — Alternador Automotivo',
    subtitle: 'Indução Eletromagnética & Retificação 12V-18V',
    centerX: 230,
    centerY: 390,
    scaleDesktop: 2.2,
    scaleMobile: 1.95,
    moduleId: 'G3'
  },
  TARGET_ESP: {
    id: 'TARGET_ESP',
    name: 'G2 — Buck LM2596 & ESP32',
    subtitle: 'Regulação Step-Down 5.0V & Telemetria Wi-Fi',
    centerX: 500,
    centerY: 290,
    scaleDesktop: 2.45,
    scaleMobile: 2.15,
    moduleId: 'G2'
  },
  TARGET_LOADS: {
    id: 'TARGET_LOADS',
    name: 'G5 — Banco de Cargas',
    subtitle: 'Resistores Cerâmicos & Torque Opositor de Lenz',
    centerX: 680,
    centerY: 180,
    scaleDesktop: 2.45,
    scaleMobile: 2.15,
    moduleId: 'G5'
  }
};

export class CameraController {
  constructor(svgElementId) {
    this.svg = document.getElementById(svgElementId);
    this.stage = document.getElementById('camera-stage');

    if (!this.svg) {
      console.warn(`[CameraController] SVG com ID "${svgElementId}" não encontrado.`);
    }

    // Mantém o viewBox estático em 0 0 1000 600 para evitar re-layout de DOM a 60fps
    if (this.svg) {
      this.svg.setAttribute('viewBox', '0 0 1000 600');
    }

    this.currentTargetId = 'TARGET_GLOBAL';
    this.isCardPeeked = false;
    this.listeners = [];
    this.transitionTimer = null;

    // Aplica enquadramento inicial responsivo (Mobile vs Desktop)
    this.applyStageTransform('TARGET_GLOBAL', false);

    // Reajusta enquadramento ao girar a tela do celular ou redimensionar janela
    window.addEventListener('resize', () => {
      this.applyStageTransform(this.currentTargetId, false);
    });
  }

  /**
   * Calcula a matriz de transformação GPU (tx, ty, scale) em unidades do SVG (1000x600)
   * compensando a posição do card lateral para que o componente em zoom nunca fique coberto.
   */
  computeTransform(targetKey) {
    const target = CAMERA_TARGETS[targetKey] || CAMERA_TARGETS.TARGET_GLOBAL;
    const isMobile = window.innerWidth <= 768;

    if (targetKey === 'TARGET_GLOBAL') {
      if (isMobile) {
        // No mobile panorâmico com KPIs no topo dedicado, a bicicleta fica centralizada com leve zoom
        const scale = 1.15;
        const focusX = 490;
        const focusY = 320;
        const destX = 500;
        const destY = 320;
        return {
          tx: destX - scale * focusX,
          ty: destY - scale * focusY,
          scale
        };
      }
      return { tx: 0, ty: 0, scale: 1.0 };
    }

    // Modo Inspeção de Subsistema (Zoom Focado)
    const scale = isMobile ? target.scaleMobile : target.scaleDesktop;

    // Se o usuário recolheu o card lateral (peek mode), centraliza o subsistema na tela
    if (this.isCardPeeked) {
      const destX = 500;
      const destY = 300;
      return {
        tx: destX - scale * target.centerX,
        ty: destY - scale * target.centerY,
        scale
      };
    }

    // Com o card lateral aberto na direita, posiciona o componente na área livre à esquerda
    const destX = isMobile ? 255 : 335;
    const destY = isMobile ? 275 : 300;

    return {
      tx: destX - scale * target.centerX,
      ty: destY - scale * target.centerY,
      scale
    };
  }

  applyStageTransform(targetKey, animate = true, onComplete = null) {
    if (!this.stage) return;

    const { tx, ty, scale } = this.computeTransform(targetKey);

    if (!animate) {
      this.stage.style.transition = 'none';
    } else {
      this.stage.style.transition = 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
    }

    this.stage.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;

    if (!animate) {
      // Força reflow leve apenas ao inicializar/redimensionar sem transição
      void this.stage.offsetWidth;
      this.stage.style.transition = 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
    }

    clearTimeout(this.transitionTimer);
    if (animate) {
      this.transitionTimer = setTimeout(() => {
        this.notifyChange(this.currentTargetId, true);
        if (onComplete) onComplete();
      }, 560);
    } else if (onComplete) {
      onComplete();
    }
  }

  /**
   * Alterna o modo "espiar" (quando o card lateral é recolhido para ver a peça inteira)
   */
  setCardPeeked(isPeeked) {
    this.isCardPeeked = Boolean(isPeeked);
    this.applyStageTransform(this.currentTargetId, true);
  }

  // Registra ouvinte para mudanças de câmera
  onChange(callback) {
    this.listeners.push(callback);
  }

  notifyChange(targetId, isFinished) {
    this.listeners.forEach((fn) => fn(targetId, isFinished));
  }

  getCurrentTarget() {
    return CAMERA_TARGETS[this.currentTargetId] || CAMERA_TARGETS.TARGET_GLOBAL;
  }

  isGlobal() {
    return this.currentTargetId === 'TARGET_GLOBAL';
  }

  /**
   * Transiciona suavemente via GPU para um alvo de CAMERA_TARGETS
   */
  goTo(targetKey, onComplete = null) {
    const target = CAMERA_TARGETS[targetKey];
    if (!target) {
      console.warn(`[CameraController] Alvo desconhecido: ${targetKey}`);
      return;
    }

    // Ao trocar de módulo, restaura o card lateral aberto
    this.isCardPeeked = false;
    this.currentTargetId = targetKey;
    this.notifyChange(targetKey, false);
    this.applyStageTransform(targetKey, true, onComplete);
  }

  resetOverview(onComplete = null) {
    this.isCardPeeked = false;
    this.goTo('TARGET_GLOBAL', onComplete);
  }
}
