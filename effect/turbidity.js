this.defaultName = "Turbidity";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float;uniform sampler2D tDiffuse;varying vec2 vUvScaled;uniform float strength;uniform float rotation;uniform vec2 direction;void main(){vec4 texel=vec4(0.0);for(float i=-1.0;i<=1.0;i+=1.0){for(float j=-1.0;j<=1.0;j+=1.0){vec2 offset=vec2(i,j)*strength;vec2 rotatedOffset=vec2(offset.x*cos(rotation)-offset.y*sin(rotation),offset.x*sin(rotation)+offset.y*cos(rotation));vec2 scaledOffset=rotatedOffset*direction/10.0;texel+=texture2D(tDiffuse,vUvScaled+scaledOffset);}}gl_FragColor=texel/9.0;}`);

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
    rotation: {
        dynamic: true,
        name: "rotation",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    direction: {
        dynamic: true,
        name: "direction",
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
            strength: { type: "f", value: 1.0 },
            rotation: { type: "f", value: 1.0 },
            direction: { type: "v2", value: new THREE.Vector2() },
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
        this.pass.uniforms.rotation.value = this.properties.rotation.get(e);
        var _direction = this.properties.direction.get(e);
        if (_direction) this.pass.uniforms.direction.value.set(_direction[0], _direction[1]);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
