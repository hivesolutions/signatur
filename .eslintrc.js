module.exports = {
    extends: ["hive", "hive/prettier"],
    env: {
        browser: true
    },
    globals: {
        jQuery: "readonly",
        getOptions: "readonly",
        drawText: "readonly",
        deserializeText: "readonly",
        serializeText: "readonly",
        simplifyText: "readonly",
        multifontText: "readonly",
        hasUnsupportedFont: "readonly",
        countLines: "readonly"
    }
};
