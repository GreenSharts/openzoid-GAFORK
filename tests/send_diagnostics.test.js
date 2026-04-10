
const fs = require('fs');
const path = require('path');
const assert = require('assert');

/**
 * Robustly load Panzoid core and UI files into a global context for testing.
 */
function loadPanzoid() {
    const coreFile = fs.readdirSync(path.join(__dirname, '..')).find(f => f.startsWith('core-') && f.endsWith('.js'));
    const uiFile = fs.readdirSync(path.join(__dirname, '..')).find(f => f.startsWith('ui-1.1.0.js')); // Use specific version if needed but let's try to find it dynamically

    // Re-fallback for core and ui files
    const allFiles = fs.readdirSync(path.join(__dirname, '..'));
    const actualCoreFile = allFiles.find(f => f.match(/^core-[\d.]+\.js$/));
    const actualUiFile = allFiles.find(f => f.match(/^ui-[\d.]+\.js$/));

    if (!actualCoreFile || !actualUiFile) {
        throw new Error("Could not find Panzoid core or UI files");
    }

    const coreCode = fs.readFileSync(path.join(__dirname, '..', actualCoreFile), 'utf8');
    const uiCode = fs.readFileSync(path.join(__dirname, '..', actualUiFile), 'utf8');

    // Define global objects needed by the scripts
    global.PZ = { ui: {} };
    global.PZVERSION = "1.1.0";
    global.window = {
        addEventListener: () => {},
        removeEventListener: () => {}
    };
    global.THREE = {
        OBJLoader: function() {},
        DefaultLoadingManager: {},
        Vector2: function() {},
        Vector3: function() {},
        Matrix4: function() {},
        Euler: function() {},
        Quaternion: function() {},
        Color: function() {},
        Object3D: function() {},
        Group: function() {},
        Scene: function() {},
        Camera: function() {},
        PerspectiveCamera: function() {},
        OrthographicCamera: function() {},
        Texture: function() {},
        DataTexture: function() {},
        WebGLRenderTarget: function() {},
        LinearFilter: 1,
        NearestFilter: 1,
        RGBAFormat: 1,
        UnsignedByteType: 1
    };

    // Robust function and its prototype methods extraction by counting braces
    function extractComponent(code, constructorName) {
        const escapedName = constructorName.replace(/\./g, '\\.');
        const constructorRegex = new RegExp(`${escapedName}\\s*=\\s*function\\s*\\(.*?\\)\\s*\\{`, 'g');
        const match = constructorRegex.exec(code);
        if (!match) return null;

        // Find the end of the function by counting braces
        let braceCount = 1;
        let i = constructorRegex.lastIndex;
        while (braceCount > 0 && i < code.length) {
            if (code[i] === '{') braceCount++;
            else if (code[i] === '}') braceCount--;
            i++;
        }
        const constructorCode = code.substring(match.index, i);
        try {
            eval(constructorCode);
        } catch (e) {
            console.error(`Failed to eval constructor ${constructorName}: ${e.message}`);
        }

        // Find all prototype methods
        const protoRegex = new RegExp(`${escapedName}\\.prototype\\.(\\w+)\\s*=\\s*function\\s*\\(.*?\\)\\s*\\{`, 'g');
        let protoMatch;
        while ((protoMatch = protoRegex.exec(code)) !== null) {
            let pBraceCount = 1;
            let j = protoRegex.lastIndex;
            while (pBraceCount > 0 && j < code.length) {
                if (code[j] === '{') pBraceCount++;
                else if (code[j] === '}') pBraceCount--;
                j++;
            }
            const methodCode = code.substring(protoMatch.index, j);
            try {
                eval(methodCode);
            } catch (e) {
                console.error(`Failed to eval method ${constructorName}.prototype.${protoMatch[1]}: ${e.message}`);
            }
        }
        return true;
    }

    // Extract necessary components
    extractComponent(coreCode, 'PZ.observable');

    // Manually define PZ.observable.defineObservableProp if extraction fails or is complex
    PZ.observable.defineObservableProp = function (e, t, r, i) {
        (e[r] = e[r] || new PZ.observable()),
            Object.defineProperty(e, t, {
                set(a) {
                    let s = e["_" + t];
                    (s !== a || i) && ((e["_" + t] = a), e[r].update(s));
                },
                get: () => e["_" + t],
            });
    };

    extractComponent(uiCode, 'PZ.ui.editor');
}

loadPanzoid();

// Mock PZ.api and reset state for each test
let lastApiCall = null;
PZ.api = async function(url, method, data) {
    lastApiCall = { url, method, data };
};

// Mock other dependencies of PZ.ui.editor that might fail during instantiation
PZ.ui.history = function() {};
PZ.ui.recovery = function() {};

function setup() {
    lastApiCall = null;
}

function runTests() {
    console.log("Running PZ.ui.editor.sendDiagnostics tests...");

    // Test case 1: Normal operation
    {
        setup();
        const editor = new PZ.ui.editor();
        editor.onError({ message: "Error 1", stack: "Stack 1" });
        editor.onError({ message: "Error 2" });
        // Use a project object that satisfies the watchers if any
        editor.project = { assets: { onAssetRemoved: { watch: () => {} } }, name: "Test Project" };

        editor.sendDiagnostics();

        assert.ok(lastApiCall, "PZ.api should have been called");
        assert.strictEqual(lastApiCall.url, "/feedback/diagnostics");
        assert.ok(lastApiCall.data.message.includes("Stack 1"), "Message should include stack trace");
        assert.ok(lastApiCall.data.message.includes("Error 2"), "Message should include error message");
        assert.ok(lastApiCall.data.message.includes('"name":"Test Project"'), "Message should include stringified project");
        assert.strictEqual(editor.errorList.length, 0, "errorList should be cleared");
        console.log("✅ Normal operation passed");
    }

    // Test case 2: Error path in errorList processing
    {
        setup();
        const editor = new PZ.ui.editor();
        editor.project = { assets: { onAssetRemoved: { watch: () => {} } }, name: "Test Project" };
        // This will cause i.stack to throw if i is null
        editor.errorList.push(null);

        editor.sendDiagnostics();

        assert.ok(lastApiCall.data.message.includes("Could not log errors:"), "Message should indicate error list failure");
        assert.ok(lastApiCall.data.message.includes('"name":"Test Project"'), "Project should still be logged");
        console.log("✅ errorList error path passed");
    }

    // Test case 3: Error path in project stringification
    {
        setup();
        const editor = new PZ.ui.editor();
        editor.onError({ message: "Error 1" });

        // Circular reference causes JSON.stringify to throw
        const circularProject = { assets: { onAssetRemoved: { watch: () => {} } } };
        circularProject.self = circularProject;
        editor.project = circularProject;

        editor.sendDiagnostics();

        assert.ok(lastApiCall.data.message.includes("Error 1"), "Errors should still be logged");
        assert.ok(lastApiCall.data.message.includes("Could not log project:"), "Message should indicate project logging failure");
        console.log("✅ Project stringification error path passed");
    }

    console.log("All tests passed!");
}

try {
    runTests();
} catch (error) {
    console.error("Test failed!");
    console.error(error);
    process.exit(1);
}
