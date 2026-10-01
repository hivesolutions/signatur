const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const STATIC_PATH = path.resolve(__dirname, "..", "..", "..", "static", "js");
const FONTS_PATH = path.resolve(__dirname, "..", "..", "..", "static", "fonts");
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

// unix timestamp of the build rendered on the settings screen, for
// the main script to localize in the locale and time zone of the browser
const BUILD_DATE = 1790677148;

// scale factors the viewport applies to a font size in profile
// units to get the pixels of the viewer container font size, and
// to that font size to get the pixels of its line height
const VIEWPORT_SCALE = 3;
const FONT_SIZE_SCALE = 1 / 0.7;
const LINE_HEIGHT_SCALE = 1.232;

// width of every character of the fake layout in em, which keeps
// each character 1.3 times the font size in profile units (times the
// viewport scale) wide, the width the scenarios below are laid out with
const CHAR_WIDTH = 0.91;

// fonts rendered with an F3S derived counterpart while the F3S fonts
// option is checked, mapped to the source of their F3S font face
const F3S_FONTS = {
    "Helvetica 1L": "url(/static/fonts/helvetica1l-f3s.ttf)",
    "Helvetica 4L": "url(/static/fonts/helvetica4l-f3s.ttf)",
    "Roman 4L": "url(/static/fonts/roman4l-f3s.ttf)",
    "Script 4L": "url(/static/fonts/script4l-f3s.ttf)",
    "Script 412 1L": "url(/static/fonts/script4121l-f3s.ttf)",
    "Script Round 1L": "url(/static/fonts/scriptround1l-f3s.ttf)"
};

// profiles served to the viewport, a plate whose safe area is
// 30 mm wide (90 px once scaled), a finer twin of it whose font
// size slider moves in half unit steps, an automatically sized
// twin that declares no step at all and a double sided twin
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
    },
    double: {
        id: "double",
        name: "Double",
        width: 30,
        height: 10,
        unit: "mm",
        orientation: "landscape",
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        font_size: { mode: "manual", default: 2, min: 1, max: 8, step: 1 },
        text: { max_lines: 2 },
        double_sided: { enabled: true }
    }
};

