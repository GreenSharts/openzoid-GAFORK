this.defaultName = "Halftone";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`uniform float size;
uniform float radius;
uniform float angle;
uniform int channel;
uniform vec2 offset;

uniform sampler2D image;
uniform vec2 resolution;
varying vec2 nodeCoord;

vec2 warp(vec2 uv) {
  // Applies a mirror wrapping
  vec2 uv_ = (uv*2.0 + resolution) / (2.0 * resolution);
  return (1.0 - 2.0*abs(mod(uv_, 2.0) - 1.0)) * (resolution/2.0);
}

mat2 rotation(float a) {
	return mat2(cos(a), sin(a), -sin(a), cos(a));
}

float circle(vec2 uv, vec2 circlePos, float radius) {
  float dist = length(uv - circlePos);
	return 1.0 - smoothstep(radius - (radius*0.1),
                          radius + (radius*0.1),
                          dist);
}

void main() {
  // Calculate rotation matrixes
  mat2 m = rotation(radians(angle));
  mat2 m_ = rotation(radians(-angle));

  // Displace coordinates
  vec2 dCoord = (nodeCoord * m) + offset;

  // Pixelate coordinates
  vec2 coord = size * floor(dCoord / size + 0.5);

  // Un-displace pixelated coordinates
  vec4 c = texture2D(image, warp((coord - offset) * m_));

  // Determinate circle radius
  float r;
  if (channel == 0)      r = radius * c.a;
  else if (channel == 1) r = radius * c.r;
  else if (channel == 2) r = radius * c.g;
  else                   r = radius * c.b;

  // Draw circle at pixelated coordinates
  gl_FragColor = c * circle(dCoord, coord, r);
}`);

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
        name: "Size",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    radius: {
        dynamic: true,
        name: "Radius",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    angle: {
        dynamic: true,
        name: "Angle",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    offset: {
        dynamic: true,
        name: "Offset",
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
            image: { type: "t", value: null },
            resolution: { type: "v2", value: new THREE.Vector2(100, 100) },
            uvScale: { type: "v2", value: new THREE.Vector2(1, 1) },
            size: { type: "f", value: 1.0 },
            radius: { type: "f", value: 1.0 },
            angle: { type: "f", value: 1.0 },
            channel: { type: "f", value: 1.0 },
            offset: { type: "v2", value: new THREE.Vector2() },
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
        this.pass.uniforms.image.value = this.pass.uniforms.tDiffuse.value;
        this.pass.uniforms.size.value = this.properties.size.get(e);
        this.pass.uniforms.radius.value = this.properties.radius.get(e);
        this.pass.uniforms.angle.value = this.properties.angle.get(e);
        this.pass.uniforms.channel.value = this.properties.channel.get(e);
        var _offset = this.properties.offset.get(e);
        if (_offset) this.pass.uniforms.offset.value.set(_offset[0], _offset[1]);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
