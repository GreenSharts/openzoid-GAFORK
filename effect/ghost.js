this.defaultName = "Ghost";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float;uniform sampler2D tDiffuse;varying vec2 vUv;uniform float scale;uniform float intensity;uniform vec2 position;uniform vec3 tint;void main(){vec2 offset=vUv-position;float distance=length(offset);vec2 direction=normalize(offset);vec2 extrudeUV=position+direction*distance*(1.0-scale);if(extrudeUV.x<0.0||extrudeUV.x>1.0||extrudeUV.y<0.0||extrudeUV.y>1.0){discard;}vec4 color=texture2D(tDiffuse,vUv);vec4 extrudeColor=texture2D(tDiffuse,extrudeUV);vec4 texel=mix(color,extrudeColor,intensity);texel.rgb+=tint;gl_FragColor=texel;}`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
    },
    scale: {
        dynamic: true,
        name: "scale",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    intensity: {
        dynamic: true,
        name: "intensity",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    position: {
        dynamic: true,
        name: "position",
        type: PZ.property.type.VECTOR2,
        value: [0, 0],
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
            scale: { type: "f", value: 1.0 },
            intensity: { type: "f", value: 1.0 },
            position: { type: "v2", value: new THREE.Vector2() },
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
        this.pass.uniforms.scale.value = this.properties.scale.get(e);
        this.pass.uniforms.intensity.value = this.properties.intensity.get(e);
        var _position = this.properties.position.get(e);
        if (_position) this.pass.uniforms.position.value.set(_position[0], _position[1]);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
