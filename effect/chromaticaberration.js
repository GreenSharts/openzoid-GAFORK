this.defaultName = "Chromatic aberration";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float; uniform sampler2D tDiffuse; varying vec2 vUv; uniform float strength; uniform float red; uniform float green; uniform float blue; void main() { vec2 centered = vUv - vec2(0.5, 0.5); float strength = strength * length(centered); vec2 redOffset = vUv + centered * red * 0.025 * strength; vec4 redColor = texture2D(tDiffuse, redOffset); vec2 greenOffset = vUv + centered * green * 0.025 * strength; vec4 greenColor = texture2D(tDiffuse, greenOffset); vec2 blueOffset = vUv + centered * blue * 0.025 * strength; vec4 blueColor = texture2D(tDiffuse, blueOffset); vec4 finalColor; finalColor.r = redColor.r; finalColor.g = greenColor.g; finalColor.b = blueColor.b; finalColor.a = (redColor.a + greenColor.a + blueColor.a) / 3.0; gl_FragColor = finalColor; }`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
    },
    strength: {
        dynamic: true,
        name: "strength",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    red: {
        dynamic: true,
        name: "red",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    green: {
        dynamic: true,
        name: "green",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    blue: {
        dynamic: true,
        name: "blue",
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
            strength: { type: "f", value: 1.0 },
            red: { type: "f", value: 1.0 },
            green: { type: "f", value: 1.0 },
            blue: { type: "f", value: 1.0 },
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
        this.pass.uniforms.strength.value = this.properties.strength.get(e);
        this.pass.uniforms.red.value = this.properties.red.get(e);
        this.pass.uniforms.green.value = this.properties.green.get(e);
        this.pass.uniforms.blue.value = this.properties.blue.get(e);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
