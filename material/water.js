this.defaultName = "Water";

this.load = function (e) {
    this.threeObj = new THREE.MeshStandardMaterial();
    this.properties.load(e && e.properties);
    this.initWater();
};

this.unload = function () {
    this.threeObj.dispose();
    if (this.initialPhaseTexture) this.initialPhaseTexture.dispose();
    if (this.initialSpectrumRenderTarget) this.initialSpectrumRenderTarget.dispose();
    if (this.pingPhaseRenderTarget) this.pingPhaseRenderTarget.dispose();
    if (this.pongPhaseRenderTarget) this.pongPhaseRenderTarget.dispose();
    if (this.spectrumRenderTarget) this.spectrumRenderTarget.dispose();
    if (this.displacementMapRenderTarget) this.displacementMapRenderTarget.dispose();
    if (this.normalMapRenderTarget) this.normalMapRenderTarget.dispose();
    if (this.pingTransformRenderTarget) this.pingTransformRenderTarget.dispose();
    if (this.pongTransformRenderTarget) this.pongTransformRenderTarget.dispose();

    if (this.initialSpectrumMaterial) this.initialSpectrumMaterial.dispose();
    if (this.phaseMaterial) this.phaseMaterial.dispose();
    if (this.spectrumMaterial) this.spectrumMaterial.dispose();
    if (this.horizontalSubtransformMaterial) this.horizontalSubtransformMaterial.dispose();
    if (this.verticalSubtransformMaterial) this.verticalSubtransformMaterial.dispose();
    if (this.normalMapMaterial) this.normalMapMaterial.dispose();
};

this.toJSON = function () {
    return { type: this.type, properties: this.properties };
};

const RESOLUTION = 512;
const log2 = function (number) {
    return Math.log(number) / Math.log(2);
};

