var jQuery = window.jQuery ? window.jQuery : null;

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

jQuery(document).ready(function() {
    var body = jQuery("body");
    var form = jQuery(".form");
    var formInput = jQuery(".form > input");
    var buttonClear = jQuery(".button-clear");
    var buttonDownload = jQuery(".button-download");
    var signature = jQuery(".signature");
    var theme = body.attr("data-theme") || "default";
    buttonClear.click(function() {
        signature.jSignature("reset");
    });
    buttonDownload.click(function() {
        var svgBase64 = signature.jSignature("getData", "svgbase64");
        formInput.attr("value", svgBase64[1]);
        form.submit();
    });
    signature.jSignature(getOptions(theme));
    signature.bind("change", function() {
        var data = signature.jSignature("getData", "base30");
        var hasData = Boolean(data[1]);
        if (hasData) {
            buttonClear.show();
        } else {
            buttonClear.hide();
        }
    });
});
