const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createHash } = require("crypto");

// root of the repository, the root a capture records by default, and
// the capture script, run on a process of its own as it runs its main
// code as soon as it is loaded
const ROOT_PATH = path.resolve(__dirname, "..", "..", "..", "..", "..");
const SCRIPT_PATH = path.join(ROOT_PATH, ".agents/skills/match-f3s-fonts/scripts/capture.js");

// address of the Signatur server the script opens when given no base,
// never contacted as the fake browser serves every page itself
const BASE_URL = "http://127.0.0.1:3123";

// colony print base URL and engrave node rendered on the print button
// of the fake viewport, on a reserved domain as no request ever leaves
// the fake browser, and the job colony print answers a print with
const PRINT_URL = "https://print.example.com";
const PRINT_NODE = "gravo-gold-std";
const JOB = { id: "f3s-dry-run-1" };

// layout of the fake viewport, the box of the plate in the window, the
// characters of the editor laid out from its top left corner on a grid
// of advance by pitch pixels, and the font size and the line height
// computed for the editor
const LAYOUT = {
    plate: { left: 120, top: 80, width: 700, height: 700 },
    advance: 20,
    pitch: 40,
    fontSize: 30,
    lineHeight: 37
};

// clip of the viewport and plate screenshots, the box of the plate
const CLIP = { x: 120, y: 80, width: 700, height: 700 };

// keys of the Cool Emojis keyboard of the fake viewport mapped to their
// category, the keyboard showing the keys of a single category, the
// first one until the tab of another one is clicked
const KEYBOARD = { A: "symbols", B: "symbols", "|": "pop", "'": "pop", "\\": "other" };

// signature every PNG file starts with
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// a case as cases.py generates it, two lines of Roman 4L at 5 mm on
// the 70 mm plate rendered with the F3S fonts
const ROMAN_CASE = {
    name: "cov-roman4l-1",
    font: "Roman 4L",
    font_size: 5,
    lines: ["Ab", "c"],
    profile: "plate",
    width: 70,
    height: 70,
    margins: [5, 5, 5, 5],
    f3s: true
};

// a case written by hand, a line of Helvetica 4L and Cool Emojis
// segments zoomed in, with neither a profile nor the F3S fonts
const MIXED_CASE = {
    name: "mixed",
    font: "Helvetica 4L",
    font_size: 3,
    lines: [
        [
            ["Helvetica 4L", "a "],
            ["Cool Emojis", "A"]
        ]
    ],
    zoom: 2,
    width: 70,
    height: 70,
    margins: [0, 0, 0, 0]
};

// a Cool Emojis case with a line typed on the keyboard of the viewport,
// as the pipe emoji cannot travel in the URL, holding the quote and
// the backslash emojis that the selector of their keys has to escape
const EMOJIS_CASE = {
    name: "e2e-emojis",
    font: "Cool Emojis",
    font_size: 6,
    lines: [[["Cool Emojis", "A B"]]],
    typed: ["| '\\"],
    profile: "plate",
    width: 70,
    height: 70,
    margins: [5, 5, 5, 5],
    f3s: true
};

// a Cool Emojis case made of a typed line only
const TYPED_CASE = {
    name: "typed-pipe",
    font: "Cool Emojis",
    font_size: 6,
    lines: [],
    typed: ["| A"],
    profile: "plate",
    width: 70,
    height: 70,
    margins: [5, 5, 5, 5],
    f3s: true
};

// errors the script stops with, when the viewport does not show the
// Roman 4L case, when the confirm modal is not set to a dry run and
// when a print that is not a dry run left the browser
const NOT_SHOWN = `${ROMAN_CASE.name}: the viewport does not show the case, refusing to submit`;
const NOT_DRY_RUN = "the confirm modal is not set to a dry run, refusing to engrave";
const NOT_DRY_RUN_SENT = "a payload without dry run left the browser, stop and investigate";

// capture.json of an earlier run in the output directory, holding a
// case the run does not capture again, a stale capture of a case it
// does and the hash of a font only the earlier run loaded
const EARLIER_INDEX = {
    meta: {
        label: "earlier",
        base_url: "http://127.0.0.1:3124",
        root: "/earlier",
        date: "2026-09-30T10:00:00.000Z",
        device_scale_factor: 2,
        fonts: { "/static/fonts/script4l-f3s.ttf": "0".repeat(64) }
    },
    cases: {
        "cov-script4l-1": { case: { name: "cov-script4l-1" }, job: { id: "earlier" } },
        "cov-roman4l-1": { case: { name: "cov-roman4l-1" }, job: { id: "stale" } }
    }
};

// requests the page of the capture scenario sends once it loads, to
// probe the guard: a GET to another host, posts to the Signatur server,
// to another host and to a server whose address the Signatur one is a
// prefix of, and prints, a dry run, ones that are not a literal dry
// run, one checking the path, one of another type, one whose data is
// not JSON and one without a body
const PROBES = [
    { method: "GET", url: "https://cdn.example.com/fonts.css" },
    { method: "POST", url: `${BASE_URL}/settings/fonts` },
    { method: "POST", url: "https://collect.example.com/events" },
    {
        method: "POST",
        url: "http://127.0.0.1:31230/nodes/prefix/print",
        type: "gravo",
        data: JSON.stringify({ dry_run: false })
    },
    {
        method: "POST",
        url: `${PRINT_URL}/nodes/dry/print`,
        type: "gravo",
        data: JSON.stringify({ dry_run: true })
    },
    {
        method: "POST",
        url: `${PRINT_URL}/nodes/real/print`,
        type: "gravo",
        data: JSON.stringify({ dry_run: false })
    },
    {
        method: "POST",
        url: `${PRINT_URL}/nodes/unset/print`,
        type: "gravo",
        data: JSON.stringify({})
    },
    {
        method: "POST",
        url: `${PRINT_URL}/nodes/string/print`,
        type: "gravo",
        data: JSON.stringify({ dry_run: "true" })
    },
    { method: "POST", url: `${PRINT_URL}/nodes/empty/print` },
    {
        method: "POST",
        url: `${PRINT_URL}/nodes/path/print`,
        type: "gravo",
        data: JSON.stringify({ dry_run: true, check_path: true })
    },
    {
        method: "POST",
        url: `${PRINT_URL}/nodes/pdf/print`,
        type: "pdf",
        data: JSON.stringify({ dry_run: true })
    },
    {
        method: "POST",
        url: `${PRINT_URL}/nodes/broken/print`,
        type: "gravo",
        data: "{dry_run: true}"
    }
];

