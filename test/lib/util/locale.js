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

    describe("#resolveLocale()", function() {
        it("should keep a locale that has its own pages", () => {
            const result = lib.resolveLocale("pt_pt");
            assert.strictEqual(result, "pt_pt");
        });

        it("should resolve the default locale to the default pages", () => {
            let result;

            result = lib.resolveLocale("en_us");
            assert.strictEqual(result, "");

            result = lib.resolveLocale("");
            assert.strictEqual(result, "");

            result = lib.resolveLocale(undefined);
            assert.strictEqual(result, "");

            result = lib.resolveLocale(null);
            assert.strictEqual(result, "");
        });

        it("should resolve an unknown locale to the default pages", () => {
            let result;

            result = lib.resolveLocale("fr_fr");
            assert.strictEqual(result, "");

            result = lib.resolveLocale("PT_PT");
            assert.strictEqual(result, "");
        });

        it("should not let a locale select another page", () => {
            let result;

            result = lib.resolveLocale("../layout");
            assert.strictEqual(result, "");

            result = lib.resolveLocale("pt_pt/../../app");
            assert.strictEqual(result, "");

            result = lib.resolveLocale("constructor");
            assert.strictEqual(result, "");

            result = lib.resolveLocale("__proto__");
            assert.strictEqual(result, "");

            result = lib.resolveLocale(["pt_pt"]);
            assert.strictEqual(result, "");
        });
    });
});
