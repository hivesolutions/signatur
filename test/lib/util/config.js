const assert = require("assert");
const lib = require("../../../lib");

describe("Config", function() {
    let featuresBackup = null;

    before(function() {
        // backs up the base feature values resolved at start time so
        // the assertions below run against a deterministic base
        // regardless of the environment, restoring the original
        // values after the suite finishes
        featuresBackup = lib.conf.FEATURES;
        lib.conf.FEATURES = {
            calligraphy: false,
            feedback: true,
            faces: true,
            checkPath: false
        };
    });

    after(function() {
        lib.conf.FEATURES = featuresBackup;
    });

    describe("#resolveFeatures()", function() {
        it("should fall back to the base values without a session", () => {
            const features = lib.resolveFeatures(null);
            assert.deepStrictEqual(features, {
                calligraphy: false,
                feedback: true,
                faces: true,
                checkPath: false
            });
        });

        it("should apply the explicit session overrides", () => {
            const features = lib.resolveFeatures({
                feature_checkPath: "1",
                feature_feedback: "0"
            });
            assert.strictEqual(features.checkPath, true);
            assert.strictEqual(features.feedback, false);
            assert.strictEqual(features.calligraphy, false);
            assert.strictEqual(features.faces, true);
        });

        it("should ignore override values outside the canonical tokens", () => {
            const features = lib.resolveFeatures({ feature_checkPath: "yes" });
            assert.strictEqual(features.checkPath, false);
        });

        it("should coerce missing base entries to false", () => {
            lib.conf.FEATURES = {};
            const features = lib.resolveFeatures(null);
            assert.deepStrictEqual(features, {
                calligraphy: false,
                feedback: false,
                faces: false,
                checkPath: false
            });
        });
    });
});
