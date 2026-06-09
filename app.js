// requires the multiple libraries
const fs = require("fs/promises");
const express = require("express");
const cookieSession = require("cookie-session");
const path = require("path");
const process = require("process");
const bodyParser = require("body-parser");
const multer = require("multer");
const JSZip = require("jszip");
const ejs = require("ejs");
const util = require("hive-js-util");
const info = require("./package");
const lib = require("./lib");

// imports the master configuration JSON and converts it
// into a proper base 64 string ready to be used in front-end
const master = require("./config/master.json");
const masterb64 = Buffer.from(JSON.stringify(master)).toString("base64");

// builds the initial application object to be used
// by the application for serving
const app = express();

// initializes the session middleware using a cookie based store
// so the whole session payload travels in the signed cookie and
// no server side storage is required; the signing keys are read
// from `lib.conf.SESSION_SECRET` (comma separated to support
// rotation, first entry signs new cookies, the rest still
// validate old ones) and fall back to a placeholder so the
// local dev flow keeps working without any environment setup;
// the lifetime is `lib.conf.SESSION_MAX_AGE` (ms), defaulting
// to ~6 months
app.use(
    cookieSession({
        name: "signatur.sid",
        keys: lib.conf.SESSION_SECRET,
        httpOnly: true,
        maxAge: lib.conf.SESSION_MAX_AGE,
        sameSite: "lax"
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

app.engine("ejs", (filename, payload = {}, cb) => {
    payload.lib = lib;
    ejs.renderFile(filename, payload, {}, cb);
});
app.set("view engine", "ejs");

app.locals.dev = process.env.NODE_ENV !== "production";

app.use("/static", express.static(path.join(__dirname, "static")));
app.use(bodyParser.urlencoded({ extended: true }));

// list of public route prefixes that bypass the global require
// user middleware so the login flow, the favicon and the public
// info endpoint can be reached without an authenticated session;
// the engine convert endpoint stays public so colony print can
// keep posting svgs validated through the existing key header,
// the static mount falls past express.static for missing assets
// so it must be public to keep returning a clean 404 instead of
// redirecting to /login, and the text route is hit by Headless
// from /receipt and /image without the user's cookie so it must
// also stay reachable for those rendering flows to work
const PUBLIC_PATHS = [
    "/login",
    "/logout",
    "/info",
    "/favicon.ico",
    "/static",
    "/convert",
    "/text"
];

// global authentication middleware that enforces a logged in
// user on every interactive route, allowing only the small list
// of public paths above through; admin only routes apply the
// `lib.requireAdmin` middleware directly below
app.use((req, res, next) => {
    const isPublic = PUBLIC_PATHS.some(prefix => req.path === prefix || req.path.startsWith(prefix + "/"));
    if (isPublic) {
        next();
        return;
    }
    lib.requireUser(req, res, next);
});

// configures the multer middleware that parses the multipart
// payload of the profile form, accepting only text fields since
// background images are now managed by the dedicated asset
// endpoints under `/profiles/assets`
const profileUpload = multer().none();

// configures the multer middleware that handles the multipart
// upload of a single PNG asset, keeping it in memory so the
// magic bytes can be validated before the file is written
const assetUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
}).single("file");

// configures the multer middleware that handles the multipart
// upload of a single profiles bundle zip, keeping it in memory
// so the archive can be unpacked before the on disk profiles
// directory is replaced
const bundleUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 }
}).single("file");

// configures the multer middleware that handles the cool emojis
// font upload, accepting a required TTF/OTF font payload and an
// optional mapping JSON payload kept in memory so both bodies can
// be validated upfront before the on disk fonts directory is
// touched
const emojisUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 2 }
}).fields([
    { name: "font", maxCount: 1 },
    { name: "mapping", maxCount: 1 }
]);

// configures the multer middleware that handles the multipart
// upload of a single emoji `.f3s` payload, keeping it in
// memory so the filename and the body can be validated before
// the engraving fonts directory is touched
const emojisF3sUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
}).single("file");

// configures the multer middleware that handles the paired
// upload of a text font, accepting both the browser `.ttf`
// payload and the engraving `.f3s` payload together so the
// two halves stay consistent on disk
const fontsUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 2 }
}).fields([
    { name: "ttf", maxCount: 1 },
    { name: "f3s", maxCount: 1 }
]);

app.get("/", (req, res, next) => {
    // forwards the bare root URL to the user's preferred home
    // landing page, defaulting to the classic gateway when no
    // explicit preference has been stored on the session yet
    const home = req.session.home === "welcome" ? "/welcome" : "/gateway";
    res.redirect(302, home);
});

app.get("/login", (req, res, next) => {
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    const nextUrl = typeof req.query.next === "string" ? req.query.next : "";
    const error = typeof req.query.error === "string" ? req.query.error : "";
    res.render("login" + (locale ? `-${locale}` : ""), {
        theme: theme,
        next: nextUrl,
        error: error
    });
});

app.post("/login", async (req, res, next) => {
    async function clojure() {
        const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const nextRaw = typeof req.body.next === "string" ? req.body.next : "";
        const safeNext = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
        const user = await lib.verifyCredentials(username, password);
        if (!user) {
            const params = new URLSearchParams();
            params.set("error", "invalid");
            if (nextRaw) params.set("next", nextRaw);
            res.redirect(302, "/login?" + params.toString());
            return;
        }
        req.session.user = user;
        res.redirect(302, safeNext);
    }
    clojure().catch(next);
});

const handleLogout = (req, res) => {
    if (req.session) req.session.user = null;
    res.redirect(302, "/login");
};
app.get("/logout", handleLogout);
app.post("/logout", handleLogout);

