const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const STATIC_PATH = path.resolve(__dirname, "..", "..", "..", "..", "static", "js");
const SCRIPTS = ["plugins/keyboard.js"];

// time in milliseconds a key is pressed for before the keyboard
// shows its accented variants
const LONG_PRESS = 400;

describe("Keyboard", function() {
    let window = null;
    let jQuery = null;
    let body = null;
    let keyboard = null;
    let timers = null;
    let sequence = null;
    let now = null;
    let typed = null;

    // moves the fake clock of the window forward by the given time
    // and runs the timers that became due, in the order they were set
    const elapse = function(time) {
        now += time;
        const due = timers.filter(timer => timer.time <= now);
        timers = timers.filter(timer => timer.time > now);
        for (const timer of due) timer.callback();
    };

    // selects a font the way the viewport does, setting it on the
    // keyboard and keeping its name on the body for the keys typed
    const select = function(font) {
        keyboard.css("font-family", '"' + font + '"');
        body.data("font", font);
    };

    // taps the key with the given value, pressing and releasing it
    // before the keyboard takes the press for a long one
    const tap = function(value) {
        const key = keyboard.find('> .char[data-value="' + value + '"]');
        key.trigger("mousedown");
        key.trigger("mouseup");
        key.click();
    };

    // presses the key with the given value for as long as it takes
    // the keyboard to show its accented variants, returning the popup
    const press = function(value) {
        keyboard.find('> .char[data-value="' + value + '"]').trigger("mousedown");
        elapse(LONG_PRESS);
        return jQuery(".accent-popup");
    };

    // returns the accented variants listed on the popup, in the
    // order the operator reads them
    const variants = function(popup) {
        return popup
            .find("> .accent-option")
            .map(function() {
                return jQuery(this).text();
            })
            .get();
    };

    beforeEach(function() {
        const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
            url: "http://localhost/viewport",
            runScripts: "outside-only"
        });
        window = dom.window;
        jQuery = require("jquery")(window);

        // installs a fake clock on the window, as the popup only shows
        // once a key was pressed for a while and only listens to the
        // clicks outside of it after the press that opened it
        timers = [];
        sequence = 0;
        now = 0;
        window.setTimeout = function(callback, delay) {
            sequence += 1;
            timers.push({ id: sequence, time: now + (delay || 0), callback: callback });
            return sequence;
        };
        window.clearTimeout = function(id) {
            timers = timers.filter(timer => timer.id !== id);
        };

        const context = dom.getInternalVMContext();
        for (const script of SCRIPTS) {
            const filePath = path.join(STATIC_PATH, script);
            const code = fs.readFileSync(filePath, "utf8");
            new vm.Script(code, { filename: filePath }).runInContext(context);
        }

        // mounts a keyboard with the same class names as the viewport
        // view, with keys that have accented variants and one that has
        // none, collecting the keys it reports as typed
        body = jQuery("body");
        keyboard = jQuery('<div class="keyboard-container"></div>').appendTo(body);
        keyboard.append('<span class="char letters" data-value="A" data-accents="À,Á,Â,Ã">A</span>');
        keyboard.append('<span class="char letters" data-value="C" data-accents="Ç">C</span>');
        keyboard.append('<span class="char letters" data-value="B">B</span>');
        keyboard.append('<span class="char utility shift letters" data-value="⇧"></span>');
        keyboard.keyboardcontainer();
        typed = [];
        keyboard.bind("key", function(event, font, value) {
            typed.push([font, value]);
        });
        select("Roman 4L");
    });

    afterEach(function() {
        window.close();
    });

    describe("#showAccentPopup()", function() {
        it("should list the accented variants of the pressed key", () => {
            const popup = press("A");
            assert.strictEqual(popup.length, 1);
            assert.deepStrictEqual(variants(popup), ["À", "Á", "Â", "Ã"]);
            assert.strictEqual(popup.find("> .accent-popup-arrow").length, 1);
        });

        it("should list the variants in lowercase while the keyboard is in lowercase", () => {
            tap("⇧");
            assert.deepStrictEqual(variants(press("A")), ["à", "á", "â", "ã"]);
            tap("⇧");
            assert.deepStrictEqual(variants(press("A")), ["À", "Á", "Â", "Ã"]);
        });

        it("should draw the variants with the font of the keyboard", () => {
            const popup = press("A");
            assert.strictEqual(popup.css("font-family"), '"Roman 4L"');
            assert.strictEqual(popup.css("font-family"), keyboard.css("font-family"));
        });

        it("should draw the variants with the font selected at the time of the press", () => {
            press("A");
            select("Script 4L");
            assert.strictEqual(press("C").css("font-family"), '"Script 4L"');
            assert.strictEqual(press("A").css("font-family"), '"Script 4L"');
        });

        it("should anchor the popup to the body, above the middle of the pressed key", () => {
            window.Element.prototype.getBoundingClientRect = function() {
                return { left: 100, top: 200, width: 44, height: 44 };
            };
            const popup = press("A");
            assert.strictEqual(popup.parent().get(0), body.get(0));
            assert.strictEqual(popup.get(0).style.left, "122px");
            assert.strictEqual(popup.get(0).style.top, "200px");
        });

        it("should type the selected variant with the selected font and close", () => {
            const popup = press("A");
            popup
                .find("> .accent-option")
                .eq(3)
                .trigger("mouseup");
            assert.deepStrictEqual(typed, [["Roman 4L", "Ã"]]);
            assert.strictEqual(jQuery(".accent-popup").length, 0);
        });

        it("should replace the popup of the key pressed before", () => {
            press("A");
            const popup = press("C");
            assert.strictEqual(popup.length, 1);
            assert.deepStrictEqual(variants(popup), ["Ç"]);
        });

        it("should close on a click outside of the popup", () => {
            press("A");
            elapse(0);
            body.click();
            assert.strictEqual(jQuery(".accent-popup").length, 0);
            assert.deepStrictEqual(typed, []);
        });
    });
});
