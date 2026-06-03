(function(jQuery) {
    /**
     * Modal overlay plugin that manages multiple modal types
     * including error messages, print confirmation with specs
     * preview, printer configuration, and instructions display.
     *
     * Operates on a .modal-overlay element and discovers its
     * children (.modal, .modal-message, .modal-specs, etc.)
     * by class name convention.
     *
     * Actions:
     *   "show"    - displays the modal with an optional message
     *   "hide"    - dismisses the modal with a fade-out animation
     *   "confirm" - builds and shows the print confirmation modal
     *               with the given specs object and viewport preview
     *
     * Events:
     *   "show" - triggered after the modal becomes visible so
     *            downstream plugins can reset transient state (for
     *            example clearing a previous form submission) every
     *            time the overlay is opened
     */
    jQuery.fn.modal = function(action, message) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const modalMessage = jQuery(".modal-message", context);
            const modalPreview = jQuery(".modal-preview", context);
            const modalSpecs = jQuery(".modal-specs", context);
            const buttonClose = jQuery(".button-modal-close", context);
            const buttonEngrave = jQuery(".button-modal-engrave", context);

            if (action === "show") {
                if (message !== undefined) modalMessage.text(message);
                context.addClass("visible");
                context.triggerHandler("show");
                return;
            }

            if (action === "hide") {
                if (!context.hasClass("visible")) return;
                context.find("input, textarea").blur();
                context.addClass("dismissing");
                context.one("transitionend", function() {
                    context.removeClass("visible dismissing");
                });
                return;
            }

            // renders the printing specs in the confirmation modal
            // and shows it for the user to review before engraving;
            // the field labels are read from data attributes on the
            // overlay so each locale template owns its own copy
            if (action === "confirm") {
                const specs = message;
                const labels = {
                    text: context.attr("data-label-text") || "Text",
                    font: context.attr("data-label-font") || "Font",
                    profile: context.attr("data-label-profile") || "Profile",
                    viewport: context.attr("data-label-viewport") || "Surface",
                    fontSize: context.attr("data-label-font-size") || "Font size",
                    margins: context.attr("data-label-margins") || "Margins",
                    extraPadding: context.attr("data-label-extra-padding") || "Extra padding",
                    finalViewport: context.attr("data-label-final-viewport") || "Final surface",
                    node: context.attr("data-label-node") || "Node",
                    jig: context.attr("data-label-jig") || "Jig",
                    newline: context.attr("data-label-newline") || "↵",
                    empty: context.attr("data-label-empty") || "No text yet.",
                    ready: context.attr("data-label-ready") || "Ready to engrave on"
                };

                // detects the empty text state so the modal can both
                // disable the primary action and surface a friendly
                // hint instead of the raw "(empty)" placeholder
                const hasMultifont = specs.multifont && specs.multifont.length > 0;
                const hasText = hasMultifont || (specs.text && specs.text !== "(empty)");

                const buildRow = function(label, value) {
                    return (
                        '<div class="modal-spec">' +
                        '<span class="modal-spec-label">' +
                        jQuery("<span>").text(label).html() +
                        "</span>" +
                        '<span class="modal-spec-value">' +
                        value +
                        "</span>" +
                        "</div>"
                    );
                };

                let html = "";
                if (hasMultifont) {
                    let textHtml = "";
                    for (let index = 0; index < specs.multifont.length; index++) {
                        const entry = specs.multifont[index];
                        const font = entry[0];
                        const value = entry[1];
                        if (value === "\n") {
                            textHtml +=
                                '<span class="modal-spec-segment modal-spec-newline">' +
                                jQuery("<span>").text(labels.newline).html() +
                                "</span>";
                            continue;
                        }
                        const escaped = jQuery("<span>").text(value).html().replace(/ /g, "␣");
                        const fontEscaped = jQuery("<span>").text(font).html();
                        textHtml +=
                            '<span class="modal-spec-segment">' +
                            '<span class="modal-spec-text">' +
                            escaped +
                            "</span>" +
                            '<span class="modal-spec-font">' +
                            fontEscaped +
                            "</span>" +
                            "</span>";
                    }
                    html += buildRow(labels.text, textHtml);
                } else if (specs.text) {
                    html += buildRow(labels.text, jQuery("<span>").text(specs.text).html());
                }
                if (specs.font) {
                    html += buildRow(labels.font, jQuery("<span>").text(specs.font).html());
                }
                if (specs.profile) {
                    html += buildRow(labels.profile, jQuery("<span>").text(specs.profile).html());
                }
                if (specs.viewport) {
                    html += buildRow(labels.viewport, jQuery("<span>").text(specs.viewport).html());
                }
                if (specs.font_size) {
                    html += buildRow(
                        labels.fontSize,
                        jQuery("<span>").text(specs.font_size).html()
                    );
                }
                if (specs.margins) {
                    html += buildRow(labels.margins, jQuery("<span>").text(specs.margins).html());
                }
                if (specs.extra_padding) {
                    html += buildRow(
                        labels.extraPadding,
                        jQuery("<span>").text(specs.extra_padding).html()
                    );
                }
                if (specs.final_viewport) {
                    html += buildRow(
                        labels.finalViewport,
                        jQuery("<span>").text(specs.final_viewport).html()
                    );
                }
                if (specs.node) {
                    html += buildRow(labels.node, jQuery("<span>").text(specs.node).html());
                }
                if (specs.instructions) {
                    html += buildRow(labels.jig, jQuery("<span>").text(specs.instructions).html());
                }
                modalSpecs.html(html);

                // fills the subtitle with a friendly status line that
                // names the destination profile when the engraving is
                // ready to go, falling back to a blank string otherwise
                const subtitle = jQuery(".modal-subtitle", context);
                if (hasText && specs.profile) {
                    subtitle.text(labels.ready + " " + specs.profile);
                    subtitle.addClass("visible");
                } else {
                    subtitle.text("");
                    subtitle.removeClass("visible");
                }

                // toggles the empty hint and the disabled state on the
                // primary action so the operator cannot send a blank
                // engraving by mistake, restoring both when text exists
                const emptyHint = jQuery(".modal-empty-hint", context);
                const engraveButton = jQuery(".button-modal-engrave", context);
                if (hasText) {
                    emptyHint.text("").removeClass("visible");
                    engraveButton.removeClass("disabled");
                } else {
                    emptyHint.text(labels.empty).addClass("visible");
                    engraveButton.addClass("disabled");
                }

                // clones the viewport preview into the modal so that the
                // user can visually confirm the engraving layout
                modalPreview.empty();
                const viewportPreview = jQuery(".viewport > .main-container > .viewport-preview");
                if (viewportPreview.hasClass("profile-active")) {
                    const clone = viewportPreview.clone();
                    clone.find(".crosshair").remove();
                    clone.find(".ruler").remove();
                    clone.find(".caret").remove();
                    clone.removeClass("crosshair-active");
                    clone.css({
                        transform: "none",
                        "-o-transform": "none",
                        "-ms-transform": "none",
                        "-moz-transform": "none",
                        "-khtml-transform": "none",
                        "-webkit-transform": "none",
                        "margin-bottom": "",
                        "margin-right": "",
                        zoom: 1
                    });
                    modalPreview.append(clone);
                }

                context.addClass("visible");
                return;
            }

            // dismisses the modal with a faster fade-out transition
            // removing the visible and dismissing classes after completion
            const dismissModal = function(callback) {
                if (!context.hasClass("visible")) return;
                context.find("input, textarea").blur();
                context.addClass("dismissing");
                context.one("transitionend", function() {
                    context.removeClass("visible dismissing");
                    if (callback) callback();
                });
            };

            buttonClose.click(function() {
                dismissModal();
            });

            // registers for the click operation on the overlay
            // background to dismiss the modal when clicking outside
            context.click(function(event) {
                if (event.target !== context.get(0)) return;
                dismissModal();
            });

            // registers for the escape key press to dismiss
            // the modal when it is currently visible
            jQuery(document).bind("keydown", function(event) {
                if (event.key !== "Escape") return;
                if (!context.hasClass("visible")) return;
                dismissModal();
            });

            // registers for the click operation on the engrave button
            // that performs the actual print submission via colony print
            buttonEngrave.click(async function() {
                if (jQuery(this).hasClass("disabled")) return;
                context.removeClass("visible");

                const buttonPrint = jQuery(".button-print");
                const text = buttonPrint.attr("data-text");
                const font = buttonPrint.attr("data-font");
                const multifont = buttonPrint.data("multifont");

                // resolves the colony print configuration falling back from
                // the engrave specific localStorage keys to the legacy
                // unprefixed ones and finally to the data attribute rendered
                // by the server side configuration so existing installs
                // keep working without any reconfiguration
                const printUrl =
                    localStorage.getItem("url") || buttonPrint.attr("data-url") || null;
                const node =
                    localStorage.getItem("engrave_node") ||
                    localStorage.getItem("node") ||
                    buttonPrint.attr("data-node") ||
                    null;
                const key = localStorage.getItem("key") || buttonPrint.attr("data-key") || null;
                const fontSizeRange = jQuery(".font-size-range");
                const profileSelect = jQuery(".profile-select");
                const profileKey = profileSelect.val();

                // builds the data payload for the print operation, including
                // the viewport information from the selected profile if available
                const dryRun = jQuery(".modal-dry-run", context).prop("checked");
                const record = jQuery(".modal-record", context).prop("checked");
                const textPayload = multifont && multifont.length > 0 ? multifont : text;
                const fontPayload = font === "Cool Emojis" ? null : font;
                const printData = {
                    text: textPayload,
                    font: fontPayload,
                    debug: true,
                    dry_run: dryRun,
                    record: record
                };
                if (profileKey) {
                    const profiles = context.data("profiles") || {};
                    const profile = profiles[profileKey];
                    if (profile) {
                        const machine = profile.machine || {};
                        const extraPadding = profile.extra_padding || {};
                        printData.width =
                            (machine.viewport_width || profile.width) +
                            (extraPadding.left || 0) +
                            (extraPadding.right || 0);
                        printData.height =
                            (machine.viewport_height || profile.height) +
                            (extraPadding.top || 0) +
                            (extraPadding.bottom || 0);
                        printData.font_size = parseInt(fontSizeRange.val());
                        const ml =
                            (parseFloat(jQuery(".margin-left").val()) || 0) +
                            (extraPadding.left || 0);
                        const mr =
                            (parseFloat(jQuery(".margin-right").val()) || 0) +
                            (extraPadding.right || 0);
                        const mt =
                            (parseFloat(jQuery(".margin-top").val()) || 0) +
                            (extraPadding.top || 0);
                        const mb =
                            (parseFloat(jQuery(".margin-bottom").val()) || 0) +
                            (extraPadding.bottom || 0);
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
                        // surfaces the post engraving feedback modal so the
                        // user can rate the experience, falling back silently
                        // when the feedback feature is disabled and the
                        // overlay has not been rendered into the page
                        const feedbackOverlay = jQuery(".modal-overlay-feedback");
                        if (feedbackOverlay.length > 0) feedbackOverlay.modal("show");
                    }
                } catch (err) {
                    const errorOverlay = jQuery(".modal-overlay-error");
                    errorOverlay.modal("show", String(err));
                }
            });
        });

        return this;
    };
})(jQuery);
