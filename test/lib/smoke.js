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
    const headlessKeys = [];
    let headless = null;
    let child = null;
    let port = null;

    const findFreePort = function() {
        return new Promise((resolve, reject) => {
            const probe = net.createServer();
            probe.unref();
            probe.on("error", reject);
            probe.listen(0, host, () => {
                const chosen = probe.address().port;
                probe.close(() => resolve(chosen));
            });
        });
    };

    const request = function(requestPath) {
        return new Promise((resolve, reject) => {
            const req = http.request({ host: host, port: port, method: "GET", path: requestPath }, res => {
                let body = "";
                res.on("data", chunk => {
                    body += chunk.toString();
                });
                res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: body }));
            });
            req.on("error", reject);
            req.end();
        });
    };

    const waitForReady = async function(timeoutMs) {
        const started = Date.now();
        for (;;) {
            try {
                return await request("/text");
            } catch (err) {
                if (Date.now() - started > timeoutMs) throw new Error("server did not become ready");
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
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

    describe("#receipt()", function() {
        it("should send the headless key when rendering the receipt text", async () => {
            headlessKeys.length = 0;
            const response = await request("/receipt?text=arial:a");
            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(headlessKeys, [headlessKey]);
        });
    });

    describe("#image()", function() {
        it("should send the headless key and return the rendered image", async () => {
            headlessKeys.length = 0;
            const response = await request("/image?text=arial:a");
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.headers["content-type"], "image/png");
            assert.deepStrictEqual(headlessKeys, [headlessKey]);
        });
    });
});
