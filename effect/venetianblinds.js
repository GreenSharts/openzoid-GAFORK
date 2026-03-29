this.defaultName = "Venetian blinds";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float;uniform sampler2D tDiffuse;varying vec2 vUvScaled;uniform float width;uniform float angle;uniform float margin;void main(){float p_width=width;vec4 texel=texture2D(tDiffuse,vUvScaled);float s=vUvScaled.x+vUvScaled.y;float angle_rad=radians(angle)*180.0;float cosAngle=cos(angle_rad);float sinAngle=sin(angle_rad);vec2 p=vUvScaled-vec2(0.5);vec2 rotatedP=vec2(p.x*cosAngle-p.y*sinAngle,p.x*sinAngle+p.y*cosAngle);float sRotated=rotatedP.x+rotatedP.y;float blinds=mod(sRotated,p_width);float p_margin=margin*p_width/float(2);float alpha=step(p_margin,blinds)*step(blinds,p_width-p_margin);gl_FragColor=texel*alpha;}`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
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
    margin: {
        dynamic: true,
        name: "margin",
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
            width: { type: "f", value: 1.0 },
            angle: { type: "f", value: 1.0 },
            margin: { type: "f", value: 1.0 },
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
        this.pass.uniforms.width.value = this.properties.width.get(e);
        this.pass.uniforms.angle.value = this.properties.angle.get(e);
        this.pass.uniforms.margin.value = this.properties.margin.get(e);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
