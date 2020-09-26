const util = require("hive-js-util");
const yonius = require("yonius");

const conf = {};

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
    conf.KEY = yonius.conf("SIGNATUR_KEY", null);
    conf.HEADLESS_URL = yonius.conf("HEADLESS_URL", "https://headless.stage.hive.pt");
    conf.PRINT_URL = yonius.conf("PRINT_URL", "https://colony-print.stage.hive.pt");
    conf.PRINT_NODE = yonius.conf("PRINT_NODE", "default");
    conf.PRINT_PRINTER = yonius.conf("PRINT_PRINTER", "printer");
    conf.PRINT_KEY = yonius.conf("PRINT_KEY", null);
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

module.exports = {
    conf: conf,
    start: start,
    stop: stop
};
