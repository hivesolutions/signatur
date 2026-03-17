const fs = require("fs");
const path = require("path");

const STATIC = path.join(__dirname, "..", "static");

const CSS_FILES = [
    "css/layout.css",
    "css/gateway.css",
    "css/signature.css",
    "css/viewport.css",
    "css/keyboard.css",
    "css/profile.css",
    "css/modal.css",
    "css/toast.css",
    "css/report.css",
    "css/text.css",
    "css/console.css"
];

const JS_FILES = [
    "js/util.js",
    "js/plugins/fonts.js",
    "js/plugins/keyboard.js",
    "js/plugins/modal.js",
    "js/plugins/toast.js",
    "js/plugins/console.js",
    "js/main.js"
];

const concat = function(files, output) {
    const parts = [];
    for (const file of files) {
        const filePath = path.join(STATIC, file);
        const content = fs.readFileSync(filePath, "utf-8");
        parts.push(content);
    }
    const outputPath = path.join(STATIC, output);
    fs.writeFileSync(outputPath, parts.join("\n"), "utf-8");
    console.log("Built " + outputPath + " (" + files.length + " files)");
};

concat(CSS_FILES, "css/bundle.css");
concat(JS_FILES, "js/bundle.js");