app.get("/gateway", (req, res, next) => {
    const fullscreen =
        req.query.fullscreen !== undefined
            ? req.query.fullscreen === "1"
            : req.session.fullscreen === "1";
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.fullscreen = fullscreen ? "1" : "0";
    req.session.theme = theme;
    req.session.locale = locale;
    res.render("gateway" + (locale ? `-${locale}` : ""), {
        fullscreen: fullscreen,
        theme: theme,
        master: master,
        masterb64: masterb64,
        config: req.session.config || {},
        showOptions: req.session.show_options !== "0",
        info: info || {}
    });
});

app.post("/gateway", (req, res, next) => {
    req.session.config = Object.assign({}, req.body);
    const elements = req.session.config.elements;

    // remembers the entry point that submitted the gateway form
    // so that downstream views can render a back button that
    // returns to the same place the user came from
    req.session.entry = req.body.entry === "welcome" ? "welcome" : "gateway";

    // builds the optional profile/variant query string so that
    // a template selection made on the welcome screen is forwarded
    // to the editor for automatic pre-selection
    const params = new URLSearchParams();
    if (req.session.config.profile) params.set("profile", req.session.config.profile);
    if (req.session.config.variant) params.set("variant", req.session.config.variant);
    const query = params.toString() ? "?" + params.toString() : "";

    switch (elements) {
        case "text":
            res.redirect(302, "/viewport" + query);
            break;
        case "digital_printing":
        case "graphic_element":
            res.redirect(302, "/report" + query);
            break;
        case "calligraphy":
        default:
            res.redirect(302, "/signature" + query);
            break;
    }
});

app.get("/settings", lib.requireAdmin, (req, res, next) => {
    const fullscreen =
        req.query.fullscreen !== undefined
            ? req.query.fullscreen === "1"
            : req.session.fullscreen === "1";
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.fullscreen = fullscreen ? "1" : "0";
    req.session.theme = theme;
    req.session.locale = locale;

    // resolves the next URL to redirect to after saving so the user
    // returns to the screen they came from instead of always landing
    // on the welcome page
    const nextUrl = typeof req.query.next === "string" ? req.query.next : "";
    res.render("settings" + (locale ? `-${locale}` : ""), {
        fullscreen: fullscreen,
        theme: theme,
        locale: locale,
        conf: lib.conf,
        home: req.session.home === "welcome" ? "welcome" : "gateway",
        showOptions: req.session.show_options !== "0",
        viewportMode: req.session.viewport_mode === "store" ? "store" : "technical",
        features: lib.resolveFeatures(req.session),
        featuresBase: lib.conf.FEATURES || {},
        featuresOverride: Object.keys(lib.FEATURES || {}).reduce((accumulator, name) => {
            accumulator[name] = req.session["feature_" + name];
            return accumulator;
        }, {}),
        next: nextUrl,
        info: info || {}
    });
});

app.post("/settings", lib.requireAdmin, (req, res, next) => {
    const theme = req.body.theme || "";
    const locale = req.body.locale || "";
    req.session.theme = theme;
    req.session.locale = locale;
    req.session.home = req.body.home === "welcome" ? "welcome" : "gateway";
    req.session.show_options = req.body.show_options === "0" ? "0" : "1";
    req.session.viewport_mode = req.body.viewport_mode === "store" ? "store" : "technical";

    // persists every declared feature flag override sent through the
    // features tab onto the session, treating `1` / `0` as explicit
    // overrides and anything else as a clear so the base value from
    // the matching `FEATURE_<NAME>` env var takes over again
    for (const name of Object.keys(lib.FEATURES || {})) {
        const value = req.body["feature_" + name];
        if (value === "1") req.session["feature_" + name] = "1";
        else if (value === "0") req.session["feature_" + name] = "0";
        else delete req.session["feature_" + name];
    }

    // resolves the redirect target from the submitted next field
    // restricting it to local paths so the form cannot be used as
    // an open redirect, falling back to the bare `/` so the user
    // lands on the configured home (gateway or welcome) according
    // to the freshly saved `home` preference instead of being
    // hardcoded to the welcome screen
    const target =
        typeof req.body.next === "string" && req.body.next.startsWith("/")
            ? req.body.next
            : "/";

    // persists the fullscreen flag onto the session so that it
    // survives the next request without polluting the redirect
    // query string
    req.session.fullscreen = req.body.fullscreen === "1" ? "1" : "0";

    res.redirect(302, target);
});

app.post("/settings/diagnostics", lib.requireAdmin, (req, res, next) => {
    async function clojure() {
        const engine = lib.ENGINES.inkscape.singleton();
        const probes = await engine.probe();
        const fixturePath = path.join(__dirname, "res", "diagnostic.svg");
        const svgBuffer = await fs.readFile(fixturePath);
        const steps = await engine.diagnose(svgBuffer);
        res.json({ probes: probes, steps: steps });
    }
    clojure().catch(next);
});

