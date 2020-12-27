const assert = require("assert");
const lib = require("../../../lib");

describe("Locale", function() {
    describe("#localize()", function() {
        it("should run simple localizations", () => {
            let result;

            result = lib.localize("hello", "en_us");
            assert.strictEqual(result, "hello");

            result = lib.localize("hello", "pt_pt");
            assert.strictEqual(result, "olá");

            result = lib.localize("hello");
            assert.strictEqual(result, "hello");
        });
    });
});
