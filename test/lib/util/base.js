const assert = require("assert");
const lib = require("../../../lib");

describe("Base", function() {
    describe("#fontText()", function() {
        it("should return proper most relevant fonts", () => {
            let result;

            result = lib.fontText("arial:a|times:b");
            assert.strictEqual(result, "arial");

            result = lib.fontText("arial:a|times:bc");
            assert.strictEqual(result, "times");
        });

        it("should be able to use other separators", () => {
            let result;

            result = lib.fontText("arial:a-times:b", "-");
            assert.strictEqual(result, "arial", "-");

            result = lib.fontText("arial:a-times:bc", "-");
            assert.strictEqual(result, "times");
        });

        it("should handle proper invalid cases", () => {
            let result;

            result = lib.fontText(null);
            assert.strictEqual(result, null);

            result = lib.fontText("");
            assert.strictEqual(result, null);
        });
    });
});
