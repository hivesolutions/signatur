const assert = require("assert");
const lib = require("../../../lib");

describe("Base", function() {
    describe("#deserializeText()", function() {
        it("should deserialize simple text", () => {
            let result;

            result = lib.deserializeText("arial:a|times:b");
            assert.deepStrictEqual(result, [
                ["arial", "a"],
                ["times", "b"]
            ]);

            result = lib.deserializeText("arial:a|times:bc");
            assert.deepStrictEqual(result, [
                ["arial", "a"],
                ["times", "bc"]
            ]);
        });

        it("should deserialize complex text", () => {
            const result = lib.deserializeText("arial:a|times:::|emoji:ad");
            assert.deepStrictEqual(result, [
                ["arial", "a"],
                ["times", "::"],
                ["emoji", "ad"]
            ]);
        });

        it("should deserialize erroneous text", () => {
            const result = lib.deserializeText("arial:a|times|emoji:ad");
            assert.deepStrictEqual(result, [
                ["arial", "a"],
                ["times", null],
                ["emoji", "ad"]
            ]);
        });
    });

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
