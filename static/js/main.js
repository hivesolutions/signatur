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

jQuery(document).ready(function() {
    var body = jQuery("body");
    var form = jQuery(".form");
    var formInput = jQuery(".form > input");
    var buttonClear = jQuery(".button-clear");
    var buttonDownload = jQuery(".button-download");
    var signature = jQuery(".signature");
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
            buttonClear.show();
        } else {
            buttonClear.hide();
        }
    });

    // gathers the canvas from the current viewport and then
    // runs the drawing of the text in it
    var canvas = document.getElementsByClassName("jSignature")[0];
    var ctx = canvas.getContext("2d");
    drawText(ctx);
});
