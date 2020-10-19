const jQuery = window.jQuery ? window.jQuery : null;

/**
 * Gathers the series of UI and canvas options according to
 * the requested theme.
 *
 * @param {String} theme The name of the theme to retrieve the target
 * options, that change thickness and global UI.
 * @returns {Object} An object with the setting for the current theme.
 */
const getOptions = function(theme) {
    switch (theme) {
        case "ldj":
            return {
                width: "100%",
                height: "100%",
                lineWidth: 1,
                UndoButton: true
            };
        default:
            return {
                width: "100%",
                height: "100%",
                lineWidth: 4,
                UndoButton: true
            };
    }
};

const drawText = function(ctx) {
    ctx.font = "30px Arial";
    ctx.fillText("Hello World", 10, 500);
};

const serializeText = function(text) {
    const buffer = [];
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        buffer.push(item[0] + ":" + item[1]);
    }
    return buffer.join("-");
};

jQuery(document).ready(function() {
    // runs a series of selections over the current viewport
    const body = jQuery("body");
    const form = jQuery(".form");
    const formInput = jQuery(".form > input");
    const buttonClear = jQuery(".button-clear");
    const buttonReport = jQuery(".button-report");
    const buttonReceipt = jQuery(".button-receipt");
    const buttonDownload = jQuery(".button-download");
    const fontsContainer = jQuery(".fonts-container");
    const keyboardContainer = jQuery(".keyboard-container");
    const emojisContainer = jQuery(".emojis-container");
    const viewportContainer = jQuery(".viewer-container");
    const formConsole = jQuery(".form-console");
    const inputViewport = jQuery(".input-viewport");
    const signature = jQuery(".signature");

    // gathers the currently selected theme information
    // to be used to change the current visual style
    const theme = body.attr("data-theme") || "default";

    // registers for the click operation on the clear button
    // that sends the "reset" event to the jsignature
    buttonClear.click(function() {
        signature.jSignature("reset");
    });

    // registers for the download button click operation so that
    // we obtain the SVG version and submit the current form with it
    // effectively converting the data into HPGL
    buttonDownload.click(function() {
        const svgBase64 = signature.jSignature("getData", "svgbase64");
        formInput.attr("value", svgBase64[1]);
        form.submit();
    });

    // registers for the click event on the button receipt
    // to run the remove logic of receipt printing using
    // the colony (cloud) print service
    buttonReceipt.click(async function() {
        // gathers the reference to the current element in
        // pressing and then references some of its data
        // elements for operation configuration
        const element = jQuery(this);
        const printUrl =
            localStorage.getItem("url") ||
            element.attr("data-url") ||
            "https://colony-print.stage.hive.pt";
        const node = localStorage.getItem("node") || element.attr("data-node") || "default";
        const printer =
            localStorage.getItem("printer") || element.attr("data-printer") || "printer";
        const key = localStorage.getItem("key") || element.attr("data-key") || null;
        const locale = localStorage.getItem("locale") || element.attr("data-locale") || null;

        // builds the GET parameters that are going to be "sent"
        // to the receipt printing operation
        const receiptParams = new URLSearchParams();
        if (locale) receiptParams.append("locale", locale);

        // retrieves the XML based template of the receipt that
        // is going to be used in the printing operation
        const receiptResponse = await fetch(`/receipt?${receiptParams.toString()}`);
        const receiptXml = await receiptResponse.text();

        // converts the XML template into a "compiled" binary format (binie)
        // that can be used by colony cloud print
        const binieResponse = await fetch(`${printUrl}/documents.binie?base64=1`, {
            method: "POST",
            body: receiptXml
        });
        const receiptBinie = await binieResponse.text();

        // builds the parameters that are going to be used for the concrete
        // printing operation and runs the print with the properly configured
        // colony cloud print configuration
        await fetch(`${printUrl}/nodes/${node}/printers/print`, {
            method: "POST",
            body: new URLSearchParams([
                ["printer", printer],
                ["data_b64", receiptBinie]
            ]),
            headers: { "X-Secret-Key": key }
        });
    });

    // starts the jsignature "inside" the signature area
    // allowing proper interactive operations to be performed
    signature.jSignature(getOptions(theme));

    // registers for any change in the signature so that the
    // button clear visibility may be controlled
    signature.bind("change", function() {
        const data = signature.jSignature("getData", "base30");
        const hasData = Boolean(data[1]);
        if (hasData) {
            buttonClear.css("display", "inline-block");
        } else {
            buttonClear.css("display", "none");
        }
    });

    // gathers the canvas from the current viewport and then
    // runs the drawing of the text in it
    const canvas = document.getElementsByClassName("jSignature")[0];
    if (canvas) {
        const ctx = canvas.getContext("2d");
        drawText(ctx);
    }

    // registers the fonts container and then binds the font changed
    // event to the operation of switching keyboard and updating global
    // body information on the selected font
    fontsContainer.fontscontainer();
    fontsContainer.bind("font", function(event, font) {
        if (font === "Cool Emojis") {
            keyboardContainer.hide();
            emojisContainer.show();
        } else {
            emojisContainer.hide();
            keyboardContainer.show();
        }
        keyboardContainer.css("font-family", '"' + font + '"');
        inputViewport.css("font-family", '"' + font + '"');
        body.data("font", font);
    });

    // creates the key handler function responsible for
    // the update of the current text value, both from
    // a visual and logic point of view
    const keyHandler = function(event, font, value) {
        const caret = jQuery("> .caret", viewportContainer);
        const buttonHref = buttonReport.attr("data-href");
        const text = body.data("text") || [];
        let caretPosition =
            body.data("caret_position") === undefined ? -1 : body.data("caret_position");
        let element = null;
        if (value === "⌫") {
            caret.prev().remove();
            text.splice(caretPosition, 1);
            caretPosition--;
            caretPosition = Math.max(caretPosition, -1);
        } else if (value === "⎵") {
            element = jQuery("<span style=\"font-family: '" + font + "';\">&nbsp;</span>");
            caret.before(element);
            element.click(function() {
                const element = jQuery(this);
                element.after(caret);
                caretPosition = element.index(".viewer-container > span:not(.caret)");
                body.data("caret_position", caretPosition);
            });
            text.splice(caretPosition + 1, 0, [font, " "]);
            caretPosition++;
        } else {
            element = jQuery("<span style=\"font-family: '" + font + "';\">" + value + "</span>");
            caret.before(element);
            element.click(function() {
                const element = jQuery(this);
                element.after(caret);
                caretPosition = element.index(".viewer-container > span:not(.caret)");
                body.data("caret_position", caretPosition);
            });
            text.splice(caretPosition + 1, 0, [font, value]);
            caretPosition++;
        }
        body.data("text", text);
        body.data("caret_position", caretPosition);
        buttonReport.attr("href", buttonHref + "?text=" + serializeText(text));
    };

    keyboardContainer.keyboardcontainer();
    emojisContainer.keyboardcontainer();

    keyboardContainer.bind("key", keyHandler);
    emojisContainer.bind("key", keyHandler);

    formConsole.formconsole();
});