// scenarios the script runs in, each with the command line arguments
// after the cases file and the output directory, the environment, the
// cases, the capture.json in the output directory before the run,
// whether the Chromium executable exists, the settings of the fake
// viewport and the requests its page sends once it loads
const SCENARIOS = {
    // captures cases without submitting them into the directory of an
    // earlier run, the viewport trimming the last character of the text
    // of the URL and failing to serve the regular Helvetica 4L font
    capture: {
        cases: [ROMAN_CASE, MIXED_CASE, TYPED_CASE],
        index: EARLIER_INDEX,
        page: { hidden: 1, missing: ["/static/fonts/helvetica4l.ttf"] },
        requests: PROBES
    },
    // submits a case and captures one that opts out of the submission,
    // with every option of the command line, the credentials and the
    // Chromium executable given and Check path unticked on the modal
    submit: {
        args: [
            "--submit",
            "--base",
            "http://127.0.0.1:3124",
            "--label",
            "branch",
            "--root",
            "candidate"
        ],
        env: { SIGNATUR_USERNAME: "user", SIGNATUR_PASSWORD: "secret" },
        chromium: true,
        cases: [EMOJIS_CASE, Object.assign({}, ROMAN_CASE, { submit: false })],
        page: { checkPath: false }
    },
    // the viewport shows the case at another font size
    resized: { args: ["--submit"], cases: [ROMAN_CASE], page: { fontSize: 4.5 } },
    // the viewport trims the last character of the case
    trimmed: { args: ["--submit"], cases: [ROMAN_CASE], page: { hidden: 1 } },
    // the confirm modal opens with Dry run ticked, so ticking it again
    // unticks it
    unticked: { args: ["--submit"], cases: [ROMAN_CASE], page: { dryRun: true } },
    // the confirm modal opens with Check path ticked
    checked: { args: ["--submit"], cases: [ROMAN_CASE], page: { checkPath: true } },
    // the page prints a real job on colony print despite Dry run ticked
    engraved: { args: ["--submit"], cases: [ROMAN_CASE], page: { payload: { dry_run: false } } },
    // the page prints a real job on a print URL of the Signatur server,
    // whose requests the guard lets through
    proxied: {
        args: ["--submit"],
        cases: [ROMAN_CASE],
        page: { printUrl: BASE_URL, payload: { dry_run: false } }
    },
    // the page prints a dry run checking the path on a print URL of the
    // Signatur server
    proxiedPath: {
        args: ["--submit"],
        cases: [ROMAN_CASE],
        page: { printUrl: BASE_URL, payload: { check_path: true } }
    },
    // a case with the pipe emoji in a line of the URL
    piped: { cases: [Object.assign({}, EMOJIS_CASE, { lines: [[["Cool Emojis", "A|B"]]] })] }
};