this.initWater = function() {
    // We cannot definitively check Float extensions before we get a renderer.
    // Three.js manages these internally, so we assume FloatType is supported,
    // and if the device lacks OES_texture_float, three.js handles warning.

    let type = THREE.FloatType;
    let format = THREE.RGBAFormat;

    this._createRenderTargets = function() {
        if (this.initialSpectrumRenderTarget) this.initialSpectrumRenderTarget.dispose();
        if (this.pingPhaseRenderTarget) this.pingPhaseRenderTarget.dispose();
        if (this.pongPhaseRenderTarget) this.pongPhaseRenderTarget.dispose();
        if (this.spectrumRenderTarget) this.spectrumRenderTarget.dispose();
        if (this.displacementMapRenderTarget) this.displacementMapRenderTarget.dispose();
        if (this.normalMapRenderTarget) this.normalMapRenderTarget.dispose();
        if (this.pingTransformRenderTarget) this.pingTransformRenderTarget.dispose();
        if (this.pongTransformRenderTarget) this.pongTransformRenderTarget.dispose();

        let createRenderTarget = function() {
            return new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, {
                wrapS: THREE.ClampToEdgeWrapping,
                wrapT: THREE.ClampToEdgeWrapping,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: format,
                type: type,
                stencilBuffer: false,
                depthBuffer: false
            });
        };

        this.initialSpectrumRenderTarget = createRenderTarget();
        this.initialSpectrumRenderTarget.texture.wrapS = THREE.RepeatWrapping;
        this.initialSpectrumRenderTarget.texture.wrapT = THREE.RepeatWrapping;

        this.pingPhaseRenderTarget = createRenderTarget();
        this.pongPhaseRenderTarget = createRenderTarget();

        this.spectrumRenderTarget = createRenderTarget();

        this.pingTransformRenderTarget = createRenderTarget();
        this.pongTransformRenderTarget = createRenderTarget();

        this.displacementMapRenderTarget = createRenderTarget();
        this.displacementMapRenderTarget.texture.minFilter = THREE.LinearFilter;
        this.displacementMapRenderTarget.texture.magFilter = THREE.LinearFilter;

        this.normalMapRenderTarget = createRenderTarget();
        this.normalMapRenderTarget.texture.minFilter = THREE.LinearFilter;
        this.normalMapRenderTarget.texture.magFilter = THREE.LinearFilter;

        if (this.spectrumMaterial) {
            this.spectrumMaterial.uniforms.u_initialSpectrum.value = this.initialSpectrumRenderTarget.texture;
            this.normalMapMaterial.uniforms.u_displacementMap.value = this.displacementMapRenderTarget.texture;
        }

        this._lastSize = null; // force initial render
        this.firstFrameComplete = false;
    };
    this._createRenderTargets();

    // Initialize phase texture with random values
    let phaseArray = new Float32Array(RESOLUTION * RESOLUTION * 4);
    for (let i = 0; i < RESOLUTION; i++) {
        for (let j = 0; j < RESOLUTION; j++) {
            phaseArray[i * RESOLUTION * 4 + j * 4] = Math.random() * 2.0 * Math.PI;
            phaseArray[i * RESOLUTION * 4 + j * 4 + 1] = 0;
            phaseArray[i * RESOLUTION * 4 + j * 4 + 2] = 0;
            phaseArray[i * RESOLUTION * 4 + j * 4 + 3] = 0;
        }
    }
    let phaseTextureType = type === THREE.UnsignedByteType ? THREE.FloatType : type; // If we lack float render targets, we might still have float datatextures
    let phaseTexture = new THREE.DataTexture(phaseArray, RESOLUTION, RESOLUTION, THREE.RGBAFormat, phaseTextureType);
    phaseTexture.needsUpdate = true;
    this.initialPhaseTexture = phaseTexture;

    // Shaders
    const FULLSCREEN_VERTEX_SOURCE = [
        'varying vec2 v_coordinates;',
        'void main (void) {',
            'v_coordinates = uv;',
            'gl_Position = vec4(position, 1.0);',
        '}',
    ].join('\n');

    const INITIAL_SPECTRUM_FRAGMENT_SOURCE = [
        'precision highp float;',
        'const float PI = 3.14159265359;',
        'const float G = 9.81;',
        'const float KM = 370.0;',
        'const float CM = 0.23;',
        'uniform vec2 u_wind;',
        'uniform float u_resolution;',
        'uniform float u_size;',
        'varying vec2 v_coordinates;',
        'float square (float x) {',
            'return x * x;',
        '}',
        'float omega (float k) {',
            'return sqrt(G * k * (1.0 + square(k / KM)));',
        '}',
        'float tanh (float x) {',
            'return (1.0 - exp(-2.0 * x)) / (1.0 + exp(-2.0 * x));',
        '}',
        'void main (void) {',
            'vec2 coordinates = gl_FragCoord.xy - 0.5;',
            'float n = (coordinates.x < u_resolution * 0.5) ? coordinates.x : coordinates.x - u_resolution;',
            'float m = (coordinates.y < u_resolution * 0.5) ? coordinates.y : coordinates.y - u_resolution;',
            'vec2 waveVector = (2.0 * PI * vec2(n, m)) / u_size;',
            'float k = length(waveVector);',
            'float U10 = length(u_wind);',
            'float Omega = 0.84;',
            'float kp = G * square(Omega / U10);',
            'float c = omega(k) / k;',
            'float cp = omega(kp) / kp;',
            'float Lpm = exp(-1.25 * square(kp / k));',
            'float gamma = 1.7;',
            'float sigma = 0.08 * (1.0 + 4.0 * pow(Omega, -3.0));',
            'float Gamma = exp(-square(sqrt(k / kp) - 1.0) / 2.0 * square(sigma));',
            'float Jp = pow(gamma, Gamma);',
            'float Fp = Lpm * Jp * exp(-Omega / sqrt(10.0) * (sqrt(k / kp) - 1.0));',
            'float alphap = 0.006 * sqrt(Omega);',
            'float Bl = 0.5 * alphap * cp / c * Fp;',
            'float z0 = 0.000037 * square(U10) / G * pow(U10 / cp, 0.9);',
            'float uStar = 0.41 * U10 / log(10.0 / z0);',
            'float alpham = 0.01 * ((uStar < CM) ? (1.0 + log(uStar / CM)) : (1.0 + 3.0 * log(uStar / CM)));',
            'float Fm = exp(-0.25 * square(k / KM - 1.0));',
            'float Bh = 0.5 * alpham * CM / c * Fm * Lpm;',
            'float a0 = log(2.0) / 4.0;',
            'float am = 0.13 * uStar / CM;',
            'float Delta = tanh(a0 + 4.0 * pow(c / cp, 2.5) + am * pow(CM / c, 2.5));',
            'float cosPhi = dot(normalize(u_wind), normalize(waveVector));',
            'float S = (1.0 / (2.0 * PI)) * pow(k, -4.0) * (Bl + Bh) * (1.0 + Delta * (2.0 * cosPhi * cosPhi - 1.0));',
            'float dk = 2.0 * PI / u_size;',
            'float h = sqrt(S / 2.0) * dk;',
            'if (waveVector.x == 0.0 && waveVector.y == 0.0) {',
                'h = 0.0;',
            '}',
            'gl_FragColor = vec4(h, 0.0, 0.0, 0.0);',
        '}'
    ].join('\n');

    const PHASE_FRAGMENT_SOURCE = [
        'precision highp float;',
        'const float PI = 3.14159265359;',
        'const float G = 9.81;',
        'const float KM = 370.0;',
        'varying vec2 v_coordinates;',
        'uniform sampler2D u_phases;',
        'uniform float u_deltaTime;',
        'uniform float u_resolution;',
        'uniform float u_size;',
        'float omega (float k) {',
            'return sqrt(G * k * (1.0 + k * k / KM * KM));',
        '}',
        'void main (void) {',
            'float deltaTime = 1.0 / 60.0;',
            'vec2 coordinates = gl_FragCoord.xy - 0.5;',
            'float n = (coordinates.x < u_resolution * 0.5) ? coordinates.x : coordinates.x - u_resolution;',
            'float m = (coordinates.y < u_resolution * 0.5) ? coordinates.y : coordinates.y - u_resolution;',
            'vec2 waveVector = (2.0 * PI * vec2(n, m)) / u_size;',
            'float phase = texture2D(u_phases, v_coordinates).r;',
            'float deltaPhase = omega(length(waveVector)) * u_deltaTime;',
            'phase = mod(phase + deltaPhase, 2.0 * PI);',
            'gl_FragColor = vec4(phase, 0.0, 0.0, 0.0);',
        '}'
    ].join('\n');

    const SPECTRUM_FRAGMENT_SOURCE = [
        'precision highp float;',
        'const float PI = 3.14159265359;',
        'const float G = 9.81;',
        'const float KM = 370.0;',
        'varying vec2 v_coordinates;',
        'uniform float u_size;',
        'uniform float u_resolution;',
        'uniform sampler2D u_phases;',
        'uniform sampler2D u_initialSpectrum;',
        'uniform float u_choppiness;',
        'vec2 multiplyComplex (vec2 a, vec2 b) {',
            'return vec2(a[0] * b[0] - a[1] * b[1], a[1] * b[0] + a[0] * b[1]);',
        '}',
        'vec2 multiplyByI (vec2 z) {',
            'return vec2(-z[1], z[0]);',
        '}',
        'float omega (float k) {',
            'return sqrt(G * k * (1.0 + k * k / KM * KM));',
        '}',
        'void main (void) {',
            'vec2 coordinates = gl_FragCoord.xy - 0.5;',
            'float n = (coordinates.x < u_resolution * 0.5) ? coordinates.x : coordinates.x - u_resolution;',
            'float m = (coordinates.y < u_resolution * 0.5) ? coordinates.y : coordinates.y - u_resolution;',
            'vec2 waveVector = (2.0 * PI * vec2(n, m)) / u_size;',
            'float phase = texture2D(u_phases, v_coordinates).r;',
            'vec2 phaseVector = vec2(cos(phase), sin(phase));',
            'vec2 h0 = texture2D(u_initialSpectrum, v_coordinates).rg;',
            'vec2 h0Star = texture2D(u_initialSpectrum, vec2(1.0 - v_coordinates + 1.0 / u_resolution)).rg;',
            'h0Star.y *= -1.0;',
            'vec2 h = multiplyComplex(h0, phaseVector) + multiplyComplex(h0Star, vec2(phaseVector.x, -phaseVector.y));',
            'vec2 hX = -multiplyByI(h * (waveVector.x / length(waveVector))) * u_choppiness;',
            'vec2 hZ = -multiplyByI(h * (waveVector.y / length(waveVector))) * u_choppiness;',
            'if (waveVector.x == 0.0 && waveVector.y == 0.0) {',
                'h = vec2(0.0);',
                'hX = vec2(0.0);',
                'hZ = vec2(0.0);',
            '}',
            'gl_FragColor = vec4(hX + multiplyByI(h), hZ);',
        '}'
    ].join('\n');

    const SUBTRANSFORM_FRAGMENT_SOURCE = [
        'precision highp float;',
        'const float PI = 3.14159265359;',
        'uniform sampler2D u_input;',
        'uniform float u_transformSize;',
        'uniform float u_subtransformSize;',
        'varying vec2 v_coordinates;',
        'vec2 multiplyComplex (vec2 a, vec2 b) {',
            'return vec2(a[0] * b[0] - a[1] * b[1], a[1] * b[0] + a[0] * b[1]);',
        '}',
        'void main (void) {',
            '#ifdef HORIZONTAL',
            'float index = v_coordinates.x * u_transformSize - 0.5;',
            '#else',
            'float index = v_coordinates.y * u_transformSize - 0.5;',
            '#endif',
            'float evenIndex = floor(index / u_subtransformSize) * (u_subtransformSize * 0.5) + mod(index, u_subtransformSize * 0.5);',
            '#ifdef HORIZONTAL',
            'vec4 even = texture2D(u_input, vec2(evenIndex + 0.5, gl_FragCoord.y) / u_transformSize).rgba;',
            'vec4 odd = texture2D(u_input, vec2(evenIndex + u_transformSize * 0.5 + 0.5, gl_FragCoord.y) / u_transformSize).rgba;',
            '#else',
            'vec4 even = texture2D(u_input, vec2(gl_FragCoord.x, evenIndex + 0.5) / u_transformSize).rgba;',
            'vec4 odd = texture2D(u_input, vec2(gl_FragCoord.x, evenIndex + u_transformSize * 0.5 + 0.5) / u_transformSize).rgba;',
            '#endif',
            'float twiddleArgument = -2.0 * PI * (index / u_subtransformSize);',
            'vec2 twiddle = vec2(cos(twiddleArgument), sin(twiddleArgument));',
            'vec2 outputA = even.xy + multiplyComplex(twiddle, odd.xy);',
            'vec2 outputB = even.zw + multiplyComplex(twiddle, odd.zw);',
            'gl_FragColor = vec4(outputA, outputB);',
        '}'
    ].join('\n');

    const NORMAL_MAP_FRAGMENT_SOURCE = [
        'precision highp float;',
        'varying vec2 v_coordinates;',
        'uniform sampler2D u_displacementMap;',
        'uniform float u_resolution;',
        'uniform float u_size;',
        'void main (void) {',
            'float texel = 1.0 / u_resolution;',
            'float texelSize = u_size / u_resolution;',
            'vec3 center = texture2D(u_displacementMap, v_coordinates).rgb;',
            'vec3 right = vec3(texelSize, 0.0, 0.0) + texture2D(u_displacementMap, v_coordinates + vec2(texel, 0.0)).rgb - center;',
            'vec3 left = vec3(-texelSize, 0.0, 0.0) + texture2D(u_displacementMap, v_coordinates + vec2(-texel, 0.0)).rgb - center;',
            'vec3 top = vec3(0.0, 0.0, -texelSize) + texture2D(u_displacementMap, v_coordinates + vec2(0.0, -texel)).rgb - center;',
            'vec3 bottom = vec3(0.0, 0.0, texelSize) + texture2D(u_displacementMap, v_coordinates + vec2(0.0, texel)).rgb - center;',
            'vec3 topRight = cross(right, top);',
            'vec3 topLeft = cross(top, left);',
            'vec3 bottomLeft = cross(left, bottom);',
            'vec3 bottomRight = cross(bottom, right);',
            'gl_FragColor = vec4(normalize(topRight + topLeft + bottomLeft + bottomRight), 1.0);',
        '}'
    ].join('\n');

    this.initialSpectrumMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_wind: { value: new THREE.Vector2(10.0, 10.0) },
            u_resolution: { value: RESOLUTION },
            u_size: { value: 250.0 }
        },
        vertexShader: FULLSCREEN_VERTEX_SOURCE,
        fragmentShader: INITIAL_SPECTRUM_FRAGMENT_SOURCE,
        depthWrite: false, depthTest: false
    });

    this.phaseMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_phases: { value: phaseTexture },
            u_deltaTime: { value: 0.0 },
            u_resolution: { value: RESOLUTION },
            u_size: { value: 250.0 }
        },
        vertexShader: FULLSCREEN_VERTEX_SOURCE,
        fragmentShader: PHASE_FRAGMENT_SOURCE,
        depthWrite: false, depthTest: false
    });

    this.spectrumMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_size: { value: 250.0 },
            u_resolution: { value: RESOLUTION },
            u_phases: { value: null },
            u_initialSpectrum: { value: this.initialSpectrumRenderTarget.texture },
            u_choppiness: { value: 1.5 }
        },
        vertexShader: FULLSCREEN_VERTEX_SOURCE,
        fragmentShader: SPECTRUM_FRAGMENT_SOURCE,
        depthWrite: false, depthTest: false
    });

    this.horizontalSubtransformMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_input: { value: null },
            u_transformSize: { value: RESOLUTION },
            u_subtransformSize: { value: 0.0 }
        },
        vertexShader: FULLSCREEN_VERTEX_SOURCE,
        fragmentShader: '#define HORIZONTAL \n' + SUBTRANSFORM_FRAGMENT_SOURCE,
        depthWrite: false, depthTest: false
    });

    this.verticalSubtransformMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_input: { value: null },
            u_transformSize: { value: RESOLUTION },
            u_subtransformSize: { value: 0.0 }
        },
        vertexShader: FULLSCREEN_VERTEX_SOURCE,
        fragmentShader: SUBTRANSFORM_FRAGMENT_SOURCE,
        depthWrite: false, depthTest: false
    });

    this.normalMapMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_displacementMap: { value: this.displacementMapRenderTarget.texture },
            u_resolution: { value: RESOLUTION },
            u_size: { value: 250.0 }
        },
        vertexShader: FULLSCREEN_VERTEX_SOURCE,
        fragmentShader: NORMAL_MAP_FRAGMENT_SOURCE,
        depthWrite: false, depthTest: false
    });

    this.fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fullscreenScene = new THREE.Scene();
    this.fullscreenQuad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2));
    this.fullscreenScene.add(this.fullscreenQuad);

    this.pingPhase = true;
    this.lastTime = 0;

    // Apply the custom vertex/fragment shader to this material
    this.threeObj.onBeforeCompile = (shader, renderer) => {
        // THREE r91: onBeforeCompile(shader, renderer)
        // Ensure we capture renderer correctly, if missing use fallback
        this.renderer = renderer || (typeof window !== "undefined" && window.editor && window.editor.playback ? window.editor.playback.renderer : null);
        if (this._lastRenderer !== this.renderer) {
            if (this._createRenderTargets) {
                this._createRenderTargets();
                this._lastRenderer = this.renderer;
            }
        }

        if (this._needsFFTUpdate) {
            this._runFFTSimulation(this.renderer, this._lastTime);
            this._needsFFTUpdate = false;
        }
        // Keep a reference to shader to update textures if recreated
        this._shader = shader;
        shader.uniforms.u_displacementMap = { value: this.displacementMapRenderTarget.texture };
        shader.uniforms.u_normalMap = { value: this.normalMapRenderTarget.texture };
        shader.uniforms.u_geometrySize = { value: 2000.0 };
        shader.uniforms.u_size = { value: 250.0 };

        shader.uniforms.u_oceanColor = { value: new THREE.Color() };
        shader.uniforms.u_skyColor = { value: new THREE.Color() };
        shader.uniforms.u_sunDirection = { value: new THREE.Vector3() };
        shader.uniforms.u_exposure = { value: 0.35 };

        this.threeObj.userData.shader = shader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `
            #include <common>
            uniform sampler2D u_displacementMap;
            uniform float u_geometrySize;
            uniform float u_size;
            varying vec2 v_coordinates;
            varying vec3 v_position;
            varying vec3 v_normal;
            `
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            v_coordinates = uv;
            vec3 displacement = texture2D(u_displacementMap, v_coordinates).rgb * (u_geometrySize / u_size);

            // To incorporate choppiness and vertical displacement around the object's normal,
            // we use the normal for vertical (y), and tangent/bitangent for horizontal (x, z)
            vec3 t = normalize(cross(normal, vec3(0.0, 1.0, 0.0)));
            if (length(t) < 0.0001) t = normalize(cross(normal, vec3(1.0, 0.0, 0.0)));
            vec3 b = normalize(cross(normal, t));

            transformed = transformed + normal * displacement.y + t * displacement.x + b * displacement.z;
            v_position = (modelMatrix * vec4(transformed, 1.0)).xyz;
            v_normal = normalize(normalMatrix * normal);
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `
            #include <common>
            varying vec2 v_coordinates;
            varying vec3 v_position;
            varying vec3 v_normal;

            uniform sampler2D u_displacementMap;
            uniform sampler2D u_normalMap;
            uniform vec3 u_oceanColor;
            uniform vec3 u_skyColor;
            uniform float u_exposure;
            uniform vec3 u_sunDirection;

            vec3 hdr (vec3 color, float exposure) {
                return 1.0 - exp(-color * exposure);
            }
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>

            vec3 mapNormal = texture2D(u_normalMap, v_coordinates).rgb;

            vec3 t = normalize(cross(v_normal, vec3(0.0, 1.0, 0.0)));
            if (length(t) < 0.0001) t = normalize(cross(v_normal, vec3(1.0, 0.0, 0.0)));
            vec3 b = normalize(cross(v_normal, t));
            mat3 tbn = mat3(t, v_normal, b);
            vec3 worldNormal = normalize(tbn * mapNormal);

            vec3 view = normalize(cameraPosition - v_position);

            // Prevent NaN from negative base in pow
            float dotNV = dot(worldNormal, view);
            float fresnel = 0.02 + 0.98 * pow(max(0.0, 1.0 - dotNV), 5.0);
            vec3 sky = fresnel * u_skyColor;

            float diffuse_water = clamp(dot(worldNormal, normalize(u_sunDirection)), 0.0, 1.0);
            vec3 water = (1.0 - fresnel) * u_oceanColor * u_skyColor * diffuse_water;

            vec3 color = sky + water;

            gl_FragColor = vec4(hdr(color, u_exposure), 1.0); // Hardcode opacity to 1.0 for testing
            `
        );
    };
};

