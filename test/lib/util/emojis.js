const assert = require("assert");
const lib = require("../../../lib");

describe("Emojis", function() {
    describe("#validateEmojisFont()", function() {
        it("should validate a valid TTF payload", () => {
            const buffer = Buffer.concat([
                Buffer.from([0x00, 0x01, 0x00, 0x00]),
                Buffer.alloc(64)
            ]);
            const errors = lib.validateEmojisFont(buffer);
            assert.deepStrictEqual(errors, []);
        });

        it("should validate a valid OTF payload", () => {
            const buffer = Buffer.concat([
                Buffer.from([0x4f, 0x54, 0x54, 0x4f]),
                Buffer.alloc(64)
            ]);
            const errors = lib.validateEmojisFont(buffer);
            assert.deepStrictEqual(errors, []);
        });

        it("should reject a non-buffer payload", () => {
            const errors = lib.validateEmojisFont("not a buffer");
            assert.deepStrictEqual(errors, ["font payload must be a buffer"]);
        });

        it("should reject a payload shorter than the magic header", () => {
            const buffer = Buffer.from([0x00, 0x01, 0x00]);
            const errors = lib.validateEmojisFont(buffer);
            assert.deepStrictEqual(errors, ["font payload is too short to be a TTF file"]);
        });

        it("should reject a payload with an unknown signature", () => {
            const buffer = Buffer.concat([
                Buffer.from([0x89, 0x50, 0x4e, 0x47]),
                Buffer.alloc(64)
            ]);
            const errors = lib.validateEmojisFont(buffer);
            assert.deepStrictEqual(errors, ["font must be a TTF or OTF file"]);
        });
    });

    describe("#validateEmojisMapping()", function() {
        it("should validate a valid mapping payload", () => {
            const errors = lib.validateEmojisMapping(JSON.stringify({
                A: "1101.coracao",
                B: "1102.estrela"
            }));
            assert.deepStrictEqual(errors, []);
        });

        it("should validate an empty mapping payload", () => {
            const errors = lib.validateEmojisMapping("{}");
            assert.deepStrictEqual(errors, []);
        });

        it("should reject a non-string payload", () => {
            const errors = lib.validateEmojisMapping({ A: "1101.coracao" });
            assert.deepStrictEqual(errors, ["mapping payload must be a string"]);
        });

        it("should reject a payload that is not valid JSON", () => {
            const errors = lib.validateEmojisMapping("not json");
            assert.deepStrictEqual(errors, ["mapping must be valid JSON"]);
        });

        it("should reject a JSON array", () => {
            const errors = lib.validateEmojisMapping("[]");
            assert.deepStrictEqual(errors, ["mapping must be a plain object"]);
        });

        it("should reject a JSON null", () => {
            const errors = lib.validateEmojisMapping("null");
            assert.deepStrictEqual(errors, ["mapping must be a plain object"]);
        });

        it("should reject entries with non-string values", () => {
            const errors = lib.validateEmojisMapping(JSON.stringify({
                A: "1101.coracao",
                B: 42
            }));
            assert.deepStrictEqual(errors, ["mapping entry \"B\" must be a string"]);
        });
    });
});