// fake of the playwright module the script requires through the
// PLAYWRIGHT_PATH variable, written to a module of its own for every
// scenario, so it may only use the configuration it is called with:
// it serves the login form and the viewport as jsdom documents, calls
// the functions the script evaluates in the page with the document of
// the page as a global, so they run as the code of the script, sends
// every request of the page through the route handler of the script
// and appends every call it gets to the log as a line of JSON, nothing
// ever leaving the process
const fakePlaywright = function(config) {
    const fs = require("fs");
    const { JSDOM } = require(config.jsdom);
    const layout = config.layout;
    const settings = config.page;
    const requests = config.requests;

    // content of every screenshot, a transparent pixel
    const PNG =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

    const listeners = [];
    let navigations = [];
    let waiters = [];
    let handler = null;
    let window = null;

    const log = function(entry) {
        fs.appendFileSync(config.log, `${JSON.stringify(entry)}\n`);
    };

    // encodes the form of a print, as the confirm modal posts it
    const encode = function(type, data) {
        return new URLSearchParams([
            ["type", type],
            ["data", data]
        ]).toString();
    };

    // returns the element of a selector, failing as Playwright does once
    // it times out waiting for it when it is missing or, for an action
    // that needs it visible, hidden
    const find = function(selector, visible) {
        const element = window.document.querySelector(selector);
        if (!element || (visible && element.closest("[hidden]"))) {
            throw new Error(`Timeout 30000ms exceeded waiting for ${selector}`);
        }
        return element;
    };

    // sends a request of the page through the route handler, resolving
    // with the request once the handler lets it through and with null
    // once it aborts it
    const send = async function(method, url, body) {
        const request = { method: () => method, url: () => url, postData: () => body || null };
        const decision = await new Promise(resolve => {
            handler({
                request: () => request,
                continue: async () => resolve("continue"),
                abort: async () => resolve("abort")
            });
        });
        log({ call: "request", method: method, url: url, body: body || null, decision: decision });
        return decision === "continue" ? request : null;
    };

    // answers a request with the given status and body, notifying the
    // response listeners and the first waiter whose predicate takes it
    const respond = function(request, status, body) {
        const response = {
            url: () => request.url(),
            status: () => status,
            request: () => request,
            body: async () => Buffer.from(body),
            json: async () => JSON.parse(body)
        };
        for (const listener of listeners) listener(response);
        const waiter = waiters.find(candidate => candidate.predicate(response));
        if (!waiter) return;
        waiters = waiters.filter(candidate => candidate !== waiter);
        waiter.resolve(response);
    };

    // returns the box of an element of the editor, laid out on a grid
    // from the top left corner of the plate, a newline ending its row
    // and a hidden element taking no room, as the browser renders them
    const box = function(element) {
        if (element.style.display === "none") return { left: 0, right: 0, top: 0, bottom: 0 };
        let row = 0;
        let column = 0;
        for (const sibling of element.parentNode.children) {
            if (sibling === element) break;
            if (sibling.classList.contains("newline")) {
                row++;
                column = 0;
            } else if (!sibling.classList.contains("caret") && sibling.style.display !== "none") {
                column++;
            }
        }
        const left = layout.plate.left + column * layout.advance;
        const top = layout.plate.top + row * layout.pitch;
        const width = element.classList.contains("newline") ? 0 : layout.advance;
        return { left: left, right: left + width, top: top, bottom: top + layout.pitch };
    };

    // the login form, posting the credentials to the server once it is
    // submitted and opening the home page the server redirects to
    const login = function(address) {
        const document = window.document;
        document.body.innerHTML = `
            <form class="form form-login" method="post" action="/login">
                <input class="login-input" id="login-username" name="username" type="text" />
                <input class="login-input" id="login-password" name="password" type="password" />
                <button type="submit" class="button button-start">Sign In</button>
            </form>`;
        const form = document.querySelector(".form-login");
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const body = new URLSearchParams(new window.FormData(form)).toString();
            if (await send("POST", `${address.origin}/login`, body)) {
                await load(`${address.origin}/`);
            }
        });
    };

    // the viewport of the case on the query: a clone of the viewer
    // without the text ahead of the editor, the text of the query in the
    // editor with an element per character and its last `hidden` ones
    // trimmed, the font size input holding the size of the query unless
    // `fontSize` is given, the emojis keyboard, the print button and the
    // confirm modal it shows, with Dry run ticked as `dryRun` and Check
    // path present when `checkPath` is given, whose engrave button
    // resolves the extra fonts and prints the text as a gravo job on
    // `printUrl`, with the fields of `payload` changed; the fonts of the
    // families of the text load with the page, each holding its own file
    // name, the ones of `missing` failing with a 404
    const viewport = async function(address) {
        const document = window.document;
        const params = address.searchParams;
        const font = params.get("font");
        document.body.innerHTML = `
            <div class="viewport-faces">
                <div class="viewport-preview">
                    <svg class="viewport-svg"></svg>
                    <div class="viewer-container"><span>F</span></div>
                </div>
            </div>
            <a class="button button-print">Engrave</a>
            <input class="font-size-input" type="hidden" />
            <div class="viewport">
                <div class="main-container">
                    <div class="viewport-preview profile-active">
                        <div class="ruler ruler-horizontal"></div>
                        <div class="ruler ruler-vertical"></div>
                        <svg class="viewport-svg"></svg>
                        <div class="viewer-container caret-active">
                            <span class="caret">|</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="emojis-container selected"><div class="emojis-tabs"></div></div>
            <div class="modal-overlay modal-overlay-confirm" hidden>
                <div class="modal-options">
                    <input class="modal-dry-run" type="checkbox" id="modal-dry-run" />
                    <label for="modal-dry-run">Dry run</label>
                </div>
                <span class="button button-modal-engrave">Engrave</span>
            </div>`;

        const editor = document.querySelector(".viewport .viewer-container");
        const caret = editor.querySelector(".caret");
        const plate = document.querySelector(".viewport .viewport-svg");
        const fontSizeInput = document.querySelector(".font-size-input");
        editor.setAttribute("data-text", params.get("text"));
        editor.style.fontFamily = `"${font}"`;
        editor.style.fontSize = `${layout.fontSize}px`;
        editor.style.lineHeight = `${layout.lineHeight}px`;
        plate.getBoundingClientRect = () => Object.assign({}, layout.plate);
        fontSizeInput.value = String(
            settings.fontSize === undefined ? params.get("font_size") : settings.fontSize
        );

        // types a character at the caret of the editor, a newline ending
        // the line
        const text = [];
        const type = function(family, char) {
            const element = document.createElement(char === "\n" ? "div" : "span");
            if (char === "\n") {
                element.className = "newline";
            } else {
                element.style.fontFamily = `'${family}'`;
                element.textContent = char === " " ? "\u00a0" : char;
            }
            element.getBoundingClientRect = () => box(element);
            editor.insertBefore(element, caret);
            text.push([family, char]);
        };

        const families = new Set();
        const elements = params.get("text").split("|");
        for (const element of elements.filter(element => element)) {
            if (element === "\\n") {
                type(null, "\n");
                continue;
            }
            const index = element.indexOf(":");
            families.add(element.slice(0, index));
            type(element.slice(0, index), element.slice(index + 1));
        }
        const characters = Array.from(editor.querySelectorAll("span:not(.caret)"));
        for (const element of characters.slice(characters.length - (settings.hidden || 0))) {
            element.style.display = "none";
        }

        const keyboard = document.querySelector(".emojis-container");
        const select = function(category) {
            for (const key of keyboard.querySelectorAll(".char[data-category]")) {
                key.hidden = key.getAttribute("data-category") !== category;
            }
        };
        const categories = [];
        const keys = Object.entries(config.keyboard).concat([
            ["\u23b5", null],
            ["\u21b5", null]
        ]);
        for (const [value, category] of keys) {
            if (category && !categories.includes(category)) {
                const tab = document.createElement("span");
                tab.className = "emojis-tab";
                tab.setAttribute("data-category", category);
                keyboard.querySelector(".emojis-tabs").append(tab);
                categories.push(category);
            }
            const key = document.createElement("span");
            key.className = category ? "char" : "char utility";
            if (category) key.setAttribute("data-category", category);
            key.setAttribute("data-value", value);
            key.textContent = value;
            keyboard.append(key);
        }
        select(categories[0]);
        keyboard.addEventListener("click", event => {
            const value = event.target.getAttribute("data-value");
            if (event.target.classList.contains("emojis-tab")) {
                select(event.target.getAttribute("data-category"));
            } else if (value === "\u21b5") {
                type(null, "\n");
            } else {
                type("Cool Emojis", value === "\u23b5" ? " " : value);
            }
        });

        const overlay = document.querySelector(".modal-overlay-confirm");
        const dryRun = document.querySelector(".modal-dry-run");
        dryRun.checked = Boolean(settings.dryRun);
        if (settings.checkPath !== undefined) {
            overlay.querySelector(".modal-options").insertAdjacentHTML(
                "beforeend",
                `<input class="modal-check-path" type="checkbox" id="modal-check-path" />
                <label for="modal-check-path">Check path</label>`
            );
            document.querySelector(".modal-check-path").checked = settings.checkPath;
        }
        document.querySelector(".button-print").addEventListener("click", () => {
            overlay.hidden = false;
        });
        document.querySelector(".button-modal-engrave").addEventListener("click", async () => {
            overlay.hidden = true;
            const checkPath = document.querySelector(".modal-check-path");
            const extraFonts = {};
            for (const family of families) extraFonts[family] = "AAEAAA==";
            const data = Object.assign(
                {
                    text: text,
                    font: font === "Cool Emojis" ? null : font,
                    font_size: parseFloat(fontSizeInput.value),
                    debug: true,
                    dry_run: dryRun.checked,
                    record: false,
                    check_path: Boolean(checkPath && checkPath.checked),
                    extra_fonts: extraFonts
                },
                settings.payload
            );
            const names = encodeURIComponent(Array.from(families).join(","));
            const url = `${address.origin}/settings/fonts/resolve?names=${names}`;
            const fonts = await send("GET", url);
            if (fonts) respond(fonts, 200, "{}");
            const print = await send(
                "POST",
                `${settings.printUrl}/nodes/${settings.node}/print`,
                encode("gravo", JSON.stringify(data))
            );
            if (print) {
                respond(print, 200, JSON.stringify(settings.job));
                return;
            }
            for (const waiter of waiters.splice(0)) {
                const message = `Timeout ${waiter.timeout}ms exceeded waiting for the response`;
                waiter.reject(new Error(message));
            }
        });

        const files = ["/static/css/layout.css"];
        for (const family of families) {
            const stem = family.toLowerCase().replace(/ /g, "");
            const f3s = params.get("f3s") === "1" && family !== "Cool Emojis";
            files.push(`/static/fonts/${stem}${f3s ? "-f3s" : ""}.ttf`);
        }
        for (const file of files) {
            const request = await send("GET", `${address.origin}${file}`);
            const status = (settings.missing || []).includes(file) ? 404 : 200;
            if (request) respond(request, status, file.split("/").pop());
        }
    };

    // opens the document of an address, the login form, the viewport of
    // the case on its query or a blank page, completing the navigations
    // waited for
    const load = async function(url) {
        const address = new URL(url);
        if (window) window.close();
        window = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
            url: url
        }).window;
        Object.defineProperty(window.document, "fonts", { value: { ready: Promise.resolve() } });
        globalThis.document = window.document;
        globalThis.getComputedStyle = window.getComputedStyle.bind(window);
        if (address.pathname === "/login") login(address);
        if (address.pathname === "/viewport") await viewport(address);
        for (const resolve of navigations.splice(0)) resolve();
    };

    const page = {
        route: async (pattern, callback) => {
            log({ call: "route", pattern: pattern });
            handler = callback;
        },
        on: (event, listener) => {
            if (event === "response") listeners.push(listener);
        },
        goto: async url => {
            log({ call: "goto", url: url });
            if (!(await send("GET", url))) throw new Error(`net::ERR_FAILED at ${url}`);
            await load(url);
            for (const request of requests.splice(0)) {
                const body = request.type ? encode(request.type, request.data) : null;
                await send(request.method, request.url, body);
            }
        },
        waitForNavigation: () => new Promise(resolve => navigations.push(resolve)),
        waitForSelector: async (selector, options) => {
            const state = (options && options.state) || "visible";
            find(selector, state === "visible");
        },
        waitForResponse: (predicate, options) =>
            new Promise((resolve, reject) => {
                waiters.push({
                    predicate: predicate,
                    timeout: options.timeout,
                    resolve: resolve,
                    reject: reject
                });
            }),
        waitForTimeout: async () => {},
        fill: async (selector, value) => {
            find(selector, true).value = value;
        },
        click: async selector => {
            log({ call: "click", selector: selector });
            find(selector, true).click();
        },
        getAttribute: async (selector, name) => find(selector, false).getAttribute(name),
        locator: selector => ({
            dispatchEvent: async type => {
                log({ call: "dispatchEvent", selector: selector, type: type });
                find(selector, false).dispatchEvent(new window.MouseEvent(type, { bubbles: true }));
            }
        }),
        evaluate: async fn => fn(),
        addStyleTag: async options => {
            const style = window.document.createElement("style");
            style.textContent = options.content;
            window.document.head.append(style);
            return { evaluate: async fn => fn(style) };
        },
        screenshot: async options => {
            const plate = window.document.querySelector(".viewport .viewport-svg");
            const guides = window.getComputedStyle(plate).visibility !== "hidden";
            log({
                call: "screenshot",
                path: options.path,
                clip: options.clip || null,
                guides: guides
            });
            fs.writeFileSync(options.path, Buffer.from(PNG, "base64"));
        }
    };

    const browser = {
        newContext: async options => {
            log({ call: "newContext", options: options });
            return { newPage: async () => page };
        },
        close: async () => log({ call: "close" })
    };

    return {
        chromium: {
            launch: async options => {
                log({ call: "launch", options: options });
                return browser;
            }
        }
    };
};

