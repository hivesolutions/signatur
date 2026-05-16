// requires the multiple libraries
const fs = require("fs/promises");
const express = require("express");
const cookieSession = require("cookie-session");
const path = require("path");
const process = require("process");
const bodyParser = require("body-parser");
const multer = require("multer");
const JSZip = require("jszip");
const fetch = require("node-fetch");
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
// no server side storage is required; the secret is hardcoded
// since the session only carries non sensitive UI preferences
app.use(
    cookieSession({
        name: "signatur.sid",
        keys: ["signatur"],
        httpOnly: true,
        maxAge: 60000000,
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

app.get("/", (req, res, next) => {
    // forwards the bare root URL to the user's preferred home
    // landing page, defaulting to the classic gateway when no
    // explicit preference has been stored on the session yet
    const home = req.session.home === "welcome" ? "/welcome" : "/gateway";
    res.redirect(302, home);
});

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

app.get("/settings", (req, res, next) => {
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
        next: nextUrl,
        info: info || {}
    });
});

app.post("/settings", (req, res, next) => {
    const theme = req.body.theme || "";
    const locale = req.body.locale || "";
    req.session.theme = theme;
    req.session.locale = locale;
    req.session.home = req.body.home === "welcome" ? "welcome" : "gateway";
    req.session.show_options = req.body.show_options === "0" ? "0" : "1";
    req.session.viewport_mode = req.body.viewport_mode === "store" ? "store" : "technical";

    // resolves the redirect target from the submitted next field
    // restricting it to local paths so the form cannot be used as
    // an open redirect
    const target =
        typeof req.body.next === "string" && req.body.next.startsWith("/")
            ? req.body.next
            : "/welcome";

    // persists the fullscreen flag onto the session so that it
    // survives the next request without polluting the redirect
    // query string
    req.session.fullscreen = req.body.fullscreen === "1" ? "1" : "0";

    res.redirect(302, target);
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
        info: info || {}
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
        back: req.session.entry === "welcome" ? "/welcome" : "/"
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
        back: req.session.entry === "welcome" ? "/welcome" : "/"
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
        back: req.session.entry === "welcome" ? "/welcome" : "/"
    });
});

app.get("/console", (req, res, next) => {
    const theme = req.query.theme || req.session.theme || "";
    const locale = req.query.locale || req.session.locale || "";
    req.session.locale = locale;
    res.render("console" + (locale ? `-${locale}` : ""), {
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

app.get("/config", (req, res, next) => {
    res.json(req.session.config || {});
});

app.get("/profiles/manager", (req, res, next) => {
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

app.post("/profiles/validate", profileUpload, (req, res, next) => {
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

app.post("/profiles", profileUpload, (req, res, next) => {
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

app.post("/profiles/:id/enabled", profileUpload, (req, res, next) => {
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

app.post("/profiles/:id/delete", (req, res, next) => {
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

app.get("/profiles/assets", (req, res, next) => {
    async function clojure() {
        const directoryPath = path.join(__dirname, "static", "profiles");
        const files = await fs.readdir(directoryPath);
        const assets = files.filter(file => lib.ASSET_FILENAME_PATTERN.test(file)).sort();
        res.json({ assets: assets });
    }
    clojure().catch(next);
});

app.post("/profiles/assets", assetUpload, (req, res, next) => {
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

app.post("/profiles/assets/:filename/delete", (req, res, next) => {
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

app.get("/profiles/bundle", (req, res, next) => {
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

app.post("/profiles/bundle", bundleUpload, (req, res, next) => {
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
