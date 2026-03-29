this.defaultName = "Radial Step Wipe";
this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
varying vec2 vUvScaled;

uniform vec2 resolution;

uniform float start;
uniform float end;
uniform float rotation;

uniform vec3 color_1;
uniform vec3 color_2;
uniform vec3 color_3;
uniform vec3 color_4;

void main()
{
  vec4 texel = texture2D(tDiffuse, vUvScaled);
  float sectOff = float(section_offset)*50.;
  float sectW = float(section_width)/100.;
  float s = start*360.+180.;
  float e = end*360.+180.;
  float x = vUvScaled[0]-.5;
  float y = vUvScaled[1]-.5;
  float h = sqrt(pow(x,2.)+pow(y*resolution[1]/resolution[0],2.));
  float a = 360.-degrees(atan(y,x));
  float adjS = s - (h - mod(h,sectW))/sectW * sectOff;
  float adjE = e - (h - mod(h,sectW))/sectW * sectOff;
  int col = int(mod((h - mod(h,sectW))/sectW,float(number_of_colors)));
  vec3 color = col==0?color_1:col==1?color_2:col==2?color_3:color_4;
  gl_FragColor = vec4(color,1);
  if (!(a > adjS && a <= adjE)) { gl_FragColor = vec4(0); }
}`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
    },
    start: {
        dynamic: true,
        name: "start",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    end: {
        dynamic: true,
        name: "end",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    sectionoffset: {
        dynamic: true,
        name: "section offset",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    sectionwidth: {
        dynamic: true,
        name: "section width",
        type: PZ.property.type.NUMBER,
        value: 1,
    },
    color1: {
        dynamic: true,
        name: "color 1",
        type: PZ.property.type.VECTOR3,
        value: [0, 0, 0],
    },
    color2: {
        dynamic: true,
        name: "color 2",
        type: PZ.property.type.VECTOR3,
        value: [0, 0, 0],
    },
    color3: {
        dynamic: true,
        name: "color 3",
        type: PZ.property.type.VECTOR3,
        value: [0, 0, 0],
    },
    color4: {
        dynamic: true,
        name: "color 4",
        type: PZ.property.type.VECTOR3,
        value: [0, 0, 0],
    },
    numberofcolors: {
        dynamic: true,
        name: "number of colors",
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
            start: { type: "f", value: 1.0 },
            end: { type: "f", value: 1.0 },
            section_offset: { type: "f", value: 1.0 },
            section_width: { type: "f", value: 1.0 },
            color_1: { type: "v3", value: new THREE.Vector3() },
            color_2: { type: "v3", value: new THREE.Vector3() },
            color_3: { type: "v3", value: new THREE.Vector3() },
            color_4: { type: "v3", value: new THREE.Vector3() },
            number_of_colors: { type: "f", value: 1.0 },
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
        this.pass.uniforms.start.value = this.properties.start.get(e);
        this.pass.uniforms.end.value = this.properties.end.get(e);
        this.pass.uniforms.section_offset.value = this.properties.sectionoffset.get(e);
        this.pass.uniforms.section_width.value = this.properties.sectionwidth.get(e);
        var _color1 = this.properties.color1.get(e);
        if (_color1) this.pass.uniforms.color_1.value.set(_color1[0], _color1[1], _color1[2]);
        var _color2 = this.properties.color2.get(e);
        if (_color2) this.pass.uniforms.color_2.value.set(_color2[0], _color2[1], _color2[2]);
        var _color3 = this.properties.color3.get(e);
        if (_color3) this.pass.uniforms.color_3.value.set(_color3[0], _color3[1], _color3[2]);
        var _color4 = this.properties.color4.get(e);
        if (_color4) this.pass.uniforms.color_4.value.set(_color4[0], _color4[1], _color4[2]);
        this.pass.uniforms.number_of_colors.value = this.properties.numberofcolors.get(e);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    this.pass.uniforms.resolution.value.set(resolution[0], resolution[1]);
};
