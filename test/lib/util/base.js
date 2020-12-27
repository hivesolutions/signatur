const assert = require("assert");
const lib = require("../../../lib");

describe("Base", function() {
    describe("#fontText()", function() {
        it("should return proper most relevant fonts", () => {
            let result;

            result = lib.fontText("arial:a-times:b");
            assert.strictEqual(result, "arial");

            result = lib.fontText("arial:a-times:bc");
            assert.strictEqual(result, "times");
        });
    });
});
