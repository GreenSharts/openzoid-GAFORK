console.log("Memory leaks are mentioned in the README.md:");
console.log("`There is a memory leaking issue that causes performance issues over time`");
console.log("If duplicating scenes creates a memory leak, it's probably because resources (geometries, materials, render targets, textures) aren't being disposed of.");
console.log("Let's look at `unload()` in `PZ.motionBlur`:");
console.log("`this.velocityBuffer && (this.velocityBuffer.dispose(), (this.velocityBuffer = null))`");
console.log("Let's look at `PZ.layer.scene` `unload()`:");
console.log("`for (let e = 0; e < this.objects.length; e++) this.objects[e].unload(); super.unload();`");
console.log("Wait, `PZ.layer.scene` doesn't dispose `this.threeObj`? It doesn't dispose `this.envMap`? It doesn't dispose `this.motionBlur`? It doesn't dispose `this.pass`?");
