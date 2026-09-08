const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const STATIC_PATH = path.resolve(__dirname, "..", "..", "..", "..", "static", "js");
const SCRIPTS = ["util.js", "plugins/texteditor.js"];

describe("TextEditor", function() {
    let window = null;
    let jQuery = null;
    let body = null;
    let container = null;
    let keyboard = null;
    let changes = null;
    let overflows = null;
    let trims = null;

    // installs a fake layout on the document, since jsdom computes
    // none, placing every visible child of the container left to
    // right with the given width (or its own data-width) and wrapping
    // the ones that would not fit the container width onto a new row,
    // the same way the flex wrap of the viewport css does, while a
    // newline element always starts a new row; the caret takes part
    // in the flow like any other flex item unless hidden
    const layout = function(containerWidth, charWidth) {
        window.Element.prototype.getBoundingClientRect = function() {
            if (this.classList.contains("viewer-container")) {
                return { top: 0, right: containerWidth, bottom: 100, left: 0 };
            }
            const children = this.parentNode ? this.parentNode.children : [];
            let x = 0;
            let row = 0;
            for (const child of children) {
                if (child.style.display === "none") continue;
                if (child.classList.contains("newline")) {
                    if (child === this) return { top: row * 10, right: 0, bottom: 0, left: 0 };
                    x = 0;
                    row++;
                    continue;
                }
                const width = parseFloat(child.getAttribute("data-width")) || charWidth;
                if (x > 0 && x + width > containerWidth) {
                    x = 0;
                    row++;
                }
                if (child === this) {
                    return { top: row * 10, right: x + width, bottom: row * 10 + 10, left: x };
                }
                x += width;
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
    // with newline elements and non breaking spaces normalized
    const rendered = function() {
        return container
            .children(":not(.caret)")
            .map(function() {
                return jQuery(this).hasClass("newline") ? "\n" : this.textContent;
            })
            .get()
            .join("")
            .replace(/\u00a0/g, " ");
    };

    // returns the index of the character the caret element sits
    // after (-1 when it sits before the first one), as rendered
    const caretIndex = function() {
        const caret = container.children(".caret");
        return container.children(":not(.caret)").index(caret.prev());
    };

    // converts the given text array into plain (same realm) values
    // so that deep equality assertions work on the jsdom arrays
    const plain = function(text) {
        return JSON.parse(JSON.stringify(text));
    };

    // simulates a key press on the virtual keyboard, the path the
    // on screen keyboards use to forward characters to the editor
    const press = function(value) {
        keyboard.triggerHandler("key", ["Helvetica", value]);
    };

    // simulates a key press on the physical keyboard
    const keydown = function(key) {
        body.trigger(jQuery.Event("keydown", { key: key }));
    };

    beforeEach(function() {
        const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
            runScripts: "outside-only"
        });
        window = dom.window;
        jQuery = require("jquery")(window);
        const context = dom.getInternalVMContext();
        for (const script of SCRIPTS) {
            const filePath = path.join(STATIC_PATH, script);
            const code = fs.readFileSync(filePath, "utf8");
            new vm.Script(code, { filename: filePath }).runInContext(context);
        }

        body = jQuery("body");
        keyboard = jQuery('<div class="keyboard-container selected"></div>').appendTo(body);
        for (const value of ["A", "B", "C", "D", "X"]) {
            keyboard.append('<span data-value="' + value + '"></span>');
        }
        container = jQuery('<div class="viewer-container"><span class="caret">|</span></div>');
        container.children(".caret").attr("data-width", 5);
        container.appendTo(body);

        changes = [];
        overflows = [];
        trims = [];
        container.bind("change", function(event, text, caretPosition) {
            changes.push([plain(text), caretPosition]);
        });
        container.bind("overflow", function(event, text, caretPosition) {
            overflows.push([plain(text), caretPosition]);
        });
        container.bind("trim", function(event, text, removed) {
            trims.push([plain(text), removed]);
        });

        container.texteditor();
        body.data("font", "Helvetica");
        layout(40, 10);
    });

    describe("#overflowing", function() {
        it("should be false for an empty editor", () => {
            assert.strictEqual(container.texteditor("overflowing"), false);
        });

        it("should be false when every line fits the container", () => {
            load("abcd\nefgh");
            assert.strictEqual(container.texteditor("overflowing"), false);
        });

        it("should be true when a line wraps past the container width", () => {
            load("abcd\nefghi");
            assert.strictEqual(container.texteditor("overflowing"), true);
        });

        it("should be false for an empty selection", () => {
            assert.strictEqual(jQuery(".missing").texteditor("overflowing"), false);
        });
    });

    describe("#option", function() {
        it("should block overflow by default", () => {
            load("abcd");
            press("e");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(overflows.length, 1);
        });

        it("should allow lines to wrap when the overflow flag is set", () => {
            container.texteditor("option", { overflow: true });
            load("abcd");
            press("e");
            assert.strictEqual(characters(), "abcde");
            assert.strictEqual(overflows.length, 0);
        });

        it("should block overflow again when the flag is cleared", () => {
            container.texteditor("option", { overflow: true });
            container.texteditor("option", { overflow: false });
            load("abcd");
            press("e");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(overflows.length, 1);
        });

        it("should keep the max lines constraint alongside the overflow flag", () => {
            container.texteditor("option", { maxLines: 1, overflow: true });
            load("ab");
            press("↵");
            assert.strictEqual(characters(), "ab");

            container.texteditor("option", { overflow: false });
            press("↵");
            assert.strictEqual(characters(), "ab");
            assert.strictEqual(changes.length, 0);
        });
    });

    describe("#trim", function() {
        it("should keep text that fits the container", () => {
            load("abcd");
            container.texteditor("trim");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(rendered(), "abcd");
            assert.strictEqual(changes.length, 0);
            assert.strictEqual(trims.length, 0);
        });

        it("should drop the trailing characters of a wrapping line", () => {
            load("abcdef");
            container.texteditor("trim");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(rendered(), "abcd");
            assert.strictEqual(body.data("caret_position"), 3);
            assert.strictEqual(caretIndex(), 3);
            assert.deepStrictEqual(changes, [[plain(load("abcd")), 3]]);
            assert.deepStrictEqual(trims, [[plain(load("abcd")), 2]]);
        });

        it("should trim every wrapping line and leave the others intact", () => {
            load("abcdef\nghij\nklmnop");
            container.texteditor("trim");
            assert.strictEqual(characters(), "abcd\nghij\nklmn");
            assert.strictEqual(rendered(), "abcd\nghij\nklmn");
            assert.strictEqual(changes.length, 1);
            assert.deepStrictEqual(trims[0][1], 4);
        });

        it("should keep the caret in place when the removed characters sit after it", () => {
            load("abcdef");
            keydown("ArrowLeft");
            keydown("ArrowLeft");
            keydown("ArrowLeft");
            assert.strictEqual(body.data("caret_position"), 2);

            container.texteditor("trim");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(body.data("caret_position"), 2);
            assert.strictEqual(caretIndex(), 2);
        });

        it("should move the caret back to the start when the whole line is removed", () => {
            layout(40, 50);
            load("ab");
            container.texteditor("trim");
            assert.strictEqual(characters(), "");
            assert.strictEqual(rendered(), "");
            assert.strictEqual(body.data("caret_position"), -1);
            assert.strictEqual(caretIndex(), -1);
        });

        it("should empty every line whose characters are wider than the container", () => {
            layout(40, 50);
            load("ab\ncd");
            container.texteditor("trim");
            assert.strictEqual(characters(), "\n");
            assert.strictEqual(rendered(), "\n");
            assert.deepStrictEqual(trims[0][1], 4);
        });

        it("should skip trimming while overflow is allowed", () => {
            container.texteditor("option", { overflow: true });
            load("abcdef");
            container.texteditor("trim");
            assert.strictEqual(characters(), "abcdef");
            assert.strictEqual(changes.length, 0);
            assert.strictEqual(trims.length, 0);
        });

        it("should leave server rendered text alone until its state is loaded", () => {
            const caret = container.children(".caret");
            for (const value of ["a", "b", "c", "d", "e", "f"]) {
                caret.before("<span style=\"font-family: 'Helvetica';\">" + value + "</span>");
            }
            container.texteditor("bindExisting");
            container.texteditor("trim");
            assert.strictEqual(rendered(), "abcdef");
            assert.strictEqual(changes.length, 0);
        });

        it("should not trim while the container is hidden", () => {
            layout(0, 0);
            load("abcdef");
            container.texteditor("trim");
            assert.strictEqual(characters(), "abcdef");
            assert.strictEqual(changes.length, 0);
        });
    });

    describe("#space()", function() {
        it("should insert a space that fits the line", () => {
            load("abc");
            press("⎵");
            assert.strictEqual(characters(), "abc ");
            assert.strictEqual(rendered(), "abc ");
            assert.strictEqual(changes.length, 1);
            assert.strictEqual(overflows.length, 0);
        });

        it("should refuse a space that would wrap the line", () => {
            load("abcd");
            press("⎵");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(rendered(), "abcd");
            assert.strictEqual(overflows.length, 1);
        });
    });

    describe("#type()", function() {
        it("should accept a character that fits the line", () => {
            load("abc");
            press("d");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(rendered(), "abcd");
            assert.strictEqual(body.data("caret_position"), 3);
            assert.strictEqual(changes.length, 1);
            assert.strictEqual(overflows.length, 0);
        });

        it("should refuse a character that would wrap the line", () => {
            const text = plain(load("abcd"));
            press("e");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(rendered(), "abcd");
            assert.strictEqual(body.data("caret_position"), 3);
            assert.strictEqual(caretIndex(), 3);
            assert.deepStrictEqual(overflows, [[text, 3]]);
            assert.deepStrictEqual(changes[changes.length - 1], [text, 3]);
        });

        it("should refuse a character inserted in the middle of a full line", () => {
            load("abcd");
            keydown("ArrowLeft");
            keydown("ArrowLeft");
            press("x");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(rendered(), "abcd");
            assert.strictEqual(body.data("caret_position"), 1);
            assert.strictEqual(caretIndex(), 1);
            assert.strictEqual(overflows.length, 1);
        });

        it("should only measure the line being typed on", () => {
            load("abcd\nef");
            press("g");
            assert.strictEqual(characters(), "abcd\nefg");
            assert.strictEqual(overflows.length, 0);
        });

        it("should accept a character that wraps while overflow is allowed", () => {
            container.texteditor("option", { overflow: true });
            load("abcd");
            press("e");
            assert.strictEqual(characters(), "abcde");
            assert.strictEqual(rendered(), "abcde");
            assert.strictEqual(overflows.length, 0);
        });

        it("should measure only after the change listeners had a chance to re-fit", () => {
            load("abcd");
            container.bind("change", function() {
                layout(40, 5);
            });
            press("e");
            assert.strictEqual(characters(), "abcde");
            assert.strictEqual(overflows.length, 0);
        });

        it("should refuse the inserted character even when a listener trims on change", () => {
            load("abcd");
            keydown("ArrowLeft");
            keydown("ArrowLeft");
            container.bind("change", function() {
                container.texteditor("trim");
            });
            press("x");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(rendered(), "abcd");
            assert.strictEqual(overflows.length, 1);
            assert.strictEqual(trims.length, 0);
        });

        it("should accept a physical keyboard character that fits the line", () => {
            load("abc");
            keydown("d");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(overflows.length, 0);
        });

        it("should refuse a physical keyboard character that would wrap the line", () => {
            load("abcd");
            keydown("a");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(overflows.length, 1);
        });
    });

    describe("#overflowIndex()", function() {
        it("should detect a single character reaching past the right edge", () => {
            load("a");
            container.children(":not(.caret)").first().attr("data-width", 50);
            assert.strictEqual(container.texteditor("overflowing"), true);

            container.texteditor("trim");
            assert.strictEqual(characters(), "");
            assert.deepStrictEqual(trims[0][1], 1);
        });

        it("should ignore newlines when looking for the first wrapping line", () => {
            load("\n\nabcdef");
            container.texteditor("trim");
            assert.strictEqual(characters(), "\n\nabcd");
            assert.strictEqual(rendered(), "\n\nabcd");
        });

        it("should report nothing while the container is hidden", () => {
            layout(0, 0);
            load("abcdef");
            assert.strictEqual(container.texteditor("overflowing"), false);
        });

        it("should not count the caret width when parked in the middle of a line", () => {
            load("abcd");
            keydown("ArrowLeft");
            keydown("ArrowLeft");
            assert.strictEqual(container.texteditor("overflowing"), false);

            container.texteditor("trim");
            assert.strictEqual(characters(), "abcd");
            assert.strictEqual(trims.length, 0);
        });

        it("should leave a hidden caret hidden after measuring", () => {
            load("abcd");
            container.children(".caret").hide();
            assert.strictEqual(container.texteditor("overflowing"), false);
            assert.strictEqual(container.children(".caret").css("display"), "none");

            container.children(".caret").show();
            assert.strictEqual(container.texteditor("overflowing"), false);
            assert.notStrictEqual(container.children(".caret").css("display"), "none");
        });
    });
});
