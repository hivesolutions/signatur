const assert = require("assert");
const http = require("http");
const net = require("net");
const path = require("path");
const childProcess = require("child_process");

describe("Smoke", function() {
    this.timeout(20000);

    const host = "127.0.0.1";
    let child = null;
    let port = null;

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
        port = await findFreePort();
        const appPath = path.resolve(__dirname, "..", "..", "app.js");
        child = childProcess.spawn(process.execPath, [appPath], {
            env: Object.assign({}, process.env, {
                HOST: host,
                PORT: String(port),
                NODE_ENV: process.env.NODE_ENV || "test"
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
    });

    after(function(done) {
        if (child) {
            child.once("exit", () => done());
            child.kill("SIGTERM");
            setTimeout(() => {
                if (!child.killed) child.kill("SIGKILL");
            }, 2000);
        } else {
            done();
        }
    });

    const request = function(method, requestPath, options = {}) {
        return new Promise((resolve, reject) => {
            const headers = options.headers || {};
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

        it("should expose uuid.v4 as a callable from require()", () => {
            assertRequireable("uuid");
            const uuid = require("uuid");
            assert.strictEqual(typeof uuid.v4, "function");
            const value = uuid.v4();
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

    describe("#settings()", function() {
        it("should render the settings view with the diagnostics tab", async () => {
            const response = await request("GET", "/settings");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('data-tab="diagnostics"'));
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
