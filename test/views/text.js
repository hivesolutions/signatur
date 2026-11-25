const assert = require("assert");
const path = require("path");
const ejs = require("ejs");

describe("Text", function() {
    const viewPath = path.resolve(__dirname, "..", "..", "views", "text.ejs");

    describe("#render()", function() {
        it("should render each character in its font", async () => {
            const html = await ejs.renderFile(viewPath, { text: [["arial", "a"]] });
            assert.ok(html.includes('<span class="item" style="font-family: \'arial\'">a</span>'));
        });

        it("should render a space as a non breaking space", async () => {
            const html = await ejs.renderFile(viewPath, { text: [["arial", " "]] });
            assert.ok(html.includes(">&nbsp;</span>"));
        });

        it("should escape the characters so they can not inject markup", async () => {
            const html = await ejs.renderFile(viewPath, {
                text: [["arial", "<img src=x onerror=alert(1)>"]]
            });
            assert.ok(!html.includes("<img"));
            assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
        });
    });
});
