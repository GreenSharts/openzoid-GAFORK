this.defaultName = "Inner shadow";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float; uniform sampler2D tDiffuse; varying vec2 vUvScaled; uniform vec2 offset; uniform vec3 rgb; void main(){ vec4 texel = texture2D(tDiffuse, vUvScaled); vec2 offsetUv = vUvScaled + (offset * -0.1); vec4 offsetTexel = texture2D(tDiffuse, offsetUv); gl_FragColor = (texel.a == 1.0 && offsetTexel.a == 0.0) ? vec4(rgb, 1.0) : texel; }`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
    },
    offset: {
        dynamic: true,
        name: "offset",
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
            offset: { type: "v2", value: new THREE.Vector2() },
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
        var _offset = this.properties.offset.get(e);
        if (_offset) this.pass.uniforms.offset.value.set(_offset[0], _offset[1]);
        var _rgb = this.properties.rgb.get(e);
        if (_rgb) this.pass.uniforms.rgb.value.set(_rgb[0], _rgb[1], _rgb[2]);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
