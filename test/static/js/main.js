const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const STATIC_PATH = path.resolve(__dirname, "..", "..", "..", "static", "js");
const SCRIPTS = [
    "util.js",
    "plugins/calligraphy.js",
    "plugins/collapsible.js",
    "plugins/console.js",
    "plugins/diagnostics.js",
    "plugins/emojis.js",
    "plugins/feedback.js",
    "plugins/fonts.js",
    "plugins/fontsmanager.js",
    "plugins/inspiration.js",
    "plugins/jsonhighlight.js",
    "plugins/keyboard.js",
    "plugins/modal.js",
    "plugins/printjobs.js",
    "plugins/profilemanager.js",
    "plugins/profileselector.js",
    "plugins/texteditor.js",
    "plugins/toast.js",
    "plugins/viewportfaces.js",
    "plugins/viewportpreview.js",
    "plugins/welcome.js",
    "main.js"
];

// scale factors the viewport applies to a font size in profile
// units to get the pixels of the viewer container font size
const VIEWPORT_SCALE = 3;
const FONT_SIZE_SCALE = 1.3;

// profiles served to the viewport, a plate whose safe area is
// 30 mm wide (90 px once scaled), a finer twin of it whose font
// size slider moves in half unit steps and an automatically sized
// twin that declares no step at all
const PROFILES = {
    plate: {
        id: "plate",
        name: "Plate",
        width: 30,
        height: 10,
        unit: "mm",
        orientation: "landscape",
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        font_size: { mode: "manual", default: 2, min: 1, max: 8, step: 1 },
        text: { max_lines: 2 }
    },
    fine: {
        id: "fine",
        name: "Fine",
        width: 30,
        height: 10,
        unit: "mm",
        orientation: "landscape",
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        font_size: { mode: "manual", default: 2, min: 1, max: 8, step: 0.5 },
        text: { max_lines: 2 }
    },
    automatic: {
        id: "automatic",
        name: "Automatic",
        width: 30,
        height: 10,
        unit: "mm",
        orientation: "landscape",
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        font_size: { mode: "automatic", min: 1, max: 8 },
        text: { max_lines: 2 }
    }
};

