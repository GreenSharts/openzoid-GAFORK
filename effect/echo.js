this.defaultName = "Echo";

this.vertShader = this.parentProject.assets.createFromPreset(PZ.asset.type.SHADER, "/assets/shaders/vertex/common.glsl");
this.fragShader = new PZ.asset.shader(`
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tPrevious;
uniform float blendAmount;
varying vec2 vUv;

void main() {
    vec4 current = texture2D(tDiffuse, vUv);
    vec4 previous = texture2D(tPrevious, vUv);

    // Simple blend of current and previous frame
    gl_FragColor = mix(current, previous, blendAmount);
}
`);

this.propertyDefinitions = {
    enabled: {
        dynamic: true,
        name: "Enabled",
        type: PZ.property.type.OPTION,
        value: 1,
        items: "off;on",
    },
    blendAmount: {
        dynamic: true,
        name: "Blend Amount",
        type: PZ.property.type.NUMBER,
        value: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
    }
};

this.properties.addAll(this.propertyDefinitions, this);

this.load = async function (e) {
    this.vertShader = new PZ.asset.shader(this.parentProject.assets.load(this.vertShader));
    if (typeof this.fragShader === "string") this.fragShader = new PZ.asset.shader(this.parentProject.assets.load(this.fragShader));

    var t = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { type: "t", value: null },
            tPrevious: { type: "t", value: null },
            blendAmount: { type: "f", value: 0.5 },
        },
        vertexShader: await this.vertShader.getShader(),
        fragmentShader: await this.fragShader.getShader(),
    });

    this.pass = new THREE.ShaderPass(t);
    this.pass.needsSwap = true;

    // We need a render target to store the previous frame
    this.previousRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
    });

    this.pass.uniforms.tPrevious.value = this.previousRenderTarget.texture;

    // Custom render method for this pass to save the result
    var oldRender = this.pass.render;
    var _this = this;
    this.pass.render = function(renderer, writeBuffer, readBuffer, delta, maskActive) {
        // Set the previous frame texture
        _this.pass.uniforms.tPrevious.value = _this.previousRenderTarget.texture;

        // Render the pass normally
        oldRender.call(this, renderer, writeBuffer, readBuffer, delta, maskActive);

        // Save the result into previousRenderTarget for the next frame
        // If writeBuffer is null, it means we are rendering to screen, which we can't easily copy from in WebGL1 without readPixels.
        // Usually effects in Panzoid render to a writeBuffer first before the final screen pass.
        if (writeBuffer) {
            // Wait, we can't easily read pixels without a performance hit.
            // But we don't need to read pixels to CPU. We just want to copy the WebGL texture.
            // Let's use a FullScreenQuad or simply rely on the fact that if writeBuffer is a render target,
            // we can use a CopyShader to copy it to previousRenderTarget.

            // Panzoid's THREE.ShaderPass.render signature is (renderer, writeBuffer, readBuffer, delta, maskActive)
            // oldRender already ran and output to writeBuffer (or screen).
            // Actually, ShaderPass by default writes to writeBuffer.

            // To copy writeBuffer to previousRenderTarget without a new pass, we can use renderer.copyFramebufferToTexture
            // But writeBuffer is a RenderTarget. We can just tell the renderer to copy it.
            // Wait, an easier way is to just swap the pointers if they are the same size!
            // But we need previousRenderTarget to persist.

            // Let's just use the CopyShader provided by Three.js (if available in Panzoid)
            if (THREE.CopyShader && !this.copyPass) {
                this.copyPass = new THREE.ShaderPass(THREE.CopyShader);
            }
            if (this.copyPass) {
                this.copyPass.render(renderer, this.previousRenderTarget, writeBuffer, delta, maskActive);
            }
        }
    };

    this.properties.load(e && e.properties);
};

this.toJSON = function () { return { type: this.type, properties: this.properties }; };
this.unload = function (e) {
    this.parentProject.assets.unload(this.vertShader);
    this.parentProject.assets.unload(this.fragShader);
    if (this.previousRenderTarget) {
        this.previousRenderTarget.dispose();
    }
};
this.update = function (e) {
    if (this.pass) {
        this.pass.uniforms.blendAmount.value = this.properties.blendAmount.get(e);
        this.pass.enabled = this.properties.enabled.get(e) === 1;
    }
};
this.resize = function () {
    let resolution = this.parentLayer.properties.resolution.get();
    if (this.previousRenderTarget) {
        this.previousRenderTarget.setSize(resolution[0], resolution[1]);
    }
};
