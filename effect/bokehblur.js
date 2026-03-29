this.defaultName = "Bokeh Blur";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float; precision highp int; uniform sampler2D tDiffuse; varying vec2 vUvScaled; uniform float strength; void main() { vec2 resolution = vec2(1.0, 1.0 / 0.5); vec2 uv = vUvScaled; float goldenAngle = 2.39996323; vec4 color = vec4(0.0); float total = 0.0; float radius = strength * 0.01; vec2 offset = vec2(0.0); float angle = 0.0; for (int i = 0; i < 2048; i++) { angle += goldenAngle; float r = sqrt(float(i) + 0.5) / sqrt(float(2048)); offset = vec2(cos(angle), sin(angle)) * radius * r; offset.y /= 0.5; vec4 texel = texture2D(tDiffuse, uv + offset); float weight = 3.141592 * length(texel.rgb); color += texel * weight; total += weight; } gl_FragColor = color / total; }`);

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
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
