/* eslint-env mocha */

const assert = require("assert");
const http = require("http");
const net = require("net");
const path = require("path");
const childProcess = require("child_process");

describe("Smoke", function() {
    this.timeout(20000);

    const host = "127.0.0.1";
    const headlessKey = "smokekey";
    const injection = encodeURIComponent("arial:<img src=x onerror=alert(1)>");
    const headlessKeys = [];
    let headless = null;
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

    const request = function(method, requestPath, options = {}) {
        return new Promise((resolve, reject) => {
            const requestOptions = {
                host: host,
                port: port,
                method: method,
                path: requestPath,
                headers: Object.assign({}, options.headers || {})
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

    before(async function() {
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
                HEADLESS_URL: "http://" + host + ":" + headless.address().port,
                HEADLESS_KEY: headlessKey
            }),
            stdio: "ignore"
        });
        await waitForReady(15000);
    });

    after(function(done) {
        headless.close();
        child.once("exit", () => done());
        child.kill("SIGTERM");
    });

    describe("#gateway()", function() {
        it("should fall back to the default page for an unknown locale", async () => {
            const response = await request("GET", "/gateway?locale=fr_fr");
            assert.strictEqual(response.status, 200);
        });
    });

    describe("#viewport()", function() {
        it("should escape the characters so they can not inject markup", async () => {
            const response = await request("GET", "/viewport?text=" + injection);
            assert.strictEqual(response.status, 200);
            assert.ok(!response.body.includes("<img src=x"));
            assert.ok(response.body.includes("&lt;img src=x onerror=alert(1)&gt;"));
        });
    });

    describe("#report()", function() {
        it("should escape the characters so they can not inject markup", async () => {
            const response = await request("GET", "/report?text=" + injection);
            assert.strictEqual(response.status, 200);
            assert.ok(!response.body.includes("<img src=x"));
            assert.ok(response.body.includes("&lt;img src=x onerror=alert(1)&gt;"));
        });

        it("should fall back to the default report for an unknown locale", async () => {
            const response = await request("GET", "/report?locale=fr_fr&text=arial:a");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('<span class="item"'));
        });

        it("should not let the locale select another page", async () => {
            const locale = encodeURIComponent("../layout");
            const response = await request("GET", "/report?locale=" + locale + "&text=arial:a");
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes('<span class="item"'));
        });

        it("should escape the characters on the Portuguese report too", async () => {
            const response = await request("GET", "/report?locale=pt_pt&text=" + injection);
            assert.strictEqual(response.status, 200);
            assert.ok(!response.body.includes("<img src=x"));
            assert.ok(response.body.includes("&lt;img src=x onerror=alert(1)&gt;"));
        });
    });

    describe("#receipt()", function() {
        it("should send the headless key when rendering the receipt text", async () => {
            headlessKeys.length = 0;
            const response = await request("GET", "/receipt?text=arial:a");
            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(headlessKeys, [headlessKey]);
        });

        it("should fall back to the default receipt for an unknown locale", async () => {
            const response = await request("GET", "/receipt?locale=fr_fr&text=arial:a");
            assert.strictEqual(response.status, 200);
        });
    });

    describe("#text()", function() {
        it("should render each character in its font", async () => {
            const response = await request("GET", "/text?text=arial:a");
            assert.strictEqual(response.status, 200);
            const span = '<span class="item" style="font-family: \'arial\'">a</span>';
            assert.ok(response.body.includes(span));
        });

        it("should render a space as a non breaking space", async () => {
            const response = await request("GET", "/text?text=" + encodeURIComponent("arial: "));
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.includes(">&nbsp;</span>"));
        });

        it("should escape the characters so they can not inject markup", async () => {
            const response = await request("GET", "/text?text=" + injection);
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
});
