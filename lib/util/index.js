const auth = require("./auth");
const base = require("./base");
const config = require("./config");
const date = require("./date");
const emojis = require("./emojis");
const errors = require("./errors");
const locale = require("./locale");
const profile = require("./profile");

Object.assign(module.exports, auth);
Object.assign(module.exports, base);
Object.assign(module.exports, config);
Object.assign(module.exports, date);
Object.assign(module.exports, emojis);
Object.assign(module.exports, errors);
Object.assign(module.exports, locale);
Object.assign(module.exports, profile);