describe("Main", function() {
    let window = null;
    let jQuery = null;
    let body = null;
    let container = null;
    let fontSizeRange = null;
    let fontSizeInput = null;
    let fonts = null;

    // installs a fake layout on the document, since jsdom computes
    // none, sizing the viewer container with the safe area width the
    // viewport preview gives it and every character 0.91 em wide at
    // the font size applied to the container, placing them left to
    // right and wrapping the ones that would not fit the container
    // width onto a new row, the same way the flex wrap of the viewport
    // css does, while a newline element always starts a new row, and
    // drawing the glyphs of a font that an F3S font face renders a
    // quarter of an em wider, so swapping the fonts changes the widths
    const layout = function() {
        window.Element.prototype.getBoundingClientRect = function() {
            if (this.classList.contains("viewer-container")) {
                return { top: 0, right: parseFloat(this.style.width) || 0, bottom: 100, left: 0 };
            }
            const parent = this.parentNode;
            const children = parent ? parent.children : [];
            const containerWidth = parent ? parseFloat(parent.style.width) || 0 : 0;
            const charWidth = parent ? (parseFloat(parent.style.fontSize) || 0) * CHAR_WIDTH : 0;
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
                const family = child.style.fontFamily.replace(/['"]/g, "");
                const swapped = fonts.faces.some(face => face.family === family);
                const width = child.textContent.length * charWidth * (swapped ? 1.25 : 1);
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
    // pairs the viewport works with, newlines included, in the given
    // font or in Helvetica when none is given
    const load = function(values, font) {
        const text = [];
        for (const value of values) {
            text.push(value === "\n" ? [null, "\n"] : [font || "Helvetica", value]);
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

    // returns the line height currently applied to the container
    const lineHeight = function() {
        return container.get(0).style.lineHeight;
    };

    // returns the container line height the viewport applies for
    // the given font size in profile units
    const leading = function(size) {
        return size * VIEWPORT_SCALE * FONT_SIZE_SCALE * LINE_HEIGHT_SCALE + "px";
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

    // simulates the operator checking or unchecking the F3S fonts
    // option
    const f3s = function(checked) {
        jQuery(".f3s-mode").prop("checked", checked).trigger("change");
    };

    // returns the families of the font faces added to the font set
    // of the document, in the order they were added
    const families = function() {
        return fonts.faces.map(face => face.family);
    };

    // simulates the document finishing loading its fonts, notifying
    // the viewport through the loading done event of its font set
    const loadingDone = function() {
        fonts.status = "loaded";
        for (const [type, listener] of fonts.listeners) {
            if (type === "loadingdone") listener();
        }
    };

    // mounts the viewport on a new document loaded from the given
    // address, with the given classes rendered on its body
    const mount = async function(url, classes) {
        const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
            url: url,
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

        // stands in for the font face constructor, which jsdom lacks,
        // keeping the family and the source the face is created with
        window.FontFace = function(family, source) {
            this.family = family;
            this.source = source;
        };

        // stands in for the font set of the document, which jsdom lacks,
        // with every font loaded by default so that a test can flag them
        // as still loading and then notify the viewport once they are done,
        // keeping the font faces added to it in the order they were added
        fonts = {
            status: "loaded",
            faces: [],
            listeners: [],
            add: function(face) {
                this.faces.push(face);
            },
            delete: function(face) {
                this.faces = this.faces.filter(candidate => candidate !== face);
            },
            addEventListener: function(type, listener) {
                this.listeners.push([type, listener]);
            }
        };
        Object.defineProperty(window.document, "fonts", { value: fonts, configurable: true });

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
        if (classes) body.addClass(classes);
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
        const f3sOption = jQuery('<div class="viewport-options-f3s"></div>').appendTo(options);
        f3sOption.append('<input class="f3s-mode" type="checkbox" checked />');
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
        const faces = jQuery('<div class="viewport-faces"></div>').appendTo(body);
        faces.append('<div class="viewport-faces-thumbnails"></div>');
        body.append('<div class="toast"></div>');
        const build = jQuery('<div class="settings-group"></div>').appendTo(body);
        build.append(
            '<div class="settings-readout settings-build-date" data-timestamp="' +
                BUILD_DATE +
                '">29/09/2026 10:19:08</div>'
        );
        build.append('<div class="settings-readout settings-build-date">29/09/2026 10:19:08</div>');
        fontSizeRange = jQuery(".font-size-range");
        fontSizeInput = jQuery(".font-size-input");
        layout();

        // waits for the viewport to restore the profile selected on the
        // URL, flagged by the loading guard being cleared from the body
        while (body.hasClass("profiles-loading")) {
            await new Promise(resolve => window.setTimeout(resolve));
        }
    };

    beforeEach(async function() {
        await mount("http://localhost/viewport?profile=plate&f3s=0");
    });

    afterEach(function() {
        window.close();
    });

    describe("#settingsBuildDate()", function() {
        it("should localize the build date to the locale and time zone of the browser", () => {
            const buildDate = jQuery(".settings-build-date").eq(0);
            assert.strictEqual(buildDate.text(), new Date(BUILD_DATE * 1000).toLocaleString());
            assert.notStrictEqual(buildDate.text(), "29/09/2026 10:19:08");
        });

        it("should keep the server rendered date when the timestamp is missing", () => {
            const buildDate = jQuery(".settings-build-date").eq(1);
            assert.strictEqual(buildDate.text(), "29/09/2026 10:19:08");
        });
    });

    describe("#loadProfiles()", function() {
        it("should render the F3S fonts by default", async () => {
            window.close();
            await mount("http://localhost/viewport?profile=plate");
            assert.strictEqual(jQuery(".f3s-mode").prop("checked"), true);
            assert.deepStrictEqual(families(), Object.keys(F3S_FONTS));
            const params = new URLSearchParams(window.location.search);
            assert.strictEqual(params.get("f3s"), null);
        });

        it("should restore the F3S fonts turned off on the URL", async () => {
            assert.strictEqual(jQuery(".f3s-mode").prop("checked"), false);
            assert.deepStrictEqual(families(), []);
            const params = new URLSearchParams(window.location.search);
            assert.strictEqual(params.get("f3s"), "0");
        });

        it("should ignore an F3S fonts value other than 0 on the URL", async () => {
            window.close();
            await mount("http://localhost/viewport?profile=plate&f3s=false");
            assert.strictEqual(jQuery(".f3s-mode").prop("checked"), true);
            assert.deepStrictEqual(families(), Object.keys(F3S_FONTS));
            const params = new URLSearchParams(window.location.search);
            assert.strictEqual(params.get("f3s"), null);
        });

        it("should force the F3S fonts on in store mode", async () => {
            window.close();
            await mount("http://localhost/viewport?profile=plate&f3s=0", "store-mode");
            assert.strictEqual(jQuery(".f3s-mode").prop("checked"), true);
            assert.deepStrictEqual(families(), Object.keys(F3S_FONTS));
            const params = new URLSearchParams(window.location.search);
            assert.strictEqual(params.get("f3s"), null);
        });
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

        it("should space the lines by the line height scale of the font size", () => {
            load("abcd");
            slide(3);
            assert.strictEqual(fontSize(), scaled(3));
            assert.strictEqual(lineHeight(), leading(3));
        });

        it("should keep the line height fractional on small font sizes", () => {
            load("abcd");
            slide(1);
            assert.strictEqual(lineHeight(), leading(1));
            assert.notStrictEqual(lineHeight(), Math.round(parseFloat(leading(1))) + "px");
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

        it("should apply an increase made while the fonts load without measuring it", () => {
            fonts.status = "loading";
            load("abcd");
            slide(8);
            assert.strictEqual(fontSizeInput.val(), "8");
            assert.strictEqual(fontSize(), scaled(8));
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(jQuery(".toast").hasClass("visible"), false);
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

    describe("#refreshProfile()", function() {
        it("should show the F3S fonts option while a profile is selected", () => {
            assert.strictEqual(jQuery(".viewport-options-f3s").hasClass("visible"), true);
        });

        it("should hide the F3S fonts option once no profile is selected", () => {
            jQuery(".profile-select").val("").trigger("change");
            assert.strictEqual(jQuery(".viewport-options-f3s").hasClass("visible"), false);
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

    describe("#applyF3sFonts()", function() {
        it("should render every font that has one with its F3S counterpart", () => {
            f3s(true);
            assert.deepStrictEqual(families(), Object.keys(F3S_FONTS));
            for (const face of fonts.faces) {
                assert.strictEqual(face.source, F3S_FONTS[face.family]);
            }
        });

        it("should point every F3S face to a font shipped next to its regular font", () => {
            f3s(true);
            assert.strictEqual(fonts.faces.length, 6);
            for (const face of fonts.faces) {
                const filename = face.source.match(/^url\(\/static\/fonts\/(.+)\)$/)[1];
                const regular = filename.replace(/-f3s\.ttf$/, ".ttf");
                assert.notStrictEqual(regular, filename);
                assert.strictEqual(fs.existsSync(path.join(FONTS_PATH, filename)), true);
                assert.strictEqual(fs.existsSync(path.join(FONTS_PATH, regular)), true);
            }
        });

        it("should keep the emoji fonts with their regular faces", () => {
            f3s(true);
            assert.strictEqual(families().includes("Cool Emojis"), false);
            assert.strictEqual(families().includes("Cool Emojis Pantograph"), false);
        });

        it("should render the regular fonts again once unchecked", () => {
            f3s(true);
            f3s(false);
            assert.deepStrictEqual(families(), []);
        });

        it("should keep a single F3S face per font across repeated changes", () => {
            f3s(true);
            const previous = fonts.faces.slice();
            f3s(true);
            assert.deepStrictEqual(families(), Object.keys(F3S_FONTS));
            for (const face of previous) {
                assert.strictEqual(fonts.faces.includes(face), false);
            }
        });

        it("should leave the fonts alone when the browser has no font set", () => {
            delete window.document.fonts;
            load("abc", "Helvetica 1L");
            f3s(true);
            assert.deepStrictEqual(families(), []);
            assert.strictEqual(characters(), "abc");
            const params = new URLSearchParams(window.location.search);
            assert.strictEqual(params.get("f3s"), null);
        });
    });

    describe("#f3sMode()", function() {
        it("should save the F3S fonts on the URL only while unchecked", () => {
            f3s(true);
            let params = new URLSearchParams(window.location.search);
            assert.strictEqual(params.get("f3s"), null);
            f3s(false);
            params = new URLSearchParams(window.location.search);
            assert.strictEqual(params.get("f3s"), "0");
            assert.strictEqual(params.get("profile"), "plate");
        });

        it("should keep the font names stored in the text", () => {
            load("abc", "Helvetica 1L");
            f3s(true);
            const fontNames = body.data("text").map(item => item[0]);
            assert.deepStrictEqual(fontNames, ["Helvetica 1L", "Helvetica 1L", "Helvetica 1L"]);
        });

        it("should trim the text that no longer fits the wider F3S glyphs", () => {
            load("abcdefghijk", "Helvetica 1L");
            assert.strictEqual(jQuery(".toast").hasClass("visible"), false);
            f3s(true);
            assert.strictEqual(characters(), "abcdefghi");
            assert.strictEqual(rendered(), "abcdefghi");
            assert.strictEqual(jQuery(".toast").hasClass("visible"), true);
        });

        it("should keep the text of a font without an F3S counterpart", () => {
            load("abcdefghijk", "Helvetica");
            f3s(true);
            assert.strictEqual(characters(), "abcdefghijk");
            assert.strictEqual(jQuery(".toast").hasClass("visible"), false);
        });

        it("should keep the text intact until the F3S fonts are done loading", () => {
            load("abcdefghijk", "Helvetica 1L");
            fonts.status = "loading";
            f3s(true);
            assert.strictEqual(characters(), "abcdefghijk");
            loadingDone();
            assert.strictEqual(characters(), "abcdefghi");
        });

        it("should keep the text that no longer fits while overflow is allowed", () => {
            jQuery(".overflow-mode").prop("checked", true).trigger("change");
            load("abcdefghijk", "Helvetica 1L");
            f3s(true);
            assert.strictEqual(characters(), "abcdefghijk");
            assert.strictEqual(jQuery(".toast").hasClass("visible"), false);
        });

        it("should step the automatic size down to fit the F3S glyphs and back up without them", () => {
            load("abcdefghijk", "Helvetica 1L");
            jQuery(".profile-select").val("automatic").trigger("change");
            assert.strictEqual(fontSizeInput.val(), "2");
            f3s(true);
            assert.strictEqual(fontSizeInput.val(), "1");
            assert.strictEqual(fontSize(), scaled(1));
            assert.strictEqual(characters(), "abcdefghijk");
            f3s(false);
            assert.strictEqual(fontSizeInput.val(), "2");
            assert.strictEqual(fontSize(), scaled(2));
            assert.strictEqual(characters(), "abcdefghijk");
        });
    });

    describe("#fontsLoadingDone()", function() {
        it("should stop an increase made while the fonts load at the largest size the text fits", () => {
            fonts.status = "loading";
            load("abcd");
            slide(8);
            loadingDone();
            assert.strictEqual(fontSizeRange.val(), "5");
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(fontSize(), scaled(5));
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(rendered(), "abcd");
            assert.strictEqual(jQuery(".toast").hasClass("visible"), false);
        });

        it("should sync the presets, the bubble and the URL to the stopped size", () => {
            fonts.status = "loading";
            load("abcd");
            preset("xl");
            loadingDone();
            assert.strictEqual(jQuery(".font-size-preset.active").length, 0);
            assert.strictEqual(jQuery(".font-size-bubble").text(), "5 mm");
            const params = new URLSearchParams(window.location.search);
            assert.strictEqual(params.get("font_size"), "5");
        });

        it("should sync the face thumbnails of a double sided profile to the stopped size", () => {
            jQuery(".profile-select").val("double").trigger("change");
            fonts.status = "loading";
            load("abcd");
            slide(8);
            loadingDone();
            const front = jQuery('.viewport-faces-thumb[data-side="front"]');
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(jQuery(".viewer-container", front).get(0).style.fontSize, scaled(5));
            assert.strictEqual(characters(), "abcd");
        });

        it("should keep an increase made while the fonts load that still fits", () => {
            fonts.status = "loading";
            load("abcd");
            slide(4);
            loadingDone();
            assert.strictEqual(fontSizeInput.val(), "4");
            assert.strictEqual(fontSize(), scaled(4));
            assert.strictEqual(characters(), "abcd");
        });

        it("should stop several increases made while the fonts load from the size before the first one", () => {
            fonts.status = "loading";
            load("abcd");
            slide(6);
            slide(8);
            loadingDone();
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(fontSize(), scaled(5));
            assert.strictEqual(characters(), "abcd");
        });

        it("should stop from a lower size applied in between the increases made while the fonts load", () => {
            fonts.status = "loading";
            load("abcdefghijkl");
            slide(3);
            slide(1);
            slide(6);
            loadingDone();
            assert.strictEqual(fontSizeInput.val(), "1");
            assert.strictEqual(fontSize(), scaled(1));
            assert.strictEqual(characters(), "abcdefghijkl");
        });

        it("should keep trimming the text when no increase is pending", () => {
            load("abcd");
            slide(5);
            fonts.status = "loading";
            jQuery(".margin-left").val(10).trigger("input");
            assert.strictEqual(characters(), "abcd");

            loadingDone();
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(characters(), "abc");
            assert.strictEqual(jQuery(".toast").hasClass("visible"), true);
        });

        it("should forget the pending size once the fonts are done", () => {
            fonts.status = "loading";
            load("abcd");
            slide(8);
            loadingDone();
            assert.strictEqual(fontSizeInput.val(), "5");

            fonts.status = "loading";
            jQuery(".margin-left").val(10).trigger("input");
            loadingDone();
            assert.strictEqual(fontSizeInput.val(), "5");
            assert.strictEqual(characters(), "abc");
        });
    });
});
