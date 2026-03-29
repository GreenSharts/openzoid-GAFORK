this.defaultName = "Edge blur";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision mediump float; uniform sampler2D tDiffuse; varying vec2 vUv; uniform vec2 center; uniform float strength; uniform float scale; void main() { vec4 sum = vec4(0.0); float distanceToCenter = distance(vUv, center); float blurIntensity = mix(0.0, strength * 3.0, smoothstep(0.0, scale * 12.0, distanceToCenter)); for (int i = 0; i < 128; i++) { float angle = float(i) * (3.14 * 2.0) / float(128.0); vec2 offset = blurIntensity * vec2(cos(angle), sin(angle)); sum += texture2D(tDiffuse, vUv + offset); } gl_FragColor = sum / float(128); }`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
    },
    center: {
        dynamic: true,
        name: "center",
        type: PZ.property.type.VECTOR2,
        value: [0, 0],
    },
    strength: {
        dynamic: true,
        name: "strength",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    scale: {
        dynamic: true,
        name: "scale",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
};

this.properties.addAll(this.propertyDefinitions, this);

this.load = async function (e) {
    this.vertShader = new PZ.asset.shader(this.parentProject.assets.load(this.vertShader));
    if (typeof this.fragShader === "string") this.fragShader = new PZ.asset.shader(this.parentProject.assets.load(this.fragShader));
    var t = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { type: "t", value: null },
            resolution: { type: "v2", value: new THREE.Vector2(100, 100) },
            uvScale: { type: "v2", value: new THREE.Vector2(1, 1) },
            center: { type: "v2", value: new THREE.Vector2() },
            strength: { type: "f", value: 1.0 },
            scale: { type: "f", value: 1.0 },
        },
        vertexShader: await this.vertShader.getShader(),
        fragmentShader: await this.fragShader.getShader(),
    });
    this.pass = new THREE.ShaderPass(t);
    this.properties.load(e && e.properties);
};

this.toJSON = function () { return { type: this.type, properties: this.properties }; };
this.unload = function (e) { this.parentProject.assets.unload(this.vertShader); this.parentProject.assets.unload(this.fragShader); };
this.update = function (e) {
    if (this.pass) {
        var _center = this.properties.center.get(e);
        if (_center) this.pass.uniforms.center.value.set(_center[0], _center[1]);
        this.pass.uniforms.strength.value = this.properties.strength.get(e);
        this.pass.uniforms.scale.value = this.properties.scale.get(e);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
