this.defaultName = "Corner Pin";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`/*
Code from https://iquilezles.org/articles/ibilinear/
Ported to CM3 by Rag
*/

precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
varying vec2 vUvScaled;

uniform vec2 Bottom_Left;
uniform vec2 Bottom_Right;
uniform vec2 Top_Right;
uniform vec2 Top_Left;
uniform float Scale;

vec2 wrap(vec2 uv) {
  // Applies a mirror wrapping
  return 1.0 - abs(mod(uv, 2.0) - 1.0);
}

float cross2d(vec2 a, vec2 b) {
    return a.x*b.y - a.y*b.x;
}

vec2 invBilinear(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
    vec2 res = vec2(-1.0);

    vec2 e = b-a;
    vec2 f = d-a;
    vec2 g = a-b+c-d;
    vec2 h = p-a;

    float k2 = cross2d( g, f );
    float k1 = cross2d( e, f ) + cross2d( h, g );
    float k0 = cross2d( h, e );

    // if edges are parallel, this is a linear equation
    if(abs(k2) < 0.001) {
        res = vec2((h.x*k1+f.x*k0)/(e.x*k1-g.x*k0), -k0/k1);
    }
    // otherwise, it's a quadratic
    else {
        float w = k1*k1 - 4.0*k0*k2;
        if(w < 0.0) return vec2(-1.0);
        w = sqrt(w);

        float ik2 = 0.5/k2;
        float v = (-k1 - w)*ik2;
        float u = (h.x - f.x*v)/(e.x + g.x*v);

        if(u<0.0 || u>1.0 || v<0.0 || v>1.0) {
           v = (-k1 + w)*ik2;
           u = (h.x - f.x*v)/(e.x + g.x*v);
        }
        res = vec2(u, v);
    }
    return res;
}

void main() {
    vec2 coord = invBilinear(
        vUvScaled,
        Bottom_Left,
        Bottom_Right,
        Top_Right,
        Top_Left
    );
    coord = (coord - 0.5)/Scale + 0.5;
    gl_FragColor = texture2D(tDiffuse, wrap(coord));
}`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
    },
    BottomLeft: {
        dynamic: true,
        name: "Bottom Left",
        type: PZ.property.type.VECTOR2,
        value: [0, 0],
    },
    BottomRight: {
        dynamic: true,
        name: "Bottom Right",
        type: PZ.property.type.VECTOR2,
        value: [0, 0],
    },
    TopRight: {
        dynamic: true,
        name: "Top Right",
        type: PZ.property.type.VECTOR2,
        value: [0, 0],
    },
    TopLeft: {
        dynamic: true,
        name: "Top Left",
        type: PZ.property.type.VECTOR2,
        value: [0, 0],
    },
    Scale: {
        dynamic: true,
        name: "Scale",
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
            Bottom_Left: { type: "v2", value: new THREE.Vector2() },
            Bottom_Right: { type: "v2", value: new THREE.Vector2() },
            Top_Right: { type: "v2", value: new THREE.Vector2() },
            Top_Left: { type: "v2", value: new THREE.Vector2() },
            Scale: { type: "f", value: 1.0 },
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
        var _BottomLeft = this.properties.BottomLeft.get(e);
        if (_BottomLeft) this.pass.uniforms.Bottom_Left.value.set(_BottomLeft[0], _BottomLeft[1]);
        var _BottomRight = this.properties.BottomRight.get(e);
        if (_BottomRight) this.pass.uniforms.Bottom_Right.value.set(_BottomRight[0], _BottomRight[1]);
        var _TopRight = this.properties.TopRight.get(e);
        if (_TopRight) this.pass.uniforms.Top_Right.value.set(_TopRight[0], _TopRight[1]);
        var _TopLeft = this.properties.TopLeft.get(e);
        if (_TopLeft) this.pass.uniforms.Top_Left.value.set(_TopLeft[0], _TopLeft[1]);
        this.pass.uniforms.Scale.value = this.properties.Scale.get(e);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
