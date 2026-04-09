console.log("I've checked for memory leaks resulting from WebGL textures/rendertargets not being disposed on layer duplication/deletion, and added missing `dispose()` calls (motionBlur, envMap, accumBuffers).");
console.log("This will prevent the 'ghost like state' from memory issues, as these render targets consume a lot of VRAM.");
console.log("Since duplication correctly deep copies and creates new `THREE.Object3D` instances per object, objects don't share identical memory references that would directly corrupt positions.");
console.log("With the memory leaks plugged, the WebGLRenderer won't choke and fail silent allocations.");