app.post("/settings/emojis", lib.requireAdmin, emojisUpload, (req, res, next) => {
    async function clojure() {
        const errors = [];

        // resolves the uploaded payloads from the multer fields output
        // so the validation and the disk writes can treat the optional
        // mapping body the same way regardless of whether the client
        // included it on the submission
        const fontFile = req.files && req.files.font ? req.files.font[0] : null;
        const mappingFile = req.files && req.files.mapping ? req.files.mapping[0] : null;

        if (!fontFile) {
            errors.push("font is required");
        } else {
            for (const message of lib.validateEmojisFont(fontFile.buffer)) {
                errors.push(message);
            }
        }

        // walks the optional mapping payload through the validator so
        // a malformed JSON body cannot land on disk and break the
        // viewport consumer that expects character to name pairs for
        // every glyph in the emoji catalog
        if (mappingFile) {
            const mappingText = mappingFile.buffer.toString("utf8");
            for (const message of lib.validateEmojisMapping(mappingText)) {
                errors.push(message);
            }
        }

        if (errors.length > 0) {
            res.status(400).json({ errors: errors });
            return;
        }

        // writes the validated font payload over the existing display
        // font and, when provided, the validated mapping body so the
        // next viewport load picks up the freshly uploaded set without
        // any further server side intervention
        const fontsDirectory = path.join(__dirname, "static", "fonts");
        const fontPath = path.join(fontsDirectory, "coolemojis.ttf");
        await fs.writeFile(fontPath, fontFile.buffer);
        if (mappingFile) {
            const mappingPath = path.join(fontsDirectory, "coolemojis.mapping.json");
            await fs.writeFile(mappingPath, mappingFile.buffer);
        }

        res.json({ status: "ok", mapping: Boolean(mappingFile) });
    }
    clojure().catch(next);
});

app.get("/settings/emojis/f3s", lib.requireAdmin, (req, res, next) => {
    async function clojure() {
        const directoryPath = path.join(__dirname, "static", "fonts", "f3s", "emoji");
        let files = [];
        try {
            files = await fs.readdir(directoryPath);
        } catch (err) {
            // missing directory is treated as an empty catalog so the
            // first ever upload can lazily create the tree without an
            // out of band initialization step
        }
        const fonts = [];
        for (const file of files) {
            if (!lib.EMOJI_F3S_FILENAME_PATTERN.test(file)) continue;
            const stat = await fs.stat(path.join(directoryPath, file));
            fonts.push({ name: file, size: stat.size, mtime: stat.mtimeMs });
        }
        fonts.sort((a, b) => a.name.localeCompare(b.name));
        res.json({ fonts: fonts });
    }
    clojure().catch(next);
});

app.post("/settings/emojis/f3s", lib.requireAdmin, emojisF3sUpload, (req, res, next) => {
    async function clojure() {
        const errors = [];

        // requires both the filename and the file payload so the
        // resulting entry has a deterministic on disk name that
        // can be referenced from the bundled `coolemojis.mapping.json`
        const filename = typeof req.body.filename === "string" ? req.body.filename.trim() : "";
        if (!filename) {
            errors.push("filename is required");
        } else if (!lib.EMOJI_F3S_FILENAME_PATTERN.test(filename)) {
            errors.push(
                "filename must match pattern: lowercase alphanumeric with hyphens or dots and a .f3s extension"
            );
        }

        if (!req.file) {
            errors.push("file is required");
        }

        if (errors.length > 0) {
            res.status(400).json({ errors: errors });
            return;
        }

        // lazily creates the destination tree on the first ever
        // upload so the operator does not need to seed any folder
        // before the admin upload becomes available
        const directoryPath = path.join(__dirname, "static", "fonts", "f3s", "emoji");
        await fs.mkdir(directoryPath, { recursive: true });
        const targetPath = path.join(directoryPath, filename);
        await fs.writeFile(targetPath, req.file.buffer);
        res.json({ status: "ok", filename: filename });
    }
    clojure().catch(next);
});

app.post("/settings/emojis/f3s/:filename/delete", lib.requireAdmin, (req, res, next) => {
    async function clojure() {
        const filename = req.params.filename;
        if (!lib.EMOJI_F3S_FILENAME_PATTERN.test(filename)) {
            res.status(400).json({ error: "invalid f3s filename" });
            return;
        }

        const directoryPath = path.join(__dirname, "static", "fonts", "f3s", "emoji");
        const targetPath = path.join(directoryPath, filename);
        try {
            await fs.unlink(targetPath);
        } catch (err) {
            res.status(404).json({ error: "f3s entry not found" });
            return;
        }

        res.json({ status: "ok" });
    }
    clojure().catch(next);
});

// names owned by the Emojis tab that must stay out of the Fonts
// catalog so deleting an entry from the Fonts tab can never unlink
// the display halves of the bundled Cool Emojis font face declared
// in `static/css/layout.css`
const EMOJIS_OWNED_FONTS = new Set(["coolemojis", "coolemojisp"]);

app.get("/settings/fonts", lib.requireAdmin, (req, res, next) => {
    async function clojure() {
        const fontsDirectory = path.join(__dirname, "static", "fonts");
        const f3sDirectory = path.join(fontsDirectory, "f3s", "fonts");
        let ttfFiles = [];
        let f3sFiles = [];
        try {
            ttfFiles = await fs.readdir(fontsDirectory);
        } catch (err) {
            // missing root fonts directory is unexpected at runtime,
            // but treating it as an empty catalog keeps the endpoint
            // resilient during the very first deployment
        }
        try {
            f3sFiles = await fs.readdir(f3sDirectory);
        } catch (err) {
            // missing f3s subdirectory is treated as no installed
            // engraving payloads so the first ever upload can lazily
            // create the tree without an out of band step
        }

        // collects the base names of every accepted `.ttf` and `.f3s`
        // entry so the response can surface only the names that
        // satisfy the paired upload requirement of the Fonts tab
        // while still listing partial state for ops; the suffix
        // checks are case sensitive so an uppercase `Font.TTF` entry
        // is skipped instead of being later stat'd as a lowercase
        // path that does not exist on case sensitive filesystems
        const ttfNames = new Set();
        const f3sNames = new Set();
        for (const file of ttfFiles) {
            if (!file.endsWith(".ttf")) continue;
            const name = file.slice(0, -4);
            if (!lib.FONT_NAME_PATTERN.test(name)) continue;
            if (EMOJIS_OWNED_FONTS.has(name)) continue;
            ttfNames.add(name);
        }
        for (const file of f3sFiles) {
            if (!file.endsWith(".f3s")) continue;
            const name = file.slice(0, -4);
            if (!lib.FONT_NAME_PATTERN.test(name)) continue;
            if (EMOJIS_OWNED_FONTS.has(name)) continue;
            f3sNames.add(name);
        }

        const names = Array.from(new Set([...ttfNames, ...f3sNames]));
        names.sort();
        const fonts = [];
        for (const name of names) {
            const entry = { name: name, ttf: null, f3s: null };
            if (ttfNames.has(name)) {
                const stat = await fs.stat(path.join(fontsDirectory, `${name}.ttf`));
                entry.ttf = { size: stat.size, mtime: stat.mtimeMs };
            }
            if (f3sNames.has(name)) {
                const stat = await fs.stat(path.join(f3sDirectory, `${name}.f3s`));
                entry.f3s = { size: stat.size, mtime: stat.mtimeMs };
            }
            fonts.push(entry);
        }
        res.json({ fonts: fonts });
    }
    clojure().catch(next);
});

