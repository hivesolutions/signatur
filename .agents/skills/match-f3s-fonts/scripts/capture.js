// Captures the visible Signatur viewport for a list of cases and, with
// --submit, sends the same composition to the engraving node through the
// real Engrave confirm modal, ALWAYS as a dry run, so gravo-pilot takes
// the Gravostyle screenshot of exactly what the viewport shows.
//
// Usage: node capture.js cases.json OUT_DIR [--base URL] [--label NAME]
//        [--root SIGNATUR_DIR] [--submit]
//
// Writes, per case, <name>-page.png (the whole visible page), the plate
// of the viewport as shown (<name>-viewport.png) and without background,
// rulers and guides (<name>-plate.png, used for the overlay), plus the
// character boxes in capture.json. With --submit the confirm modal is
// screenshotted (<name>-confirm.png) and the job id and the payload sent
// are recorded in capture.json for `gravo_job.py fetch`. The SHA-256 of
// every TTF the page loads is recorded too, so the measurement can prove
// it reads the very fonts that rendered the viewport.
//
// Dry run guard: every request that is not a GET to the Signatur server
// is intercepted, a print is only let through when it is a gravo job
// whose decoded payload carries dry_run true and no check_path, anything
// else is aborted, and the Dry run checkbox must be checked before the
// Engrave button is clicked. A case is never submitted when Signatur
// changed its font size or trims its text, as the engraving would then
// differ from the case.
//
// Environment: SIGNATUR_USERNAME and SIGNATUR_PASSWORD (admin/admin, from
// `npm run user:local`), CHROMIUM_PATH (/usr/bin/chromium when present)
// and PLAYWRIGHT_PATH (the playwright module, default `playwright`).

const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");

const playwright = require(process.env.PLAYWRIGHT_PATH || "playwright");

const option = function(name, fallback) {
    const index = process.argv.indexOf(name);
    return index === -1 ? fallback : process.argv[index + 1];
};

const casesPath = process.argv[2];
const outDir = process.argv[3];
const baseUrl = option("--base", "http://127.0.0.1:3123");
const label = option("--label", "viewport");
const root = path.resolve(option("--root", path.join(__dirname, "..", "..", "..", "..")));
const submitJobs = process.argv.includes("--submit");

const segments = function(line, font) {
    return typeof line === "string" ? [[font, line]] : line;
};

// serializes the lines as the viewport `text` query parameter does,
// `font:char` elements joined by "|" with a `\n` element between lines
const serialize = function(font, lines) {
    const parts = [];
    lines.forEach((line, index) => {
        if (index > 0) parts.push("\\n");
        for (const [segmentFont, text] of segments(line, font)) {
            for (const char of text) {
                if (char === "|") throw new Error("'|' cannot travel in the URL, use typed");
                parts.push(`${segmentFont}:${char}`);
            }
        }
    });
    return parts.join("|");
};

const guard = async function(route) {
    const request = route.request();
    if (request.method() === "GET" || request.url().startsWith(baseUrl)) {
        return route.continue();
    }
    if (/\/nodes\/[^/]+\/print$/.test(request.url())) {
        const params = new URLSearchParams(request.postData() || "");
        let data = null;
        try {
            data = JSON.parse(params.get("data"));
        } catch (err) {
            data = null;
        }
        if (params.get("type") === "gravo" && data && data.dry_run === true && !data.check_path) {
            console.log("  guard: dry run payload allowed");
            return route.continue();
        }
    }
    console.log("  guard: BLOCKED %s %s", request.method(), request.url());
    return route.abort();
};

const login = async function(page) {
    await page.goto(`${baseUrl}/login`);
    await page.fill("#login-username", process.env.SIGNATUR_USERNAME || "admin");
    await page.fill("#login-password", process.env.SIGNATUR_PASSWORD || "admin");
    await Promise.all([page.waitForNavigation(), page.click("button.button-start")]);
};

const openCase = async function(page, item) {
    const params = new URLSearchParams();
    params.set("profile", item.profile || "plate");
    params.set("font", item.font);
    params.set("font_size", String(item.font_size));
    params.set("margins", item.margins.join(","));
    params.set("text", serialize(item.font, item.lines));
    params.set("caret", "0");
    if (item.zoom) params.set("zoom", String(item.zoom));
    params.set("f3s", item.f3s ? "1" : "0");
    await page.goto(`${baseUrl}/viewport?${params.toString()}`);
    await page.waitForSelector(".viewport-preview.profile-active");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);

    // types the lines that cannot travel in the URL (the "|" emoji is
    // the separator of the serialized text) through the emoji keyboard
    for (const line of item.typed || []) {
        await page.click(".emojis-container.selected .char[data-value='\u21b5']");
        for (const char of line) {
            if (char === " ") {
                await page.click(".emojis-container.selected .char[data-value='\u23b5']");
                continue;
            }
            const key =
                `.emojis-container.selected .char[data-value='${char.replace("'", "\\'")}']`;
            const category = await page.getAttribute(key, "data-category");
            await page.click(
                `.emojis-container.selected .emojis-tab[data-category='${category}']`
            );
            await page.click(key);
        }
        await page.waitForTimeout(300);
    }
};

