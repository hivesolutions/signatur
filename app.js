// requires the multiple libraries
const express = require("express");
const session = require("express-session");
const path = require("path");
const process = require("process");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const expressLayouts = require("express-ejs-layouts");
const util = require("hive-js-util");
const info = require("./package");
const lib = require("./lib");

// builds the initial application object to be used
// by the application for serving
const app = express();

// initializes the session middleware with the pre-defined
// session password (for encryption)
app.use(
    session({
        secret: "keyboard cat",
        cookie: { maxAge: 60000000 },
        resave: true,
        saveUninitialized: true
    })
);

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

app.get(["/", "/gateway"], (req, res, next) => {
    const fullscreen = req.query.fullscreen === "1";
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.theme = theme;
    req.session.locale = locale;
    res.render("gateway" + (locale ? `-${locale}` : ""), {
        fullscreen: fullscreen,
        theme: theme,
        config: req.session.config || {}
    });
});

app.post("/gateway", (req, res, next) => {
    req.session.config = Object.assign({}, req.body);
    const elements = req.session.config.elements;
    switch (elements) {
        case "text":
            res.redirect(302, "/viewport");
            break;
        case "digital_printing":
        case "graphic_element":
            res.redirect(302, "/report");
            break;
        case "calligraphy":
        default:
            res.redirect(302, "/signature");
            break;
    }
});

app.get("/signature", (req, res, next) => {
    const fullscreen = req.query.fullscreen === "1";
    const theme = req.query.theme || req.session.theme || "";
    req.session.theme = theme;
    res.render("signature", {
        fullscreen: fullscreen,
        theme: theme
    });
});

app.get("/viewport", (req, res, next) => {
    const fullscreen = req.query.fullscreen === "1";
    const theme = req.query.theme || req.session.theme || "";
    req.session.theme = theme;
    req.session.config = req.session.config || {};
    req.session.config.text = req.query.text || req.session.config.text || null;
    res.render("viewport", {
        fullscreen: fullscreen,
        theme: theme,
        config: req.session.config || {},
        text: lib.deserializeText(req.session.config.text) || null
    });
});

app.get("/report", (req, res, next) => {
    const fullscreen = req.query.fullscreen === "1";
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.theme = theme;
    req.session.locale = locale;
    req.session.config = req.session.config || {};
    req.session.config.text = req.query.text || req.session.config.text || null;
    res.render("report" + (locale ? `-${locale}` : ""), {
        fullscreen: fullscreen,
        theme: theme,
        conf: lib.conf,
        config: req.session.config || {},
        text: lib.deserializeText(req.session.config.text) || null
    });
});

app.get("/receipt", (req, res, next) => {
    async function clojure() {
        const locale = req.query.locale || req.session.locale || "";
        req.session.locale = locale;
        req.session.config = req.session.config || {};
        req.session.config.text = req.query.text || req.session.config.text || null;
        const response = await fetch(
            `${lib.conf.HEADLESS_URL}/?full_page=0&trim=1&url=http://4ce02f7f177b.ngrok.io/text?text=Helvetica%204L:R-Helvetica%204L:R-Helvetica%204L:R-Cool%20Emojis:j-Cool%20Emojis:j`
        );
        const imageBuffer = await response.buffer();
        const imageBase64 = imageBuffer.toString("base64");
        res.render("receipt" + (locale ? `-${locale}` : ""), {
            config: req.session.config || {},
            textImageBase64: imageBase64
        });
    }
    clojure().catch(next);
});

app.get("/text", (req, res, next) => {
    req.session.config = req.session.config || {};
    req.session.config.text = req.query.text || req.session.config.text || null;
    res.render("text", {
        config: req.session.config || {},
        text: lib.deserializeText(req.session.config.text) || null
    });
});

app.get("/config", (req, res, next) => {
    res.json(req.session.config || {});
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