app.post("/settings/fonts", lib.requireAdmin, fontsUpload, (req, res, next) => {
    async function clojure() {
        const errors = [];

        // requires the font name plus both the browser and the
        // engraving payloads so the resulting on disk pair stays
        // consistent and can be uniquely identified through the
        // canonical `<name>.ttf` and `<name>.f3s` filenames
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        if (!name) {
            errors.push("name is required");
        } else if (!lib.FONT_NAME_PATTERN.test(name)) {
            errors.push(
                "name must match pattern: lowercase alphanumeric with hyphens"
            );
        } else if (EMOJIS_OWNED_FONTS.has(name)) {
            errors.push("name is reserved by the Emojis tab");
        }

        const ttfFile = req.files && req.files.ttf ? req.files.ttf[0] : null;
        const f3sFile = req.files && req.files.f3s ? req.files.f3s[0] : null;
        if (!ttfFile) errors.push("ttf is required");
        if (!f3sFile) errors.push("f3s is required");

        if (ttfFile) {
            for (const message of lib.validateEmojisFont(ttfFile.buffer)) {
                errors.push(message);
            }
        }

        if (errors.length > 0) {
            res.status(400).json({ errors: errors });
            return;
        }

        // writes both payloads side by side, lazily creating the
        // engraving subdirectory so a brand new deployment does
        // not require any out of band initialization before the
        // first font upload can land
        const fontsDirectory = path.join(__dirname, "static", "fonts");
        const f3sDirectory = path.join(fontsDirectory, "f3s", "fonts");
        await fs.mkdir(f3sDirectory, { recursive: true });
        await fs.writeFile(path.join(fontsDirectory, `${name}.ttf`), ttfFile.buffer);
        await fs.writeFile(path.join(f3sDirectory, `${name}.f3s`), f3sFile.buffer);

        res.json({ status: "ok", name: name });
    }
    clojure().catch(next);
});

app.post("/settings/fonts/:name/delete", lib.requireAdmin, (req, res, next) => {
    async function clojure() {
        const name = req.params.name;
        if (!lib.FONT_NAME_PATTERN.test(name)) {
            res.status(400).json({ error: "invalid font name" });
            return;
        }
        if (EMOJIS_OWNED_FONTS.has(name)) {
            res.status(400).json({ error: "name is reserved by the Emojis tab" });
            return;
        }

        // removes both halves of the font pair, treating missing
        // files as already deleted so a re-run cleans up any
        // partial state left behind by a previous failure
        const fontsDirectory = path.join(__dirname, "static", "fonts");
        const targets = [
            path.join(fontsDirectory, `${name}.ttf`),
            path.join(fontsDirectory, "f3s", "fonts", `${name}.f3s`)
        ];
        let removed = false;
        for (const target of targets) {
            try {
                await fs.unlink(target);
                removed = true;
            } catch (err) {
                // ignores files that do not exist on disk
            }
        }

        if (!removed) {
            res.status(404).json({ error: "font not found" });
            return;
        }

        res.json({ status: "ok" });
    }
    clojure().catch(next);
});

app.get("/settings/fonts/resolve", (req, res, next) => {
    async function clojure() {
        const names = typeof req.query.names === "string" ? req.query.names : "";
        const requested = names
            .split(",")
            .map(value => value.trim())
            .filter(Boolean)
            .slice(0, 128);

        // resolves each requested name from either the emoji or the
        // text font subdirectory, base64 encoding the payload that
        // is found first so the caller can attach it to the gravo
        // print payload as part of the `extra_fonts` envelope;
        // names that do not match the filename pattern or that have
        // no corresponding payload are silently dropped so the
        // caller still receives a partial response without leaking
        // the missing entries through an error
        const fontsDirectory = path.join(__dirname, "static", "fonts");
        const candidates = [
            path.join(fontsDirectory, "f3s", "emoji"),
            path.join(fontsDirectory, "f3s", "fonts")
        ];
        const fonts = {};
        for (const name of requested) {
            const filename = `${name}.f3s`;
            if (!lib.EMOJI_F3S_FILENAME_PATTERN.test(filename)) continue;
            for (const directory of candidates) {
                const candidatePath = path.join(directory, filename);
                try {
                    const buffer = await fs.readFile(candidatePath);
                    fonts[name] = buffer.toString("base64");
                    break;
                } catch (err) {
                    // not found at this candidate, keep walking
                }
            }
        }
        res.json({ fonts: fonts });
    }
    clojure().catch(next);
});

