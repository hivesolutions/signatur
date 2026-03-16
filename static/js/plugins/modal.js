(function(jQuery) {
    jQuery.fn.modal = function(action, message) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const modalMessage = jQuery(".modal-message", context);
            const modalSpecs = jQuery(".modal-specs", context);
            const buttonClose = jQuery(".button-modal-close", context);
            const buttonConfigure = jQuery(".button-modal-configure", context);
            const buttonEngrave = jQuery(".button-modal-engrave", context);
            const buttonSave = jQuery(".button-modal-save", context);

            if (action === "show") {
                modalMessage.text(message);
                context.addClass("visible");
                return;
            }

            // renders the printing specs in the confirmation modal
            // and shows it for the user to review before engraving
            if (action === "confirm") {
                const specs = message;
                let html = "";
                if (specs.multifont && specs.multifont.length > 0) {
                    html += '<div class="modal-spec"><strong>Text:</strong></div>';
                    for (let index = 0; index < specs.multifont.length; index++) {
                        const entry = specs.multifont[index];
                        const font = entry[0];
                        const value = entry[1];
                        if (value === "\n") {
                            html += '<div class="modal-spec modal-spec-segment">&crarr;</div>';
                            continue;
                        }
                        const escaped = jQuery("<span>").text(value).html().replace(/ /g, "&nbsp;");
                        const fontEscaped = jQuery("<span>").text(font).html();
                        html +=
                            '<div class="modal-spec modal-spec-segment">' +
                            '<span class="modal-spec-text">' +
                            escaped +
                            "</span>" +
                            ' <span class="modal-spec-font">(' +
                            fontEscaped +
                            ")</span>" +
                            "</div>";
                    }
                } else {
                    if (specs.text) {
                        html +=
                            '<div class="modal-spec"><strong>Text:</strong> ' +
                            jQuery("<span>").text(specs.text).html() +
                            "</div>";
                    }
                }
                if (specs.font) {
                    html +=
                        '<div class="modal-spec"><strong>Font:</strong> ' +
                        jQuery("<span>").text(specs.font).html() +
                        "</div>";
                }
                if (specs.profile) {
                    html +=
                        '<div class="modal-spec"><strong>Profile:</strong> ' +
                        jQuery("<span>").text(specs.profile).html() +
                        "</div>";
                }
                if (specs.viewport) {
                    html +=
                        '<div class="modal-spec"><strong>Viewport:</strong> ' +
                        jQuery("<span>").text(specs.viewport).html() +
                        "</div>";
                }
                if (specs.font_size) {
                    html +=
                        '<div class="modal-spec"><strong>Font size:</strong> ' +
                        jQuery("<span>").text(specs.font_size).html() +
                        "</div>";
                }
                if (specs.margins) {
                    html +=
                        '<div class="modal-spec"><strong>Margins:</strong> ' +
                        jQuery("<span>").text(specs.margins).html() +
                        "</div>";
                }
                if (specs.node) {
                    html +=
                        '<div class="modal-spec"><strong>Node:</strong> ' +
                        jQuery("<span>").text(specs.node).html() +
                        "</div>";
                }
                modalSpecs.html(html);
                context.addClass("visible");
                return;
            }

            buttonClose.click(function() {
                context.removeClass("visible");
            });

            // registers for the click operation on the configure button
            // that opens the printer configuration modal
            buttonConfigure.click(function() {
                context.removeClass("visible");
                const configOverlay = jQuery(".modal-overlay-config");
                configOverlay.modal("show");
            });

            // registers for the click operation on the engrave button
            // that performs the actual print submission via colony print
            buttonEngrave.click(async function() {
                context.removeClass("visible");

                const buttonPrint = jQuery(".button-print");
                const text = buttonPrint.attr("data-text");
                const font = buttonPrint.attr("data-font");
                const multifont = buttonPrint.data("multifont");
                const printUrl = localStorage.getItem("url");
                const node = localStorage.getItem("node");
                const key = localStorage.getItem("key") || null;
                const fontSizeRange = jQuery(".font-size-range");
                const profileSelect = jQuery(".profile-select");
                const profileKey = profileSelect.val();

                // builds the data payload for the print operation, including
                // the viewport information from the selected profile if available
                const dryRun = jQuery(".modal-dry-run", context).prop("checked");
                const textPayload = multifont && multifont.length > 0 ? multifont : text;
                const fontPayload = font === "Cool Emojis" ? null : font;
                const printData = {
                    text: textPayload,
                    font: fontPayload,
                    debug: true,
                    dry_run: dryRun
                };
                if (profileKey) {
                    const profiles = context.data("profiles") || {};
                    const profile = profiles[profileKey];
                    if (profile) {
                        const machine = profile.machine || {};
                        printData.width = machine.viewport_width || profile.width;
                        printData.height = machine.viewport_height || profile.height;
                        printData.font_size = parseInt(fontSizeRange.val());
                        const ml = parseFloat(jQuery(".margin-left").val()) || 0;
                        const mr = parseFloat(jQuery(".margin-right").val()) || 0;
                        const mt = parseFloat(jQuery(".margin-top").val()) || 0;
                        const mb = parseFloat(jQuery(".margin-bottom").val()) || 0;
                        printData.margins = [ml, mr, mt, mb];
                    }
                }

                // builds the parameters that are going to be used for the concrete
                // printing operation and runs the print with the properly configured
                // colony cloud print configuration
                try {
                    const printResponse = await fetch(`${printUrl}/nodes/${node}/print`, {
                        method: "POST",
                        body: new URLSearchParams([
                            ["type", "gravo"],
                            ["data", JSON.stringify(printData)]
                        ]),
                        headers: { "X-Secret-Key": key }
                    });
                    if (printResponse.status !== 200) {
                        const error = await printResponse.json();
                        const errorMessage = error.message || error.error || "unset";
                        const errorOverlay = jQuery(".modal-overlay-error");
                        errorOverlay.modal(
                            "show",
                            "Error while running the final print operation: " + errorMessage
                        );
                    } else {
                        jQuery(".toast").toast("show", "Engraving job submitted successfully.");
                    }
                } catch (err) {
                    const errorOverlay = jQuery(".modal-overlay-error");
                    errorOverlay.modal("show", String(err));
                }
            });

            // registers for the click operation on the save button
            // that persists the printer configuration to localStorage
            buttonSave.click(function() {
                const url = jQuery(".input[name=url]", context).val();
                const node = jQuery(".input[name=node]", context).val();
                const printer = jQuery(".input[name=printer]", context).val();
                const key = jQuery(".input[name=key]", context).val();
                if (url) localStorage.setItem("url", url);
                if (node) localStorage.setItem("node", node);
                if (printer) localStorage.setItem("printer", printer);
                if (key) localStorage.setItem("key", key);
                context.removeClass("visible");
            });

            // populates the configuration fields with the current
            // values stored in localStorage (if any)
            jQuery(".input[name=url]", context).val(localStorage.getItem("url") || "");
            jQuery(".input[name=node]", context).val(localStorage.getItem("node") || "");
            jQuery(".input[name=printer]", context).val(localStorage.getItem("printer") || "");
            jQuery(".input[name=key]", context).val(localStorage.getItem("key") || "");
        });

        return this;
    };
})(jQuery);
