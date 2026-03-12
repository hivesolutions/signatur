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

const serializeText = function(text, separator = "|") {
    const buffer = [];
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        buffer.push(item[0] + ":" + item[1]);
    }
    return buffer.join(separator);
};

const simplifyText = function(text, separator = "") {
    const buffer = [];
    let font = null;
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        font = item[0];
        buffer.push(item[1]);
    }
    return [buffer.join(separator), font];
};

(function(jQuery) {
    jQuery.fn.fontscontainer = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const fonts = jQuery(".font", context);

            fonts.click(function() {
                const _element = jQuery(this);
                if (_element.hasClass("selected")) {
                    _element.removeClass("selected");
                    context.triggerHandler("defont", [_element.attr("data-font")]);
                    return;
                }
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
                if (specs.text) html += "<div class=\"modal-spec\"><strong>Text:</strong> " + jQuery("<span>").text(specs.text).html() + "</div>";
                if (specs.font) html += "<div class=\"modal-spec\"><strong>Font:</strong> " + jQuery("<span>").text(specs.font).html() + "</div>";
                if (specs.profile) html += "<div class=\"modal-spec\"><strong>Profile:</strong> " + jQuery("<span>").text(specs.profile).html() + "</div>";
                if (specs.viewport) html += "<div class=\"modal-spec\"><strong>Viewport:</strong> " + jQuery("<span>").text(specs.viewport).html() + "</div>";
                if (specs.font_size) html += "<div class=\"modal-spec\"><strong>Font size:</strong> " + jQuery("<span>").text(specs.font_size).html() + "</div>";
                if (specs.node) html += "<div class=\"modal-spec\"><strong>Node:</strong> " + jQuery("<span>").text(specs.node).html() + "</div>";
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
                const printUrl = localStorage.getItem("url");
                const node = localStorage.getItem("node");
                const key = localStorage.getItem("key") || null;
                const fontSizeRange = jQuery(".font-size-range");
                const profileSelect = jQuery(".profile-select");
                const profileKey = profileSelect.val();

                // builds the data payload for the print operation, including
                // the viewport information from the selected profile if available
                const printData = { text: text, font: font, debug: true };
                if (profileKey) {
                    const profiles = context.data("profiles") || {};
                    const profile = profiles[profileKey];
                    if (profile) {
                        const machine = profile.machine || {};
                        printData.width = machine.viewport_width || profile.width;
                        printData.height = machine.viewport_height || profile.height;
                        printData.font_size = parseInt(fontSizeRange.val());
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

(function(jQuery) {
    jQuery.fn.toast = function(action, message) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);

            if (action === "show") {
                context.text(message);
                context.addClass("visible");
                setTimeout(function() {
                    context.removeClass("visible");
                }, 3000);
            }
        });

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

jQuery(document).ready(function() {
    // runs a series of selections over the current viewport
    const body = jQuery("body");
    const form = jQuery(".form");
    const formInput = jQuery(".form > input");
    const buttonClear = jQuery(".button-clear");
    const buttonPrint = jQuery(".button-print");
    const buttonReport = jQuery(".button-report");
    const buttonReceipt = jQuery(".button-receipt");
    const buttonDownload = jQuery(".button-download");
    const buttonConfigure = jQuery(".button-configure");
    const profileContainer = jQuery(".profile-container");
    const profileInfo = jQuery(".profile-info");
    const profileInfoName = jQuery(".profile-info-name");
    const profileInfoDimensions = jQuery(".profile-info-dimensions");
    const profileInfoOrientation = jQuery(".profile-info-orientation");
    const profileSelect = jQuery(".profile-select");
    const fontSizeContainer = jQuery(".font-size-container");
    const fontSizeRange = jQuery(".font-size-range");
    const fontSizeValue = jQuery(".font-size-value");
    const fontSizeMode = jQuery(".font-size-mode");
    const viewportPreview = jQuery(".viewport-preview");
    const viewportSvg = jQuery(".viewport-svg");
    const fontsContainer = jQuery(".fonts-container");
    const keyboardContainer = jQuery(".keyboard-container");
    const emojisContainer = jQuery(".emojis-container");
    const emojispContainer = jQuery(".emojisp-container");
    const viewportContainer = jQuery(".viewer-container");
    const formConsole = jQuery(".form-console");
    const inputViewport = jQuery(".input-viewport");
    const signature = jQuery(".signature");
    const modalOverlayError = jQuery(".modal-overlay-error");
    const modalOverlayConfirm = jQuery(".modal-overlay-confirm");
    const modalOverlayConfig = jQuery(".modal-overlay-config");
    const toast = jQuery(".toast");

    // gathers the values for the form related fields so that the
    // typical form validations and changes may be performed
    const technologyRadios = jQuery("input[name=technology]");
    const technologySelected = jQuery("input[name=technology]:checked");
    const elementsE = jQuery("[id=elements]");
    const locationE = jQuery("[id=location]");
    const elementsChild = jQuery("> *", elementsE);
    const locationChild = jQuery("> *", locationE);

    // gathers the currently selected theme information
    // to be used to change the current visual style
    const theme = body.attr("data-theme") || "default";

    // tries to retrieve the master configuration information
    // base 64 JSON dictionary and parses it
    const masterb64 = body.attr("data-master") || "";
    const master = JSON.parse(atob(masterb64) || "{}");

    // schedules a timeout for the initial selection of the
    // technology in case that's required (pre-selection of fields)
    setTimeout(() => {
        updateForm(technologySelected.val());
    });

    // registers for the change in selection in the technology
    // radio buttons so that the form may adapt
    technologyRadios.bind("change", function() {
        const value = this.value;
        updateForm(value);
    });

    // registers for the click operation on the clear button
    // that sends the "reset" event to the jsignature
    buttonClear.click(function() {
        signature.jSignature("reset");
    });

    // registers for the print/engrave button click operation
    // that opens the confirmation modal with the printing specs
    buttonPrint.click(function() {
        const element = jQuery(this);
        const text = element.attr("data-text");
        const font = element.attr("data-font");

        const printUrl = localStorage.getItem("url");
        const node = localStorage.getItem("node");

        // verifies that the printer is properly configured before
        // trying to run the print operation, showing a modal otherwise
        if (!printUrl || !node) {
            modalOverlayError.modal(
                "show",
                "No printer configured, please set the printer in the console."
            );
            return;
        }

        // builds the specs object that summarizes the current
        // printing configuration for user confirmation
        const specs = {
            text: text || "(empty)",
            font: font || "(none)",
            node: node
        };
        if (currentProfile) {
            const machine = currentProfile.machine || {};
            const width = machine.viewport_width || currentProfile.width;
            const height = machine.viewport_height || currentProfile.height;
            const unit = currentProfile.unit || "";
            specs.profile = currentProfile.name;
            specs.viewport = width + " x " + height + (unit ? " " + unit : "");
            specs.font_size = fontSizeRange.val() + (unit ? " " + unit : "");
        }

        modalOverlayConfirm.modal("confirm", specs);
    });

    // registers for the download button click operation so that
    // we obtain the SVG version and submit the current form with it
    // effectively converting the data into HPGL
    buttonDownload.click(function() {
        const svgBase64 = signature.jSignature("getData", "svgbase64");
        formInput.attr("value", svgBase64[1]);
        form.submit();
    });

    // registers for the click operation on the configure button
    // that opens the printer configuration modal from the gateway
    buttonConfigure.click(function() {
        modalOverlayConfig.modal("show");
    });

    // scale factor used to convert mm to pixels for the
    // viewport preview SVG rendering (pixels per mm)
    const VIEWPORT_SCALE = 3;

    // stores the currently selected profile and the loaded
    // profiles dictionary for later reference
    let currentProfile = null;
    let profiles = {};

    // fetches the available profiles from the server and
    // populates the profile dropdown with the results
    const loadProfiles = async function() {
        try {
            const response = await fetch("/profiles");
            if (response.status !== 200) return;
            profiles = await response.json();
            const keys = Object.keys(profiles);
            if (keys.length === 0) return;
            for (const key of keys) {
                const profile = profiles[key];
                const option = jQuery("<option></option>");
                option.attr("value", key);
                option.text(profile.name);
                profileSelect.append(option);
            }
            profileContainer.addClass("visible");
            modalOverlayConfirm.data("profiles", profiles);
        } catch (err) {
            // silently ignores profile loading errors
        }
    };

    // renders the viewport preview SVG based on the selected
    // profile definition including bounds and safe drawable area
    const renderViewportPreview = function(profile) {
        if (!profile) {
            viewportPreview.removeClass("profile-active");
            viewportContainer.css({
                position: "",
                left: "",
                top: "",
                width: "",
                height: "",
                margin: "",
                padding: "",
                border: "",
                "min-width": ""
            });
            return;
        }

        const width = profile.width * VIEWPORT_SCALE;
        const height = profile.height * VIEWPORT_SCALE;
        const showBounds = profile.preview ? profile.preview.show_bounds : false;
        const showSafeArea = profile.preview ? profile.preview.show_safe_area : false;
        const padding = profile.padding || { top: 0, right: 0, bottom: 0, left: 0 };

        const svg = viewportSvg.get(0);
        svg.setAttribute("width", width);
        svg.setAttribute("height", height);
        svg.setAttribute("viewBox", "0 0 " + width + " " + height);

        // clears existing SVG content before re-rendering
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }

        // renders the outer bounds rectangle
        if (showBounds) {
            const bounds = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            bounds.setAttribute("x", 0);
            bounds.setAttribute("y", 0);
            bounds.setAttribute("width", width);
            bounds.setAttribute("height", height);
            bounds.setAttribute("fill", "none");
            bounds.setAttribute("stroke", "#2d2d2d");
            bounds.setAttribute("stroke-width", 2);
            bounds.setAttribute("stroke-dasharray", "6 3");
            svg.appendChild(bounds);
        }

        // renders the safe drawable area defined by padding
        if (showSafeArea) {
            const safeX = padding.left * VIEWPORT_SCALE;
            const safeY = padding.top * VIEWPORT_SCALE;
            const safeW = width - (padding.left + padding.right) * VIEWPORT_SCALE;
            const safeH = height - (padding.top + padding.bottom) * VIEWPORT_SCALE;
            const safe = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            safe.setAttribute("x", safeX);
            safe.setAttribute("y", safeY);
            safe.setAttribute("width", safeW);
            safe.setAttribute("height", safeH);
            safe.setAttribute("fill", "rgba(45, 45, 45, 0.05)");
            safe.setAttribute("stroke", "#9d9d9d");
            safe.setAttribute("stroke-width", 1);
            safe.setAttribute("stroke-dasharray", "4 2");
            svg.appendChild(safe);
        }

        // positions the viewer container over the safe drawable
        // area so that text renders inside the viewport preview
        const safeX = padding.left * VIEWPORT_SCALE;
        const safeY = padding.top * VIEWPORT_SCALE;
        const safeW = width - (padding.left + padding.right) * VIEWPORT_SCALE;
        const safeH = height - (padding.top + padding.bottom) * VIEWPORT_SCALE;
        viewportContainer.css({
            position: "absolute",
            left: safeX + "px",
            top: safeY + "px",
            width: safeW + "px",
            height: safeH + "px",
            margin: "0px",
            padding: "0px",
            border: "none",
            "min-width": "0px"
        });

        viewportPreview.addClass("profile-active");
    };

    // updates the floating profile info block with the
    // currently selected profile summary information
    const updateProfileInfo = function(profile) {
        if (!profile) {
            profileInfo.removeClass("visible");
            return;
        }

        const unit = profile.unit || "";
        profileInfoName.text(profile.name);
        profileInfoDimensions.text(profile.width + " x " + profile.height + (unit ? " " + unit : ""));
        profileInfoOrientation.text(profile.orientation || "");
        profileInfo.addClass("visible");
    };

    // updates the font size controls based on the selected
    // profile configuration for manual or automatic mode
    const updateFontSizeControls = function(profile) {
        if (!profile || !profile.font_size) {
            fontSizeContainer.removeClass("visible");
            return;
        }

        const fs = profile.font_size;
        const isAutomatic = fs.mode === "automatic";

        fontSizeMode.prop("checked", isAutomatic);
        fontSizeRange.prop("disabled", isAutomatic);

        if (fs.min !== undefined) fontSizeRange.attr("min", fs.min);
        if (fs.max !== undefined) fontSizeRange.attr("max", fs.max);
        if (fs.step !== undefined) fontSizeRange.attr("step", fs.step);
        if (fs.default !== undefined) {
            fontSizeRange.val(fs.default);
            fontSizeValue.text(fs.default);
        }

        fontSizeContainer.addClass("visible");
    };

    // calculates the automatic font size to fit the current
    // text content within the safe drawable area of the profile
    const calculateAutoFontSize = function(profile) {
        if (!profile || !profile.font_size) return null;

        const fs = profile.font_size;
        const padding = profile.padding || { top: 0, right: 0, bottom: 0, left: 0 };
        const safeW = profile.width - padding.left - padding.right;
        const safeH = profile.height - padding.top - padding.bottom;

        const text = body.data("text") || [];
        const [textSimple] = simplifyText(text);
        if (!textSimple || textSimple.length === 0) return fs.max || fs.default || 12;

        // estimates the font size based on available width and
        // character count using a simple heuristic (0.6 ratio)
        const charWidth = 0.6;
        const fitByWidth = safeW / (textSimple.length * charWidth);
        const fitByHeight = safeH;
        let size = Math.min(fitByWidth, fitByHeight);
        size = Math.max(size, fs.min || 4);
        size = Math.min(size, fs.max || 36);

        return Math.round(size);
    };

    // applies the current font size to the viewport text
    // display based on the selected profile configuration
    const applyFontSize = function() {
        if (!currentProfile) return;

        const isAutomatic = fontSizeMode.prop("checked");
        let size;

        if (isAutomatic) {
            size = calculateAutoFontSize(currentProfile);
            if (size !== null) {
                fontSizeRange.val(size);
                fontSizeValue.text(size);
            }
        } else {
            size = parseInt(fontSizeRange.val());
        }

        if (size) {
            const scaledSize = size * VIEWPORT_SCALE;
            viewportContainer.css("font-size", scaledSize + "px");
            viewportContainer.css("line-height", scaledSize + "px");
        }
    };

    // registers for the change in the profile dropdown so
    // that the viewport preview and font size controls update
    profileSelect.bind("change", function() {
        const key = jQuery(this).val();
        currentProfile = key ? profiles[key] : null;
        renderViewportPreview(currentProfile);
        updateProfileInfo(currentProfile);
        updateFontSizeControls(currentProfile);
        applyFontSize();
    });

    // registers for the change in the font size range slider
    // to update the displayed value and apply the new size
    fontSizeRange.bind("input", function() {
        const size = jQuery(this).val();
        fontSizeValue.text(size);
        applyFontSize();
    });

    // registers for the change in the font size mode checkbox
    // to toggle between manual and automatic sizing modes
    fontSizeMode.bind("change", function() {
        const isAutomatic = jQuery(this).prop("checked");
        fontSizeRange.prop("disabled", isAutomatic);
        applyFontSize();
    });

    // loads the available profiles from the server
    loadProfiles();

    // registers for the click event on the button receipt
    // to run the remove logic of receipt printing using
    // the colony (cloud) print service
    buttonReceipt.click(async function() {
        try {
            await printReceipt();
        } catch (err) {
            modalOverlayError.modal("show", String(err));
        }
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
            emojispContainer.hide();
            emojisContainer.show();
        } else if (font === "Cool Emojis Pantograph") {
            keyboardContainer.hide();
            emojisContainer.hide();
            emojispContainer.show();
        } else {
            emojisContainer.hide();
            emojispContainer.hide();
            keyboardContainer.show();
        }
        keyboardContainer.css("font-family", '"' + font + '"');
        inputViewport.css("font-family", '"' + font + '"');
        body.data("font", font);
    });
    fontsContainer.bind("defont", function(event, font) {
        keyboardContainer.hide();
        emojisContainer.hide();
        emojispContainer.hide();
    });

    const updateForm = function(value) {
        const options = master[value] || {};
        const elements = options.elements || "*";
        const location = options.location || "*";

        elementsChild.hide();
        if (elements === "*") {
            elementsChild.show();
        } else {
            for (const element of elements) {
                const elementE = jQuery(`> [value=${element}]`, elementsE);
                const labelE = elementE.next();
                elementE.show();
                labelE.show();
            }
        }

        locationChild.hide();
        if (location === "*") {
            locationChild.show();
        } else {
            for (const _location of location) {
                const _locationE = jQuery(`> [value=${_location}]`, locationE);
                const labelE = _locationE.next();
                _locationE.show();
                labelE.show();
            }
        }
    };

    // creates the key handler function responsible for
    // the update of the current text value, both from
    // a visual and logic point of view
    const keyHandler = function(event, font, value) {
        if (value === "⌫") {
            backspace();
        } else if (value === "⎵") {
            space(font);
        } else {
            type(font, value);
        }
    };

    const keyboardHandler = function(event) {
        const font = body.data("font");
        let executed = false;
        switch (event.key) {
            case "Backspace":
                executed = backspace();
                if (executed) {
                    event.stopPropagation();
                    event.preventDefault();
                }
                break;

            case " ":
                executed = space(font);
                if (executed) {
                    event.stopPropagation();
                    event.preventDefault();
                }
                break;

            default:
                type(font, event.key, true);
                break;
        }
    };

    const backspace = function() {
        let [text, caret, caretPosition] = getText();
        if (caret.length === 0) return false;
        caret.prev().remove();
        text.splice(caretPosition, 1);
        caretPosition--;
        caretPosition = Math.max(caretPosition, -1);
        setText(text, caretPosition);
        return true;
    };

    const space = function(font) {
        let [text, caret, caretPosition] = getText();
        if (caret.length === 0) return false;
        const element = jQuery("<span style=\"font-family: '" + font + "';\">&nbsp;</span>");
        caret.before(element);
        element.click(function() {
            const element = jQuery(this);
            element.after(caret);
            caretPosition = element.index(".viewer-container > span:not(.caret)");
            body.data("caret_position", caretPosition);
        });
        text.splice(caretPosition + 1, 0, [font, " "]);
        caretPosition++;
        setText(text, caretPosition);
        return true;
    };

    const type = function(font, value, validate) {
        // determines if a key exists in the current visible keyboard that
        // has the value of the provided key and if that's not the case returns
        // the control flow immediately, key is not compatible
        const key = jQuery(
            `.keyboard-container:visible > span[data-value=\"${value
                .replace("\\", "\\\\")
                .replace('"', '\\"')
                .toUpperCase()}\"]`,
            body
        );
        if (validate && key.length === 0) return;

        let [text, caret, caretPosition] = getText();
        const element = jQuery("<span style=\"font-family: '" + font + "';\">" + value + "</span>");
        caret.before(element);
        element.click(function() {
            const element = jQuery(this);
            element.after(caret);
            caretPosition = element.index(".viewer-container > span:not(.caret)");
            body.data("caret_position", caretPosition);
        });
        text.splice(caretPosition + 1, 0, [font, value]);
        caretPosition++;
        setText(text, caretPosition);
    };

    const getText = function() {
        const text = body.data("text") || [];
        const caret = jQuery("> .caret", viewportContainer);
        const caretPosition =
            body.data("caret_position") === undefined ? -1 : body.data("caret_position");
        return [text, caret, caretPosition];
    };

    const setText = function(text, caretPosition) {
        body.data("text", text);
        body.data("caret_position", caretPosition);

        const buttonHref = buttonReport.attr("data-href");
        buttonReport.attr("href", buttonHref + "?text=" + encodeURIComponent(serializeText(text)));

        const [textSimple, font] = simplifyText(text);
        buttonPrint.attr("data-text", textSimple);
        buttonPrint.attr("data-font", font);

        // recalculates the automatic font size when the
        // text content changes to fit the viewport
        if (currentProfile && fontSizeMode.prop("checked")) {
            applyFontSize();
        }
    };

    const printReceipt = async function() {
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
        if (receiptResponse.status !== 200) {
            const error = await receiptResponse.json();
            const errorMessage = error.message || error.error || "unset";
            throw new Error(`Error while obtaining receipt XML: ${errorMessage}`);
        }
        const receiptXml = await receiptResponse.text();

        // converts the XML template into a "compiled" binary format (binie)
        // that can be used by colony cloud print
        const binieResponse = await fetch(`${printUrl}/documents.binie?base64=1`, {
            method: "POST",
            body: receiptXml
        });
        if (binieResponse.status !== 200) {
            const error = await binieResponse.json();
            const errorMessage = error.message || error.error || "unset";
            throw new Error(`Error while converting XML to binie: ${errorMessage}`);
        }
        const receiptBinie = await binieResponse.text();

        // builds the parameters that are going to be used for the concrete
        // printing operation and runs the print with the properly configured
        // colony cloud print configuration
        const printResponse = await fetch(`${printUrl}/nodes/${node}/printers/print`, {
            method: "POST",
            body: new URLSearchParams([
                ["printer", printer],
                ["data_b64", receiptBinie]
            ]),
            headers: { "X-Secret-Key": key }
        });
        if (printResponse.status !== 200) {
            const error = await printResponse.json();
            const errorMessage = error.message || error.error || "unset";
            throw new Error(`Error while running the final print operation: ${errorMessage}`);
        }
    };

    keyboardContainer.keyboardcontainer();
    emojisContainer.keyboardcontainer();
    emojispContainer.keyboardcontainer();

    keyboardContainer.bind("key", keyHandler);
    emojisContainer.bind("key", keyHandler);
    emojispContainer.bind("key", keyHandler);

    modalOverlayError.modal();
    modalOverlayConfirm.modal();
    modalOverlayConfig.modal();
    toast.toast();

    formConsole.formconsole();

    body.bind("keydown", keyboardHandler);
});
