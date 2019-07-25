// requires the multiple libraries
const express = require("express");
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
    const theme = req.query.theme || "";
    res.render("index", { theme: theme });
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
        result["stack"] = err.stack ? err.stack.split("\n") : [];
    }
    res.status(500);
    res.json(result);
});

app.listen(lib.PORT, lib.HOSTNAME, () => {
    lib.startLogging();
    util.Logging.info("Listening on " + lib.HOSTNAME + ":" + String(lib.PORT));
    lib.init();
});
