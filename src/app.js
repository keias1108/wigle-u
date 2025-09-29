import {
  DEFAULT_PARAMS,
  SIMULATION_SIZE,
  INITIAL_CANVAS_WIDTH,
  INITIAL_CANVAS_HEIGHT,
  PARAM_CONTROL_IDS,
  INTERACTION_MODES,
  INTERACTION_RADIUS,
  CHART_HISTORY_LENGTH,
} from './config.js';
import { getLifecycleShader } from './shaders.js';
import { GPUComputationRenderer } from './gpuComputationRenderer.js';

const THREE = window.THREE;

export class EnergyLifeSimulation {
  constructor({
    canvasSelector = '#canvas',
    containerSelector = '#canvasContainer',
    controlsSelector = '#controls',
    chartCanvasSelector = '#chartCanvas',
  } = {}) {
    this.canvasSelector = canvasSelector;
    this.containerSelector = containerSelector;
    this.controlsSelector = controlsSelector;
    this.chartCanvasSelector = chartCanvasSelector;

    this.params = { ...DEFAULT_PARAMS };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.computeRenderer = null;
    this.computeVariables = {};
    this.material = null;

    this.isPaused = false;
    this.speedMultiplier = 1;
    this.frameCount = 0;
    this.lastTime = performance.now();

    this.interactionTexture = null;
    this.interactionMode = 'energy';
    this.isMouseDown = false;
    this.mousePos = { x: 0, y: 0 };

    this.chartHistory = [];
    this.downsamplePasses = [];
    this.downsampleScene = null;
    this.downsampleCamera = null;
    this.downsampleMesh = null;
    this.averageBuffer = null;
    this.chartCtx = null;

    this.canvasWidth = INITIAL_CANVAS_WIDTH;
    this.canvasHeight = INITIAL_CANVAS_HEIGHT;

    this.dom = {};

    this.animate = this.animate.bind(this);
  }

  init() {
    this.#cacheDom();
    this.#setupCanvas();
    this.#setupRenderer();
    this.#initComputeRenderer();
    this.#setupDisplay();
    this.#setupControls();
    this.#setupChart();
    this.#setupInteraction();
    this.#setupKeyboard();
    this.#setupResize();
    requestAnimationFrame(this.animate);
  }

  animate() {
    requestAnimationFrame(this.animate);

    if (!this.isPaused && this.speedMultiplier > 0) {
      for (let i = 0; i < this.speedMultiplier; i++) {
        this.computeRenderer.compute();
      }

      this.#updateInteractionTexture();

      const currentRenderTarget = this.computeRenderer.getCurrentRenderTarget(
        this.computeVariables.field,
      );

      const average = this.#computeAverage(currentRenderTarget.texture);
      this.computeVariables.field.material.uniforms.globalAverage.value =
        average;
      this.#updateAverageEnergy(average);

      this.material.uniforms.fieldTexture.value = currentRenderTarget.texture;
    }

    this.renderer.render(this.scene, this.camera);
    this.#updateFps();
  }

