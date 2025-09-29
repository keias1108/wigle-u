const THREE = window.THREE;

export class GPUComputationRenderer {
  constructor(sizeX, sizeY, renderer) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.renderer = renderer;

    this.passThruShader = this.#createPassThroughShader();
    this.variables = [];
    this.currentTextureIndex = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.camera.position.z = 1;

    this.passThruUniforms = {
      passTexture: { value: null },
    };

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.passThruShader,
    );
    this.scene.add(this.mesh);
  }

  createTexture() {
    const data = new Float32Array(this.sizeX * this.sizeY * 4);
    const texture = new THREE.DataTexture(
      data,
      this.sizeX,
      this.sizeY,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.needsUpdate = true;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  addVariable(variableName, fragmentShader, initialTexture) {
    const material = new THREE.ShaderMaterial({
      fragmentShader,
      vertexShader: this.#getPassThroughVertexShader(),
    });

    const variable = {
      name: variableName,
      renderTargets: [],
      material,
      dependencies: [],
    };

    for (let i = 0; i < 2; i++) {
      const renderTarget = new THREE.WebGLRenderTarget(this.sizeX, this.sizeY, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
      });
      variable.renderTargets.push(renderTarget);
    }

    this.renderTexture(initialTexture, variable.renderTargets[0]);
    this.renderTexture(initialTexture, variable.renderTargets[1]);

    this.variables.push(variable);
    return variable;
  }

  setVariableDependencies(variable, dependencies) {
    variable.dependencies = dependencies;
  }

  init() {
    return null;
  }

  compute() {
    const currentTextureIndex = this.currentTextureIndex;
    const nextTextureIndex = (currentTextureIndex + 1) % 2;

    for (let i = 0; i < this.variables.length; i++) {
      const variable = this.variables[i];

      for (let d = 0; d < variable.dependencies.length; d++) {
        const dependency = variable.dependencies[d];
        const name = dependency.name;
        variable.material.uniforms[name] = {
          value: dependency.renderTargets[currentTextureIndex].texture,
        };
      }

      this.mesh.material = variable.material;
      this.renderer.setRenderTarget(variable.renderTargets[nextTextureIndex]);
      this.renderer.render(this.scene, this.camera);
    }

    this.renderer.setRenderTarget(null);
    this.currentTextureIndex = nextTextureIndex;
  }

  getCurrentRenderTarget(variable) {
    return variable.renderTargets[this.currentTextureIndex];
  }

  renderTexture(texture, renderTarget) {
    this.passThruUniforms.passTexture.value = texture;
    this.mesh.material = this.passThruShader;
    this.renderer.setRenderTarget(renderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  #createPassThroughShader() {
    return new THREE.ShaderMaterial({
      uniforms: this.passThruUniforms,
      vertexShader: this.#getPassThroughVertexShader(),
      fragmentShader: this.#getPassThroughFragmentShader(),
    });
  }

  #getPassThroughVertexShader() {
    return `
                    void main() {
                        gl_Position = vec4(position, 1.0);
                    }
                `;
  }

  #getPassThroughFragmentShader() {
    return `
                    uniform sampler2D passTexture;
                    void main() {
                        vec2 uv = gl_FragCoord.xy / vec2(${this.sizeX}.0, ${this.sizeY}.0);
                        gl_FragColor = texture2D(passTexture, uv);
                    }
                `;
  }
}
