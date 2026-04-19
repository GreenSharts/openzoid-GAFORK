## 2024-05-24 - [MotionBlur Matrix Cache Bug]
**Learning:** In `PZ.motionBlur.prototype.update`, the `WeakMap.set` was missing its first argument, causing it to fail and re-allocate `THREE.Matrix4` and internal `Float32Array` for every object on every frame.
**Action:** Always ensure `WeakMap.set` is called with both key and value.

## 2024-05-24 - [Shape Drawing Memoization]
**Learning:** Redundant `Math.cos` and `Math.sin` calls in `PZ.shape.path.draw` can be avoided by memoizing the results based on the rotation value.
**Action:** Implement instance-level caching for expensive calculations in hot rendering loops.

## 2026-04-13 - [Motion Blur Allocation Bottleneck]
**Learning:** High-frequency loops like `scene.traverse` in `PZ.motionBlur.prototype.update` suffer from significant overhead when creating new arrow functions and closures for `onBeforeRender` every frame, even if the actual `Matrix4` objects are cached.
**Action:** Pre-bind traversal callbacks in the constructor and conditionally assign object hooks (`onBeforeRender`) only once to eliminate per-frame allocations.
