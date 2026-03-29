this.defaultName = "Light sweep";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float;uniform sampler2D tDiffuse;varying vec2 vUv;uniform float strength;uniform vec2 position;uniform float width;uniform float feather;uniform float angle;uniform vec3 rgb;void main(){vec4 texel = texture2D(tDiffuse, vUv);float radians = radians(angle);float cosAngle = cos(radians);float sinAngle = sin(radians);vec2 rotatedUV = vec2(dot(vUv - position, vec2(cosAngle, sinAngle)), dot(vUv - position, vec2(-sinAngle, cosAngle)));float gradient = smoothstep(feather * 0.5, -feather * 0.5, abs(rotatedUV.y) - width * 0.025);gl_FragColor = texel + vec4(rgb, 1.0) * gradient * strength * texel.a;}`);

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
    position: {
        dynamic: true,
        name: "position",
        type: PZ.property.type.VECTOR2,
        value: [0, 0],
    },
    width: {
        dynamic: true,
        name: "width",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    angle: {
        dynamic: true,
        name: "angle",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    feather: {
        dynamic: true,
        name: "feather",
        type: PZ.property.type.NUMBER,
        value: 1,
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
            strength: { type: "f", value: 1.0 },
            position: { type: "v2", value: new THREE.Vector2() },
            width: { type: "f", value: 1.0 },
            angle: { type: "f", value: 1.0 },
            feather: { type: "f", value: 1.0 },
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
        this.pass.uniforms.strength.value = this.properties.strength.get(e);
        var _position = this.properties.position.get(e);
        if (_position) this.pass.uniforms.position.value.set(_position[0], _position[1]);
        this.pass.uniforms.width.value = this.properties.width.get(e);
        this.pass.uniforms.angle.value = this.properties.angle.get(e);
        this.pass.uniforms.feather.value = this.properties.feather.get(e);
        var _rgb = this.properties.rgb.get(e);
        if (_rgb) this.pass.uniforms.rgb.value.set(_rgb[0], _rgb[1], _rgb[2]);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
