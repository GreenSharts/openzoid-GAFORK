this.defaultName = "Ambient occlusion";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float; uniform sampler2D tDiffuse; varying vec2 vUv; uniform float strength; uniform float distance; void main() { vec4 texel = texture2D(tDiffuse, vUv); float ao = 0.0; for (float i = 0.0; i < 6.28; i += 0.1) { vec2 offset = vec2(cos(i), sin(i)) * distance * 0.005; ao += texture2D(tDiffuse, vUv + offset).r; } ao = 1.0 - clamp(ao * strength * 0.1 / 64.0, 0.0, 1.0); texel.rgb *= ao; gl_FragColor = texel; }`);

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
    distance: {
        dynamic: true,
        name: "distance",
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
            distance: { type: "f", value: 1.0 },
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
        this.pass.uniforms.distance.value = this.properties.distance.get(e);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