describe("Capture", function() {
    this.timeout(20000);

    const directories = [];
    const runs = {};

    // runs the capture script in a scenario, in a directory of its own,
    // its working one, holding the cases file, the fake playwright module
    // and its log, resolving once the script exits with its exit status,
    // its output, the calls logged by the fake, the capture.json written
    // (null when there is none), the directory and the output directory
    const run = function(scenario) {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "signatur-capture-"));
        const out = path.join(directory, "run");
        const casesPath = path.join(directory, "cases.json");
        const modulePath = path.join(directory, "playwright.js");
        const logPath = path.join(directory, "log.jsonl");
        const chromiumPath = path.join(directory, "chromium");
        directories.push(directory);
        fs.writeFileSync(casesPath, JSON.stringify(scenario.cases));
        fs.writeFileSync(logPath, "");
        if (scenario.chromium) fs.writeFileSync(chromiumPath, "");
        if (scenario.index) {
            fs.mkdirSync(out);
            fs.writeFileSync(path.join(out, "capture.json"), JSON.stringify(scenario.index));
        }
        const config = {
            jsdom: require.resolve("jsdom"),
            log: logPath,
            layout: LAYOUT,
            keyboard: KEYBOARD,
            page: Object.assign({ printUrl: PRINT_URL, node: PRINT_NODE, job: JOB }, scenario.page),
            requests: scenario.requests || []
        };
        fs.writeFileSync(
            modulePath,
            `module.exports = (${fakePlaywright})(${JSON.stringify(config)});`
        );

        // clears the credentials of the environment so that the script
        // falls back to its defaults unless the scenario gives them
        const env = Object.assign({}, process.env, {
            PLAYWRIGHT_PATH: modulePath,
            CHROMIUM_PATH: chromiumPath
        });
        delete env.SIGNATUR_USERNAME;
        delete env.SIGNATUR_PASSWORD;
        const child = childProcess.spawn(
            process.execPath,
            [SCRIPT_PATH, casesPath, out].concat(scenario.args || []),
            { cwd: directory, env: Object.assign(env, scenario.env) }
        );
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8").on("data", chunk => {
            stdout += chunk;
        });
        child.stderr.setEncoding("utf8").on("data", chunk => {
            stderr += chunk;
        });
        return new Promise(resolve => {
            child.on("close", status => {
                const indexPath = path.join(out, "capture.json");
                const lines = fs.readFileSync(logPath, "utf-8").split("\n");
                resolve({
                    status: status,
                    stdout: stdout,
                    stderr: stderr,
                    log: lines.filter(line => line).map(line => JSON.parse(line)),
                    index: fs.existsSync(indexPath)
                        ? JSON.parse(fs.readFileSync(indexPath, "utf-8"))
                        : null,
                    directory: directory,
                    out: out
                });
            });
        });
    };

    // returns the calls of the given kind logged by the fake browser
    const calls = function(result, kind) {
        return result.log.filter(entry => entry.call === kind);
    };

    // returns the selectors of the elements the script clicked or sent
    // an event to, in order
    const targets = function(result) {
        return result.log
            .filter(entry => entry.call === "click" || entry.call === "dispatchEvent")
            .map(entry => entry.selector);
    };

    // returns the requests of the page to print a job
    const prints = function(result) {
        return calls(result, "request").filter(entry => entry.url.endsWith("/print"));
    };

    // returns the posts of the login form to the Signatur server at the
    // given address
    const signIns = function(result, base) {
        return calls(result, "request").filter(
            entry => entry.method === "POST" && entry.url === `${base}/login`
        );
    };

    // returns the decision of the guard on the first request of the page
    // to the given address
    const decision = function(result, url) {
        return calls(result, "request").find(entry => entry.url === url).decision;
    };

    // returns the query of the viewport opened for the case at the given
    // index of the cases
    const query = function(result, index) {
        const urls = calls(result, "goto").map(entry => new URL(entry.url));
        return urls.filter(url => url.pathname === "/viewport")[index].searchParams;
    };

    // returns the characters of the editor recorded for a case
    const chars = function(result, name) {
        return result.index.cases[name].spans.map(span => span.char);
    };

    // returns whether a file of the output directory is a PNG image
    const png = function(result, name) {
        const filePath = path.join(result.out, name);
        if (!fs.existsSync(filePath)) return false;
        return fs.readFileSync(filePath).subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
    };

    // returns the hash recorded for a font file the fake viewport serves,
    // whose content is its own file name
    const digest = function(name) {
        return createHash("sha256").update(name).digest("hex");
    };

    // asserts that a run failed with the given message before any print
    // left the page, recording no case
    const refused = function(result, message) {
        assert.strictEqual(result.status, 1);
        assert.ok(result.stderr.includes(message), result.stderr);
        assert.deepStrictEqual(prints(result), []);
        assert.strictEqual(result.index, null);
    };

    // starts every scenario at once, as each run spends most of its time
    // loading jsdom, the tests waiting for the run they look into
    before(function() {
        for (const [name, scenario] of Object.entries(SCENARIOS)) {
            runs[name] = run(scenario);
        }
    });

    after(async function() {
        await Promise.all(Object.values(runs));
        for (const directory of directories) {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    describe("#option()", function() {
        it("should default to the local server, the viewport label and the repository root", async () => {
            const result = await runs.capture;
            assert.strictEqual(result.status, 0, result.stderr);
            assert.strictEqual(result.index.meta.base_url, BASE_URL);
            assert.strictEqual(result.index.meta.label, "viewport");
            assert.strictEqual(result.index.meta.root, ROOT_PATH);
            assert.strictEqual(calls(result, "goto")[0].url, `${BASE_URL}/login`);
        });

        it("should read the base, the label and the root from the command line", async () => {
            const result = await runs.submit;
            assert.strictEqual(result.status, 0, result.stderr);
            assert.strictEqual(result.index.meta.base_url, "http://127.0.0.1:3124");
            assert.strictEqual(result.index.meta.label, "branch");
            assert.strictEqual(
                result.index.meta.root,
                path.join(fs.realpathSync(result.directory), "candidate")
            );
            assert.strictEqual(calls(result, "goto")[0].url, "http://127.0.0.1:3124/login");
        });
    });

    describe("#serialize()", function() {
        it("should send the characters of a line in the font of the case", async () => {
            const result = await runs.capture;
            assert.strictEqual(
                query(result, 0).get("text"),
                "Roman 4L:A|Roman 4L:b|\\n|Roman 4L:c"
            );
        });

        it("should send the segments of a line in their own fonts", async () => {
            const result = await runs.capture;
            assert.strictEqual(
                query(result, 1).get("text"),
                "Helvetica 4L:a|Helvetica 4L: |Cool Emojis:A"
            );
        });

        it("should refuse a pipe in a line of the URL", async () => {
            const result = await runs.piped;
            assert.strictEqual(result.status, 1);
            assert.ok(result.stderr.includes("'|' cannot travel in the URL, use typed"));
            assert.deepStrictEqual(
                calls(result, "goto").map(entry => entry.url),
                [`${BASE_URL}/login`]
            );
            assert.strictEqual(result.index, null);
        });
    });

    describe("#guard()", function() {
        it("should let a GET to any host through", async () => {
            const result = await runs.capture;
            assert.strictEqual(decision(result, "https://cdn.example.com/fonts.css"), "continue");
        });

        it("should let any request to the Signatur server through", async () => {
            const result = await runs.capture;
            assert.strictEqual(decision(result, `${BASE_URL}/login`), "continue");
            assert.strictEqual(decision(result, `${BASE_URL}/settings/fonts`), "continue");
        });

        it("should let a gravo print through when it is a dry run", async () => {
            const result = await runs.capture;
            assert.strictEqual(decision(result, `${PRINT_URL}/nodes/dry/print`), "continue");
            assert.ok(result.stdout.includes("guard: dry run payload allowed"));
        });

        it("should block a print that is not a literal dry run", async () => {
            const result = await runs.capture;
            for (const node of ["real", "unset", "string", "empty"]) {
                const url = `${PRINT_URL}/nodes/${node}/print`;
                assert.strictEqual(decision(result, url), "abort");
                assert.ok(result.stdout.includes(`guard: BLOCKED POST ${url}`));
            }
        });

        it("should block a dry run print that checks the path", async () => {
            const result = await runs.capture;
            assert.strictEqual(decision(result, `${PRINT_URL}/nodes/path/print`), "abort");
        });

        it("should block a dry run print of a type other than gravo", async () => {
            const result = await runs.capture;
            assert.strictEqual(decision(result, `${PRINT_URL}/nodes/pdf/print`), "abort");
        });

        it("should block a print whose data is not JSON", async () => {
            const result = await runs.capture;
            assert.strictEqual(decision(result, `${PRINT_URL}/nodes/broken/print`), "abort");
        });

        it("should block a post to another host", async () => {
            const result = await runs.capture;
            const url = "https://collect.example.com/events";
            assert.strictEqual(decision(result, url), "abort");
            assert.ok(result.stdout.includes(`guard: BLOCKED POST ${url}`));
        });

        it("should block a post to a server whose address extends the Signatur one", async () => {
            const result = await runs.capture;
            const url = "http://127.0.0.1:31230/nodes/prefix/print";
            assert.strictEqual(decision(result, url), "abort");
            assert.ok(result.stdout.includes(`guard: BLOCKED POST ${url}`));
        });
    });

    describe("#login()", function() {
        it("should sign in as the admin user before opening the first case", async () => {
            const result = await runs.capture;
            const signIn = signIns(result, BASE_URL);
            assert.deepStrictEqual(
                signIn.map(entry => entry.body),
                ["username=admin&password=admin"]
            );
            assert.ok(result.log.indexOf(signIn[0]) < result.log.indexOf(calls(result, "goto")[1]));
            assert.strictEqual(new URL(calls(result, "goto")[1].url).pathname, "/viewport");
        });

        it("should sign in as the user of the environment", async () => {
            const result = await runs.submit;
            assert.deepStrictEqual(
                signIns(result, "http://127.0.0.1:3124").map(entry => entry.body),
                ["username=user&password=secret"]
            );
        });
    });

    describe("#openCase()", function() {
        it("should open the viewport on the profile, the font, the size and the margins of the case", async () => {
            const result = await runs.capture;
            const params = query(result, 0);
            assert.strictEqual(params.get("profile"), "plate");
            assert.strictEqual(params.get("font"), "Roman 4L");
            assert.strictEqual(params.get("font_size"), "5");
            assert.strictEqual(params.get("margins"), "5,5,5,5");
            assert.strictEqual(params.get("caret"), "0");
            assert.strictEqual(params.get("zoom"), null);
            assert.strictEqual(params.get("f3s"), "1");
        });

        it("should default to the plate profile with the regular fonts and zoom when asked", async () => {
            const result = await runs.capture;
            const params = query(result, 1);
            assert.strictEqual(params.get("profile"), "plate");
            assert.strictEqual(params.get("margins"), "0,0,0,0");
            assert.strictEqual(params.get("zoom"), "2");
            assert.strictEqual(params.get("f3s"), "0");
        });

        it("should type the typed lines on the emojis keyboard after the lines of the URL", async () => {
            const result = await runs.submit;
            assert.strictEqual(result.status, 0, result.stderr);
            assert.deepStrictEqual(chars(result, EMOJIS_CASE.name), [
                "A",
                "\u00a0",
                "B",
                "\n",
                "|",
                "\u00a0",
                "'",
                "\\"
            ]);
            const typed = result.index.cases[EMOJIS_CASE.name].spans.slice(4);
            assert.ok(typed.every(span => span.font === "Cool Emojis"));
        });

        it("should type the typed lines of a case without other lines from its first line", async () => {
            const result = await runs.capture;
            assert.strictEqual(query(result, 2).get("text"), "");
            assert.deepStrictEqual(chars(result, TYPED_CASE.name), ["|", "\u00a0", "A"]);
        });
    });

    describe("#capture()", function() {
        it("should screenshot the page, the viewport and the plate of every case", async () => {
            const result = await runs.capture;
            for (const item of [ROMAN_CASE, MIXED_CASE, TYPED_CASE]) {
                for (const kind of ["page", "viewport", "plate"]) {
                    assert.ok(png(result, `${item.name}-${kind}.png`), `${item.name}-${kind}.png`);
                }
                assert.strictEqual(png(result, `${item.name}-confirm.png`), false);
            }
        });

        it("should clip to the plate and hide its guides for the plate screenshot only", async () => {
            const result = await runs.submit;
            const prefix = path.join(result.out, EMOJIS_CASE.name);
            const shots = calls(result, "screenshot").filter(entry =>
                entry.path.startsWith(prefix)
            );
            assert.deepStrictEqual(shots, [
                { call: "screenshot", path: `${prefix}-page.png`, clip: null, guides: true },
                { call: "screenshot", path: `${prefix}-viewport.png`, clip: CLIP, guides: true },
                { call: "screenshot", path: `${prefix}-plate.png`, clip: CLIP, guides: false },
                { call: "screenshot", path: `${prefix}-confirm.png`, clip: null, guides: true }
            ]);
        });

        it("should record the plate, the font of the editor and the box of every character", async () => {
            const result = await runs.capture;
            const entry = result.index.cases[ROMAN_CASE.name];
            assert.deepStrictEqual(entry.case, ROMAN_CASE);
            assert.deepStrictEqual(entry.plate, LAYOUT.plate);
            assert.strictEqual(entry.fontSize, LAYOUT.fontSize);
            assert.strictEqual(entry.lineHeight, LAYOUT.lineHeight);
            assert.strictEqual(entry.fontFamily, '"Roman 4L"');
            assert.strictEqual(entry.fontSizeInput, "5");
            assert.deepStrictEqual(entry.spans, [
                {
                    char: "A",
                    font: "Roman 4L",
                    display: "inline",
                    left: 120,
                    right: 140,
                    top: 80,
                    bottom: 120
                },
                {
                    char: "b",
                    font: "Roman 4L",
                    display: "inline",
                    left: 140,
                    right: 160,
                    top: 80,
                    bottom: 120
                },
                {
                    char: "\n",
                    font: "",
                    display: "block",
                    left: 160,
                    right: 160,
                    top: 80,
                    bottom: 120
                },
                {
                    char: "c",
                    font: "Roman 4L",
                    display: "none",
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0
                }
            ]);
        });

        it("should print the font size, the line height and the size input of every case", async () => {
            const result = await runs.capture;
            for (const item of [ROMAN_CASE, MIXED_CASE]) {
                const line = `${item.name} font-size 30px line-height 37px input ${item.font_size}`;
                assert.ok(result.stdout.includes(line), result.stdout);
            }
        });
    });

    describe("#submit()", function() {
        it("should tick Dry run on the confirm modal before engraving", async () => {
            const result = await runs.submit;
            assert.deepStrictEqual(targets(result).slice(-3), [
                ".button-print",
                'label[for="modal-dry-run"]',
                ".modal-overlay-confirm .button-modal-engrave"
            ]);
            assert.ok(png(result, `${EMOJIS_CASE.name}-confirm.png`));
        });

        it("should engrave the case as a dry run and record the job", async () => {
            const result = await runs.submit;
            assert.strictEqual(prints(result).length, 1);
            assert.strictEqual(prints(result)[0].url, `${PRINT_URL}/nodes/${PRINT_NODE}/print`);
            assert.strictEqual(prints(result)[0].decision, "continue");
            assert.deepStrictEqual(result.index.cases[EMOJIS_CASE.name].job, JOB);
            assert.ok(result.stdout.includes(`submitted dry run job ${JOB.id}`));
        });

        it("should record the payload sent with the names of its extra fonts", async () => {
            const result = await runs.submit;
            const payload = result.index.cases[EMOJIS_CASE.name].payload;
            assert.strictEqual(payload.dry_run, true);
            assert.strictEqual(payload.check_path, false);
            assert.strictEqual(payload.font, null);
            assert.strictEqual(payload.font_size, 6);
            assert.deepStrictEqual(payload.extra_fonts, ["Cool Emojis"]);
        });

        it("should count the characters of the typed lines as part of the case", async () => {
            const result = await runs.submit;
            const entry = result.index.cases[EMOJIS_CASE.name];
            assert.strictEqual(entry.spans.filter(span => span.char !== "\n").length, 7);
            assert.deepStrictEqual(entry.job, JOB);
        });

        it("should capture a case that opts out of the submission without engraving it", async () => {
            const result = await runs.submit;
            const entry = result.index.cases[ROMAN_CASE.name];
            assert.strictEqual(entry.case.submit, false);
            assert.strictEqual(entry.job, undefined);
            assert.strictEqual(entry.payload, undefined);
            assert.ok(png(result, `${ROMAN_CASE.name}-plate.png`));
            assert.strictEqual(png(result, `${ROMAN_CASE.name}-confirm.png`), false);
        });

        it("should refuse a case whose font size the viewport changed", async () => {
            const result = await runs.resized;
            refused(result, NOT_SHOWN);
            assert.deepStrictEqual(targets(result), ["button.button-start"]);
            assert.strictEqual(png(result, `${ROMAN_CASE.name}-confirm.png`), false);
        });

        it("should refuse a case whose text the viewport trimmed", async () => {
            const result = await runs.trimmed;
            refused(result, NOT_SHOWN);
            assert.deepStrictEqual(targets(result), ["button.button-start"]);
            assert.strictEqual(png(result, `${ROMAN_CASE.name}-confirm.png`), false);
        });

        it("should refuse to engrave when Dry run is left unticked", async () => {
            const result = await runs.unticked;
            refused(result, NOT_DRY_RUN);
            assert.deepStrictEqual(targets(result), [
                "button.button-start",
                ".button-print",
                'label[for="modal-dry-run"]'
            ]);
            assert.strictEqual(png(result, `${ROMAN_CASE.name}-confirm.png`), false);
        });

        it("should refuse to engrave when Check path is ticked", async () => {
            const result = await runs.checked;
            refused(result, NOT_DRY_RUN);
            assert.deepStrictEqual(targets(result), [
                "button.button-start",
                ".button-print",
                'label[for="modal-dry-run"]'
            ]);
            assert.strictEqual(png(result, `${ROMAN_CASE.name}-confirm.png`), false);
        });

        it("should fail when the guard blocks a print that is not a dry run", async () => {
            const result = await runs.engraved;
            const url = `${PRINT_URL}/nodes/${PRINT_NODE}/print`;
            assert.strictEqual(result.status, 1);
            assert.deepStrictEqual(
                prints(result).map(entry => [entry.url, entry.decision]),
                [[url, "abort"]]
            );
            assert.ok(result.stdout.includes(`guard: BLOCKED POST ${url}`));
            assert.ok(result.stderr.includes("Timeout 60000ms exceeded"), result.stderr);
            assert.strictEqual(result.index, null);
        });

        it("should stop when a print without dry run reached the Signatur server", async () => {
            const result = await runs.proxied;
            assert.strictEqual(result.status, 1);
            const decisions = prints(result).map(entry => entry.decision);
            assert.deepStrictEqual(decisions, ["continue"]);
            assert.ok(result.stderr.includes(NOT_DRY_RUN_SENT), result.stderr);
            assert.strictEqual(result.index, null);
        });

        it("should stop when a print checking the path reached the Signatur server", async () => {
            const result = await runs.proxiedPath;
            assert.strictEqual(result.status, 1);
            const decisions = prints(result).map(entry => entry.decision);
            assert.deepStrictEqual(decisions, ["continue"]);
            assert.ok(result.stderr.includes(NOT_DRY_RUN_SENT), result.stderr);
            assert.strictEqual(result.index, null);
        });
    });

    describe("#main()", function() {
        it("should launch the given Chromium", async () => {
            const result = await runs.submit;
            assert.deepStrictEqual(calls(result, "launch")[0].options, {
                executablePath: path.join(result.directory, "chromium")
            });
        });

        it("should launch the browser of Playwright when the given Chromium is missing", async () => {
            const result = await runs.capture;
            assert.deepStrictEqual(calls(result, "launch")[0].options, {});
        });

        it("should open a 1440 by 900 window at twice the pixel density", async () => {
            const result = await runs.capture;
            assert.deepStrictEqual(calls(result, "newContext")[0].options, {
                viewport: { width: 1440, height: 900 },
                deviceScaleFactor: 2
            });
            assert.strictEqual(result.index.meta.device_scale_factor, 2);
        });

        it("should guard every request of the page from the first one", async () => {
            const result = await runs.capture;
            const route = calls(result, "route");
            assert.deepStrictEqual(route, [{ call: "route", pattern: "**/*" }]);
            assert.ok(result.log.indexOf(route[0]) < result.log.indexOf(calls(result, "goto")[0]));
        });

        it("should record the hash of every font file the page loaded and nothing else", async () => {
            const result = await runs.capture;
            const fonts = Object.assign({}, EARLIER_INDEX.meta.fonts, {
                "/static/fonts/roman4l-f3s.ttf": digest("roman4l-f3s.ttf"),
                "/static/fonts/coolemojis.ttf": digest("coolemojis.ttf")
            });
            assert.deepStrictEqual(result.index.meta.fonts, fonts);
        });

        it("should keep the cases and the fonts of an earlier run in the output directory", async () => {
            const result = await runs.capture;
            assert.deepStrictEqual(
                result.index.cases["cov-script4l-1"],
                EARLIER_INDEX.cases["cov-script4l-1"]
            );
            const font = "/static/fonts/script4l-f3s.ttf";
            assert.strictEqual(result.index.meta.fonts[font], EARLIER_INDEX.meta.fonts[font]);
            assert.strictEqual(result.index.meta.label, "viewport");
            assert.notStrictEqual(result.index.meta.date, EARLIER_INDEX.meta.date);
            assert.ok(!Number.isNaN(Date.parse(result.index.meta.date)));
        });

        it("should replace the capture of a case captured again", async () => {
            const result = await runs.capture;
            const entry = result.index.cases[ROMAN_CASE.name];
            assert.strictEqual(entry.job, undefined);
            assert.deepStrictEqual(entry.case, ROMAN_CASE);
            assert.deepStrictEqual(Object.keys(result.index.cases).sort(), [
                "cov-roman4l-1",
                "cov-script4l-1",
                "mixed",
                "typed-pipe"
            ]);
        });

        it("should close the browser once every case is captured", async () => {
            const result = await runs.capture;
            assert.deepStrictEqual(result.log[result.log.length - 1], { call: "close" });
        });
    });
});
