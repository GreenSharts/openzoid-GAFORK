
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

// Mock PZ object
const PZ = {};

// Find and load the actual core code file dynamically
const allFiles = fs.readdirSync(path.join(__dirname, '..'));
const coreFileName = allFiles.find(f => f.startsWith('core-') && f.endsWith('.js'));
if (!coreFileName) {
    throw new Error("Could not find Panzoid core file");
}
const coreCode = fs.readFileSync(path.join(__dirname, '..', coreFileName), 'utf8');

/**
 * Load Panzoid component into context.
 * For production, consider using a proper test runner that loads the full script.
 */
function loadComponent(code, context) {
    // Instead of complex regex extraction, evaluate necessary parts.
    // Given the monolithic nature of the file, we can either eval the whole thing (slow)
    // or use a more targeted approach.
    // For this testing improvement, we will use a more stable extraction that handles the monolithic file.

    // Define global objects needed by the scripts if not already there
    context.PZ = context.PZ || {};

    // Evaluate the core code in the context.
    // To avoid evaluating the entire 900KB file for a unit test,
    // we use a more robust version of the previous extraction logic.

    function extractAndRun(regex) {
        let match;
        while ((match = regex.exec(code)) !== null) {
            let braceCount = 1;
            let i = regex.lastIndex;
            while (braceCount > 0 && i < code.length) {
                if (code[i] === '{') braceCount++;
                else if (code[i] === '}') braceCount--;
                i++;
            }
            const snippet = code.substring(match.index, i);
            vm.runInNewContext(snippet, context);
        }
    }

    // Constructor
    extractAndRun(/PZ\.observable\s*=\s*function\s*\(.*?\)\s*\{/g);
    // Prototype methods
    extractAndRun(/PZ\.observable\.prototype\.\w+\s*=\s*function\s*\(.*?\)\s*\{/g);
    // Static methods
    extractAndRun(/PZ\.observable\.(?!prototype)\w+\s*=\s*function\s*\(.*?\)\s*\{/g);
}

loadComponent(coreCode, { PZ, console });

function runTests() {
    console.log("Running PZ.observable tests...");

    // Test constructor
    const obs = new PZ.observable();
    assert.ok(Array.isArray(obs.watchers), "watchers should be an array");
    assert.strictEqual(obs.watchers.length, 0, "watchers should be empty initially");
    console.log("✅ Constructor test passed");

    // Test watch
    let callCount = 0;
    const watcher = () => { callCount++; };

    obs.watch(watcher);
    assert.strictEqual(obs.watchers.length, 1, "watch should add watcher to array");
    assert.strictEqual(obs.watchers[0], watcher, "watcher should be the one added");
    assert.strictEqual(callCount, 0, "watch should NOT call watcher if t is false/undefined");

    obs.watch(() => {}, true);
    assert.strictEqual(obs.watchers.length, 2, "watch should add another watcher");

    let immediateCall = false;
    obs.watch(() => { immediateCall = true; }, true);
    assert.strictEqual(immediateCall, true, "watch should call watcher immediately if t is true");
    console.log("✅ watch test passed");

    // Test has
    assert.strictEqual(obs.has(watcher), true, "has should return true for existing watcher");
    assert.strictEqual(obs.has(() => {}), false, "has should return false for non-existing watcher");
    console.log("✅ has test passed");

    // Test update
    let updateArgs = null;
    const updateWatcher = (...args) => { updateArgs = args; };
    const obs2 = new PZ.observable();
    obs2.watch(updateWatcher);
    obs2.update(1, 2, 3);
    assert.deepStrictEqual(updateArgs, [1, 2, 3], "update should call watchers with arguments");
    console.log("✅ update test passed");

    // Test unwatch
    obs.unwatch(watcher);
    assert.strictEqual(obs.has(watcher), false, "unwatch should remove watcher");
    assert.strictEqual(obs.watchers.length, 2, "watchers length should decrease");

    // Test unwatch non-existent
    const initialLength = obs.watchers.length;
    obs.unwatch(() => {});
    assert.strictEqual(obs.watchers.length, initialLength, "unwatch non-existent should not change length");
    console.log("✅ unwatch test passed");

    // Test defineObservableProp
    const obj = { _prop: 'initial' };
    PZ.observable.defineObservableProp(obj, 'prop', 'onPropChanged');
    assert.ok(obj.onPropChanged instanceof PZ.observable, "should create an observable on the object");

    let notifiedValue = null;
    obj.onPropChanged.watch((val) => { notifiedValue = val; });

    obj.prop = 'new value';
    assert.strictEqual(obj.prop, 'new value', "property should be updated");
    assert.strictEqual(notifiedValue, 'initial', "observable should notify with old value (as per current implementation)");

    obj.prop = 'new value'; // setting same value
    // Note: implementation says (s !== a || i) && ((e["_" + t] = a), e[r].update(s));
    // If i is undefined (falsy), and s === a, it shouldn't update.

    console.log("✅ defineObservableProp test passed");

    console.log("All PZ.observable tests passed!");
}

try {
    runTests();
} catch (error) {
    console.error("Test failed!");
    console.error(error);
    process.exit(1);
}
