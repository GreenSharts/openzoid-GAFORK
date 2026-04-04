console.log("Wait, if `PZ.layer.scene` doesn't call `this.motionBlur.unload()`, the `velocityBuffer` is never disposed!");
console.log("And `velocityBuffer` is a `WebGLRenderTarget` which allocates VRAM (944x531 by default!).");
console.log("Let's check if `PZ.layer.scene.prototype.unload` calls `this.motionBlur.unload()`.");
console.log("It does NOT!");
console.log("Let's check if `PZ.envMap` has `unload` and if it allocates a render target.");