(function(jQuery) {
    jQuery.fn.fontscontainer = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const fonts = jQuery(".font", context);

            fonts.click(function() {
                const _element = jQuery(this);
                fonts.removeClass("selected");
                _element.addClass("selected");
                context.triggerHandler("font", [_element.attr("data-font")]);
            });
        });

        return this;
    };
})(jQuery);

(function(jQuery) {
    jQuery.fn.keyboardcontainer = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const body = jQuery("body");
            const keys = jQuery("> .char", context);

            keys.click(function() {
                const element = jQuery(this);
                let value = element.text();
                const casing = context.data("casing") || "uppercase";
                value = casing === "lowercase" ? value.toLowerCase() : value;
                if (value === "⇧") {
                    toggleCasing(context);
                } else {
                    const font = body.data("font");
                    context.triggerHandler("key", [font, value]);
                }
            });
        });

        /**
         * Toggle the casing of the keyboard.
         *
         * @param {Element} context The context that is going to be used
         * for the toggling.
         */
        const toggleCasing = function(context) {
            const casing = context.data("casing") || "uppercase";
            if (casing === "uppercase") {
                context.data("casing", "lowercase");
                context.addClass("lowercase");
            } else {
                context.data("casing", "uppercase");
                context.removeClass("lowercase");
            }
        };

        return this;
    };
})(jQuery);

(function(jQuery) {
    jQuery.fn.formconsole = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const button = jQuery(".button", context);
            const command = jQuery(".input[name=command]", context);

            button.click(function() {
                const commandValue = command.val();
                try {
                    // eslint-disable-next-line no-eval
                    const result = eval(commandValue);
                    if (result) alert(result);
                    else alert("executed");
                } catch (err) {
                    alert(err);
                }
                command.val("");
            });
        });

        return this;
    };
})(jQuery);
