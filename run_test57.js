console.log("Wait, `getTexture` handles `references`. `this.references += 1`.");
console.log("`releaseTexture` does `this.references -= 1`, and if it reaches 0, it calls `unload()`.");
console.log("So `envMap` unloads itself when references hit 0.");
console.log("Does `motionBlur` have the same reference counting?");
console.log("Let's look at `PZ.motionBlur.prototype.getTexture` and `releaseTexture`.");
