const assert = require("assert");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const childProcess = require("child_process");
const bcrypt = require("bcryptjs");
const lib = require("../../lib");

describe("Smoke", function() {
    this.timeout(20000);

    const host = "127.0.0.1";
    const commit = "7fcb0702d0ee401710b24cf41eec3dca6f3a88a7";
    const buildDate = 1790677148;
    const headlessKey = "smokekey";
    const usersPath = path.resolve(__dirname, "..", "..", "config", "users.json");
    const usersBackupPath = usersPath + ".bak";
    let child = null;
    let port = null;
    let sessionCookie = null;
    let userSessionCookie = null;
    let hadExistingUsers = false;
    let headless = null;
    const headlessKeys = [];

    const findFreePort = function() {
        return new Promise((resolve, reject) => {
            const probe = net.createServer();
            probe.unref();
            probe.on("error", reject);
            probe.listen(0, "127.0.0.1", () => {
                const chosen = probe.address().port;
                probe.close(() => resolve(chosen));
            });
        });
    };

    const waitForReady = function(timeoutMs) {
        const started = Date.now();
        return new Promise((resolve, reject) => {
            const tryOnce = function() {
                const req = http.request(
                    { host: host, port: port, method: "GET", path: "/" },
                    res => {
                        res.resume();
                        resolve();
                    }
                );
                req.on("error", () => {
                    if (Date.now() - started > timeoutMs) {
                        reject(new Error("server did not become ready"));
                        return;
                    }
                    setTimeout(tryOnce, 200);
                });
                req.end();
            };
            tryOnce();
        });
    };

    before(async function() {
        // seeds an admin and a regular user into the on disk users
        // file so the subprocess can run with authentication enabled
        // while the smoke suite logs in once per role and reuses the
        // session cookies for every protected route assertion below,
        // backing up any pre existing users file so the developer's
        // local credentials are not clobbered by the test run
        if (fs.existsSync(usersPath)) {
            fs.copyFileSync(usersPath, usersBackupPath);
            hadExistingUsers = true;
        }
        const passwordHash = bcrypt.hashSync("smokepw", 10);
        fs.writeFileSync(
            usersPath,
            JSON.stringify(
                [
                    { username: "smoke", password_hash: passwordHash, role: "admin" },
                    { username: "smokeuser", password_hash: passwordHash }
                ],
                null,
                4
            ) + "\n",
            "utf8"
        );
        // serves a fake headless service that records the key of
        // every render request and answers with a tiny image, so the
        // receipt and image routes can be exercised without a browser
        headless = http.createServer((req, res) => {
            headlessKeys.push(req.headers["x-headless-key"] || null);
            res.writeHead(200, { "Content-Type": "image/png" });
            res.end(Buffer.from("png"));
        });
        await new Promise(resolve => headless.listen(0, host, resolve));
        port = await findFreePort();
        const appPath = path.resolve(__dirname, "..", "..", "app.js");
        child = childProcess.spawn(process.execPath, [appPath], {
            env: Object.assign({}, process.env, {
                HOST: host,
                PORT: String(port),
                NODE_ENV: process.env.NODE_ENV || "test",
                FEATURE_CHECK_PATH: "1",
                GIT_COMMIT: commit,
                BUILD_DATE: String(buildDate),
                HEADLESS_URL: "http://" + host + ":" + headless.address().port,
                HEADLESS_KEY: headlessKey
            }),
            stdio: ["ignore", "pipe", "pipe"]
        });
        let stderr = "";
        child.stdout.on("data", () => {});
        child.stderr.on("data", chunk => {
            stderr += chunk.toString();
        });
        try {
            await waitForReady(15000);
        } catch (err) {
            throw new Error(
                "server did not become ready: " + err.message + "; stderr=" + stderr.slice(-2000)
            );
        }
        const loginResponse = await request("POST", "/login", {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "username=smoke&password=smokepw"
        });
        const setCookie = loginResponse.headers["set-cookie"];
        if (!setCookie || setCookie.length === 0) {
            throw new Error("login did not return a session cookie");
        }
        sessionCookie = setCookie.map(entry => entry.split(";")[0]).join("; ");

        // logs in the regular user on a separate session so the
        // assertions below can exercise the non admin rendering of
        // the protected routes without the admin role attached
        const userLoginResponse = await request("POST", "/login", {
            skipAuth: true,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "username=smokeuser&password=smokepw"
        });
        const userSetCookie = userLoginResponse.headers["set-cookie"];
        if (!userSetCookie || userSetCookie.length === 0) {
            throw new Error("user login did not return a session cookie");
        }
        userSessionCookie = userSetCookie.map(entry => entry.split(";")[0]).join("; ");
    });

    after(function(done) {
        if (headless) headless.close();
        const cleanup = () => {
            if (hadExistingUsers) {
                try {
                    fs.renameSync(usersBackupPath, usersPath);
                } catch (err) {
                    if (err.code !== "ENOENT") throw err;
                }
            } else {
                try {
                    fs.unlinkSync(usersPath);
                } catch (err) {
                    if (err.code !== "ENOENT") throw err;
                }
            }
            done();
        };
        if (child) {
            child.once("exit", cleanup);
            child.kill("SIGTERM");
            setTimeout(() => {
                if (!child.killed) child.kill("SIGKILL");
            }, 2000);
        } else {
            cleanup();
        }
    });

    const request = function(method, requestPath, options = {}) {
        return new Promise((resolve, reject) => {
            // merges the seeded session cookie onto every request so
            // the protected routes return their authenticated payload
            // instead of the global redirect to `/login`, leaving the
            // option to skip it for the handful of cases that need
            // to exercise the unauthenticated path on purpose
            const headers = Object.assign({}, options.headers || {});
            if (sessionCookie && !options.skipAuth && !headers.Cookie && !headers.cookie) {
                headers.Cookie = sessionCookie;
            }
            const requestOptions = {
                host: host,
                port: port,
                method: method,
                path: requestPath,
                headers: headers
            };
            const req = http.request(requestOptions, res => {
                let body = "";
                res.on("data", chunk => {
                    body += chunk.toString();
                });
                res.on("end", () => {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: body
                    });
                });
            });
            req.on("error", reject);
            if (options.body) req.write(options.body);
            req.end();
        });
    };

    describe("#moduleShapes()", function() {
        // probes that the named package resolves to a real CJS
        // entry point so it can be loaded under `require()` on
        // every Node version in the CI matrix, not just the one
        // the test runner happens to be using locally; rejects
        // packages that are pure ESM (`type: module` with no
        // matching `require` conditional export) because those
        // would crash with ERR_REQUIRE_ESM on Node below 22
        const assertRequireable = function(name) {
            const manifestPath = require.resolve(name + "/package.json");
            const manifest = require(manifestPath);
            const exportsField = manifest.exports;
            const isTypeModule = manifest.type === "module";
            let hasRequireEntry = false;
            if (typeof exportsField === "string") {
                hasRequireEntry = true;
            } else if (exportsField && typeof exportsField === "object") {
                const root = exportsField["."] || exportsField;
                const probe = entry => {
                    if (!entry || typeof entry !== "object") return false;
                    if (typeof entry.require === "string") return true;
                    if (entry.node && typeof entry.node === "object") return probe(entry.node);
                    if (typeof entry.default === "string" && !isTypeModule) return true;
                    return false;
                };
                hasRequireEntry = probe(root);
            } else {
                hasRequireEntry = !isTypeModule;
            }
            assert.ok(
                hasRequireEntry,
                name + " has no CJS require entry; would break on Node <22 with ERR_REQUIRE_ESM"
            );
        };

        it("should expose fetch as a runtime global", () => {
            assert.strictEqual(typeof fetch, "function");
        });

        it("should expose multer as a callable factory from require()", () => {
            assertRequireable("multer");
            const multer = require("multer");
            assert.strictEqual(typeof multer, "function");
            assert.strictEqual(typeof multer().none, "function");
            assert.strictEqual(typeof multer().single, "function");
        });

        it("should expose jszip as a constructor from require()", () => {
            assertRequireable("jszip");
            const JSZip = require("jszip");
            const zip = new JSZip();
            assert.strictEqual(typeof zip.file, "function");
            assert.strictEqual(typeof zip.generateAsync, "function");
        });

        it("should expose crypto.randomUUID as a runtime global", () => {
            assert.strictEqual(typeof crypto.randomUUID, "function");
            const value = crypto.randomUUID();
            assert.ok(/^[0-9a-f-]{36}$/i.test(value));
        });
    });

    describe("#root()", function() {
        it("should redirect to the configured home", async () => {
            const response = await request("GET", "/");
            assert.strictEqual(response.status, 302);
            assert.ok(
                response.headers.location === "/welcome" || response.headers.location === "/gateway"
            );
        });
    });

    describe("#login()", function() {
        it("should fall back to the default page for an unknown locale", async () => {
            const response = await request("GET", "/login?locale=fr_fr", { skipAuth: true });
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('name="username"'));
        });
    });

    describe("#gateway()", function() {
        it("should render the gateway view", async () => {
            const response = await request("GET", "/gateway");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes("</html>"));
        });
    });

    describe("#welcome()", function() {
        it("should render the welcome view", async () => {
            const response = await request("GET", "/welcome");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes("</html>"));
        });
    });

    describe("#signature()", function() {
        it("should fall back to the default page for an unknown locale", async () => {
            const response = await request("GET", "/signature?locale=fr_fr");
            assert.strictEqual(response.status, 200);
        });
    });

    describe("#viewport()", function() {
        it("should render the check path toggle for an admin user", async () => {
            const response = await request("GET", "/viewport");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes("modal-check-path"));
        });

        it("should render the check path toggle for a non admin user", async () => {
            const response = await request("GET", "/viewport", {
                headers: { Cookie: userSessionCookie }
            });
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes("modal-check-path"));
        });

        it("should render the Ñ as an accent of the N key of the keyboard", async () => {
            const response = await request("GET", "/viewport");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('data-value="N" data-accents="Ñ"'));
            assert.ok(response.body.includes('data-value="C" data-accents="Ç"'));
        });

        it("should escape the characters so they can not inject markup", async () => {
            const text = encodeURIComponent("arial:<img src=x onerror=alert(1)>");
            const response = await request("GET", "/viewport?text=" + text, {
                headers: { Cookie: userSessionCookie }
            });
            assert.strictEqual(response.status, 200);
            assert.ok(!response.body.includes("<img src=x"));
            assert.ok(response.body.includes("&lt;img src=x onerror=alert(1)&gt;"));
        });

        it("should escape the characters on the Portuguese editor too", async () => {
            const text = encodeURIComponent("arial:<img src=x onerror=alert(1)>");
            const response = await request("GET", "/viewport?locale=pt_pt&text=" + text, {
                headers: { Cookie: userSessionCookie }
            });
            assert.strictEqual(response.status, 200);
            assert.ok(!response.body.includes("<img src=x"));
            assert.ok(response.body.includes("&lt;img src=x onerror=alert(1)&gt;"));
        });
    });

    describe("#report()", function() {
        it("should escape the characters so they can not inject markup", async () => {
            const text = encodeURIComponent("arial:<img src=x onerror=alert(1)>");
            const response = await request("GET", "/report?text=" + text, {
                headers: { Cookie: userSessionCookie }
            });
            assert.strictEqual(response.status, 200);
            assert.ok(!response.body.includes("<img src=x"));
            assert.ok(response.body.includes("&lt;img src=x onerror=alert(1)&gt;"));
        });

        it("should fall back to the default report for an unknown locale", async () => {
            const response = await request("GET", "/report?locale=fr_fr&text=arial:a", {
                headers: { Cookie: userSessionCookie }
            });
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('<span class="item"'));
        });

        it("should escape the characters on the Portuguese report too", async () => {
            const text = encodeURIComponent("arial:<img src=x onerror=alert(1)>");
            const response = await request("GET", "/report?locale=pt_pt&text=" + text, {
                headers: { Cookie: userSessionCookie }
            });
            assert.strictEqual(response.status, 200);
            assert.ok(!response.body.includes("<img src=x"));
            assert.ok(response.body.includes("&lt;img src=x onerror=alert(1)&gt;"));
        });
    });

    describe("#console()", function() {
        it("should fall back to the default page for an unknown locale", async () => {
            const response = await request("GET", "/console?locale=fr_fr");
            assert.strictEqual(response.status, 200);
        });
    });

    describe("#components()", function() {
        it("should fall back to the default page for an unknown locale", async () => {
            const response = await request("GET", "/components?locale=fr_fr");
            assert.strictEqual(response.status, 200);
        });
    });

    describe("#receipt()", function() {
        it("should send the headless key when rendering the receipt text", async () => {
            headlessKeys.length = 0;
            const response = await request("GET", "/receipt?text=arial:a");
            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(headlessKeys, [headlessKey]);
        });
    });

    describe("#text()", function() {
        it("should render a space as a non breaking space", async () => {
            const text = encodeURIComponent("arial: ");
            const response = await request("GET", "/text?text=" + text, { skipAuth: true });
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes(">&nbsp;</span>"));
        });

        it("should escape the characters so they can not inject markup", async () => {
            const text = encodeURIComponent("arial:<img src=x onerror=alert(1)>");
            const response = await request("GET", "/text?text=" + text, { skipAuth: true });
            assert.strictEqual(response.status, 200);
            assert.ok(!response.body.includes("<img"));
            assert.ok(response.body.includes("&lt;img src=x onerror=alert(1)&gt;"));
        });

        it("should not let the locale select another page", async () => {
            const locale = encodeURIComponent("../layout");
            const response = await request("GET", "/text?locale=" + locale + "&text=arial:a", {
                skipAuth: true
            });
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('<span class="item"'));
        });

        it("should escape the characters on the Portuguese text page too", async () => {
            const text = encodeURIComponent("arial:<img src=x onerror=alert(1)>");
            const response = await request("GET", "/text?locale=pt_pt&text=" + text, {
                skipAuth: true
            });
            assert.strictEqual(response.status, 200);
            assert.ok(!response.body.includes("<img src=x"));
            assert.ok(response.body.includes("&lt;img src=x onerror=alert(1)&gt;"));
        });
    });

    describe("#image()", function() {
        it("should send the headless key and return the rendered image", async () => {
            headlessKeys.length = 0;
            const response = await request("GET", "/image?text=arial:a");
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.headers["content-type"], "image/png");
            assert.deepStrictEqual(headlessKeys, [headlessKey]);
        });
    });

    describe("#settings()", function() {
        it("should render the settings view with the diagnostics tab", async () => {
            const response = await request("GET", "/settings");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('data-tab="diagnostics"'));
        });

        it("should link the version to the changelog", async () => {
            const response = await request("GET", "/settings");
            assert.strictEqual(response.status, 200);
            assert.ok(
                response.body.includes(
                    'href="https://github.com/hivesolutions/signatur/blob/master/CHANGELOG.md"'
                )
            );
        });

        it("should render the build as the short commit linked to the commit", async () => {
            const response = await request("GET", "/settings");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('settings-group-label">Build</div>'));
            assert.ok(
                response.body.includes(
                    'href="https://github.com/hivesolutions/signatur/commit/' + commit + '"'
                )
            );
            assert.ok(response.body.includes(">#" + commit.slice(0, 8) + "</a>"));
        });

        it("should render the build date with its timestamp for the browser to localize", async () => {
            const response = await request("GET", "/settings");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('settings-group-label">Build Date</div>'));
            assert.ok(
                response.body.includes(
                    'data-timestamp="' + buildDate + '">' + lib.dateTimeString(buildDate) + "</div>"
                )
            );
        });

        it("should render the build items on the portuguese settings view", async () => {
            const response = await request("GET", "/settings?locale=pt_pt");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('settings-group-label">Versão</div>'));
            assert.ok(response.body.includes('settings-group-label">Build</div>'));
            assert.ok(response.body.includes('settings-group-label">Data da Build</div>'));
            assert.ok(response.body.includes(">#" + commit.slice(0, 8) + "</a>"));
            assert.ok(response.body.includes('data-timestamp="' + buildDate + '"'));
        });
        it("should store an unsupported locale as the default one", async () => {
            const locale = encodeURIComponent("../layout");
            const saveResponse = await request("POST", "/settings", {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: "locale=" + locale + "&home=gateway&show_options=1&viewport_mode=technical"
            });
            assert.strictEqual(saveResponse.status, 302);
            const response = await request("GET", "/settings");
            assert.strictEqual(response.status, 200);
            assert.ok(/id="locale-default"[^>]*checked/.test(response.body));
        });

    });

    describe("#settingsFontsResolve()", function() {
        it("should return an empty fonts map when no names are requested", async () => {
            const response = await request("GET", "/settings/fonts/resolve");
            assert.strictEqual(response.status, 200);
            const payload = JSON.parse(response.body);
            assert.deepStrictEqual(payload, { fonts: {} });
        });

        it("should silently drop names that do not resolve to a payload", async () => {
            const response = await request(
                "GET",
                "/settings/fonts/resolve?names=does-not-exist,nope"
            );
            assert.strictEqual(response.status, 200);
            const payload = JSON.parse(response.body);
            assert.deepStrictEqual(payload, { fonts: {} });
        });

        it("should silently drop names that fail the filename pattern", async () => {
            const response = await request(
                "GET",
                "/settings/fonts/resolve?names=Invalid%20Name,..%2Fevil"
            );
            assert.strictEqual(response.status, 200);
            const payload = JSON.parse(response.body);
            assert.deepStrictEqual(payload, { fonts: {} });
        });
    });

    describe("#settingsEmojisMapping()", function() {
        it("should stream the mapping with the download filename", async () => {
            const response = await request("GET", "/settings/emojis/mapping");
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.headers["content-type"], "application/json");
            assert.ok(
                (response.headers["content-disposition"] || "").includes("coolemojis.mapping.json")
            );
        });
    });

    describe("#settingsEmojisFont()", function() {
        it("should stream the font with the download filename", async () => {
            const response = await request("GET", "/settings/emojis/font");
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.headers["content-type"], "font/ttf");
            assert.ok(
                (response.headers["content-disposition"] || "").includes("coolemojis.ttf")
            );
        });
    });

    describe("#settingsFontsTtf()", function() {
        it("should stream the ttf with the download filename", async () => {
            const response = await request("GET", "/settings/fonts/helvetica4l/ttf");
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.headers["content-type"], "font/ttf");
            assert.ok(
                (response.headers["content-disposition"] || "").includes("helvetica4l.ttf")
            );
        });

        it("should reject an invalid font name", async () => {
            const response = await request("GET", "/settings/fonts/Invalid%20Name/ttf");
            assert.strictEqual(response.status, 400);
            const payload = JSON.parse(response.body);
            assert.strictEqual(payload.error, "invalid font name");
        });
    });

    describe("#settingsFontsF3s()", function() {
        it("should return a not found for a font without an engraving half", async () => {
            const response = await request("GET", "/settings/fonts/helvetica4l/f3s");
            assert.strictEqual(response.status, 404);
            const payload = JSON.parse(response.body);
            assert.strictEqual(payload.error, "f3s not found");
        });

        it("should reject an invalid font name", async () => {
            const response = await request("GET", "/settings/fonts/Invalid%20Name/f3s");
            assert.strictEqual(response.status, 400);
            const payload = JSON.parse(response.body);
            assert.strictEqual(payload.error, "invalid font name");
        });
    });

    describe("#profilesManager()", function() {
        it("should fall back to the default page for an unknown locale", async () => {
            const response = await request("GET", "/profiles/manager?locale=fr_fr");
            assert.strictEqual(response.status, 200);
        });
    });

    describe("#profiles()", function() {
        it("should return the profiles catalog as JSON", async () => {
            const response = await request("GET", "/profiles");
            assert.strictEqual(response.status, 200);
            const payload = JSON.parse(response.body);
            assert.strictEqual(typeof payload, "object");
        });
    });

    describe("#profilesBundle()", function() {
        it("should stream a zip archive with the bundle filename", async () => {
            const response = await request("GET", "/profiles/bundle");
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.headers["content-type"], "application/zip");
            assert.ok((response.headers["content-disposition"] || "").includes("profiles-"));
        });
    });

    describe("#profilesValidate()", function() {
        it("should accept a multipart payload and return JSON errors", async () => {
            const boundary = "----signaturSmokeBoundary";
            const profile = JSON.stringify({ id: "smoke", name: "Smoke" });
            const parts = [];
            parts.push("--" + boundary + "\r\n");
            parts.push('Content-Disposition: form-data; name="profile_json"\r\n\r\n');
            parts.push(profile + "\r\n");
            parts.push("--" + boundary + "--\r\n");
            const body = parts.join("");
            const response = await request("POST", "/profiles/validate", {
                headers: {
                    "Content-Type": "multipart/form-data; boundary=" + boundary,
                    "Content-Length": Buffer.byteLength(body)
                },
                body: body
            });
            assert.strictEqual(response.status, 200);
            const payload = JSON.parse(response.body);
            assert.ok(Array.isArray(payload.errors));
            assert.ok(payload.errors.length > 0);
        });
    });

    describe("#info()", function() {
        it("should return the commit and the date of the running build without a session", async () => {
            const response = await request("GET", "/info", { skipAuth: true });
            assert.strictEqual(response.status, 200);
            const payload = JSON.parse(response.body);
            assert.strictEqual(payload.commit, commit);
            assert.strictEqual(payload.build_date, buildDate);
        });
    });

    describe("#settingsDiagnostics()", function() {
        it("should run the diagnostics endpoint and return probes and steps", async () => {
            const response = await request("POST", "/settings/diagnostics");
            assert.strictEqual(response.status, 200);
            const payload = JSON.parse(response.body);
            assert.ok(Array.isArray(payload.probes));
            assert.ok(Array.isArray(payload.steps));
        });
    });
});
