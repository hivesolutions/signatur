var jQuery = window.jQuery ? window.jQuery : null;

/**
 * Gathers the series of UI and canvas options according to
 * the requested theme.
 *
 * @param {String} theme The name of the theme to retrieve the target
 * options, that change thickness and global UI.
 * @returns {Object} An object with the setting for the current theme.
 */
var getOptions = function(theme) {
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

var drawText = function(ctx) {
    ctx.font = "30px Arial";
    ctx.fillText("Hello World", 10, 500);
};

var serializeText = function(text) {
    var buffer = [];
    for (var index = 0; index < text.length; index++) {
        var item = text[index];
        buffer.push(item[0] + ":" + item[1]);
    }
    return buffer.join("-");
};

jQuery(document).ready(function() {
    // runs a series of selections over the current viewport
    var body = jQuery("body");
    var form = jQuery(".form");
    var formInput = jQuery(".form > input");
    var buttonClear = jQuery(".button-clear");
    var buttonReport = jQuery(".button-report");
    var buttonDownload = jQuery(".button-download");
    var fontsContainer = jQuery(".fonts-container");
    var keyboardContainer = jQuery(".keyboard-container");
    var emojisContainer = jQuery(".emojis-container");
    var viewportContainer = jQuery(".viewer-container");
    var inputViewport = jQuery(".input-viewport");
    var signature = jQuery(".signature");

    // gathers the currently selected theme information
    // to be used to change the current visual style
    var theme = body.attr("data-theme") || "default";

    // registers for the click operation on the clear button
    // that sends the "reset" event to the jsignature
    buttonClear.click(function() {
        signature.jSignature("reset");
    });

    // registers for the download button click operation so that
    // we obtain the SVG version and submit the current form with it
    // effectively converting the data into HPGL
    buttonDownload.click(function() {
        var svgBase64 = signature.jSignature("getData", "svgbase64");
        formInput.attr("value", svgBase64[1]);
        form.submit();
    });

    // starts the jsignature "inside" the signature area
    // allowing proper interactive operations to be performed
    signature.jSignature(getOptions(theme));

    // registers for any change in the signature so that the
    // button clear visibility may be controlled
    signature.bind("change", function() {
        var data = signature.jSignature("getData", "base30");
        var hasData = Boolean(data[1]);
        if (hasData) {
            buttonClear.css("display", "inline-block");
        } else {
            buttonClear.css("display", "none");
        }
    });

    // gathers the canvas from the current viewport and then
    // runs the drawing of the text in it
    var canvas = document.getElementsByClassName("jSignature")[0];
    if (canvas) {
        var ctx = canvas.getContext("2d");
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
    var keyHandler = function(event, font, value) {
        var caret = jQuery("> .caret", viewportContainer);
        var buttonHref = buttonReport.attr("data-href");
        var text = body.data("text") || [];
        if (value === "⌫") {
            caret.prev().remove();
            text.pop();
        } else if (value === "⎵") {
            caret.before("<span style=\"font-family: '" + font + "';\">&nbsp;</span>");
            text.push([font, " "]);
        } else {
            caret.before("<span style=\"font-family: '" + font + "';\">" + value + "</span>");
            text.push([font, value]);
        }
        body.data("text", text);
        buttonReport.attr("href", buttonHref + "?text=" + serializeText(text));
    };

    keyboardContainer.keyboardcontainer();
    emojisContainer.keyboardcontainer();

    keyboardContainer.bind("key", keyHandler);
    emojisContainer.bind("key", keyHandler);
});

(function(jQuery) {
    jQuery.fn.fontscontainer = function() {
        var elements = jQuery(this);

        elements.each(function() {
            var context = jQuery(this);
            var fonts = jQuery(".font", context);

            fonts.click(function() {
                var _element = jQuery(this);
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
        var elements = jQuery(this);

        elements.each(function() {
            var context = jQuery(this);
            var body = jQuery("body");
            var keys = jQuery("> .char", context);

            keys.click(function() {
                var element = jQuery(this);
                var value = element.text();
                var casing = context.data("casing") || "uppercase";
                value = casing === "lowercase" ? value.toLowerCase() : value;
                if (value === "⇧") {
                    toggleCasing(context);
                } else {
                    var font = body.data("font");
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
        var toggleCasing = function(context) {
            var casing = context.data("casing") || "uppercase";
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