app.get("/welcome", (req, res, next) => {
    const fullscreen =
        req.query.fullscreen !== undefined
            ? req.query.fullscreen === "1"
            : req.session.fullscreen === "1";
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.fullscreen = fullscreen ? "1" : "0";
    req.session.theme = theme;
    req.session.locale = locale;
    res.render("welcome" + (locale ? `-${locale}` : ""), {
        fullscreen: fullscreen,
        theme: theme,
        master: master,
        masterb64: masterb64,
        config: req.session.config || {},
        showOptions: req.session.show_options !== "0",
        viewportMode: req.session.viewport_mode === "store" ? "store" : "technical",
        info: info || {},
        user: req.session.user || null
    });
});

app.get("/signature", (req, res, next) => {
    const fullscreen =
        req.query.fullscreen !== undefined
            ? req.query.fullscreen === "1"
            : req.session.fullscreen === "1";
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.fullscreen = fullscreen ? "1" : "0";
    req.session.theme = theme;
    req.session.locale = locale;
    res.render("signature" + (locale ? `-${locale}` : ""), {
        fullscreen: fullscreen,
        theme: theme,
        back: "/"
    });
});

app.get("/viewport", (req, res, next) => {
    const fullscreen =
        req.query.fullscreen !== undefined
            ? req.query.fullscreen === "1"
            : req.session.fullscreen === "1";
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.fullscreen = fullscreen ? "1" : "0";
    req.session.theme = theme;
    req.session.locale = locale;
    req.session.config = req.session.config || {};
    req.session.config.text = req.query.text || req.session.config.text || null;
    const features = lib.resolveFeatures(req.session);
    res.render("viewport" + (locale ? `-${locale}` : ""), {
        fullscreen: fullscreen,
        theme: theme,
        conf: lib.conf,
        master: master,
        masterb64: masterb64,
        options: master[req.session.config.technology] || {},
        config: req.session.config || {},
        text: lib.deserializeText(req.session.config.text) || null,
        viewportMode: req.session.viewport_mode === "store" ? "store" : "technical",
        features: features,
        featuresb64: Buffer.from(JSON.stringify(features)).toString("base64"),
        back: "/"
    });
});

app.get("/report", (req, res, next) => {
    const fullscreen =
        req.query.fullscreen !== undefined
            ? req.query.fullscreen === "1"
            : req.session.fullscreen === "1";
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.fullscreen = fullscreen ? "1" : "0";
    req.session.theme = theme;
    req.session.locale = locale;
    req.session.config = req.session.config || {};
    req.session.config.text = req.query.text || req.session.config.text || null;
    res.render("report" + (locale ? `-${locale}` : ""), {
        fullscreen: fullscreen,
        theme: theme,
        conf: lib.conf,
        locale: locale,
        config: req.session.config || {},
        text: lib.deserializeText(req.session.config.text) || null,
        font: lib.fontText(req.session.config.text) || null,
        localize: (v, f) => lib.localize(v, locale || undefined, f),
        back: "/"
    });
});

app.get("/console", (req, res, next) => {
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.theme = theme;
    req.session.locale = locale;
    res.render("console" + (locale ? `-${locale}` : ""), {
        theme: theme
    });
});

app.get("/components", (req, res, next) => {
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.theme = theme;
    req.session.locale = locale;
    res.render("components", {
        theme: theme
    });
});

app.get("/receipt", (req, res, next) => {
    async function clojure() {
        const locale = req.query.locale || req.session.locale || "";
        req.session.locale = locale;
        req.session.config = req.session.config || {};
        req.session.config.text = req.query.text || req.session.config.text || null;
        const remoteUrl = `${lib.conf.BASE_URL}/text?text=${encodeURIComponent(
            req.session.config.text
        )}`;
        const response = await fetch(
            `${lib.conf.HEADLESS_URL}/?full_page=0&trim=1&url=${encodeURIComponent(remoteUrl)}`
        );
        if (response.status !== 200) throw new Error("Not possible to retrieve remote image");
        const imageBuffer = await response.buffer();
        const imageBase64 = imageBuffer.toString("base64");
        res.render("receipt" + (locale ? `-${locale}` : ""), {
            config: req.session.config || {},
            font: lib.fontText(req.session.config.text) || null,
            textImageBase64: imageBase64,
            localize: (v, f) => lib.localize(v, locale || undefined, f)
        });
    }
    clojure().catch(next);
});

app.get("/text", (req, res, next) => {
    const locale = req.query.locale || req.session.locale || "";
    req.session.locale = locale;
    req.session.config = req.session.config || {};
    req.session.config.text = req.query.text || req.session.config.text || null;
    res.render("text" + (locale ? `-${locale}` : ""), {
        config: req.session.config || {},
        text: lib.deserializeText(req.session.config.text) || null
    });
});

