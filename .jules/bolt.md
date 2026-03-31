## 2024-05-24 - [MotionBlur Matrix Cache Bug]
**Learning:** In `PZ.motionBlur.prototype.update`, the `WeakMap.set` was missing its first argument, causing it to fail and re-allocate `THREE.Matrix4` and internal `Float32Array` for every object on every frame.
**Action:** Always ensure `WeakMap.set` is called with both key and value.

## 2024-05-24 - [Shape Drawing Memoization]
**Learning:** Redundant `Math.cos` and `Math.sin` calls in `PZ.shape.path.draw` can be avoided by memoizing the results based on the rotation value.
**Action:** Implement instance-level caching for expensive calculations in hot rendering loops.
