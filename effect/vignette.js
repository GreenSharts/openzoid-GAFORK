this.defaultName = "Vignette";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float; uniform sampler2D tDiffuse; varying vec2 vUv; uniform vec2 center; uniform float smoothness; uniform float size; uniform vec3 rgb; void main(){ vec4 color = texture2D(tDiffuse, vUv); float distance = distance(center, vUv); float maxDistance = length(center) * size; float intensity = smoothstep(maxDistance * (1.0 - smoothness), maxDistance, distance); float invertedIntensity = 1.0 - intensity; vec3 texel = mix(rgb, color.rgb, invertedIntensity); gl_FragColor = vec4(texel, color.a); }`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
    },
    size: {
        dynamic: true,
        name: "size",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    smoothness: {
        dynamic: true,
        name: "smoothness",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    center: {
        dynamic: true,
        name: "center",
        type: PZ.property.type.VECTOR2,
        value: [0, 0],
    },
    rgb: {
        dynamic: true,
        name: "rgb",
        type: PZ.property.type.VECTOR3,
        value: [0, 0, 0],
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
            size: { type: "f", value: 1.0 },
            smoothness: { type: "f", value: 1.0 },
            center: { type: "v2", value: new THREE.Vector2() },
            rgb: { type: "v3", value: new THREE.Vector3() },
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
        this.pass.uniforms.size.value = this.properties.size.get(e);
        this.pass.uniforms.smoothness.value = this.properties.smoothness.get(e);
        var _center = this.properties.center.get(e);
        if (_center) this.pass.uniforms.center.value.set(_center[0], _center[1]);
        var _rgb = this.properties.rgb.get(e);
        if (_rgb) this.pass.uniforms.rgb.value.set(_rgb[0], _rgb[1], _rgb[2]);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