app.get("/image", (req, res, next) => {
    async function clojure() {
        const locale = req.query.locale || req.session.locale || "";
        req.session.locale = locale;
        req.session.config = req.session.config || {};
        req.session.config.text = req.query.text || req.session.config.text || null;
        const remoteUrl = `${lib.conf.BASE_URL}/text?text=${encodeURIComponent(
            req.session.config.text
        )}`;
        const response = await fetch(
            `${lib.conf.HEADLESS_URL}/?full_page=0&trim=1&url=${encodeURIComponent(remoteUrl)}`
        );
        if (response.status !== 200) throw new Error("Not possible to retrieve remote image");
        const imageBuffer = await response.buffer();
        res.contentType("image/png");
        res.send(imageBuffer);
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

app.post("/feedback", (req, res, next) => {
    async function clojure() {
        // ensures the feedback feature is currently enabled for the
        // requester so disabled deployments do not accept submissions
        const features = lib.resolveFeatures(req.session);
        if (!features.feedback) {
            res.status(404).json({ error: "feedback feature is disabled" });
            return;
        }

        // validates the satisfaction value against the small set of
        // allowed multiple choice answers so the on disk payload stays
        // consistent and easy to aggregate later
        const allowedSatisfaction = new Set([
            "very_satisfied",
            "satisfied",
            "neutral",
            "unsatisfied",
            "very_unsatisfied"
        ]);
        const satisfaction = typeof req.body.satisfaction === "string" ? req.body.satisfaction : "";
        if (!allowedSatisfaction.has(satisfaction)) {
            res.status(400).json({ error: "invalid satisfaction value" });
            return;
        }

        // captures the optional free text notes, trimming any leading
        // or trailing whitespace and applying a sensible upper bound
        // so the persisted entries cannot grow unbounded
        const notesRaw = typeof req.body.notes === "string" ? req.body.notes : "";
        const notes = notesRaw.trim().slice(0, 2000);

        // builds the entry payload, capturing the contextual fields the
        // client sends so the feedback can be cross referenced with the
        // engraving submission it relates to
        const entry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            satisfaction: satisfaction,
            notes: notes,
            profile: typeof req.body.profile === "string" ? req.body.profile : null,
            variant: typeof req.body.variant === "string" ? req.body.variant : null,
            locale: req.session.locale || null
        };

        // groups the feedback submissions by year, month and day in
        // separate subdirectories derived from the ISO timestamp so
        // the on disk layout stays easy to navigate as the number of
        // entries grows, while each entry remains its own JSON file
        // named after the generated identifier for easy inspection
        // and per file aggregation
        const year = entry.timestamp.slice(0, 4);
        const month = entry.timestamp.slice(5, 7);
        const day = entry.timestamp.slice(8, 10);
        const directoryPath = path.join(__dirname, "data", "feedback", year, month, day);
        await fs.mkdir(directoryPath, { recursive: true });
        const entryPath = path.join(directoryPath, `${entry.id}.json`);
        await fs.writeFile(entryPath, JSON.stringify(entry, null, 4) + "\n", "utf8");
        res.json({ id: entry.id });
    }
    clojure().catch(next);
});

app.get("/config", (req, res, next) => {
    res.json(req.session.config || {});
});

app.get("/profiles/manager", lib.requireAdmin, (req, res, next) => {
    async function clojure() {
        const fullscreen =
            req.query.fullscreen !== undefined
                ? req.query.fullscreen === "1"
                : req.session.fullscreen === "1";
        const theme = req.query.theme || req.session.theme || "";
        const locale = req.query.locale || req.session.locale || "";
        req.session.fullscreen = fullscreen ? "1" : "0";
        req.session.theme = theme;
        req.session.locale = locale;

        // pre-loads the profile and inspirations payloads from disk
        // when the page is opened in edit mode so the editor starts
        // with the current template contents ready for tweaks
        const editId = typeof req.query.edit === "string" ? req.query.edit : "";
        let profileJson = "";
        let inspirationsJson = "";
        let editTarget = "";
        if (editId && lib.PROFILE_ID_PATTERN.test(editId)) {
            const directoryPath = path.join(__dirname, "static", "profiles");
            try {
                const profileContent = await fs.readFile(
                    path.join(directoryPath, `${editId}.json`),
                    "utf8"
                );
                profileJson = profileContent.replace(/\s+$/, "");
                editTarget = editId;
            } catch (err) {
                // silently ignores missing profile files and renders
                // the upload screen in regular create mode instead
            }
            if (editTarget) {
                try {
                    const inspContent = await fs.readFile(
                        path.join(directoryPath, `${editId}.inspirations.json`),
                        "utf8"
                    );
                    inspirationsJson = inspContent.replace(/\s+$/, "");
                } catch (err) {
                    // inspirations file is optional and absent for
                    // profiles that do not declare any inspirations
                }
            }
        }

        res.render("manager" + (locale ? `-${locale}` : ""), {
            fullscreen: fullscreen,
            theme: theme,
            locale: locale,
            errors: [],
            profileJson: profileJson,
            inspirationsJson: inspirationsJson,
            editTarget: editTarget,
            info: info || {}
        });
    }
    clojure().catch(next);
});

app.post("/profiles/validate", lib.requireAdmin, profileUpload, (req, res, next) => {
    async function clojure() {
        const editTarget = typeof req.body.edit_target === "string" ? req.body.edit_target : "";
        const { profile, errors } = lib.validateProfileSubmission(
            req.body.profile_json,
            req.body.inspirations_json
        );
        const directoryPath = path.join(__dirname, "static", "profiles");
        const filesystemErrors = await lib.validateProfileFilesystem(
            profile,
            editTarget,
            directoryPath
        );
        for (const message of filesystemErrors) errors.push(message);
        res.json({ errors: errors });
    }
    clojure().catch(next);
});

app.post("/profiles", lib.requireAdmin, profileUpload, (req, res, next) => {
    async function clojure() {
        const profileText = req.body.profile_json || "";
        const inspirationsText = req.body.inspirations_json || "";
        const editTarget = typeof req.body.edit_target === "string" ? req.body.edit_target : "";
        const { profile, inspirations, errors } = lib.validateProfileSubmission(
            profileText,
            inspirationsText
        );

        // runs the mode aware filesystem checks so create rejects
        // duplicate ids while edit accepts in place updates and
        // renames without clobbering unrelated templates
        const directoryPath = path.join(__dirname, "static", "profiles");
        if (errors.length === 0) {
            const filesystemErrors = await lib.validateProfileFilesystem(
                profile,
                editTarget,
                directoryPath
            );
            for (const message of filesystemErrors) errors.push(message);
        }

        if (errors.length > 0) {
            res.status(400).json({ errors: errors });
            return;
        }

        // writes the profile JSON and the optional inspirations
        // JSON to the profiles directory using filenames derived
        // from the validated profile id so that submitted ids
        // cannot influence the on disk layout
        const profilePath = path.join(directoryPath, `${profile.id}.json`);
        await fs.writeFile(profilePath, JSON.stringify(profile, null, 4) + "\n", "utf8");
        if (inspirations) {
            const inspPath = path.join(directoryPath, `${profile.id}.inspirations.json`);
            await fs.writeFile(inspPath, JSON.stringify(inspirations, null, 4) + "\n", "utf8");
        }

        // cleans up the previous profile and inspirations files
        // when an edit results in a rename, leaving every PNG asset
        // alone since assets and profiles now have independent
        // lifecycles managed through the asset endpoints
        if (editTarget && profile.id !== editTarget) {
            const oldTargets = [
                path.join(directoryPath, `${editTarget}.json`),
                path.join(directoryPath, `${editTarget}.inspirations.json`)
            ];
            for (const target of oldTargets) {
                try {
                    await fs.unlink(target);
                } catch (err) {
                    // ignores files that do not exist on disk
                }
            }
        }

        res.json({ status: "ok", id: profile.id });
    }
    clojure().catch(next);
});

app.post("/profiles/:id/enabled", lib.requireAdmin, profileUpload, (req, res, next) => {
    async function clojure() {
        const id = req.params.id;
        if (!lib.PROFILE_ID_PATTERN.test(id)) {
            res.status(400).json({ error: "invalid profile id" });
            return;
        }

        // resolves the requested state from the submitted form field,
        // accepting only the canonical "1" and "0" tokens used across
        // the rest of the form endpoints to keep the API consistent
        if (req.body.enabled !== "1" && req.body.enabled !== "0") {
            res.status(400).json({ error: "invalid enabled value" });
            return;
        }
        const enabled = req.body.enabled === "1";

        // reads the existing profile JSON, flips the enabled flag and
        // writes the file back so the change persists through the
        // catalog filter without going through the full save flow
        const directoryPath = path.join(__dirname, "static", "profiles");
        const target = path.join(directoryPath, `${id}.json`);
        let profile;
        try {
            const content = await fs.readFile(target, "utf8");
            profile = JSON.parse(content);
        } catch (err) {
            res.status(404).json({ error: "profile not found" });
            return;
        }

        profile.enabled = enabled;
        await fs.writeFile(target, JSON.stringify(profile, null, 4) + "\n");

        res.json({ status: "ok", enabled: enabled });
    }
    clojure().catch(next);
});

app.post("/profiles/:id/delete", lib.requireAdmin, (req, res, next) => {
    async function clojure() {
        const id = req.params.id;
        if (!lib.PROFILE_ID_PATTERN.test(id)) {
            res.status(400).json({ error: "invalid profile id" });
            return;
        }

        // removes the profile JSON file together with the optional
        // inspirations entry, treating missing files as already
        // deleted so a re-run cleans up partial state; PNG assets
        // are intentionally preserved since they may be referenced
        // by other profiles or variants
        const directoryPath = path.join(__dirname, "static", "profiles");
        const targets = [
            path.join(directoryPath, `${id}.json`),
            path.join(directoryPath, `${id}.inspirations.json`)
        ];
        let removed = false;
        for (const target of targets) {
            try {
                await fs.unlink(target);
                removed = true;
            } catch (err) {
                // ignores files that do not exist on disk
            }
        }

        if (!removed) {
            res.status(404).json({ error: "profile not found" });
            return;
        }

        res.json({ status: "ok" });
    }
    clojure().catch(next);
});

app.get("/profiles/assets", lib.requireAdmin, (req, res, next) => {
    async function clojure() {
        const directoryPath = path.join(__dirname, "static", "profiles");
        const files = await fs.readdir(directoryPath);
        const assets = files.filter(file => lib.ASSET_FILENAME_PATTERN.test(file)).sort();
        res.json({ assets: assets });
    }
    clojure().catch(next);
});

app.post("/profiles/assets", lib.requireAdmin, assetUpload, (req, res, next) => {
    async function clojure() {
        const errors = [];

        // requires both the filename and the file payload so the
        // resulting asset has a deterministic on disk name that
        // can be referenced from any profile or variant JSON
        const filename = typeof req.body.filename === "string" ? req.body.filename.trim() : "";
        if (!filename) {
            errors.push("filename is required");
        } else if (!lib.ASSET_FILENAME_PATTERN.test(filename)) {
            errors.push(
                "filename must match pattern: lowercase alphanumeric with hyphens and a .png extension"
            );
        }

        if (!req.file) {
            errors.push("file is required");
        }

        // verifies the uploaded payload is an actual PNG by
        // inspecting its first eight bytes against the magic
        // sequence so that non PNG uploads are rejected upfront
        if (req.file) {
            const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            const head = req.file.buffer.slice(0, 8);
            if (!head.equals(pngMagic)) {
                errors.push("file must be a PNG image");
            }
        }

        // refuses to overwrite an existing asset so a mistaken
        // upload cannot replace one already referenced by other
        // profiles or variants; the user must pick a new name
        const directoryPath = path.join(__dirname, "static", "profiles");
        if (filename && errors.length === 0) {
            const assetPath = path.join(directoryPath, filename);
            try {
                await fs.access(assetPath);
                errors.push(`asset "${filename}" already exists`);
            } catch (err) {
                // file does not exist, which is the expected state
            }
        }

        if (errors.length > 0) {
            res.status(400).json({ errors: errors });
            return;
        }

        const assetPath = path.join(directoryPath, filename);
        await fs.writeFile(assetPath, req.file.buffer);
        res.json({ status: "ok", filename: filename });
    }
    clojure().catch(next);
});

app.post("/profiles/assets/:filename/delete", lib.requireAdmin, (req, res, next) => {
    async function clojure() {
        const filename = req.params.filename;
        if (!lib.ASSET_FILENAME_PATTERN.test(filename)) {
            res.status(400).json({ error: "invalid asset filename" });
            return;
        }

        const directoryPath = path.join(__dirname, "static", "profiles");
        const assetPath = path.join(directoryPath, filename);
        try {
            await fs.unlink(assetPath);
        } catch (err) {
            res.status(404).json({ error: "asset not found" });
            return;
        }

        res.json({ status: "ok" });
    }
    clojure().catch(next);
});

app.get("/profiles/bundle", lib.requireAdmin, (req, res, next) => {
    async function clojure() {
        const directoryPath = path.join(__dirname, "static", "profiles");
        const files = await fs.readdir(directoryPath);
        const zip = new JSZip();

        // streams every regular file in the profiles directory
        // into the archive at the root level so the resulting
        // bundle can be extracted straight back into the same
        // folder during a restore without renaming anything
        for (const file of files) {
            const filePath = path.join(directoryPath, file);
            const content = await fs.readFile(filePath);
            zip.file(file, content);
        }

        // adds a small manifest entry so consumers can identify
        // the bundle origin and version at a glance without
        // inspecting the individual profile files
        const manifest = {
            name: info.name,
            version: info.version,
            exported_at: new Date().toISOString(),
            files: files.length
        };
        zip.file("manifest.json", JSON.stringify(manifest, null, 4) + "\n");

        const buffer = await zip.generateAsync({ type: "nodebuffer" });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="profiles-${stamp}.zip"`);
        res.send(buffer);
    }
    clojure().catch(next);
});

app.post("/profiles/bundle", lib.requireAdmin, bundleUpload, (req, res, next) => {
    async function clojure() {
        if (!req.file) {
            res.status(400).json({ error: "file is required" });
            return;
        }

        // parses the uploaded archive in memory before touching
        // the on disk profiles directory so a malformed zip cannot
        // leave the destination in a partially wiped state
        let zip = null;
        try {
            zip = await JSZip.loadAsync(req.file.buffer);
        } catch (err) {
            res.status(400).json({ error: "file is not a valid zip archive" });
            return;
        }

        // collects every regular file entry rejecting anything
        // that would escape the destination directory via slashes
        // or path traversal segments so the unpacking is confined
        // to the profiles directory by construction
        const entries = [];
        for (const name of Object.keys(zip.files)) {
            const entry = zip.files[name];
            if (entry.dir) continue;
            if (name === "manifest.json") continue;
            if (name.includes("/") || name.includes("\\") || name.includes("..")) continue;
            entries.push(entry);
        }

        // refuses an empty archive so a bundle that survived the
        // upload but carries no payload (manifest only, or only
        // rejected entries) cannot wipe the catalog and leave it
        // empty under the guise of a successful restore
        if (entries.length === 0) {
            res.status(400).json({ error: "bundle has no profile entries" });
            return;
        }

        // wipes every regular file from the profiles directory
        // so the restore replaces the catalog instead of merging
        // with the previous state, matching the documented full
        // replace semantics of the bundle restore operation
        const directoryPath = path.join(__dirname, "static", "profiles");
        const existing = await fs.readdir(directoryPath);
        for (const file of existing) {
            try {
                await fs.unlink(path.join(directoryPath, file));
            } catch (err) {
                // ignores entries that cannot be removed so the
                // restore proceeds even when permissions or stale
                // handles block individual deletions
            }
        }

        // writes every accepted archive entry back to disk under
        // the original filename, keeping the flat layout produced
        // by the export so a round trip is a no-op
        let imported = 0;
        for (const entry of entries) {
            const content = await entry.async("nodebuffer");
            await fs.writeFile(path.join(directoryPath, entry.name), content);
            imported += 1;
        }

        res.json({ status: "ok", imported: imported });
    }
    clojure().catch(next);
});

app.get("/profiles", (req, res, next) => {
    async function clojure() {
        const includeDisabled = req.query.include_disabled === "1";
        const directoryPath = path.join(__dirname, "static", "profiles");
        const files = await fs.readdir(directoryPath);
        const profiles = {};
        for (const file of files) {
            const filePath = path.join(directoryPath, file);
            if (path.extname(file) === ".json") {
                const fileContent = await fs.readFile(filePath, "utf8");
                const jsonObject = JSON.parse(fileContent);
                const errors = lib.validateProfile(jsonObject);
                if (errors.length > 0) continue;
                if (!includeDisabled && jsonObject.enabled === false) continue;
                const name = path.basename(file, ".json");
                profiles[name] = jsonObject;
            }
        }

        // loads and attaches inspiration entries for profiles
        // that reference an external inspirations file
        for (const name of Object.keys(profiles)) {
            const profile = profiles[name];
            if (!profile.inspirations) continue;
            const inspPath = path.resolve(directoryPath, profile.inspirations);
            if (!inspPath.startsWith(path.resolve(directoryPath) + path.sep)) continue;
            try {
                const inspContent = await fs.readFile(inspPath, "utf8");
                const inspArray = JSON.parse(inspContent);
                const errors = lib.validateInspirations(inspArray);
                if (errors.length === 0) {
                    profile._inspirations = inspArray;
                }
            } catch (err) {
                // silently ignores missing or malformed inspiration files
            }
        }

        res.json(profiles);
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
