this.defaultName = "Extrude";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float; precision highp int; uniform sampler2D tDiffuse; varying vec2 vUvScaled; uniform vec3 rgb; uniform float angle; uniform float back; uniform float front; void main() { vec4 finalColor = vec4(0.0); float extrude = back * 0.1; for (int i = 0; i < 4080; i++) { vec2 offset = vec2(cos(angle / 6.0) * extrude, sin(angle / 6.0) * extrude); vec2 uv = vUvScaled + offset; if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) { vec4 displacedTexel = texture2D(tDiffuse, uv); finalColor = mix(finalColor, displacedTexel, displacedTexel.a); } extrude = min(extrude + 0.00025, front * 0.1); } finalColor.rgb *= rgb; gl_FragColor = finalColor; }`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
    },
    rgb: {
        dynamic: true,
        name: "rgb",
        type: PZ.property.type.VECTOR3,
        value: [0, 0, 0],
    },
    angle: {
        dynamic: true,
        name: "angle",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    back: {
        dynamic: true,
        name: "back",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    front: {
        dynamic: true,
        name: "front",
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
            rgb: { type: "v3", value: new THREE.Vector3() },
            angle: { type: "f", value: 1.0 },
            back: { type: "f", value: 1.0 },
            front: { type: "f", value: 1.0 },
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
        var _rgb = this.properties.rgb.get(e);
        if (_rgb) this.pass.uniforms.rgb.value.set(_rgb[0], _rgb[1], _rgb[2]);
        this.pass.uniforms.angle.value = this.properties.angle.get(e);
        this.pass.uniforms.back.value = this.properties.back.get(e);
        this.pass.uniforms.front.value = this.properties.front.get(e);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
