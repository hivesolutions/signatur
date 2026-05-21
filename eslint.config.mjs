import * as espree from "espree";
import hivePrettier from "eslint-config-hive/prettier";

const browserHelperGlobals = {
    jQuery: "readonly",
    getOptions: "readonly",
    drawText: "readonly",
    deserializeText: "readonly",
    serializeText: "readonly",
    simplifyText: "readonly",
    multifontText: "readonly",
    hasUnsupportedFont: "readonly",
    countLines: "readonly"
};

const mochaGlobals = {
    describe: "readonly",
    it: "readonly",
    before: "readonly",
    after: "readonly",
    beforeEach: "readonly",
    afterEach: "readonly"
};

export default [
    {
        ignores: ["static/js/jSignature.min.js", "static/js/bundle.js"]
    },
    ...hivePrettier,
    {
        languageOptions: {
            parser: espree,
            ecmaVersion: 2024,
            sourceType: "script"
        },
        rules: {
            "no-unused-vars": [
                "error",
                {
                    args: "none",
                    varsIgnorePattern: "^_",
                    caughtErrors: "none"
                }
            ],
            "no-empty": ["error", { allowEmptyCatch: true }]
        }
    },
    {
        files: ["app.js"],
        languageOptions: {
            globals: {
                process: "off"
            }
        }
    },
    {
        files: ["lib/util/config.js"],
        languageOptions: {
            globals: {
                stop: "off"
            }
        }
    },
    {
        files: ["static/js/*.js", "static/js/plugins/**/*.js"],
        languageOptions: {
            globals: browserHelperGlobals
        }
    },
    {
        files: ["static/js/util.js"],
        rules: {
            "no-redeclare": "off"
        }
    },
    {
        files: ["test/**/*.js"],
        languageOptions: {
            globals: mochaGlobals
        }
    }
];
