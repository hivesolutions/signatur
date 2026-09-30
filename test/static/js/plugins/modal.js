const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const STATIC_PATH = path.resolve(__dirname, "..", "..", "..", "..", "static", "js");
const SCRIPTS = ["plugins/modal.js", "plugins/toast.js"];

// colony print base URL and engrave node rendered on the print
// button, the endpoint every engraving job is posted to
const PRINT_URL = "http://localhost:8080";
const PRINT_NODE = "engraver";

// profiles served to the confirm modal, a small medal whose font
// size slider moves in quarter unit steps down to half a unit
const PROFILES = {
    "small-medal": {
        id: "small-medal",
        name: "Small Medal",
        width: 20,
        height: 20,
        unit: "mm",
        orientation: "landscape",
        padding: { top: 2.94, right: 2.94, bottom: 2.94, left: 2.94 },
        font_size: { mode: "manual", default: 3, min: 0.5, max: 8, step: 0.25 },
        text: { max_lines: 2 }
    }
};

describe("Modal", function() {
    let window = null;
    let jQuery = null;
    let overlay = null;
    let profileSelect = null;
    let fontSizeRange = null;
    let fontSizeInput = null;
    let printed = null;

    // applies the given font size to both the slider and the number
    // input, the same way the viewport does when a profile default,
    // an inspiration or a shared link sets the size of the text
    const resize = function(value) {
        fontSizeRange.val(value);
        fontSizeInput.val(value);
    };

    // simulates the operator confirming the engraving on the modal,
    // resolving with the data of the job once it is posted to the
    // engrave node of colony print
    const engrave = function() {
        return new Promise(resolve => {
            printed = resolve;
            overlay.find(".button-modal-engrave").click();
        });
    };

    beforeEach(function() {
        const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
            url: "http://localhost/viewport",
            runScripts: "outside-only"
        });
        window = dom.window;
        jQuery = require("jquery")(window);

        // hands the data of the job posted to the engrave node over to
        // the pending engrave and fails every other request, as there is
        // no server behind the document, leaving the job with no extra
        // fonts attached
        window.fetch = function(url, options) {
            if (url === PRINT_URL + "/nodes/" + PRINT_NODE + "/print") {
                printed(JSON.parse(options.body.get("data")));
                return Promise.resolve({ status: 200, json: () => Promise.resolve({}) });
            }
            return Promise.resolve({ status: 404 });
        };

        const context = dom.getInternalVMContext();
        for (const script of SCRIPTS) {
            const filePath = path.join(STATIC_PATH, script);
            const code = fs.readFileSync(filePath, "utf8");
            new vm.Script(code, { filename: filePath }).runInContext(context);
        }

        // mounts the viewport controls read by the engraving job, with the
        // same class names as the viewport view, with the small medal
        // selected and its font size slider bounds and step in place
        const body = jQuery("body");
        const buttonPrint = jQuery('<a class="button button-print"></a>').appendTo(body);
        buttonPrint.attr("data-text", "11.07.26");
        buttonPrint.attr("data-font", "Helvetica");
        buttonPrint.attr("data-url", PRINT_URL);
        buttonPrint.attr("data-node", PRINT_NODE);
        profileSelect = jQuery('<select class="profile-select"></select>').appendTo(body);
        profileSelect.append('<option value="">None</option>');
        profileSelect.append('<option value="small-medal">Small Medal</option>');
        profileSelect.val("small-medal");
        body.append('<input class="font-size-range" type="range" min="0.5" max="8" step="0.25" />');
        body.append('<input class="font-size-input" type="hidden" />');
        for (const side of ["left", "right", "top", "bottom"]) {
            const margin = jQuery('<input class="margin-input" type="number" value="2.94" />');
            margin.addClass("margin-" + side).appendTo(body);
        }
        overlay = jQuery('<div class="modal-overlay modal-overlay-confirm"></div>').appendTo(body);
        overlay.append('<input class="modal-dry-run" type="checkbox" />');
        overlay.append('<input class="modal-record" type="checkbox" />');
        overlay.append('<input class="modal-check-path" type="checkbox" />');
        overlay.append('<span class="button button-modal-engrave">Engrave</span>');
        overlay.data("profiles", PROFILES);
        overlay.modal();
        fontSizeRange = jQuery(".font-size-range");
        fontSizeInput = jQuery(".font-size-input");
        resize(3);
    });

    afterEach(function() {
        window.close();
    });

    describe("#buttonEngrave()", function() {
        it("should send a fractional font size as is", async () => {
            resize(2.75);
            const data = await engrave();
            assert.strictEqual(data.font_size, 2.75);
        });

        it("should send a font size below one unit as is", async () => {
            resize(0.75);
            const data = await engrave();
            assert.strictEqual(data.font_size, 0.75);
        });

        it("should send a whole font size as a number", async () => {
            resize(3);
            const data = await engrave();
            assert.strictEqual(data.font_size, 3);
        });

        it("should send the previewed size when the slider clamps it to its bounds", async () => {
            resize(10);
            assert.strictEqual(fontSizeRange.val(), "8");
            const data = await engrave();
            assert.strictEqual(data.font_size, 10);
        });

        it("should send a null font size when the input holds no number", async () => {
            resize("");
            const data = await engrave();
            assert.strictEqual(data.font_size, null);
        });

        it("should leave the font size out when no profile is selected", async () => {
            profileSelect.val("");
            resize(2.75);
            const data = await engrave();
            assert.strictEqual("font_size" in data, false);
        });
    });
});
