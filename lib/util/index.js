const base = require("./base");
const config = require("./config");
const date = require("./date");
const errors = require("./errors");
const locale = require("./locale");

Object.assign(module.exports, base);
Object.assign(module.exports, config);
Object.assign(module.exports, date);
Object.assign(module.exports, errors);
Object.assign(module.exports, locale);
