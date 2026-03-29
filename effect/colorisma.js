this.defaultName = "Colorisma";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float;uniform sampler2D tDiffuse;varying vec2 vUvScaled;uniform float strength;uniform vec3 tint;uniform float gamma;uniform float brightness;uniform float contrast;uniform float saturation;uniform float hue;uniform float sharpness;uniform float exposure;uniform float midExposure;uniform float sideExposure;vec3 applyBrightness(vec3 color, float value) { return color + value; }vec3 applyTint(vec3 color, vec3 tint) { return color * tint; }vec3 applyContrast(vec3 color, float amount) { return (color - 0.5) * amount + 0.5; }vec3 applySaturation(vec3 color, float amount) { float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722)); return mix(vec3(luminance), color, amount); }vec3 applyExposure(vec3 color, float amount) { return color + amount * color * color; }vec3 applySharpness(vec3 color, float amount) { vec3 blurredColor = texture2D(tDiffuse, vUvScaled + vec2(-0.001, 0.0)).rgb; blurredColor += texture2D(tDiffuse, vUvScaled + vec2(-0.001, 0.0)).rgb; blurredColor += texture2D(tDiffuse, vUvScaled + vec2(0.0, -0.001)).rgb; blurredColor += texture2D(tDiffuse, vUvScaled + vec2(0.0, -0.001)).rgb; blurredColor -= 4.0 * color; return color + blurredColor * -amount; }vec3 rgb2hsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }vec3 hsv2rgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }vec3 applyHue(vec3 color, float adjustment) { vec3 hsv = rgb2hsv(color); hsv.x = mod(hsv.x + adjustment, 1.0); return hsv2rgb(hsv); }  void main() { vec4 texel = texture2D(tDiffuse, vUvScaled); vec3 filteredColor = texel.rgb;filteredColor = applyBrightness(filteredColor, brightness);filteredColor = applyTint(filteredColor, tint);filteredColor = applyContrast(filteredColor, contrast);filteredColor = applySaturation(filteredColor, saturation);filteredColor = applyExposure(filteredColor, exposure);filteredColor = applyHue(filteredColor, hue / 8.0);filteredColor = pow(filteredColor, vec3(1.0 / gamma));float exposureValue = mix(midExposure, sideExposure, abs(vUvScaled.x - 0.5) * 2.0);filteredColor *= exposureValue;filteredColor = applySharpness(filteredColor, sharpness);vec3 finalColor = mix(texel.rgb, filteredColor, strength);gl_FragColor = vec4(finalColor, texel.a); }`);

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
    tint: {
        dynamic: true,
        name: "tint",
        type: PZ.property.type.VECTOR3,
        value: [0, 0, 0],
    },
    gamma: {
        dynamic: true,
        name: "gamma",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    brightness: {
        dynamic: true,
        name: "brightness",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    contrast: {
        dynamic: true,
        name: "contrast",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    saturation: {
        dynamic: true,
        name: "saturation",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    sharpness: {
        dynamic: true,
        name: "sharpness",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    hue: {
        dynamic: true,
        name: "hue",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    exposure: {
        dynamic: true,
        name: "exposure",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    midExposure: {
        dynamic: true,
        name: "midExposure",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    sideExposure: {
        dynamic: true,
        name: "sideExposure",
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
            tint: { type: "v3", value: new THREE.Vector3() },
            gamma: { type: "f", value: 1.0 },
            brightness: { type: "f", value: 1.0 },
            contrast: { type: "f", value: 1.0 },
            saturation: { type: "f", value: 1.0 },
            sharpness: { type: "f", value: 1.0 },
            hue: { type: "f", value: 1.0 },
            exposure: { type: "f", value: 1.0 },
            midExposure: { type: "f", value: 1.0 },
            sideExposure: { type: "f", value: 1.0 },
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
        var _tint = this.properties.tint.get(e);
        if (_tint) this.pass.uniforms.tint.value.set(_tint[0], _tint[1], _tint[2]);
        this.pass.uniforms.gamma.value = this.properties.gamma.get(e);
        this.pass.uniforms.brightness.value = this.properties.brightness.get(e);
        this.pass.uniforms.contrast.value = this.properties.contrast.get(e);
        this.pass.uniforms.saturation.value = this.properties.saturation.get(e);
        this.pass.uniforms.sharpness.value = this.properties.sharpness.get(e);
        this.pass.uniforms.hue.value = this.properties.hue.get(e);
        this.pass.uniforms.exposure.value = this.properties.exposure.get(e);
        this.pass.uniforms.midExposure.value = this.properties.midExposure.get(e);
        this.pass.uniforms.sideExposure.value = this.properties.sideExposure.get(e);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