  #cacheDom() {
    this.dom.canvas = document.querySelector(this.canvasSelector);
    this.dom.container = document.querySelector(this.containerSelector);
    this.dom.controls = document.querySelector(this.controlsSelector);
    this.dom.chartCanvas = document.querySelector(this.chartCanvasSelector);
    this.dom.toggleControls = document.getElementById('toggleControls');
    this.dom.savePreset = document.getElementById('savePreset');
    this.dom.loadPreset = document.getElementById('loadPreset');
    this.dom.speedButtons = Array.from(document.querySelectorAll('.speed-btn'));
    this.dom.modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
    this.dom.fpsLabel = document.getElementById('fps');
    this.dom.avgLabel = document.getElementById('avgEnergy');
    this.dom.resizeHandles =
      this.dom.container.querySelectorAll('.resize-handle');
    this.dom.presetButtons = document.querySelector('.preset-buttons');
  }

  #setupCanvas() {
    this.dom.container.style.width = `${this.canvasWidth}px`;
    this.dom.container.style.height = `${this.canvasHeight}px`;
  }

  #setupRenderer() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.dom.canvas,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
  }

  #initComputeRenderer() {
    this.computeRenderer = new GPUComputationRenderer(
      SIMULATION_SIZE,
      SIMULATION_SIZE,
      this.renderer,
    );

    const initialTexture = this.computeRenderer.createTexture();
    this.#seedPattern(initialTexture);

    this.interactionTexture = this.computeRenderer.createTexture();
    this.#clearTexture(this.interactionTexture);

    const fieldVariable = this.computeRenderer.addVariable(
      'field',
      getLifecycleShader(),
      initialTexture,
    );

    fieldVariable.material.uniforms = {
      innerRadius: { value: this.params.innerRadius },
      innerStrength: { value: this.params.innerStrength },
      outerRadius: { value: this.params.outerRadius },
      outerStrength: { value: this.params.outerStrength },
      growthCenter: { value: this.params.growthCenter },
      growthWidth: { value: this.params.growthWidth },
      growthRate: { value: this.params.growthRate },
      suppressionFactor: { value: this.params.suppressionFactor },
      globalAverage: { value: 0.0 },
      decayRate: { value: this.params.decayRate },
      diffusionRate: { value: this.params.diffusionRate },
      fissionThreshold: { value: this.params.fissionThreshold },
      instabilityFactor: { value: this.params.instabilityFactor },
      interactionTexture: { value: this.interactionTexture },
      texelSize: {
        value: new THREE.Vector2(1.0 / SIMULATION_SIZE, 1.0 / SIMULATION_SIZE),
      },
    };

    this.computeRenderer.setVariableDependencies(fieldVariable, [
      fieldVariable,
    ]);
    this.computeVariables.field = fieldVariable;

    const error = this.computeRenderer.init();
    if (error !== null) {
      console.error(error);
    }
  }

  #setupDisplay() {
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        fieldTexture: { value: null },
      },
      vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = vec4(position, 1.0);
                    }
                `,
      fragmentShader: `
                    uniform sampler2D fieldTexture;
                    varying vec2 vUv;
                    
                    vec3 energyGradient(float energy) {
                        vec3 color;
                        
                        if (energy < 0.1) {
                            color = mix(vec3(0.0, 0.0, 0.0), vec3(0.0, 0.0, 0.2), energy * 10.0);
                        } else if (energy < 0.3) {
                            color = mix(vec3(0.0, 0.0, 0.2), vec3(0.0, 0.3, 0.8), (energy - 0.1) * 5.0);
                        } else if (energy < 0.5) {
                            color = mix(vec3(0.0, 0.3, 0.8), vec3(0.0, 0.8, 1.0), (energy - 0.3) * 5.0);
                        } else if (energy < 0.7) {
                            color = mix(vec3(0.0, 0.8, 1.0), vec3(0.2, 1.0, 0.3), (energy - 0.5) * 5.0);
                        } else if (energy < 0.85) {
                            color = mix(vec3(0.2, 1.0, 0.3), vec3(1.0, 1.0, 0.0), (energy - 0.7) * 6.67);
                        } else {
                            color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 1.0), (energy - 0.85) * 6.67);
                            color += vec3(0.2) * sin(energy * 50.0);
                        }
                        
                        color += energy * 0.15;
                        
                        return color;
                    }
                    
                    void main() {
                        float energy = texture2D(fieldTexture, vUv).x;
                        vec3 color = energyGradient(energy);
                        gl_FragColor = vec4(color, 1.0);
                    }
                `,
    });

    const mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(mesh);
  }

  #setupControls() {
    if (this.dom.toggleControls) {
      this.dom.toggleControls.addEventListener('click', () => {
        this.dom.controls.classList.toggle('collapsed');
      });
    }

    PARAM_CONTROL_IDS.forEach((param) => {
      const slider = document.getElementById(param);
      const input = document.getElementById(`${param}Value`);
      if (!slider || !input) return;

      const updateValue = (value) => {
        const numeric = parseFloat(value);
        if (Number.isNaN(numeric)) return;
        this.params[param] = numeric;
        slider.value = numeric;
        input.value = numeric;

        if (this.computeVariables.field?.material?.uniforms[param]) {
          this.computeVariables.field.material.uniforms[param].value = numeric;
        }
      };

      updateValue(this.params[param]);

      slider.addEventListener('input', (event) =>
        updateValue(event.target.value),
      );
      input.addEventListener('input', (event) =>
        updateValue(event.target.value),
      );
      slider.addEventListener('wheel', (event) => {
        event.preventDefault();
        const step = parseFloat(slider.step) || 0.01;
        const delta = event.deltaY > 0 ? -step : step;
        const nextValue = Math.max(
          parseFloat(slider.min),
          Math.min(
            parseFloat(slider.max),
            parseFloat(slider.value) + delta * 10,
          ),
        );
        updateValue(nextValue);
      });
    });

    this.dom.speedButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.dom.speedButtons.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        this.speedMultiplier = parseInt(button.dataset.speed, 10);
        this.isPaused = this.speedMultiplier === 0;
      });
    });

    this.dom.modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.dom.modeButtons.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        const mode = button.dataset.mode;
        if (INTERACTION_MODES.includes(mode)) {
          this.interactionMode = mode;
        }
      });
    });

    if (this.dom.savePreset) {
      this.dom.savePreset.addEventListener('click', () => {
        const preset = JSON.stringify(this.params);
        localStorage.setItem('energyLifePreset', preset);
        alert('Preset saved!');
      });
    }

    if (this.dom.loadPreset) {
      this.dom.loadPreset.addEventListener('click', () => {
        const preset = localStorage.getItem('energyLifePreset');
        if (!preset) return;

        const loaded = JSON.parse(preset);
        Object.keys(loaded).forEach((key) => {
          if (!(key in this.params)) return;
          this.params[key] = loaded[key];
          const slider = document.getElementById(key);
          const input = document.getElementById(`${key}Value`);
          if (slider && input) {
            slider.value = loaded[key];
            input.value = loaded[key];
          }
          if (this.computeVariables.field?.material?.uniforms[key]) {
            this.computeVariables.field.material.uniforms[key].value =
              loaded[key];
          }
        });
        alert('Preset loaded!');
      });
    }
  }

  #setupChart() {
    if (!this.dom.chartCanvas) return;
    this.chartCtx = this.dom.chartCanvas.getContext('2d');
    this.dom.chartCanvas.width = 280;
    this.dom.chartCanvas.height = 130;
  }

  #updateChart(avgEnergy) {
    if (!this.chartCtx) return;
    this.chartHistory.push(avgEnergy);
    if (this.chartHistory.length > CHART_HISTORY_LENGTH) {
      this.chartHistory.shift();
    }

    const { width, height } = this.chartCtx.canvas;
    this.chartCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    this.chartCtx.fillRect(0, 0, width, height);

    this.chartCtx.strokeStyle = '#00ffcc';
    this.chartCtx.lineWidth = 2;
    this.chartCtx.beginPath();

    for (let i = 0; i < this.chartHistory.length; i++) {
      const x = (i / CHART_HISTORY_LENGTH) * width;
      const y = height - this.chartHistory[i] * height;
      if (i === 0) {
        this.chartCtx.moveTo(x, y);
      } else {
        this.chartCtx.lineTo(x, y);
      }
    }

    this.chartCtx.stroke();

    this.chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.chartCtx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height;
      this.chartCtx.beginPath();
      this.chartCtx.moveTo(0, y);
      this.chartCtx.lineTo(width, y);
      this.chartCtx.stroke();
    }
  }

  #setupInteraction() {
    this.dom.canvas.addEventListener('mousedown', (event) => {
      this.isMouseDown = true;
      this.#updateMousePos(event);
    });

    this.dom.canvas.addEventListener('mousemove', (event) => {
      if (this.isMouseDown) {
        this.#updateMousePos(event);
      }
    });

    const endInteraction = () => {
      this.isMouseDown = false;
      this.#clearTexture(this.interactionTexture);
      this.#updateInteractionTexture();
    };

    this.dom.canvas.addEventListener('mouseup', endInteraction);
    this.dom.canvas.addEventListener('mouseleave', endInteraction);
  }

  #setupKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        this.isPaused = !this.isPaused;
        this.speedMultiplier = this.isPaused ? 0 : 1;
        this.dom.speedButtons.forEach((btn) => {
          btn.classList.toggle(
            'active',
            parseInt(btn.dataset.speed, 10) === this.speedMultiplier,
          );
        });
      }
    });
  }

  #setupResize() {
    let isResizing = false;
    let currentHandle = null;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    this.dom.resizeHandles.forEach((handle) => {
      handle.addEventListener('mousedown', (event) => {
        isResizing = true;
        currentHandle = handle;
        startX = event.clientX;
        startY = event.clientY;
        startWidth = this.canvasWidth;
        startHeight = this.canvasHeight;
        event.preventDefault();
      });
    });

    document.addEventListener('mousemove', (event) => {
      if (!isResizing) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (currentHandle.classList.contains('right')) {
        this.canvasWidth = Math.max(
          400,
          Math.min(window.innerWidth - 100, startWidth + deltaX),
        );
      } else if (currentHandle.classList.contains('bottom')) {
        this.canvasHeight = Math.max(
          300,
          Math.min(window.innerHeight - 100, startHeight + deltaY),
        );
      } else if (currentHandle.classList.contains('corner')) {
        this.canvasWidth = Math.max(
          400,
          Math.min(window.innerWidth - 100, startWidth + deltaX),
        );
        this.canvasHeight = Math.max(
          300,
          Math.min(window.innerHeight - 100, startHeight + deltaY),
        );
      }

      this.dom.container.style.width = `${this.canvasWidth}px`;
      this.dom.container.style.height = `${this.canvasHeight}px`;
      this.renderer.setSize(this.canvasWidth, this.canvasHeight);
    });

    document.addEventListener('mouseup', () => {
      isResizing = false;
      currentHandle = null;
    });
  }

  #updateMousePos(event) {
    const rect = this.dom.canvas.getBoundingClientRect();
    this.mousePos.x = (event.clientX - rect.left) / rect.width;
    this.mousePos.y = 1.0 - (event.clientY - rect.top) / rect.height;
  }

  #computeAverage(fieldTexture) {
    this.#ensureDownsamplePipeline();

    let currentTexture = fieldTexture;
    for (const pass of this.downsamplePasses) {
      pass.material.uniforms.inputTexture.value = currentTexture;
      pass.material.uniforms.texelSize.value.set(
        1 / pass.inputSize,
        1 / pass.inputSize,
      );
      this.downsampleMesh.material = pass.material;
      this.renderer.setRenderTarget(pass.renderTarget);
      this.renderer.render(this.downsampleScene, this.downsampleCamera);
      currentTexture = pass.renderTarget.texture;
    }

    const lastPass = this.downsamplePasses[this.downsamplePasses.length - 1];
    this.renderer.setRenderTarget(null);
    this.renderer.readRenderTargetPixels(
      lastPass.renderTarget,
      0,
      0,
      1,
      1,
      this.averageBuffer,
    );

    return this.averageBuffer[0];
  }

  #ensureDownsamplePipeline() {
    if (this.downsamplePasses.length > 0) {
      return;
    }

    this.downsampleScene = new THREE.Scene();
    this.downsampleCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.downsampleMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial(),
    );
    this.downsampleScene.add(this.downsampleMesh);

    let size = SIMULATION_SIZE;
    while (size > 1) {
      const outputSize = Math.max(1, size >> 1);
      const renderTarget = new THREE.WebGLRenderTarget(outputSize, outputSize, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      });
      renderTarget.texture.wrapS = THREE.ClampToEdgeWrapping;
      renderTarget.texture.wrapT = THREE.ClampToEdgeWrapping;

      const material = new THREE.ShaderMaterial({
        uniforms: {
          inputTexture: { value: null },
          texelSize: { value: new THREE.Vector2(1 / size, 1 / size) },
        },
        vertexShader: `
                    void main() {
                        gl_Position = vec4(position, 1.0);
                    }
                `,
        fragmentShader: `
                    uniform sampler2D inputTexture;
                    uniform vec2 texelSize;
                    void main() {
                        vec2 coord = gl_FragCoord.xy - vec2(0.5);
                        vec2 base = coord * 2.0;
                        vec2 uv00 = (base + vec2(0.5, 0.5)) * texelSize;
                        vec2 uv10 = (base + vec2(1.5, 0.5)) * texelSize;
                        vec2 uv01 = (base + vec2(0.5, 1.5)) * texelSize;
                        vec2 uv11 = (base + vec2(1.5, 1.5)) * texelSize;
                        float sum = (
                            texture2D(inputTexture, uv00).x +
                            texture2D(inputTexture, uv10).x +
                            texture2D(inputTexture, uv01).x +
                            texture2D(inputTexture, uv11).x
                        ) * 0.25;
                        gl_FragColor = vec4(sum, 0.0, 0.0, 1.0);
                    }
                `,
      });

      this.downsamplePasses.push({
        inputSize: size,
        outputSize,
        renderTarget,
        material,
      });

      size = outputSize;
    }

    this.averageBuffer = new Float32Array(4);
  }

  #updateInteractionTexture() {
    if (this.isMouseDown) {
      const data = this.interactionTexture.image.data;
      const centerX = Math.floor(this.mousePos.x * SIMULATION_SIZE);
      const centerY = Math.floor(this.mousePos.y * SIMULATION_SIZE);
      const radiusSquared = INTERACTION_RADIUS * INTERACTION_RADIUS;
      const minX = Math.max(0, centerX - INTERACTION_RADIUS);
      const maxX = Math.min(SIMULATION_SIZE - 1, centerX + INTERACTION_RADIUS);
      const minY = Math.max(0, centerY - INTERACTION_RADIUS);
      const maxY = Math.min(SIMULATION_SIZE - 1, centerY + INTERACTION_RADIUS);

      for (let y = minY; y <= maxY; y++) {
        const dy = y - centerY;
        for (let x = minX; x <= maxX; x++) {
          const dx = x - centerX;
          const distSq = dx * dx + dy * dy;
          if (distSq >= radiusSquared) continue;

          const intensity = 1.0 - Math.sqrt(distSq) / INTERACTION_RADIUS;
          const i = (y * SIMULATION_SIZE + x) * 4;

          if (this.interactionMode === 'energy') {
            data[i] = intensity;
            data[i + 1] = 0;
            data[i + 2] = 0;
          } else if (this.interactionMode === 'attract') {
            data[i] = 0;
            data[i + 1] = intensity;
            data[i + 2] = 0;
          } else if (this.interactionMode === 'repel') {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = intensity;
          }
        }
      }

      this.interactionTexture.needsUpdate = true;
    }

    if (this.computeVariables.field) {
      this.computeVariables.field.material.uniforms.interactionTexture.value =
        this.interactionTexture;
    }
  }

  #seedPattern(texture) {
    const data = texture.image.data;
    for (let i = 0; i < data.length; i += 4) {
      const value = Math.random() * 0.05;
      data[i] = value;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 1;
    }
  }

  #clearTexture(texture) {
    const data = texture.image.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 1;
    }
  }

  #updateAverageEnergy(average) {
    if (this.dom.avgLabel) {
      this.dom.avgLabel.textContent = `Avg: ${average.toFixed(3)}`;
    }
    this.#updateChart(average);
  }

  #updateFps() {
    this.frameCount += 1;
    const currentTime = performance.now();
    if (currentTime - this.lastTime > 1000) {
      const fps = (this.frameCount * 1000) / (currentTime - this.lastTime);
      if (this.dom.fpsLabel) {
        this.dom.fpsLabel.textContent = `FPS: ${fps.toFixed(1)}`;
      }
      this.frameCount = 0;
      this.lastTime = currentTime;
    }
  }
}