this.renderPass = function(renderer, material, renderTarget) {
    this.fullscreenQuad.material = material;
    renderer.render(this.fullscreenScene, this.fullscreenCamera, renderTarget);
};

this.update = function (e) {
    var t = this;
    let renderer = this.renderer || (this.parentLayer && this.parentLayer.pass ? this.parentLayer.pass.renderer : null);

    // Attempt fallback to find renderer if not found directly
    if (!renderer && typeof window !== "undefined" && window.editor && window.editor.playback && window.editor.playback.renderer) {
        renderer = window.editor.playback.renderer;
    }

    // We defer FFT simulation steps until the first valid render pass (which we can catch via onBeforeCompile
    // or by overriding `onBeforeRender` for the shape object if needed).
    // In three.js, `onBeforeRender` supplies the `renderer`, but our water effect is a material.
    // Instead of forcing `this.update` to do WebGL commands without a renderer,
    // we'll flag it for update and do it during rendering when the material gives us a valid WebGL context.
    if (!renderer && this.renderer) {
        renderer = this.renderer; // This is the WebGLRenderer given to us inside onBeforeCompile
    }

if (!renderer) {
        this._needsFFTUpdate = true;
        this._lastTime = e;
        return;
    }

    if (this._lastRenderer !== renderer) {
        if (this._createRenderTargets) {
            this._createRenderTargets();
            if (this._shader) {
                this._shader.uniforms.u_displacementMap.value = this.displacementMapRenderTarget.texture;
                this._shader.uniforms.u_normalMap.value = this.normalMapRenderTarget.texture;
            }
        }
        this._lastRenderer = renderer;
    }

    this._runFFTSimulation(renderer, e);
};

