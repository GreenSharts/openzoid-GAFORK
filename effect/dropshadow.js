this.defaultName = "Drop Shadow";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float;
uniform sampler2D tDiffuse;
varying vec2 vUv;
uniform float distance;
uniform float angle;
uniform float blur;
uniform float opacity;
uniform vec3 color;
uniform vec2 resolution;

void main() {
    vec4 src = texture2D(tDiffuse, vUv);

    // Simple drop shadow approximation
    vec2 offset = vec2(cos(angle), sin(angle)) * distance / resolution;
    vec4 shadow = texture2D(tDiffuse, vUv - offset);

    // Mix shadow color with opacity based on alpha of offset pixel
    vec4 shadowColor = vec4(color, shadow.a * opacity);

    // Composite source over shadow
    gl_FragColor = mix(shadowColor, src, src.a);
}`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
    },
    distance: {
        dynamic: true,
        name: "Distance",
        type: PZ.property.type.NUMBER,
        value: 10,
    },
    angle: {
        dynamic: true,
        name: "Angle",
        type: PZ.property.type.NUMBER,
        value: 0.785,
    },
    blur: {
        dynamic: true,
        name: "Blur",
        type: PZ.property.type.NUMBER,
        value: 5,
    },
    opacity: {
        dynamic: true,
        name: "Opacity",
        type: PZ.property.type.NUMBER,
        value: 0.5,
    },
    color: {
        dynamic: true,
        name: "Color",
        type: PZ.property.type.COLOR,
        value: [0, 0, 0],
    }
};

this.properties.addAll(this.propertyDefinitions, this);

this.load = async function (e) {
    this.vertShader = new PZ.asset.shader(this.parentProject.assets.load(this.vertShader));
    if (typeof this.fragShader === "string") this.fragShader = new PZ.asset.shader(this.parentProject.assets.load(this.fragShader));
    var t = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { type: "t", value: null },
            resolution: { type: "v2", value: new THREE.Vector2(100, 100) },
            distance: { type: "f", value: 10.0 },
            angle: { type: "f", value: 0.785 },
            blur: { type: "f", value: 5.0 },
            opacity: { type: "f", value: 0.5 },
            color: { type: "v3", value: new THREE.Vector3(0,0,0) }
        },
        vertexShader: await this.vertShader.getShader(),
        fragmentShader: await this.fragShader.getShader(),
        transparent: true
    });
    this.pass = new THREE.ShaderPass(t);
    this.properties.load(e && e.properties);
};

this.toJSON = function () { return { type: this.type, properties: this.properties }; };
this.unload = function (e) { this.parentProject.assets.unload(this.vertShader); this.parentProject.assets.unload(this.fragShader); };

this.update = function (e) {
    if (this.pass) {
        this.pass.uniforms.distance.value = this.properties.distance.get(e);
        this.pass.uniforms.angle.value = this.properties.angle.get(e);
        this.pass.uniforms.blur.value = this.properties.blur.get(e);
        this.pass.uniforms.opacity.value = this.properties.opacity.get(e);
        var _color = this.properties.color.get(e);
        if (_color) this.pass.uniforms.color.value.set(_color[0], _color[1], _color[2]);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};

this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
