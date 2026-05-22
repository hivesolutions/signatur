const util = require("hive-js-util");
const yonius = require("yonius");

const conf = {};

const FEATURES = {
    calligraphy: { env: "FEATURE_CALLIGRAPHY", defaultValue: false },
    feedback: { env: "FEATURE_FEEDBACK", defaultValue: true }
};

const start = async () => {
    await startBase();
    await Promise.all([startConfig(), startLogging()]);
};

const stop = async () => {};

const startBase = async () => {
    await yonius.load();
};

const startConfig = async () => {
    conf.HOST = yonius.conf("HOST", "127.0.0.1");
    conf.PORT = yonius.conf("PORT", 3000, "int");
    conf.BASE_URL = yonius.conf("BASE_URL", `http://localhost:${conf.PORT}`);
    conf.KEY = yonius.conf("SIGNATUR_KEY", null);
    conf.HEADLESS_URL = yonius.conf("HEADLESS_URL", "https://headless.stage.hive.pt");
    conf.PRINT_URL = yonius.conf("PRINT_URL", "https://colony-print.stage.hive.pt");
    conf.PRINT_NODE = yonius.conf("PRINT_NODE", "default");
    conf.PRINT_PRINTER = yonius.conf("PRINT_PRINTER", "printer");
    conf.PRINT_KEY = yonius.conf("PRINT_KEY", null);
    conf.ENGRAVE_NODE = yonius.conf("ENGRAVE_NODE", conf.PRINT_NODE);
    conf.ENGRAVE_PRINTER = yonius.conf("ENGRAVE_PRINTER", conf.PRINT_PRINTER);
    conf.FEATURES = resolveFeaturesBase();
};

const resolveFeaturesBase = () => {
    const truthy = new Set(["1", "true", "yes", "on"]);
    const falsy = new Set(["0", "false", "no", "off"]);
    const base = {};
    for (const name of Object.keys(FEATURES)) {
        const spec = FEATURES[name];
        const raw = yonius.conf(spec.env, null);
        if (raw === null || raw === undefined) {
            base[name] = spec.defaultValue;
            continue;
        }
        const normalized = String(raw).trim().toLowerCase();
        if (truthy.has(normalized)) base[name] = true;
        else if (falsy.has(normalized)) base[name] = false;
        else base[name] = spec.defaultValue;
    }
    return base;
};

const startLogging = () => {
    const level = yonius.conf("LEVEL", "DEBUG").toUpperCase();

    const logger = util.Logging.getLogger(undefined, {
        level: util.Logging.constants[level]
    });

    if (util.Logging.ConsolaHandler.isReady()) {
        logger.addHandler(new util.Logging.ConsolaHandler());
        logger.setFormatter(new util.Logging.SimpleFormatter("{asctime} {message}"));
    } else {
        logger.addHandler(new util.Logging.StreamHandler());
        logger.setFormatter(new util.Logging.SimpleFormatter());
    }
};

const resolveFeatures = session => {
    const resolved = {};
    const base = conf.FEATURES || {};
    for (const name of Object.keys(FEATURES)) {
        const override = session ? session["feature_" + name] : undefined;
        if (override === "1") resolved[name] = true;
        else if (override === "0") resolved[name] = false;
        else resolved[name] = base[name] === true;
    }
    return resolved;
};

module.exports = {
    conf: conf,
    FEATURES: FEATURES,
    resolveFeatures: resolveFeatures,
    start: start,
    stop: stop
};