this._runFFTSimulation = function(renderer, e) {
    let time = this.properties.time.get(e);
    let deltaTime = (time - this.lastTime);
    this.lastTime = time;

    let size = this.properties.size.get(e);
    let choppiness = this.properties.choppiness.get(e);
    let wind = this.properties.wind.get(e);

    let changed = this._lastSize !== size || this._lastWindX !== wind[0] || this._lastWindY !== wind[1];
    this._lastSize = size;
    this._lastWindX = wind[0];
    this._lastWindY = wind[1];

    let oldRenderTarget = renderer.getRenderTarget();

    if (changed) {
        this.initialSpectrumMaterial.uniforms.u_wind.value.set(wind[0], wind[1]);
        this.initialSpectrumMaterial.uniforms.u_size.value = size;
        this.renderPass(renderer, this.initialSpectrumMaterial, this.initialSpectrumRenderTarget);
    }

    // In the first frame, use the random phase texture instead of empty render targets
    let phaseTextureIn = this.firstFrameComplete ? (this.pingPhase ? this.pongPhaseRenderTarget.texture : this.pingPhaseRenderTarget.texture) : this.initialPhaseTexture;

    if (!this.firstFrameComplete && this.initialPhaseTexture) {
        this.initialPhaseTexture.needsUpdate = true;
    }

    this.phaseMaterial.uniforms.u_phases.value = phaseTextureIn;
    this.phaseMaterial.uniforms.u_deltaTime.value = deltaTime * this.properties.speed.get(e);
    this.phaseMaterial.uniforms.u_size.value = size;
    this.renderPass(renderer, this.phaseMaterial, this.pingPhase ? this.pingPhaseRenderTarget : this.pongPhaseRenderTarget);

    this.pingPhase = !this.pingPhase;

    this.spectrumMaterial.uniforms.u_phases.value = this.pingPhase ? this.pingPhaseRenderTarget.texture : this.pongPhaseRenderTarget.texture;
    this.spectrumMaterial.uniforms.u_size.value = size;
    this.spectrumMaterial.uniforms.u_choppiness.value = choppiness;
    this.renderPass(renderer, this.spectrumMaterial, this.spectrumRenderTarget);

    var subtransformMaterial = this.horizontalSubtransformMaterial;
    var iterations = log2(RESOLUTION) * 2;
    for (var i = 0; i < iterations; i += 1) {
        if (i === iterations / 2) {
            subtransformMaterial = this.verticalSubtransformMaterial;
        }
        subtransformMaterial.uniforms.u_subtransformSize.value = Math.pow(2,(i % (iterations / 2)) + 1);

        if (i === 0) {
            subtransformMaterial.uniforms.u_input.value = this.spectrumRenderTarget.texture;
            this.renderPass(renderer, subtransformMaterial, this.pingTransformRenderTarget);
        } else if (i === iterations - 1) {
            subtransformMaterial.uniforms.u_input.value = (iterations % 2 === 0) ? this.pingTransformRenderTarget.texture : this.pongTransformRenderTarget.texture;
            this.renderPass(renderer, subtransformMaterial, this.displacementMapRenderTarget);
        } else if (i % 2 === 1) {
            subtransformMaterial.uniforms.u_input.value = this.pingTransformRenderTarget.texture;
            this.renderPass(renderer, subtransformMaterial, this.pongTransformRenderTarget);
        } else {
            subtransformMaterial.uniforms.u_input.value = this.pongTransformRenderTarget.texture;
            this.renderPass(renderer, subtransformMaterial, this.pingTransformRenderTarget);
        }
    }

    if (changed) {
        this.normalMapMaterial.uniforms.u_size.value = size;
    }
    this.renderPass(renderer, this.normalMapMaterial, this.normalMapRenderTarget);

    renderer.setRenderTarget(oldRenderTarget);
    this.firstFrameComplete = true;

    if (this.threeObj.userData.shader) {
        this.threeObj.userData.shader.uniforms.u_size.value = size;
        let oceanColor = this.properties.oceanColor.get(e);
        this.threeObj.userData.shader.uniforms.u_oceanColor.value.setRGB(oceanColor[0], oceanColor[1], oceanColor[2]);
        let skyColor = this.properties.skyColor.get(e);
        this.threeObj.userData.shader.uniforms.u_skyColor.value.setRGB(skyColor[0], skyColor[1], skyColor[2]);
        let sunDir = this.properties.sunDirection.get(e);
        this.threeObj.userData.shader.uniforms.u_sunDirection.value.set(sunDir[0], sunDir[1], sunDir[2]);
        this.threeObj.userData.shader.uniforms.u_exposure.value = this.properties.exposure.get(e);
    }
};