describe("Main", function() {
    let window = null;
    let jQuery = null;
    let body = null;
    let container = null;
    let fontSizeRange = null;
    let fontSizeInput = null;

    // installs a fake layout on the document, since jsdom computes
    // none, sizing the viewer container with the safe area width the
    // viewport preview gives it and every character one em wide at
    // the font size applied to the container, placing them left to
    // right and wrapping the ones that would not fit the container
    // width onto a new row, the same way the flex wrap of the viewport
    // css does, while a newline element always starts a new row
    const layout = function() {
        window.Element.prototype.getBoundingClientRect = function() {
            if (this.classList.contains("viewer-container")) {
                return { top: 0, right: parseFloat(this.style.width) || 0, bottom: 100, left: 0 };
            }
            const parent = this.parentNode;
            const children = parent ? parent.children : [];
            const containerWidth = parent ? parseFloat(parent.style.width) || 0 : 0;
            const charWidth = parent ? parseFloat(parent.style.fontSize) || 0 : 0;
            const rows = [[]];
            let x = 0;
            for (const child of children) {
                if (child.style.display === "none") continue;
                if (child.classList.contains("newline")) {
                    rows.push([{ element: child, width: 0 }]);
                    rows.push([]);
                    x = 0;
                    continue;
                }
                const width = child.textContent.length * charWidth;
                if (x > 0 && x + width > containerWidth) {
                    rows.push([]);
                    x = 0;
                }
                rows[rows.length - 1].push({ element: child, width: width });
                x += width;
            }
            for (let row = 0; row < rows.length; row++) {
                let left = 0;
                for (const item of rows[row]) {
                    if (item.element === this) {
                        const top = row * 10;
                        return { top: top, right: left + item.width, bottom: top + 10, left: left };
                    }
                    left += item.width;
                }
            }
            return { top: 0, right: 0, bottom: 0, left: 0 };
        };
    };

    // loads the given characters into the editor as the [font, char]
    // pairs the viewport works with, newlines included
    const load = function(values) {
        const text = [];
        for (const value of values) {
            text.push(value === "\n" ? [null, "\n"] : ["Helvetica", value]);
        }
        container.texteditor("loadText", { text: text });
        return text;
    };

    // returns the characters currently stored in the editor state
    const characters = function() {
        return (body.data("text") || []).map(item => item[1]).join("");
    };

    // returns the characters currently rendered in the container,
    // with newline elements normalized
    const rendered = function() {
        return container
            .children(":not(.caret)")
            .map(function() {
                return jQuery(this).hasClass("newline") ? "\n" : this.textContent;
            })
            .get()
            .join("");
    };

    // returns the font size currently applied to the container
    const fontSize = function() {
        return container.get(0).style.fontSize;
    };

    // returns the container font size the viewport applies for the
    // given font size in profile units
    const scaled = function(size) {
        return size * VIEWPORT_SCALE * FONT_SIZE_SCALE + "px";
    };

    // simulates the operator moving the font size slider to the
    // given value
    const slide = function(value) {
        fontSizeRange.val(value).trigger("input");
    };

    // simulates the operator picking the font size preset chip with
    // the given name
    const preset = function(name) {
        jQuery('.font-size-preset[data-preset="' + name + '"]').click();
    };

    beforeEach(async function() {
        const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
            url: "http://localhost/viewport?profile=plate",
            runScripts: "outside-only"
        });
        window = dom.window;
        jQuery = require("jquery")(window);

        // serves the profiles and fails the emojis mapping request on
        // a later tick, as the network would, since there is no server
        // behind the document, and stands in for the signature canvas
        // plugin, a third party script the viewport does not use here
        window.fetch = function() {
            return Promise.resolve({ status: 200, json: () => Promise.resolve(PROFILES) });
        };
        jQuery.getJSON = function() {
            const deferred = jQuery.Deferred();
            window.setTimeout(() => deferred.reject());
            return deferred.promise();
        };
        jQuery.fn.jSignature = function() {
            return this;
        };

        const context = dom.getInternalVMContext();
        for (const script of SCRIPTS) {
            const filePath = path.join(STATIC_PATH, script);
            const code = fs.readFileSync(filePath, "utf8");
            new vm.Script(code, { filename: filePath }).runInContext(context);
        }

        // mounts the viewport controls exercised by the suite, with the
        // same class names as the viewport view, before the document
        // ready handler of the viewport runs on the next tick
        body = jQuery("body");
        body.addClass("profiles-loading");
        const options = jQuery('<div class="viewport-options-body"></div>').appendTo(body);
        options.append('<select class="profile-select"><option value="">None</option></select>');
        options.append('<select class="variant-select"><option value="">None</option></select>');
        const sizes = jQuery('<div class="font-size-container"></div>').appendTo(options);
        for (const name of ["s", "m", "l", "xl", "auto"]) {
            sizes.append('<span class="font-size-preset" data-preset="' + name + '"></span>');
        }
        sizes.append('<input class="font-size-range" type="range" min="8" max="24" value="12" />');
        sizes.append('<span class="font-size-bubble">12</span>');
        sizes.append('<input class="font-size-input" type="hidden" value="12" />');
        sizes.append('<input class="font-size-mode" type="checkbox" hidden />');
        options.append('<input class="overflow-mode" type="checkbox" />');
        for (const side of ["left", "right", "top", "bottom"]) {
            const margin = jQuery('<input class="margin-input" type="number" value="0" />');
            margin.addClass("margin-" + side).appendTo(options);
        }
        const viewport = jQuery('<div class="viewport"><div class="main-container"></div></div>');
        const preview = jQuery('<div class="viewport-preview"></div>');
        preview.append('<svg class="viewport-svg"></svg>');
        viewport.children(".main-container").append(preview);
        viewport.appendTo(body);
        container = jQuery('<div class="viewer-container"><span class="caret">|</span></div>');
        container.appendTo(preview);
        body.append('<div class="toast"></div>');
        fontSizeRange = jQuery(".font-size-range");
        fontSizeInput = jQuery(".font-size-input");
        layout();

        // waits for the viewport to restore the profile selected on the
        // URL, flagged by the loading guard being cleared from the body
        while (body.hasClass("profiles-loading")) {
            await new Promise(resolve => window.setTimeout(resolve));
        }
    });

    afterEach(function() {
        window.close();
    });

    describe("#applyFontSize()", function() {
        it("should apply a size increase the text still fits", () => {
            load("abcd");
            slide(5);
            assert.strictEqual(fontSizeRange.val(), "5");
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(fontSize(), scaled(5));
            assert.strictEqual(characters(), "abcd");
        });

        it("should stop a size increase at the largest size the text still fits", () => {
            load("abcd");
            slide(8);
            assert.strictEqual(fontSizeRange.val(), "5");
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(fontSize(), scaled(5));
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(rendered(), "abcd");
            assert.strictEqual(container.texteditor("overflowing"), false);
        });

        it("should keep the size in place once no larger size fits the text", () => {
            load("abcd");
            slide(5);
            slide(6);
            assert.strictEqual(fontSizeRange.val(), "5");
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(fontSize(), scaled(5));
            assert.strictEqual(characters(), "abcd");
        });

        it("should stop the size increase without warning the operator", () => {
            load("abcd");
            slide(8);
            assert.strictEqual(jQuery(".toast").hasClass("visible"), false);
        });

        it("should apply a size decrease as is", () => {
            load("abcd");
            slide(5);
            slide(1);
            assert.strictEqual(fontSizeRange.val(), "1");
            assert.strictEqual(fontSizeInput.val(), "1");
            assert.strictEqual(fontSize(), scaled(1));
        });

        it("should keep the text intact across repeated size increases and decreases", () => {
            load("abcd\nef");
            for (const value of [8, 1, 6, 3, 8, 2, 7]) slide(value);
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(characters(), "abcd\nef");
            assert.strictEqual(rendered(), "abcd\nef");
        });

        it("should stop at the largest size the longest line still fits", () => {
            load("ab\nabcdef");
            slide(8);
            assert.strictEqual(fontSizeInput.val(), "3");
            assert.strictEqual(fontSize(), scaled(3));
            assert.strictEqual(characters(), "ab\nabcdef");
        });

        it("should let an empty text grow up to the largest size of the profile", () => {
            slide(8);
            assert.strictEqual(fontSizeInput.val(), "8");
            assert.strictEqual(fontSize(), scaled(8));
        });

        it("should step the size down by the step of the profile", () => {
            jQuery(".profile-select").val("fine").trigger("change");
            load("abcd");
            slide(8);
            assert.strictEqual(fontSizeRange.val(), "5.5");
            assert.strictEqual(fontSizeInput.val(), "5.5");
            assert.strictEqual(fontSize(), scaled(5.5));
            assert.strictEqual(characters(), "abcd");
        });

        it("should step the size down one unit at a time when the profile sets no step", () => {
            load("abcd");
            jQuery(".profile-select").val("automatic").trigger("change");
            preset("s");
            preset("xl");
            assert.strictEqual(jQuery(".font-size-mode").prop("checked"), false);
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(fontSize(), scaled(5));
            assert.strictEqual(characters(), "abcd");
        });

        it("should never step below the previous size when it sits between two steps", () => {
            load("abcd");

            // mirrors a size restored from a shared link that does not
            // sit on the slider step, kept as is on the number input
            fontSizeRange.val(5.5);
            fontSizeInput.val(5.5);

            slide(7);
            assert.strictEqual(fontSizeInput.val(), "5.5");
            assert.strictEqual(fontSize(), scaled(5.5));
            assert.strictEqual(characters(), "abcd");
        });

        it("should let the size grow past the line width while overflow is allowed", () => {
            jQuery(".overflow-mode").prop("checked", true).trigger("change");
            load("abcd");
            slide(8);
            assert.strictEqual(fontSizeInput.val(), "8");
            assert.strictEqual(fontSize(), scaled(8));
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(container.texteditor("overflowing"), true);
        });

        it("should keep trimming the text when a margin change narrows the line", () => {
            load("abcd");
            slide(5);
            jQuery(".margin-left").val(10).trigger("input");
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(characters(), "abc");
            assert.strictEqual(rendered(), "abc");
            assert.strictEqual(jQuery(".toast").hasClass("visible"), true);
        });
    });

    describe("#fontSizeRange()", function() {
        it("should sync the number input, the bubble and the URL to the stopped size", () => {
            load("abcd");
            slide(8);
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(jQuery(".font-size-bubble").text(), "5 mm");
            const params = new URLSearchParams(window.location.search);
            assert.strictEqual(params.get("font_size"), "5");
        });
    });

    describe("#fontSizeInput()", function() {
        it("should stop a number input increase at the largest size the text still fits", () => {
            load("abcd");
            fontSizeInput.val(8).trigger("input");
            assert.strictEqual(fontSizeRange.val(), "5");
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(fontSize(), scaled(5));
            assert.strictEqual(characters(), "abcd");
        });

        it("should apply a number input decrease as is", () => {
            load("abcd");
            slide(5);
            fontSizeInput.val(2).trigger("input");
            assert.strictEqual(fontSizeRange.val(), "2");
            assert.strictEqual(fontSizeInput.val(), "2");
            assert.strictEqual(fontSize(), scaled(2));
        });
    });

    describe("#fontSizePresets()", function() {
        it("should land a larger preset on the largest size the text still fits", () => {
            load("abcd");
            preset("xl");
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(fontSize(), scaled(5));
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(jQuery(".font-size-preset.active").length, 0);
        });

        it("should apply a preset the text still fits as is", () => {
            load("abcd");
            preset("m");
            assert.strictEqual(fontSizeInput.val(), "3");
            assert.strictEqual(fontSize(), scaled(3));
            assert.strictEqual(jQuery(".font-size-preset.active").attr("data-preset"), "m");
        });

        it("should stop a larger preset picked after the automatic size", () => {
            load("abcd");
            preset("auto");
            preset("xl");
            assert.strictEqual(jQuery(".font-size-mode").prop("checked"), false);
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(fontSize(), scaled(5));
            assert.strictEqual(characters(), "abcd");
        });
    });
});