const capture = async function(page, prefix) {
    await page.screenshot({ path: `${prefix}-page.png` });
    const data = await page.evaluate(() => {
        // the page holds clones of the viewer (inspiration and faces), the
        // editor is the one carrying the text
        const container = document.querySelector(".viewer-container[data-text]");
        const preview = container.closest(".viewport-preview");
        const svg = preview.querySelector(":scope > .viewport-svg");
        const plate = svg.getBoundingClientRect();
        const style = getComputedStyle(container);
        const spans = Array.from(container.children)
            .filter(element => !element.classList.contains("caret"))
            .map(element => {
                const rect = element.getBoundingClientRect();
                return {
                    char: element.classList.contains("newline") ? "\n" : element.textContent,
                    font: element.style.fontFamily.replace(/['"]/g, ""),
                    display: getComputedStyle(element).display,
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom
                };
            });
        return {
            plate: { left: plate.left, top: plate.top, width: plate.width, height: plate.height },
            fontSize: parseFloat(style.fontSize),
            lineHeight: parseFloat(style.lineHeight),
            fontFamily: style.fontFamily,
            fontSizeInput: document.querySelector(".font-size-input").value,
            spans: spans
        };
    });
    const clip = {
        x: data.plate.left,
        y: data.plate.top,
        width: data.plate.width,
        height: data.plate.height
    };
    await page.screenshot({ path: `${prefix}-viewport.png`, clip: clip });

    // a clean capture of the same plate with the background, the bounds,
    // the rulers and the guides hidden, so the ink of the text can be
    // overlaid on the Gravostyle composition
    const style = await page.addStyleTag({
        content: `
            .viewport-background, .viewport-svg, .ruler-horizontal, .ruler-vertical,
            .crosshair, .guidelines { visibility: hidden !important; }
            .viewport-preview { background: #ffffff !important; }
        `
    });
    await page.screenshot({ path: `${prefix}-plate.png`, clip: clip });
    await style.evaluate(element => element.remove());
    return data;
};

const submit = async function(page, prefix) {
    await page.click(".button-print");
    await page.waitForSelector(".modal-overlay-confirm .button-modal-engrave", {
        state: "visible"
    });
    await page.click('label[for="modal-dry-run"]');
    const flags = await page.evaluate(() => {
        const checkPath = document.querySelector(".modal-check-path");
        return {
            dryRun: document.querySelector("#modal-dry-run").checked,
            checkPath: Boolean(checkPath && checkPath.checked)
        };
    });
    if (!flags.dryRun || flags.checkPath) {
        throw new Error("the confirm modal is not set to a dry run, refusing to engrave");
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${prefix}-confirm.png` });
    const [response] = await Promise.all([
        page.waitForResponse(
            response =>
                /\/nodes\/[^/]+\/print$/.test(response.url()) &&
                response.request().method() === "POST",
            { timeout: 60000 }
        ),
        // dispatches the click instead of moving the pointer, as the
        // button of a tall confirm modal can sit below the window
        page.locator(".modal-overlay-confirm .button-modal-engrave").dispatchEvent("click")
    ]);
    const job = await response.json();
    const payload = JSON.parse(new URLSearchParams(response.request().postData()).get("data"));
    if (payload.dry_run !== true || payload.check_path) {
        throw new Error("a payload without dry run left the browser, stop and investigate");
    }
    if (payload.extra_fonts) payload.extra_fonts = Object.keys(payload.extra_fonts);
    return { job: job, payload: payload };
};

(async () => {
    const cases = JSON.parse(fs.readFileSync(casesPath, "utf-8"));
    fs.mkdirSync(outDir, { recursive: true });
    const chromium = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
    const browser = await playwright.chromium.launch(
        fs.existsSync(chromium) ? { executablePath: chromium } : {}
    );
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2
    });
    const page = await context.newPage();
    await page.route("**/*", guard);

    // hashes every font file the page loads, keyed by its path, so the
    // measurement can check it reads the fonts that were rendered
    const fonts = {};
    page.on("response", async response => {
        const url = new URL(response.url());
        if (!url.pathname.endsWith(".ttf") || response.status() !== 200) return;
        const body = await response.body();
        fonts[url.pathname] = createHash("sha256").update(body).digest("hex");
    });
    await login(page);

    const indexPath = path.join(outDir, "capture.json");
    const index = fs.existsSync(indexPath)
        ? JSON.parse(fs.readFileSync(indexPath, "utf-8"))
        : { cases: {} };
    index.meta = {
        label: label,
        base_url: baseUrl,
        root: root,
        date: new Date().toISOString(),
        device_scale_factor: 2
    };
    for (const item of cases) {
        const prefix = path.join(outDir, item.name);
        await openCase(page, item);
        const data = await capture(page, prefix);
        const entry = Object.assign({ case: item }, data);
        console.log(
            "%s font-size %spx line-height %spx input %s",
            item.name,
            data.fontSize,
            data.lineHeight,
            data.fontSizeInput
        );
        if (submitJobs && item.submit !== false) {
            // refuses to engrave a composition other than the case, the
            // font size being changed by Signatur or the text trimmed
            const expected = item.lines
                .map(line => segments(line, item.font).map(([, text]) => text).join(""))
                .join("").length;
            const shown = data.spans.filter(
                span => span.char !== "\n" && span.display !== "none"
            ).length;
            if (parseFloat(data.fontSizeInput) !== item.font_size || shown !== expected) {
                throw new Error(
                    `${item.name}: the viewport does not show the case, refusing to submit`
                );
            }
            const sent = await submit(page, prefix);
            entry.job = sent.job;
            entry.payload = sent.payload;
            console.log("  submitted dry run job %s", sent.job.id);
        }
        index.cases[item.name] = entry;
        index.meta.fonts = Object.assign(index.meta.fonts || {}, fonts);
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 4));
    }
    await browser.close();
})();