this.prepare = async function (e) {
};

this.props = {
    time: {
        dynamic: true,
        name: "Time",
        type: PZ.property.type.NUMBER,
        value: 0,
        step: 0.01,
        decimals: 2,
    },
    speed: {
        dynamic: true,
        name: "Simulation speed",
        type: PZ.property.type.NUMBER,
        value: 1,
        step: 0.1,
    },
    size: {
        dynamic: true,
        name: "Size",
        type: PZ.property.type.NUMBER,
        value: 250,
        step: 1,
    },
    choppiness: {
        dynamic: true,
        name: "Choppiness",
        type: PZ.property.type.NUMBER,
        value: 1.5,
        step: 0.1,
    },
    wind: {
        dynamic: true,
        group: true,
        objects: [
            {
                dynamic: true,
                name: "Wind.X",
                type: PZ.property.type.NUMBER,
                value: 10,
                step: 1,
            },
            {
                dynamic: true,
                name: "Wind.Y",
                type: PZ.property.type.NUMBER,
                value: 10,
                step: 1,
            },
        ],
        name: "Wind",
        type: PZ.property.type.VECTOR2,
    },
    oceanColor: {
        dynamic: true,
        group: true,
        objects: [
            {
                dynamic: true,
                name: "Ocean color.R",
                type: PZ.property.type.NUMBER,
                value: 0.004,
                min: 0,
                max: 1,
            },
            {
                dynamic: true,
                name: "Ocean color.G",
                type: PZ.property.type.NUMBER,
                value: 0.016,
                min: 0,
                max: 1,
            },
            {
                dynamic: true,
                name: "Ocean color.B",
                type: PZ.property.type.NUMBER,
                value: 0.047,
                min: 0,
                max: 1,
            },
        ],
        name: "Ocean color",
        type: PZ.property.type.COLOR,
    },
    skyColor: {
        dynamic: true,
        group: true,
        objects: [
            {
                dynamic: true,
                name: "Sky color.R",
                type: PZ.property.type.NUMBER,
                value: 3.2,
                min: 0,
                max: 20,
            },
            {
                dynamic: true,
                name: "Sky color.G",
                type: PZ.property.type.NUMBER,
                value: 9.6,
                min: 0,
                max: 20,
            },
            {
                dynamic: true,
                name: "Sky color.B",
                type: PZ.property.type.NUMBER,
                value: 12.8,
                min: 0,
                max: 20,
            },
        ],
        name: "Sky color",
        type: PZ.property.type.COLOR,
    },
    sunDirection: {
        dynamic: true,
        group: true,
        objects: [
            {
                dynamic: true,
                name: "Sun direction.X",
                type: PZ.property.type.NUMBER,
                value: -1.0,
                step: 0.1,
            },
            {
                dynamic: true,
                name: "Sun direction.Y",
                type: PZ.property.type.NUMBER,
                value: 1.0,
                step: 0.1,
            },
            {
                dynamic: true,
                name: "Sun direction.Z",
                type: PZ.property.type.NUMBER,
                value: 1.0,
                step: 0.1,
            },
        ],
        name: "Sun direction",
        type: PZ.property.type.VECTOR3,
    },
    exposure: {
        dynamic: true,
        name: "Exposure",
        type: PZ.property.type.NUMBER,
        value: 0.35,
        step: 0.01,
    }
};

this.properties.addAll(this.props);