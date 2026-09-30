const assert = require("assert");
const path = require("path");
const childProcess = require("child_process");
const lib = require("../../../lib");

describe("Config", function() {
    const commit = "7fcb0702d0ee401710b24cf41eec3dca6f3a88a7";
    const buildDate = 1790677148;
    let featuresBackup = null;

    // starts the library on a separate process with the given build
    // environment, so that neither the environment nor the logging
    // handlers set up by the start leak into the rest of the suite,
    // returning the commit and the date of the running build it resolved,
    // with a not a number value kept apart from null as the plain JSON
    // serialization would turn one into the other
    const startBuild = function(env) {
        const libPath = path.resolve(__dirname, "..", "..", "..", "lib");
        const script =
            "const lib = require(" +
            JSON.stringify(libPath) +
            ");" +
            "lib.start().then(() => process.stdout.write(JSON.stringify({" +
            "commit: lib.conf.GIT_COMMIT, buildDate: lib.conf.BUILD_DATE" +
            "}, (key, value) => (Number.isNaN(value) ? 'NaN' : value))));";
        const environment = Object.assign({}, process.env);
        delete environment.GIT_COMMIT;
        delete environment.BUILD_DATE;
        const output = childProcess.execFileSync(process.execPath, ["-e", script], {
            env: Object.assign(environment, env),
            encoding: "utf8"
        });
        return JSON.parse(output);
    };

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

    describe("#start()", function() {
        this.timeout(20000);

        it("should read the commit of the running build", () => {
            assert.strictEqual(startBuild({ GIT_COMMIT: commit }).commit, commit);
        });

        it("should resolve an empty commit, as left by a build without the arg, to null", () => {
            assert.strictEqual(startBuild({ GIT_COMMIT: "" }).commit, null);
        });

        it("should resolve a missing commit to null", () => {
            assert.strictEqual(startBuild({}).commit, null);
        });

        it("should read the date of the running build as a unix timestamp", () => {
            assert.strictEqual(startBuild({ BUILD_DATE: String(buildDate) }).buildDate, buildDate);
        });

        it("should resolve an empty build date, as left by a build without the arg, to null", () => {
            assert.strictEqual(startBuild({ BUILD_DATE: "" }).buildDate, null);
        });

        it("should resolve a build date that is not a number to null", () => {
            assert.strictEqual(startBuild({ BUILD_DATE: "tomorrow" }).buildDate, null);
        });

        it("should resolve a missing build date to null", () => {
            assert.strictEqual(startBuild({}).buildDate, null);
        });
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
