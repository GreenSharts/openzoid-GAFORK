this.defaultName = "Oil Paint";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float; precision highp int; uniform sampler2D tDiffuse; varying vec2 vUv; uniform float strength; void main() { vec2 resolution = vec2(gl_FragCoord.xy / vUv.xy); vec4 m[8]; vec3 s[8]; for (int i = 0; i < 8; ++i) { m[i] = vec4(0.0); s[i] = vec3(0.0); } float zeta = 1.0 / strength; float eta = 1.0 / strength; for (int y = -24; y <= 24; ++y) { for (int x = -24; x <= 24; ++x) { vec2 v = vec2(x, y) / strength; vec2 texture = vUv + vec2(x, y) / resolution; texture = clamp(texture, vec2(0.0), vec2(1.0)); vec3 c = texture2D(tDiffuse, texture).xyz; c = clamp(c, 0.0, 1.0); float w[8]; float z, vxx, vyy; vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y; w[0] = max(0.0, v.y + vxx) * max(0.0, v.y + vxx); w[2] = max(0.0, -v.x + vyy) * max(0.0, -v.x + vyy); w[4] = max(0.0, -v.y + vxx) * max(0.0, -v.y + vxx); w[6] = max(0.0, v.x + vyy) * max(0.0, v.x + vyy); v = sqrt(2.0) / 2.0 * vec2(v.x - v.y, v.x + v.y); vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y; w[1] = max(0.0, v.y + vxx) * max(0.0, v.y + vxx); w[3] = max(0.0, -v.x + vyy) * max(0.0, -v.x + vyy); w[5] = max(0.0, -v.y + vxx) * max(0.0, -v.y + vxx); w[7] = max(0.0, v.x + vyy) * max(0.0, v.x + vyy); float weights = 0.0; for (int i = 0; i < 8; ++i) weights += w[i]; float g = exp(-3.125 * dot(v, v)) / weights; for (int k = 0; k < 8; ++k) { float wk = w[k] * g; m[k] += vec4(c * wk, wk); s[k] += c * c * wk; }}} vec4 ou = vec4(0.0); for (int k = 0; k < 4; ++k) { m[k].rgb /= m[k].w; s[k] = abs(s[k] / m[k].w - m[k].rgb * m[k].rgb); float sigma2 = s[k].r + s[k].g + s[k].b; float w = 1.0 / (1.0 + pow(2048.0 * sigma2, 0.5 * 14.0)); ou += vec4(m[k].rgb * w, w); } gl_FragColor = clamp(ou / ou.w, 0.0, 1.0); }`);

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
