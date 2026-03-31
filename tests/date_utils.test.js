
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Mock PZ object
const PZ = {};

// 2. Load the actual code from ui-1.0.72.js
const uiCode = fs.readFileSync(path.join(__dirname, '../ui-1.0.72.js'), 'utf8');

// Use regex to extract the PZ.dateString function from the source file
const match = uiCode.match(/PZ\.dateString\s*=\s*function\s*\(e\)\s*\{[\s\S]*?\};/);
if (!match) {
    throw new Error("Could not find PZ.dateString in ui-1.0.72.js");
}

// Evaluate the extracted function in this context
eval(match[0]);

function runTests() {
    console.log("Running PZ.dateString tests with extracted code...");

    // Happy path - using environment-agnostic expected values
    const validDate = new Date(2023, 0, 1);
    const expected = validDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    const result1 = PZ.dateString(validDate);
    assert.strictEqual(result1, expected, "Valid date should match the system's toLocaleDateString output");
    console.log(`✅ Happy path passed (result: "${result1}")`);

    // Edge case: null
    assert.strictEqual(PZ.dateString(null), "Invalid Date", "null should return 'Invalid Date'");
    console.log("✅ null case passed");

    // Edge case: undefined
    assert.strictEqual(PZ.dateString(undefined), "Invalid Date", "undefined should return 'Invalid Date'");
    console.log("✅ undefined case passed");

    // Edge case: empty object
    assert.strictEqual(PZ.dateString({}), "Invalid Date", "Object should return 'Invalid Date'");
    console.log("✅ Object case passed");

    // Edge case: Invalid Date object
    assert.strictEqual(PZ.dateString(new Date("invalid")), "Invalid Date", "Invalid Date object should return 'Invalid Date'");
    console.log("✅ Invalid Date object case passed");

    console.log("All tests passed!");
}

try {
    runTests();
} catch (error) {
    console.error("Test failed!");
    console.error(error);
    process.exit(1);
}
