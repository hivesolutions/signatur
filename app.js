// requires the multiple libraries
const express = require("express");
const session = require("express-session");
const path = require("path");
const process = require("process");
const bodyParser = require("body-parser");
const expressLayouts = require("express-ejs-layouts");
const util = require("hive-js-util");
const info = require("./package");
const lib = require("./lib");

// builds the initial application object to be used
// by the application for serving
const app = express();

// initializes the session middleware with the pre-defined
// session password (for encryption)
app.use(session({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: true
}));

process.on("SIGINT", function() {
    process.exit();
});

process.on("SIGTERM", function() {
    process.exit();
});

process.on("exit", () => {
    util.Logging.info("Exiting on user's request");
    lib.destroy();
});

app.set("view engine", "ejs");
app.use(expressLayouts);

app.use("/static", express.static(path.join(__dirname, "static")));
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res, next) => {
    res.redirect(302, "/signature");
});

app.get("/gateway", (req, res, next) => {
    const fullscreen = req.query.fullscreen === "1";
    const theme = req.query.theme || "";
    res.render("gateway", {
        fullscreen: fullscreen,
        theme: theme
    });
});

app.post("/gateway", (req, res, next) => {
    req.session.config = req.body;
    res.redirect(302, "/signature");
});

app.get("/signature", (req, res, next) => {
    const fullscreen = req.query.fullscreen === "1";
    const theme = req.query.theme || "";
    res.render("signature", {
        fullscreen: fullscreen,
        theme: theme
    });
});

app.get("/viewport", (req, res, next) => {
    const fullscreen = req.query.fullscreen === "1";
    const theme = req.query.theme || "";
    res.render("viewport", {
        fullscreen: fullscreen,
        theme: theme
    });
});

app.get("/report", (req, res, next) => {
    const fullscreen = req.query.fullscreen === "1";
    const theme = req.query.theme || "";
    res.render("report", {
        fullscreen: fullscreen,
        theme: theme,
        config: req.session.config
    });
});

app.get("/engine", (req, res, next) => {
    async function clojure() {
        lib.verifyKey(req);
        const engine = req.query.engine || "inkscape";
        const engineModule = lib.ENGINES[engine];
        const engineInstance = engineModule.singleton();
        await engineInstance.info(req, res, next);
    }
    clojure().catch(next);
});

app.post("/convert", (req, res, next) => {
    async function clojure() {
        lib.verifyKey(req);
        const engine = req.query.engine || "inkscape";
        const engineModule = lib.ENGINES[engine];
        const engineInstance = engineModule.singleton();
        await engineInstance.convert(req, res, next);
    }
    clojure().catch(next);
});

app.get("/info", (req, res, next) => {
    res.json({
        name: info.name,
        version: info.version,
        node: process.version
    });
});

app.use((req, res, next) => {
    res.status(404);
    res.json({ error: "Route not found", code: 404 });
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    const result = { error: err.message, code: 500 };
    if (process.env.NODE_ENV !== "production") {
        result.stack = err.stack ? err.stack.split("\n") : [];
    }
    res.status(500);
    res.json(result);
});

(async () => {
    await lib.start();
    try {
        app.listen(lib.conf.PORT, lib.conf.HOST, () => {
            try {
                util.Logging.info("Listening on " + lib.conf.HOST + ":" + String(lib.conf.PORT));
                lib.init();
            } catch (err) {
                util.Logging.error(err);
            }
        });
    } finally {
        await lib.stop();
    }
})();
