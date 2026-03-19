// eslint-disable-next-line no-unused-vars
const jQuery = window.jQuery ? window.jQuery : null;

/**
 * Gathers the series of UI and canvas options according to
 * the requested theme.
 *
 * @param {String} theme The name of the theme to retrieve the target
 * options, that change thickness and global UI.
 * @returns {Object} An object with the setting for the current theme.
 */
// eslint-disable-next-line no-unused-vars
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

// eslint-disable-next-line no-unused-vars
const drawText = function(ctx) {
    ctx.font = "30px Arial";
    ctx.fillText("Hello World", 10, 500);
};

// eslint-disable-next-line no-unused-vars
const deserializeText = function(text, separator = "|") {
    if (!text) return null;
    const textL = [];
    const pairs = text.split(new RegExp("\\" + separator));
    for (let index = 0; index < pairs.length; index++) {
        const pair = pairs[index];
        if (pair === "\\n") {
            textL.push([null, "\n"]);
            continue;
        }
        let font, value;
        const offset = pair.indexOf(":");
        if (offset === -1) {
            font = pair;
            value = null;
        } else {
            font = pair.slice(0, offset);
            value = pair.slice(offset + 1);
        }
        textL.push([font, value]);
    }
    return textL;
};

// eslint-disable-next-line no-unused-vars
const serializeText = function(text, separator = "|") {
    const buffer = [];
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        if (item[1] === "\n") {
            buffer.push("\\n");
        } else {
            buffer.push(item[0] + ":" + item[1]);
        }
    }
    return buffer.join(separator);
};

// eslint-disable-next-line no-unused-vars
const simplifyText = function(text, separator = "") {
    const buffer = [];
    let font = null;
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        if (item[0] !== null) font = item[0];
        buffer.push(item[1]);
    }
    return [buffer.join(separator), font];
};

// eslint-disable-next-line no-unused-vars
const multifontText = function(text, emojiMapping) {
    const result = [];
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        const font = item[0];
        const value = item[1];
        if (value === "\n") {
            result.push([null, "\n"]);
            continue;
        }
        if (font === "Cool Emojis") {
            const mapped = emojiMapping[value];
            if (mapped) {
                result.push([mapped, "a"]);
            } else if (value === " ") {
                result.push(["HELVETICA 4L", " "]);
            }
            continue;
        }
        if (font === "Cool Emojis Pantograph") continue;
        const last = result.length > 0 ? result[result.length - 1] : null;
        if (last && last[0] === font && last[1] !== "\n") {
            last[1] += value;
        } else {
            result.push([font, value]);
        }
    }
    return result;
};

// eslint-disable-next-line no-unused-vars
const hasUnsupportedFont = function(text) {
    for (let index = 0; index < text.length; index++) {
        if (text[index][0] === "Cool Emojis Pantograph") return true;
    }
    return false;
};

// eslint-disable-next-line no-unused-vars
const countLines = function(text) {
    let lines = 1;
    for (let index = 0; index < text.length; index++) {
        if (text[index][1] === "\n") lines++;
    }
    return lines;
};

(function(jQuery) {
    /**
     * Calligraphy plugin that manages a jSignature drawing
     * canvas inside the viewport preview for freehand engraving.
     *
     * Operates on a .calligraphy-container element positioned
     * inside the viewport preview, constrained to the safe
     * drawable area defined by the profile padding.
     *
     * Actions:
     *   "init"  - initializes or reinitializes the jSignature
     *             canvas with the given width, height, and line
     *             width options
     *   "reset" - clears the current drawing and resets the canvas
     *   "undo"  - removes the last stroke from the drawing
     *   "data"  - returns the current drawing as SVG base64 data
     *             or null if the canvas is empty
     *
     * Events:
     *   "calligraphy" - triggered when the drawing content changes,
     *                   passing a boolean indicating if data exists
     */
    jQuery.fn.calligraphy = function(action, options) {
        const elements = jQuery(this);

        if (action === "data") {
            const context = elements.first();
            const initialized = context.data("_calligraphy_initialized");
            if (!initialized) return null;
            const data = context.jSignature("getData", "svgbase64");
            const hasData = Boolean(data && data[1]);
            return hasData ? data : null;
        }

        elements.each(function() {
            const context = jQuery(this);

            if (action === "init") {
                const width = options.width;
                const height = options.height;
                const lineWidth = options.lineWidth || 2;

                // destroys the previous jSignature instance
                // before reinitializing with new dimensions
                if (context.data("_calligraphy_initialized")) {
                    context.empty();
                    context.data("_calligraphy_initialized", false);
                }

                context.css({
                    width: width + "px",
                    height: height + "px"
                });

                context.jSignature({
                    width: width,
                    height: height,
                    lineWidth: lineWidth,
                    UndoButton: true,
                    color: "#000000",
                    "background-color": "transparent"
                });

                context.data("_calligraphy_initialized", true);

                // hides the jSignature undo button since we
                // provide our own undo control in the options panel
                context.find("input[type=button]").hide();

                // listens for changes in the drawing so that
                // the calligraphy event can be forwarded to consumers
                context.bind("change", function() {
                    const data = context.jSignature("getData", "base30");
                    const hasData = Boolean(data && data[1]);
                    context.triggerHandler("calligraphy", [hasData]);
                });
                return;
            }

            if (action === "reset") {
                if (context.data("_calligraphy_initialized")) {
                    context.jSignature("reset");
                }
                return;
            }

            if (action === "undo") {
                if (context.data("_calligraphy_initialized")) {
                    // triggers a click on the hidden jSignature
                    // undo button to remove the last stroke
                    context.find("input[type=button]").click();
                }
                return;
            }
        });

        return this;
    };
})(jQuery);

(function(jQuery) {
    /**
     * Collapsible panel plugin that toggles a panel between
     * expanded and minimized states using a smooth max-height
     * transition on the body element.
     *
     * Operates on a container element and discovers its children
     * (.collapsible-title, .collapsible-body, .collapsible-toggle)
     * by class name convention. Clicks on the title toggle the
     * panel state and update the toggle icon.
     */
    jQuery.fn.collapsiblepanel = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const title = jQuery(".collapsible-title", context);
            const body = jQuery(".collapsible-body", context);
            const toggle = jQuery(".collapsible-toggle", context);

            title.click(function() {
                const bodyElement = body.get(0);
                const minimized = context.hasClass("minimized");
                if (minimized) {
                    context.removeClass("minimized");
                    const height = bodyElement.scrollHeight;
                    body.css("max-height", "0px");
                    title.css("margin-bottom", "0px");
                    bodyElement.offsetHeight; // eslint-disable-line no-unused-expressions
                    body.css("max-height", height + "px");
                    title.css("margin-bottom", "");
                    toggle.text("\u25be");
                    body.one("transitionend", function() {
                        body.css("max-height", "");
                    });
                } else {
                    body.css("max-height", bodyElement.scrollHeight + "px");
                    bodyElement.offsetHeight; // eslint-disable-line no-unused-expressions
                    body.css("max-height", "0px");
                    title.css("margin-bottom", "0px");
                    toggle.text("\u25b8");
                    body.one("transitionend", function() {
                        context.addClass("minimized");
                    });
                }
            });
        });

        return this;
    };
})(jQuery);

(function(jQuery) {
    /**
     * Debug console plugin that evaluates arbitrary JavaScript
     * commands entered in a text input and displays the result.
     *
     * Operates on a .form-console element and discovers its
     * children (.button, .input[name=command]) by class name
     * convention.
     */
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

(function(jQuery) {
    /**
     * Font selection plugin that manages a clickable list of
     * font elements with toggle selection state.
     *
     * Operates on a .fonts-container element and discovers its
     * children (.font) by class name convention.
     *
     * Events:
     *   "font"   - triggered when a font is selected, passing
     *              the font name from the data-font attribute
     *   "defont" - triggered when a font is deselected, passing
     *              the font name from the data-font attribute
     */
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
    /**
     * Inspiration panel plugin that displays pre-built engraving
     * presets as clickable thumbnails with a full-screen search
     * modal for browsing all available inspirations.
     *
     * Operates on an .inspiration-panel element and discovers its
     * children (.inspiration-panel-title, .inspiration-thumbnails,
     * .button-view-all) by class name convention.
     *
     * Actions:
     *   "update" - refreshes the panel with the given profile's
     *              inspirations, rendering thumbnail previews
     *
     * Events:
     *   "apply"  - triggered when an inspiration is selected,
     *              passing the inspiration object as argument
     */
    jQuery.fn.inspirationpanel = function(action, options) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const panelTitle = jQuery(".inspiration-panel-title", context);
            const panelBody = jQuery(".inspiration-panel-body", context);
            const panelToggle = jQuery(".inspiration-panel-toggle", context);
            const thumbnails = jQuery(".inspiration-thumbnails", context);
            const buttonViewAll = jQuery(".button-view-all", context);
            const modalOverlay = jQuery(".modal-overlay-inspirations");
            const modalGrid = jQuery(".modal-inspirations-grid", modalOverlay);
            const modalSearchInput = jQuery(".modal-search-input", modalOverlay);

            // stores the current profile reference and scale
            // constants for use across rendering functions
            let currentProfile = context.data("_profile") || null;
            const viewportScale = (options && options.viewport_scale) || 3;
            const fontSizeScale = (options && options.font_size_scale) || 1.3;

            // renders a single inspiration thumbnail as a miniature
            // viewport preview with the text pre-rendered inside it
            const renderPreview = function(profile, inspiration, container) {
                const width = profile.width * viewportScale;
                const height = profile.height * viewportScale;
                const padding = inspiration.padding ||
                    profile.padding || { top: 0, right: 0, bottom: 0, left: 0 };
                const fontSize = inspiration.font_size || 3;
                const scaledSize = fontSize * viewportScale * fontSizeScale;

                const preview = jQuery('<div class="viewport-preview profile-active"></div>');
                preview.css({ width: width + "px", height: height + "px" });

                // applies the background image if the profile has one
                if (profile.background) {
                    preview.css({
                        "background-image": "url('/static/profiles/" + profile.background + "')",
                        "background-size": width + "px " + height + "px",
                        "background-repeat": "no-repeat",
                        "background-position": "0px 0px"
                    });
                }

                // positions the text container over the safe drawable area
                const safeX = padding.left * viewportScale;
                const safeY = padding.top * viewportScale;
                const safeW = width - (padding.left + padding.right) * viewportScale;
                const safeH = height - (padding.top + padding.bottom) * viewportScale;
                const viewer = jQuery('<div class="viewer-container"></div>');
                viewer.css({
                    position: "absolute",
                    left: safeX + "px",
                    top: safeY + "px",
                    width: safeW + "px",
                    height: safeH + "px",
                    margin: "0px",
                    padding: "0px",
                    border: "none",
                    "min-width": "0px",
                    "font-size": scaledSize + "px",
                    "line-height": Math.round(scaledSize * 1.2) + "px",
                    "text-align": inspiration.align || "center",
                    "align-content": "center",
                    display: "flex",
                    "flex-wrap": "wrap",
                    "justify-content":
                        inspiration.align === "left"
                            ? "flex-start"
                            : inspiration.align === "right"
                            ? "flex-end"
                            : "center",
                    overflow: "hidden"
                });

                // renders the text items inside the viewer container
                // expanding multi-character entries into individual spans
                for (let i = 0; i < inspiration.text.length; i++) {
                    const font = inspiration.text[i][0];
                    const chars = inspiration.text[i][1];
                    if (chars === "\n") {
                        viewer.append('<div class="newline"></div>');
                    } else {
                        for (let j = 0; j < chars.length; j++) {
                            const value = chars[j] === " " ? "&nbsp;" : chars[j];
                            viewer.append(
                                "<span style=\"font-family: '" + font + "';\">" + value + "</span>"
                            );
                        }
                    }
                }

                preview.append(viewer);

                // scales the preview to fit inside the container
                const containerWidth = container.width() || 72;
                const scale = containerWidth / width;
                preview.css({
                    transform: "scale(" + scale + ")",
                    "transform-origin": "0 0"
                });
                container.css({
                    height: Math.ceil(height * scale) + "px",
                    position: "relative"
                });

                container.append(preview);
            };

            // renders the inspiration thumbnails in the side panel
            // showing the first 3 entries from the profile inspirations
            const renderPanel = function(profile) {
                thumbnails.empty();

                if (!profile || !profile._inspirations || profile._inspirations.length === 0) {
                    context.removeClass("visible");
                    return;
                }

                const entries = profile._inspirations.slice(0, 3);
                for (let i = 0; i < entries.length; i++) {
                    const inspiration = entries[i];
                    const thumb = jQuery('<div class="inspiration-thumb"></div>');
                    const previewContainer = jQuery(
                        '<div class="inspiration-thumb-preview"></div>'
                    );
                    const title = jQuery('<div class="inspiration-thumb-title"></div>');
                    title.text(inspiration.title);
                    thumb.append(previewContainer);
                    thumb.append(title);
                    thumb.data("inspiration", inspiration);
                    thumbnails.append(thumb);
                    renderPreview(profile, inspiration, previewContainer);
                }

                context.addClass("visible");
                panelBody.css("overflow", "visible");
            };

            // renders all inspirations in the full-screen modal grid
            // with viewport previews and metadata for each entry
            const renderModal = function(profile, filter) {
                modalGrid.empty();

                if (!profile || !profile._inspirations) return;

                const query = (filter || "").toLowerCase();
                const entries = profile._inspirations.filter(function(insp) {
                    if (!query) return true;
                    const haystack = [
                        insp.title || "",
                        insp.description || "",
                        insp.author || "",
                        (insp.text || [])
                            .map(function(t) {
                                return t[1];
                            })
                            .join("")
                    ]
                        .join(" ")
                        .toLowerCase();
                    return haystack.indexOf(query) !== -1;
                });

                if (entries.length === 0) {
                    modalGrid.append('<div class="inspiration-empty">No inspirations found.</div>');
                    return;
                }

                for (let i = 0; i < entries.length; i++) {
                    const inspiration = entries[i];
                    const card = jQuery('<div class="inspiration-card"></div>');
                    const previewContainer = jQuery('<div class="inspiration-card-preview"></div>');
                    const title = jQuery('<div class="inspiration-card-title"></div>');
                    const description = jQuery('<div class="inspiration-card-description"></div>');
                    const author = jQuery('<div class="inspiration-card-author"></div>');
                    title.text(inspiration.title);
                    description.text(inspiration.description);
                    author.text(inspiration.author);
                    card.append(previewContainer);
                    card.append(title);
                    card.append(description);
                    card.append(author);
                    card.data("inspiration", inspiration);
                    modalGrid.append(card);
                    renderPreview(profile, inspiration, previewContainer);
                }
            };

            // updates the panel with the inspirations from
            // the given profile, showing or hiding as needed
            if (action === "update") {
                currentProfile = options;
                context.data("_profile", currentProfile);
                renderPanel(currentProfile);
                return;
            }

            // toggles the panel between expanded and minimized
            // states using a smooth max-height transition
            panelTitle.click(function() {
                const bodyElement = panelBody.get(0);
                const minimized = context.hasClass("minimized");
                if (minimized) {
                    context.removeClass("minimized");
                    const height = bodyElement.scrollHeight;
                    panelBody.css("max-height", "0px");
                    panelTitle.css("margin-bottom", "0px");
                    bodyElement.offsetHeight; // eslint-disable-line no-unused-expressions
                    panelBody.css("max-height", height + "px");
                    panelTitle.css("margin-bottom", "");
                    panelToggle.text("▾");
                    panelBody.one("transitionend", function() {
                        panelBody.css("max-height", "");
                        panelBody.css("overflow", "visible");
                    });
                } else {
                    panelBody.css("overflow", "");
                    panelBody.css("max-height", bodyElement.scrollHeight + "px");
                    bodyElement.offsetHeight; // eslint-disable-line no-unused-expressions
                    panelBody.css("max-height", "0px");
                    panelTitle.css("margin-bottom", "0px");
                    panelToggle.text("▸");
                    panelBody.one("transitionend", function() {
                        context.addClass("minimized");
                    });
                }
            });

            // registers click handlers for the panel thumbnails
            // to emit an apply event with the selected inspiration
            thumbnails.on("click", ".inspiration-thumb", function() {
                const inspiration = jQuery(this).data("inspiration");
                if (inspiration) {
                    context.triggerHandler("apply", [inspiration]);
                }
            });

            // registers for the view all button to open the
            // full-screen inspirations modal with all entries
            buttonViewAll.click(function() {
                const profile = context.data("_profile");
                if (!profile || !profile._inspirations) return;
                modalSearchInput.val("");
                renderModal(profile);
                modalOverlay.modal("show");
            });

            // registers click handlers for the modal inspiration
            // cards to emit an apply event and close the modal
            modalGrid.on("click", ".inspiration-card", function() {
                const inspiration = jQuery(this).data("inspiration");
                if (inspiration) {
                    context.triggerHandler("apply", [inspiration]);
                    modalOverlay.modal("hide");
                }
            });

            // registers for the search input to filter the
            // inspirations grid in the full-screen modal
            modalSearchInput.bind("input", function() {
                const profile = context.data("_profile");
                const query = jQuery(this).val();
                renderModal(profile, query);
            });
        });

        return this;
    };
})(jQuery);

(function(jQuery) {
    /**
     * Virtual keyboard plugin that handles character input via
     * clickable key elements with support for long-press accent
     * popups and keyboard casing toggle.
     *
     * Operates on a .keyboard-container element and discovers
     * its children (.char) by class name convention. Supports
     * data-accents attribute on keys for accent variant popups.
     *
     * Events:
     *   "key" - triggered when a key is pressed, passing the
     *           current font name and character value
     */
    jQuery.fn.keyboardcontainer = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const body = jQuery("body");
            const keys = jQuery("> .char", context);
            let longPressTimer = null;
            let longPressTriggered = false;

            keys.click(function() {
                if (longPressTriggered) return;
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

            // registers a long press handler on keys that have
            // accented variants defined in the data-accents attribute
            keys.on("mousedown touchstart", function(event) {
                longPressTriggered = false;
                const element = jQuery(this);
                const accents = element.attr("data-accents");
                if (!accents) return;
                longPressTimer = setTimeout(function() {
                    longPressTriggered = true;
                    showAccentPopup(context, element, accents);
                }, 400);
            });

            keys.on("mouseup touchend touchcancel mouseleave", function() {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
        });

        /**
         * Shows the accent popup above the pressed key with
         * the available accented character variants.
         *
         * @param {Element} context The keyboard container context.
         * @param {Element} element The key element that was long pressed.
         * @param {String} accents Comma-separated list of accented characters.
         */
        const showAccentPopup = function(context, element, accents) {
            const body = jQuery("body");
            jQuery(".accent-popup").remove();

            const variants = accents.split(",");
            const casing = context.data("casing") || "uppercase";
            const popup = jQuery('<div class="accent-popup"></div>');
            const arrow = jQuery('<div class="accent-popup-arrow"></div>');

            for (let index = 0; index < variants.length; index++) {
                let value = variants[index].trim();
                if (casing === "lowercase") value = value.toLowerCase();
                const option = jQuery('<span class="accent-option">' + value + "</span>");
                option.on("mouseup touchend click", function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    const font = body.data("font");
                    context.triggerHandler("key", [font, value]);
                    popup.remove();
                });
                popup.append(option);
            }

            popup.append(arrow);

            const offset = element.offset();
            const containerOffset = context.offset();
            const left = offset.left - containerOffset.left + element.outerWidth() / 2;
            const top = offset.top - containerOffset.top;
            popup.css({ left: left + "px", top: top + "px" });

            context.append(popup);

            // dismisses the popup when clicking outside of it
            // by registering a one-time click handler on the document
            setTimeout(function() {
                jQuery(document).one("click", function(event) {
                    if (jQuery(event.target).closest(".accent-popup").length > 0) return;
                    popup.remove();
                });
            }, 0);
        };

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
     */
    jQuery.fn.modal = function(action, message) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const modalMessage = jQuery(".modal-message", context);
            const modalPreview = jQuery(".modal-preview", context);
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
                        const escaped = jQuery("<span>").text(value).html().replace(/ /g, "⎵");
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
                if (specs.extra_padding) {
                    html +=
                        '<div class="modal-spec"><strong>Extra padding:</strong> ' +
                        jQuery("<span>").text(specs.extra_padding).html() +
                        "</div>";
                }
                if (specs.final_viewport) {
                    html +=
                        '<div class="modal-spec"><strong>Final viewport:</strong> ' +
                        jQuery("<span>").text(specs.final_viewport).html() +
                        "</div>";
                }
                if (specs.node) {
                    html +=
                        '<div class="modal-spec"><strong>Node:</strong> ' +
                        jQuery("<span>").text(specs.node).html() +
                        "</div>";
                }
                if (specs.instructions) {
                    html +=
                        '<div class="modal-spec"><strong>Jig:</strong> ' +
                        jQuery("<span>").text(specs.instructions).html() +
                        "</div>";
                }
                modalSpecs.html(html);

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
                        "margin-right": ""
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

            // registers for the click operation on the configure button
            // that opens the printer configuration modal
            buttonConfigure.click(function() {
                dismissModal(function() {
                    const configOverlay = jQuery(".modal-overlay-config");
                    configOverlay.modal("show");
                });
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
    /**
     * Profile selector plugin that manages the profile and
     * variant dropdown selection with automatic variant merging.
     *
     * Operates on a container element and discovers its children
     * (.profile-select, .variant-select, .variant-container) by
     * class name convention.
     *
     * Actions:
     *   "load"   - populates the profile dropdown with the given
     *              profiles object keyed by profile ID
     *   "select" - programmatically selects a profile and optional
     *              variant by key and index
     *   "value"  - returns the current selection as an object with
     *              profile key and variant index
     *
     * Events:
     *   "profile" - triggered when the profile or variant selection
     *               changes, passing the merged profile, base profile,
     *               profile key, and variant index as arguments
     */
    jQuery.fn.profileselector = function(action, options) {
        const elements = jQuery(this);

        // applies a variant's overrides onto the base profile
        // returning a merged profile object for rendering
        const applyVariant = function(profile, variant) {
            if (!profile || !variant) return profile;
            const merged = Object.assign({}, profile);
            if (variant.padding) merged.padding = variant.padding;
            if (variant.extra_padding) merged.extra_padding = variant.extra_padding;
            if (variant.background) merged.background = variant.background;
            if (variant.font_size) merged.font_size = variant.font_size;
            return merged;
        };

        // resolves the current profile from the given context
        // applying variant overrides if one is selected
        const resolveProfile = function(context) {
            const profileSelect = jQuery(".profile-select", context);
            const variantSelect = jQuery(".variant-select", context);
            const profiles = context.data("_profiles") || {};
            const key = profileSelect.val();
            const baseProfile = key ? profiles[key] : null;
            const index = parseInt(variantSelect.val());
            const variant = baseProfile && baseProfile.variants
                ? baseProfile.variants[index]
                : null;
            const mergedProfile = variant
                ? applyVariant(baseProfile, variant)
                : baseProfile;
            return {
                profile: mergedProfile,
                baseProfile: baseProfile,
                key: key,
                variantIndex: isNaN(index) ? null : index
            };
        };

        // returns the current selection as an object with
        // the profile key and variant index values from
        // the first matched element only
        if (action === "value") {
            return resolveProfile(elements.first());
        }

        elements.each(function() {
            const context = jQuery(this);
            const profileSelect = jQuery(".profile-select", context);
            const variantSelect = jQuery(".variant-select", context);
            const variantContainer = jQuery(".variant-container", context);

            // populates the profile dropdown with the given
            // profiles object and stores it for later lookup
            if (action === "load") {
                const profiles = options.profiles;
                context.data("_profiles", profiles);
                const keys = Object.keys(profiles);
                for (const key of keys) {
                    const profile = profiles[key];
                    const option = jQuery("<option></option>");
                    option.attr("value", key);
                    option.text(profile.name);
                    profileSelect.append(option);
                }
                return;
            }

            // programmatically selects a profile and optional
            // variant by key and index triggering the change event
            if (action === "select") {
                const profileKey = options.profile;
                const variantIndex = options.variant;
                if (profileKey) {
                    profileSelect.val(profileKey).trigger("change");
                    if (variantIndex !== undefined && variantIndex !== null) {
                        variantSelect.val(variantIndex).trigger("change");
                    }
                }
                return;
            }

            // registers for the change in the profile dropdown
            // populating the variant dropdown if variants exist
            profileSelect.bind("change", function() {
                const key = jQuery(this).val();
                const profiles = context.data("_profiles") || {};
                const baseProfile = key ? profiles[key] : null;

                // populates the variant dropdown if the profile
                // has variants defined in its configuration
                variantSelect.empty();
                if (baseProfile && baseProfile.variants && baseProfile.variants.length > 0) {
                    for (let i = 0; i < baseProfile.variants.length; i++) {
                        const variant = baseProfile.variants[i];
                        const option = jQuery("<option></option>");
                        option.attr("value", i);
                        option.text(variant.name);
                        variantSelect.append(option);
                    }
                    variantContainer.addClass("visible");
                } else {
                    variantContainer.removeClass("visible");
                }

                const resolved = resolveProfile(context);
                context.triggerHandler("profile", [
                    resolved.profile,
                    resolved.baseProfile,
                    resolved.key,
                    resolved.variantIndex
                ]);
            });

            // registers for the change in the variant dropdown
            // applying the variant overrides and emitting change
            variantSelect.bind("change", function() {
                const resolved = resolveProfile(context);
                context.triggerHandler("profile", [
                    resolved.profile,
                    resolved.baseProfile,
                    resolved.key,
                    resolved.variantIndex
                ]);
            });
        });

        return this;
    };
})(jQuery);

(function(jQuery) {
    /**
     * Text editor plugin that manages character-by-character
     * text input with caret positioning, newline handling, and
     * physical keyboard support including dead-key composition.
     *
     * Operates on a .viewer-container element and creates child
     * span elements for each character and a .caret element for
     * the insertion point.
     *
     * Actions:
     *   "option"       - updates configuration (maxLines)
     *   "loadText"     - loads text from an array of [font, char]
     *                    pairs, replacing the current content
     *   "bindExisting" - binds click handlers to server-rendered
     *                    text spans for caret positioning
     *
     * Events:
     *   "change" - triggered when the text content changes,
     *              passing the updated text array as argument
     */
    jQuery.fn.texteditor = function(action, options) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const body = jQuery("body");

            // stores configuration and state references that
            // can be updated externally via the option action
            let maxLines = context.data("_maxLines") || 0;

            // updates the max lines constraint from the profile
            // configuration to enforce the line limit on newlines
            if (action === "option") {
                if (options && options.maxLines !== undefined) {
                    maxLines = options.maxLines;
                    context.data("_maxLines", maxLines);
                }
                return;
            }

            // loads text data into the editor from an external
            // source such as an inspiration or session restore
            if (action === "loadText") {
                const textData = (options && options.text) || [];
                const caret = jQuery("> .caret", context);
                context.find("> :not(.caret)").remove();
                for (let i = 0; i < textData.length; i++) {
                    const item = textData[i];
                    if (item[1] === "\n") {
                        const element = jQuery('<div class="newline"></div>');
                        caret.before(element);
                        bindCaretClick(element, context, body);
                    } else {
                        const value = item[1] === " " ? "&nbsp;" : item[1];
                        const element = jQuery(
                            "<span style=\"font-family: '" + item[0] + "';\">" + value + "</span>"
                        );
                        caret.before(element);
                        bindCaretClick(element, context, body);
                    }
                }
                body.data("text", textData);
                body.data("caret_position", textData.length - 1);
                return;
            }

            // binds click handlers on pre-rendered DOM elements
            // that were server-rendered in the initial template
            if (action === "bindExisting") {
                context.find("> :not(.caret)").each(function() {
                    const element = jQuery(this);
                    bindCaretClick(element, context, body);
                });
                return;
            }

            // dead key composition map for physical keyboard input,
            // maps a dead key followed by a base letter to the
            // corresponding accented character
            const DEAD_KEY_MAP = {
                "´": { a: "á", e: "é", i: "í", o: "ó", u: "ú" },
                "^": { a: "â", e: "ê", o: "ô" },
                "~": { a: "ã", o: "õ" },
                "`": { a: "à" }
            };

            // builds a set of all valid accented characters so that
            // OS-composed dead key input can bypass keyboard validation
            const ACCENTED_CHARS = new Set();
            for (const deadKey in DEAD_KEY_MAP) {
                for (const base in DEAD_KEY_MAP[deadKey]) {
                    const composed = DEAD_KEY_MAP[deadKey][base];
                    ACCENTED_CHARS.add(composed);
                    ACCENTED_CHARS.add(composed.toUpperCase());
                }
            }

            let pendingDeadKey = null;

            // creates the key handler function responsible for
            // the update of the current text value, both from
            // a visual and logic point of view
            const keyHandler = function(event, font, value) {
                if (value === "⌫") {
                    backspace();
                } else if (value === "⎵") {
                    space(font);
                } else if (value === "↵") {
                    newline();
                } else {
                    type(font, value);
                }
            };

            const keyboardHandler = function(event) {
                // skips keyboard handling when a modal input is focused
                // so that text editing controls work normally in modals
                const target = jQuery(event.target);
                if (target.closest(".modal-overlay.visible").length > 0) return;

                const font = body.data("font");
                let executed = false;
                switch (event.key) {
                    case "Dead":
                        break;

                    case "Backspace":
                        pendingDeadKey = null;
                        executed = backspace();
                        if (executed) {
                            event.stopPropagation();
                            event.preventDefault();
                        }
                        break;

                    case " ":
                        pendingDeadKey = null;
                        executed = space(font);
                        if (executed) {
                            event.stopPropagation();
                            event.preventDefault();
                        }
                        break;

                    case "Enter":
                        pendingDeadKey = null;
                        executed = newline();
                        if (executed) {
                            event.stopPropagation();
                            event.preventDefault();
                        }
                        break;

                    case "Delete":
                        pendingDeadKey = null;
                        executed = deleteForward();
                        if (executed) {
                            event.stopPropagation();
                            event.preventDefault();
                        }
                        break;

                    case "ArrowLeft":
                        pendingDeadKey = null;
                        moveCaret(-1);
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    case "ArrowRight":
                        pendingDeadKey = null;
                        moveCaret(1);
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    case "ArrowUp":
                        pendingDeadKey = null;
                        moveCaretLine(-1);
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    case "ArrowDown":
                        pendingDeadKey = null;
                        moveCaretLine(1);
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    case "Home":
                        pendingDeadKey = null;
                        moveCaretHome();
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    case "End":
                        pendingDeadKey = null;
                        moveCaretEnd();
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    default:
                        // checks if the current key is a dead key accent
                        // and stores it for composition with the next key
                        if (DEAD_KEY_MAP[event.key]) {
                            pendingDeadKey = event.key;
                            event.stopPropagation();
                            event.preventDefault();
                            break;
                        }

                        // composes the pending dead key with the current
                        // key to produce an accented character if valid
                        if (pendingDeadKey) {
                            const composed = DEAD_KEY_MAP[pendingDeadKey][event.key.toLowerCase()];
                            pendingDeadKey = null;
                            if (composed) {
                                const cased =
                                    event.key === event.key.toUpperCase()
                                        ? composed.toUpperCase()
                                        : composed;
                                type(font, cased, false);
                            }
                            break;
                        }

                        // allows OS-composed accented characters to bypass
                        // the keyboard validation (dead key handled by the OS)
                        if (ACCENTED_CHARS.has(event.key)) {
                            type(font, event.key, false);
                            break;
                        }

                        type(font, event.key, true);
                        break;
                }
            };

            const backspace = function() {
                let [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                if (caretPosition < 0) return false;
                caret.prev().remove();
                text.splice(caretPosition, 1);
                caretPosition--;
                caretPosition = Math.max(caretPosition, -1);
                setText(text, caretPosition);
                return true;
            };

            const deleteForward = function() {
                const [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                if (caretPosition + 1 >= text.length) return false;
                caret.next().remove();
                text.splice(caretPosition + 1, 1);
                setText(text, caretPosition);
                return true;
            };

            const space = function(font) {
                let [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                const element = jQuery(
                    "<span style=\"font-family: '" + font + "';\">&nbsp;</span>"
                );
                caret.before(element);
                bindCaretClick(element, context, body);
                text.splice(caretPosition + 1, 0, [font, " "]);
                caretPosition++;
                setText(text, caretPosition);
                return true;
            };

            const newline = function() {
                let [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                maxLines = context.data("_maxLines") || 0;
                if (maxLines > 0 && countLines(text) >= maxLines) return false;
                const element = jQuery('<div class="newline"></div>');
                caret.before(element);
                bindCaretClick(element, context, body);
                text.splice(caretPosition + 1, 0, [null, "\n"]);
                caretPosition++;
                setText(text, caretPosition);
                return true;
            };

            const moveCaret = function(direction) {
                const [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                const newPosition = caretPosition + direction;
                if (newPosition < -1 || newPosition >= text.length) return false;
                const elements = context.children(":not(.caret)");
                if (newPosition === -1) {
                    elements.first().before(caret);
                } else {
                    elements.eq(newPosition).after(caret);
                }
                body.data("caret_position", newPosition);
                return true;
            };

            // splits the text array into lines and determines which
            // line the caret is currently on based on its position
            const getCaretLine = function(text, caretPosition) {
                const lines = [[]];
                for (let i = 0; i < text.length; i++) {
                    if (text[i][1] === "\n") {
                        lines.push([]);
                    } else {
                        lines[lines.length - 1].push(i);
                    }
                }

                // determines the current line by counting newline entries
                // up to the caret position, handling empty lines correctly
                let currentLine = 0;
                if (caretPosition >= 0) {
                    let line = 0;
                    for (let i = 0; i <= caretPosition; i++) {
                        if (text[i][1] === "\n") line++;
                    }
                    currentLine = line;
                }

                return { lines: lines, currentLine: currentLine };
            };

            const moveCaretHome = function() {
                const [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                const { lines, currentLine } = getCaretLine(text, caretPosition);

                // moves the caret to before the first character on the line
                let newPosition;
                if (lines[currentLine].length > 0) {
                    newPosition = lines[currentLine][0] - 1;
                } else {
                    newPosition =
                        currentLine === 0
                            ? -1
                            : lines[currentLine - 1].length > 0
                            ? lines[currentLine - 1][lines[currentLine - 1].length - 1] + 1
                            : currentLine - 1;
                }

                if (newPosition === caretPosition) return false;
                const elements = context.children(":not(.caret)");
                if (newPosition === -1) {
                    elements.first().before(caret);
                } else {
                    elements.eq(newPosition).after(caret);
                }
                body.data("caret_position", newPosition);
                return true;
            };

            const moveCaretEnd = function() {
                const [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                const { lines, currentLine } = getCaretLine(text, caretPosition);

                // moves the caret to after the last character on the line
                let newPosition;
                if (lines[currentLine].length > 0) {
                    newPosition = lines[currentLine][lines[currentLine].length - 1];
                } else {
                    newPosition =
                        currentLine === 0
                            ? -1
                            : lines[currentLine - 1].length > 0
                            ? lines[currentLine - 1][lines[currentLine - 1].length - 1] + 1
                            : currentLine - 1;
                }

                if (newPosition === caretPosition) return false;
                const elements = context.children(":not(.caret)");
                if (newPosition === -1) {
                    elements.first().before(caret);
                } else {
                    elements.eq(newPosition).after(caret);
                }
                body.data("caret_position", newPosition);
                return true;
            };

            const moveCaretLine = function(direction) {
                const [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                const { lines, currentLine } = getCaretLine(text, caretPosition);

                // determines the column within the current line
                let currentCol = 0;
                if (caretPosition === -1) {
                    currentCol = -1;
                } else if (text[caretPosition] && text[caretPosition][1] === "\n") {
                    currentCol = -1;
                } else {
                    const idx = lines[currentLine].indexOf(caretPosition);
                    currentCol = idx !== -1 ? idx : 0;
                }

                const targetLine = currentLine + direction;
                if (targetLine < 0 || targetLine >= lines.length) return false;

                // moves to the same column on the target line or the
                // end of the target line if it is shorter
                let newPosition;
                if (currentCol === -1) {
                    // was before first char, go to before first char of target line
                    if (lines[targetLine].length > 0) {
                        newPosition = lines[targetLine][0] - 1;
                    } else {
                        // target line is empty, find the newline before it
                        newPosition =
                            targetLine === 0
                                ? -1
                                : lines[targetLine - 1].length > 0
                                ? lines[targetLine - 1][lines[targetLine - 1].length - 1] + 1
                                : targetLine - 1;
                    }
                } else if (currentCol >= lines[targetLine].length) {
                    // column exceeds target line length, go to end
                    if (lines[targetLine].length > 0) {
                        newPosition = lines[targetLine][lines[targetLine].length - 1];
                    } else {
                        // target line is empty, position on its preceding newline
                        newPosition =
                            targetLine === 0
                                ? -1
                                : lines[targetLine - 1].length > 0
                                ? lines[targetLine - 1][lines[targetLine - 1].length - 1] + 1
                                : targetLine - 1;
                    }
                } else {
                    newPosition = lines[targetLine][currentCol];
                }

                const elements = context.children(":not(.caret)");
                if (newPosition === -1) {
                    elements.first().before(caret);
                } else {
                    elements.eq(newPosition).after(caret);
                }
                body.data("caret_position", newPosition);
                return true;
            };

            const type = function(font, value, validate) {
                // determines if a key exists in the current selected keyboard that
                // has the value of the provided key and if that's not the case returns
                // the control flow immediately, key is not compatible
                const key = jQuery(
                    `.keyboard-container.selected > span[data-value=\"${value
                        .replace("\\", "\\\\")
                        .replace('"', '\\"')
                        .toUpperCase()}\"]`,
                    body
                );
                if (validate && key.length === 0) return;

                let [text, caret, caretPosition] = getText();
                const element = jQuery(
                    "<span style=\"font-family: '" + font + "';\">" + value + "</span>"
                );
                caret.before(element);
                bindCaretClick(element, context, body);
                text.splice(caretPosition + 1, 0, [font, value]);
                caretPosition++;
                setText(text, caretPosition);
            };

            const getText = function() {
                const text = body.data("text") || [];
                const caret = jQuery("> .caret", context);
                const caretPosition =
                    body.data("caret_position") === undefined ? -1 : body.data("caret_position");
                return [text, caret, caretPosition];
            };

            const setText = function(text, caretPosition) {
                body.data("text", text);
                body.data("caret_position", caretPosition);
                context.triggerHandler("change", [text, caretPosition]);
            };

            // prevents duplicate bindings if already initialized
            if (body.data("_texteditor_initialized")) return;
            body.data("_texteditor_initialized", true);

            // binds the key handler to the virtual keyboard containers
            // so that key presses on the on-screen keyboards are forwarded
            jQuery(".keyboard-container").bind("key", keyHandler);
            jQuery(".emojis-container").bind("key", keyHandler);
            jQuery(".emojisp-container").bind("key", keyHandler);

            body.bind("keydown", keyboardHandler);
        });

        return this;
    };

    /**
     * Binds a click handler on a DOM element that repositions
     * the caret after the clicked element when selected.
     *
     * @param {Element} element The DOM element to bind the click handler on.
     * @param {Element} container The viewer container holding all elements.
     * @param {Element} body The body element used for state storage.
     */
    const bindCaretClick = function(element, container, body) {
        element.click(function() {
            const el = jQuery(this);
            const caret = container.find("> .caret");
            el.after(caret);
            const pos = container.children(":not(.caret)").index(el);
            body.data("caret_position", pos);
        });
    };
})(jQuery);

(function(jQuery) {
    /**
     * Toast notification plugin that displays temporary
     * messages to the user for a fixed duration of 3 seconds.
     *
     * Operates on a .toast element toggling a .visible class.
     *
     * Actions:
     *   "show" - displays the given message for 3 seconds
     */
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
    /**
     * Viewport preview plugin that manages the visual rendering
     * of the engraving preview area including SVG bounds, safe
     * drawable area, background images, rulers, and zoom scaling.
     *
     * Operates on a .viewport-preview element and discovers its
     * children (.viewport-svg, .viewer-container, .ruler-horizontal,
     * .ruler-vertical) by class name convention.
     *
     * Actions:
     *   "render" - renders the SVG preview with bounds, safe area,
     *              background image, and viewer container positioning
     *   "rulers" - renders horizontal and vertical ruler tick marks
     *              with optional show/hide control
     *   "zoom"   - applies a CSS transform scale to the preview
     *              with layout margin compensation
     */
    jQuery.fn.viewportpreview = function(action, options) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const svg = jQuery(".viewport-svg", context);
            const container = jQuery(".viewer-container", context);
            const calligraphyContainer = jQuery(".calligraphy-container", context);
            const rulerHorizontal = jQuery(".ruler-horizontal", context);
            const rulerVertical = jQuery(".ruler-vertical", context);

            // renders the viewport preview SVG based on the given
            // profile definition including bounds and safe drawable area
            if (action === "render") {
                const profile = options.profile;
                const scale = options.scale;
                const padding = options.padding;

                if (!profile) {
                    context.removeClass("profile-active");
                    context.css({
                        width: "",
                        height: "",
                        transform: "",
                        "margin-bottom": "",
                        "margin-right": "",
                        "background-image": "",
                        "background-size": "",
                        "background-repeat": "",
                        "background-position": ""
                    });
                    container.css({
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

                const width = profile.width * scale;
                const height = profile.height * scale;
                const showBounds = profile.preview ? profile.preview.show_bounds : false;
                const showSafeArea = profile.preview ? profile.preview.show_safe_area : false;

                const svgElement = svg.get(0);
                svgElement.setAttribute("width", width);
                svgElement.setAttribute("height", height);
                svgElement.setAttribute("viewBox", "0 0 " + width + " " + height);

                // clears existing SVG content before re-rendering
                while (svgElement.firstChild) {
                    svgElement.removeChild(svgElement.firstChild);
                }

                // renders the outer bounds as a dashed rectangle
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
                    svgElement.appendChild(bounds);
                }

                // renders the safe drawable area defined by padding
                if (showSafeArea) {
                    const safeX = padding.left * scale;
                    const safeY = padding.top * scale;
                    const safeW = width - (padding.left + padding.right) * scale;
                    const safeH = height - (padding.top + padding.bottom) * scale;
                    const safe = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    safe.setAttribute("x", safeX);
                    safe.setAttribute("y", safeY);
                    safe.setAttribute("width", safeW);
                    safe.setAttribute("height", safeH);
                    safe.setAttribute("fill", "rgba(45, 45, 45, 0.05)");
                    safe.setAttribute("stroke", "#9d9d9d");
                    safe.setAttribute("stroke-width", 1);
                    safe.setAttribute("stroke-dasharray", "4 2");
                    svgElement.appendChild(safe);
                }

                // positions the viewer container over the safe drawable
                // area so that text renders inside the viewport preview
                const safeX = padding.left * scale;
                const safeY = padding.top * scale;
                const safeW = width - (padding.left + padding.right) * scale;
                const safeH = height - (padding.top + padding.bottom) * scale;
                container.css({
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
                calligraphyContainer.css({
                    position: "absolute",
                    left: safeX + "px",
                    top: safeY + "px",
                    width: safeW + "px",
                    height: safeH + "px"
                });

                // applies the background image behind the viewport so that
                // the user can preview the engraving on a realistic surface
                if (profile.background) {
                    context.css({
                        "background-image": "url('/static/profiles/" + profile.background + "')",
                        "background-size": width + "px " + height + "px",
                        "background-repeat": "no-repeat",
                        "background-position": "0px 0px"
                    });
                } else {
                    context.css({
                        "background-image": "",
                        "background-size": "",
                        "background-repeat": "",
                        "background-position": ""
                    });
                }

                context.css({ width: width + "px", height: height + "px" });
                context.addClass("profile-active");
                return;
            }

            // renders the horizontal and vertical rulers adjacent to
            // the viewport preview based on the profile dimensions
            if (action === "rulers") {
                const profile = options.profile;
                const scale = options.scale;
                const showRulers = options.showRulers !== false;

                rulerHorizontal.empty();
                rulerVertical.empty();

                if (!profile) return;

                const width = profile.width * scale;
                const height = profile.height * scale;
                const unit = profile.unit || "mm";
                const step = 5;

                rulerHorizontal.css("width", width + "px");
                rulerVertical.css("height", height + "px");

                for (let mm = 0; mm <= profile.width; mm += step) {
                    const px = mm * scale;
                    const isMajor = mm % 10 === 0;
                    const tick = jQuery('<div class="ruler-tick"></div>');
                    tick.addClass(isMajor ? "major" : "minor");
                    tick.css("left", px + "px");
                    tick.append('<div class="ruler-line"></div>');
                    if (isMajor) {
                        tick.append('<span class="ruler-label">' + mm + "</span>");
                    }
                    rulerHorizontal.append(tick);
                }
                rulerHorizontal.append('<span class="ruler-unit">' + unit + "</span>");

                for (let mm = 0; mm <= profile.height; mm += step) {
                    const px = mm * scale;
                    const isMajor = mm % 10 === 0;
                    const tick = jQuery('<div class="ruler-tick"></div>');
                    tick.addClass(isMajor ? "major" : "minor");
                    tick.css("top", px + "px");
                    tick.append('<div class="ruler-line"></div>');
                    if (isMajor) {
                        tick.append('<span class="ruler-label">' + mm + "</span>");
                    }
                    rulerVertical.append(tick);
                }
                rulerVertical.append('<span class="ruler-unit">' + unit + "</span>");

                // applies the current rulers visibility based on
                // the provided showRulers option
                if (!showRulers) {
                    rulerHorizontal.hide();
                    rulerVertical.hide();
                }
                return;
            }

            // applies the given zoom level using a CSS transform
            // to scale the viewport preview and compensating the
            // layout margins for the scaled size
            if (action === "zoom") {
                const zoom = options.zoom || 1;
                const width = parseFloat(context.css("width")) || 0;
                const height = parseFloat(context.css("height")) || 0;
                const extraWidth = width * (zoom - 1);
                const extraHeight = height * (zoom - 1);
                context.css({
                    transform: "scale(" + zoom + ")",
                    "-o-transform": "scale(" + zoom + ")",
                    "-ms-transform": "scale(" + zoom + ")",
                    "-moz-transform": "scale(" + zoom + ")",
                    "-khtml-transform": "scale(" + zoom + ")",
                    "-webkit-transform": "scale(" + zoom + ")",
                    "margin-bottom": 16 * zoom + extraHeight + "px",
                    "margin-right": extraWidth + "px"
                });
            }
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
    const viewportOptions = jQuery(".viewport-options");
    const profileInfo = jQuery(".profile-info");
    const profileInfoDimensions = jQuery(".profile-info-dimensions");
    const profileInfoOrientation = jQuery(".profile-info-orientation");
    const profileInfoLines = jQuery(".profile-info-lines");
    const profileInfoRawToggle = jQuery(".profile-info-raw-toggle");
    const profileInfoRaw = jQuery(".profile-info-raw");
    const profileSelector = jQuery(".viewport-options-body");
    const profileInfoTitle = jQuery(".profile-info-title");
    const viewportOptionsInstructions = jQuery(".viewport-options-instructions");
    const modalOverlayInstructions = jQuery(".modal-overlay-instructions");
    const modalInstructionsTitle = jQuery(".modal-instructions-title");
    const modalInstructionsDescription = jQuery(".modal-instructions-description");
    const modalInstructionsImages = jQuery(".modal-instructions-images");

    // registers for the click operation on the raw profile
    // toggle link to show or hide the formatted JSON contents
    profileInfoRawToggle.click(function(event) {
        event.preventDefault();
        const visible = profileInfoRaw.is(":visible");
        if (visible) {
            profileInfoRaw.hide();
            profileInfoRawToggle.text("Show Raw");
        } else {
            profileInfoRaw.show();
            profileInfoRawToggle.text("Hide Raw");
        }
    });

    // registers for the click operation on the instructions
    // link to open the instructions modal for the current profile
    viewportOptionsInstructions.click(function(event) {
        event.preventDefault();
        if (!currentProfile || !currentProfile.instructions) return;
        const instructions = currentProfile.instructions;
        modalInstructionsTitle.text(instructions.title || "Instructions");
        modalInstructionsDescription.text(instructions.description || "");
        modalInstructionsImages.empty();
        const images = instructions.images || [];
        for (let i = 0; i < images.length; i++) {
            const img = jQuery("<img />");
            img.attr("src", images[i]);
            img.attr("alt", (instructions.title || "Instructions") + " " + (i + 1));
            modalInstructionsImages.append(img);
        }
        modalOverlayInstructions.modal("show");
    });

    // initializes the collapsible panel plugin on the
    // profile info and viewport options panels
    profileInfo.collapsiblepanel();
    viewportOptions.collapsiblepanel();

    // initializes the profile selector plugin on the
    // profile and variant dropdown container
    profileSelector.profileselector();

    const fontSizeContainer = jQuery(".font-size-container");
    const fontSizeRange = jQuery(".font-size-range");
    const fontSizeInput = jQuery(".font-size-input");
    const fontSizeMode = jQuery(".font-size-mode");
    const viewportPreview = jQuery(".viewport > .main-container > .viewport-preview");
    const viewportSvg = jQuery(".viewport-svg");
    const rulerHorizontal = jQuery(".ruler-horizontal");
    const rulerVertical = jQuery(".ruler-vertical");
    const rulersMode = jQuery(".rulers-mode");
    const viewportOptionsRulers = jQuery(".viewport-options-rulers");
    const crosshairMode = jQuery(".crosshair-mode");
    const viewportOptionsCrosshair = jQuery(".viewport-options-crosshair");
    const keyboardMode = jQuery(".keyboard-mode");
    const guidelinesMode = jQuery(".guidelines-mode");
    const viewportOptionsGuidelines = jQuery(".viewport-options-guidelines");
    const caretMode = jQuery(".caret-mode");
    const viewportOptionsCaret = jQuery(".viewport-options-caret");
    const zoomContainer = jQuery(".zoom-container");
    const zoomRange = jQuery(".zoom-range");
    const zoomValue = jQuery(".zoom-value");
    const crosshairHorizontal = jQuery(".crosshair-horizontal");
    const crosshairVertical = jQuery(".crosshair-vertical");
    const positionContainer = jQuery(".position-container");
    const positionValue = jQuery(".position-value");
    const marginContainer = jQuery(".margin-container");
    const marginLeft = jQuery(".margin-left");
    const marginRight = jQuery(".margin-right");
    const marginTop = jQuery(".margin-top");
    const marginBottom = jQuery(".margin-bottom");
    const fontsContainer = jQuery(".fonts-container");
    const keyboardContainer = jQuery(".keyboard-container");
    const emojisContainer = jQuery(".emojis-container");
    const emojispContainer = jQuery(".emojisp-container");
    const viewportContainer = jQuery(".viewer-container");
    const calligraphyContainer = jQuery(".calligraphy-container");
    const calligraphyMode = jQuery(".calligraphy-mode");
    const calligraphyModeContainer = jQuery(".calligraphy-mode-container");
    const calligraphyControls = jQuery(".calligraphy-controls");
    const calligraphyUndo = jQuery(".calligraphy-undo");
    const calligraphyClear = jQuery(".calligraphy-clear");
    const formConsole = jQuery(".form-console");
    const inputViewport = jQuery(".input-viewport");
    const signature = jQuery(".signature");
    const modalOverlayError = jQuery(".modal-overlay-error");
    const modalOverlayConfirm = jQuery(".modal-overlay-confirm");
    const modalOverlayConfig = jQuery(".modal-overlay-config");
    const modalOverlayInspirations = jQuery(".modal-overlay-inspirations");
    const inspirationPanel = jQuery(".inspiration-panel");
    const toast = jQuery(".toast");

    // gathers the values for the form related fields so that the
    // typical form validations and changes may be performed
    const technologyRadios = jQuery("input[name=technology]");
    const technologySelected = jQuery("input[name=technology]:checked");
    const elementsE = jQuery("[id=elements]");
    const locationE = jQuery("[id=location]");
    const elementsChild = jQuery("> *", elementsE);
    const locationChild = jQuery("> *", locationE);

    // loads the cool emojis mapping from the static fonts
    // directory to resolve emoji characters to font names
    let emojiMapping = {};
    jQuery.getJSON("/static/fonts/coolemojis.mapping.json", function(data) {
        emojiMapping = data;
        emojisContainer.find(".char[data-value]").each(function() {
            const element = jQuery(this);
            const value = element.attr("data-value");
            const font = emojiMapping[value];
            if (font) element.attr("title", font);
        });
        restoreText();
    });

    // gathers the currently selected theme information
    // to be used to change the current visual style
    const theme = body.attr("data-theme") || "default";

    // tries to retrieve the master configuration information
    // base 64 JSON dictionary and parses it
    const masterb64 = body.attr("data-master") || "";
    const master = JSON.parse(atob(masterb64) || "{}");

    // parses the current URL query parameters so that they
    // can be used to restore state on page load
    const urlParams = new URLSearchParams(window.location.search);

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
        const textData = body.data("text") || [];

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

        // verifies that the text does not contain any unsupported
        // fonts that cannot be sent to colony-print for engraving
        if (hasUnsupportedFont(textData)) {
            modalOverlayError.modal(
                "show",
                "Cool Emojis Pantograph is not supported for engraving."
            );
            return;
        }

        // builds the specs object that summarizes the current
        // printing configuration for user confirmation
        const multifont = element.data("multifont") || [];
        const specs = {
            text: text || "(empty)",
            multifont: multifont,
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
            specs.font_size = fontSizeInput.val() + (unit ? " " + unit : "");
            const margins = getMargins();
            specs.margins =
                margins.left +
                ", " +
                margins.right +
                ", " +
                margins.top +
                ", " +
                margins.bottom +
                (unit ? " " + unit : "");
            const extraPadding = currentProfile.extra_padding;
            if (extraPadding) {
                specs.extra_padding =
                    extraPadding.left +
                    ", " +
                    extraPadding.right +
                    ", " +
                    extraPadding.top +
                    ", " +
                    extraPadding.bottom +
                    (unit ? " " + unit : "");
                const finalWidth = width + (extraPadding.left || 0) + (extraPadding.right || 0);
                const finalHeight = height + (extraPadding.top || 0) + (extraPadding.bottom || 0);
                specs.final_viewport = finalWidth + " x " + finalHeight + (unit ? " " + unit : "");
            }
            if (currentProfile.instructions) {
                specs.instructions =
                    currentProfile.instructions.title ||
                    currentProfile.instructions.description ||
                    "See instructions";
            }
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

    // correction factor applied to the font size to compensate
    // for the difference between CSS em-square and visual cap height
    const FONT_SIZE_SCALE = 1.3;

    // stores the currently selected profile and the loaded
    // profiles dictionary for later reference
    let currentProfile = null;
    let profiles = {};

    // if the restoring flag is true, the URL update function will
    // ignore the call to prevent overwriting the URL state during
    // the initial restore process on page load, allowing the URL
    // parameters to properly set the initial state of the app
    let restoring = false;

    // fetches the available profiles from the server and
    // populates the profile dropdown with the results
    const loadProfiles = async function() {
        try {
            const response = await fetch("/profiles");
            if (response.status !== 200) return;
            profiles = await response.json();
            const keys = Object.keys(profiles);
            if (keys.length === 0) return;
            profileSelector.profileselector("load", { profiles: profiles });
            viewportOptions.addClass("visible");
            modalOverlayConfirm.data("profiles", profiles);

            // restores the session state from the URL query
            // parameters, suppressing URL updates during restore
            restoring = true;
            const urlProfile = urlParams.get("profile");
            if (urlProfile && profiles[urlProfile]) {
                const urlVariant = urlParams.get("variant");
                profileSelector.profileselector("select", {
                    profile: urlProfile,
                    variant: urlVariant !== null ? urlVariant : undefined
                });
            }

            // restores the margin values from the URL query
            // parameters if they were previously saved
            const urlMargins = urlParams.get("margins");
            if (urlMargins) {
                const parts = urlMargins.split(",");
                if (parts.length === 4) {
                    marginLeft.val(parts[0]);
                    marginRight.val(parts[1]);
                    marginTop.val(parts[2]);
                    marginBottom.val(parts[3]);
                    renderViewportPreview(currentProfile);
                }
            }

            // restores the font size mode and value from the
            // URL query parameters if they were previously saved
            const urlFontSizeMode = urlParams.get("font_size_mode");
            if (urlFontSizeMode === "automatic") {
                fontSizeMode.prop("checked", true);
                fontSizeInput.prop("disabled", true);
            }
            const urlFontSize = urlParams.get("font_size");
            if (urlFontSize) {
                fontSizeRange.val(urlFontSize);
                fontSizeInput.val(urlFontSize);
            }
            applyFontSize();

            // restores the zoom level from the URL query
            // parameters if it was previously saved
            const urlZoom = urlParams.get("zoom");
            if (urlZoom) {
                zoomRange.val(urlZoom);
                applyZoom();
            }

            // restores the rulers visibility from the URL
            // query parameters if it was previously saved
            const urlRulers = urlParams.get("rulers");
            if (urlRulers === "0") {
                rulersMode.prop("checked", false);
                rulerHorizontal.hide();
                rulerVertical.hide();
            }

            // restores the crosshair visibility from the URL
            // query parameters if it was previously saved
            const urlCrosshair = urlParams.get("crosshair");
            if (urlCrosshair === "0") {
                crosshairMode.prop("checked", false);
            }

            // restores the keyboard visibility from the URL
            // query parameters if it was previously saved
            const urlKeyboard = urlParams.get("keyboard");
            if (urlKeyboard === "0") {
                keyboardMode.prop("checked", false);
            }

            // restores the guidelines visibility from the URL
            // query parameters if it was previously saved
            const urlGuidelines = urlParams.get("guidelines");
            if (urlGuidelines === "0") {
                guidelinesMode.prop("checked", false);
                viewportSvg.hide();
            }

            // restores the caret visibility from the URL
            // query parameters if it was previously saved
            const urlCaret = urlParams.get("caret");
            if (urlCaret === "0") {
                caretMode.prop("checked", false);
                viewportContainer.find("> .caret").hide();
                viewportContainer.removeClass("caret-active");
            }
            restoring = false;
            updateUrl();
        } catch (err) {
            restoring = false;
            // silently ignores profile loading errors
        }
    };

    // retrieves the current margin values from the margin
    // input fields returning a padding-like object in mm
    const getMargins = function() {
        return {
            left: parseFloat(marginLeft.val()) || 0,
            right: parseFloat(marginRight.val()) || 0,
            top: parseFloat(marginTop.val()) || 0,
            bottom: parseFloat(marginBottom.val()) || 0
        };
    };

    // populates the margin input fields with the default
    // padding values from the given profile definition
    const populateMargins = function(profile) {
        if (!profile) return;
        const padding = profile.padding || { top: 0, right: 0, bottom: 0, left: 0 };
        marginLeft.val(padding.left);
        marginRight.val(padding.right);
        marginTop.val(padding.top);
        marginBottom.val(padding.bottom);
    };

    // renders the viewport preview using the viewport preview
    // plugin with the current profile and margin configuration
    const renderViewportPreview = function(profile) {
        viewportPreview.viewportpreview("render", {
            profile: profile,
            scale: VIEWPORT_SCALE,
            padding: getMargins()
        });
    };

    // renders the rulers using the viewport preview plugin
    // with the current profile and rulers visibility state
    const renderRulers = function(profile) {
        viewportPreview.viewportpreview("rulers", {
            profile: profile,
            scale: VIEWPORT_SCALE,
            showRulers: rulersMode.prop("checked")
        });
    };

    // applies the current zoom level from the zoom slider
    // using the viewport preview plugin to scale the preview
    const applyZoom = function() {
        const zoom = parseFloat(zoomRange.val()) || 1;
        zoomValue.text(zoom + "x");
        viewportPreview.viewportpreview("zoom", { zoom: zoom });
    };

    // applies an inspiration configuration to the viewport
    // setting the text, font size, margins, and font selection
    const applyInspiration = function(profile, inspiration) {
        // expands the inspiration text entries into individual
        // character pairs so that each character gets its own
        // DOM element for per-character caret navigation
        const text = [];
        const raw = inspiration.text || [];
        for (let i = 0; i < raw.length; i++) {
            const font = raw[i][0];
            const value = raw[i][1];
            if (value === "\n") {
                text.push([font, "\n"]);
            } else {
                for (let j = 0; j < value.length; j++) {
                    text.push([font, value[j]]);
                }
            }
        }

        // loads the expanded text into the editor which
        // rebuilds the DOM and sets the caret position
        viewportContainer.texteditor("loadText", { text: text });

        // determines the primary font from the text entries
        // and skips the preset if the font is not available
        let primaryFont = null;
        for (let i = 0; i < text.length; i++) {
            if (text[i][0] !== null) {
                primaryFont = text[i][0];
                break;
            }
        }
        if (primaryFont) {
            const fontElement = fontsContainer.find('.font[data-font="' + primaryFont + '"]');
            if (fontElement.length === 0) return;
            if (!fontElement.hasClass("active")) fontElement.click();
        }

        // applies the font size from the inspiration and
        // forces manual mode so automatic sizing does not
        // overwrite the inspiration value
        if (inspiration.font_size) {
            fontSizeMode.prop("checked", false);
            fontSizeRange.prop("disabled", false);
            fontSizeInput.prop("disabled", false);
            fontSizeRange.val(inspiration.font_size);
            fontSizeInput.val(inspiration.font_size);
        }

        // applies the padding from the inspiration or falls
        // back to the profile defaults to keep the viewport
        // consistent with the thumbnail preview
        const padding = inspiration.padding ||
            profile.padding || { top: 0, right: 0, bottom: 0, left: 0 };
        marginLeft.val(padding.left);
        marginRight.val(padding.right);
        marginTop.val(padding.top);
        marginBottom.val(padding.bottom);
        renderViewportPreview(profile);

        // applies the text alignment from the inspiration
        // to match the thumbnail preview layout
        if (inspiration.align) {
            const justify =
                inspiration.align === "center"
                    ? "center"
                    : inspiration.align === "right"
                    ? "flex-end"
                    : "flex-start";
            viewportContainer.css("text-align", inspiration.align);
            viewportContainer.css("justify-content", justify);
        }

        // applies the font size and recalculates layout
        applyFontSize();

        // updates the print button and report URL
        updateButtonState(text);
        updateUrl();
    };

    // updates the floating profile info block with the
    // currently selected profile summary information
    const updateProfileInfo = function(profile) {
        if (!profile) {
            profileInfo.removeClass("visible");
            profileInfoRaw.hide();
            profileInfoRawToggle.text("Show Raw");
            profileInfoTitle.contents().first().replaceWith("Profile ");
            viewportOptionsInstructions.removeClass("visible");
            return;
        }

        const unit = profile.unit || "";
        profileInfoTitle
            .contents()
            .first()
            .replaceWith(profile.name + " ");
        profileInfoDimensions.text(
            profile.width + " x " + profile.height + (unit ? " " + unit : "")
        );
        profileInfoOrientation.text(profile.orientation || "");
        const text = profile.text || {};
        const maxLines = text.max_lines || 0;
        if (maxLines > 0) {
            profileInfoLines.text("max " + maxLines + (maxLines === 1 ? " line" : " lines"));
        } else {
            profileInfoLines.text("");
        }
        profileInfoRaw.text(JSON.stringify(profile, null, 4));
        profileInfoRaw.hide();
        profileInfoRawToggle.text("Show Raw");
        profileInfo.addClass("visible");
        if (profile.instructions) {
            viewportOptionsInstructions.addClass("visible");
        } else {
            viewportOptionsInstructions.removeClass("visible");
        }
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
        fontSizeInput.prop("disabled", isAutomatic);

        const min = fs.min !== undefined ? fs.min : 4;
        const max = fs.max !== undefined ? fs.max : 36;
        const step = fs.step !== undefined ? fs.step : 1;
        fontSizeRange.attr("min", min);
        fontSizeRange.attr("max", max);
        fontSizeRange.attr("step", step);
        fontSizeInput.attr("min", min);
        fontSizeInput.attr("max", max);
        fontSizeInput.attr("step", step);
        if (fs.default !== undefined) {
            fontSizeRange.val(fs.default);
            fontSizeInput.val(fs.default);
        }

        fontSizeContainer.addClass("visible");
    };

    // calculates the automatic font size to fit the current
    // text content within the safe drawable area of the profile
    const calculateAutoFontSize = function(profile) {
        if (!profile || !profile.font_size) return null;

        const fs = profile.font_size;
        const padding = getMargins();
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
                fontSizeInput.val(size);
            }
        } else {
            size = parseFloat(fontSizeInput.val());
        }

        if (size) {
            const scaledSize = size * VIEWPORT_SCALE * FONT_SIZE_SCALE;
            viewportContainer.css("font-size", scaledSize + "px");
            viewportContainer.css("line-height", Math.round(scaledSize * 1.2) + "px");
        }
    };

    // refreshes the viewport and controls based on the
    // currently selected profile and variant combination
    const refreshProfile = function() {
        if (currentProfile) {
            populateMargins(currentProfile);
            const defaultZoom = currentProfile.preview ? currentProfile.preview.zoom || 1 : 1;
            zoomRange.val(defaultZoom);
            marginContainer.addClass("visible");
            viewportOptionsRulers.addClass("visible");
            viewportOptionsCrosshair.addClass("visible");
            viewportOptionsGuidelines.addClass("visible");
            viewportOptionsCaret.addClass("visible");
            zoomContainer.addClass("visible");
            positionContainer.addClass("visible");
            calligraphyModeContainer.addClass("visible");
        } else {
            marginContainer.removeClass("visible");
            viewportOptionsRulers.removeClass("visible");
            viewportOptionsCrosshair.removeClass("visible");
            viewportOptionsGuidelines.removeClass("visible");
            viewportOptionsCaret.removeClass("visible");
            zoomContainer.removeClass("visible");
            positionContainer.removeClass("visible");
            calligraphyModeContainer.removeClass("visible");
            calligraphyControls.removeClass("visible");
        }
        // resets calligraphy mode when switching profiles
        // since the canvas dimensions change with the profile
        calligraphyMode.prop("checked", false);
        viewportPreview.removeClass("calligraphy-active");
        calligraphyControls.removeClass("visible");
        calligraphyContainer.calligraphy("reset");
        body.data("calligraphy", null);

        const textConfig = currentProfile ? currentProfile.text || {} : {};
        const maxLines = currentProfile ? textConfig.max_lines || 0 : 1;
        viewportContainer.texteditor("option", { maxLines: maxLines });
        renderViewportPreview(currentProfile);
        renderRulers(currentProfile);
        applyZoom();
        updateProfileInfo(currentProfile);
        updateFontSizeControls(currentProfile);
        applyFontSize();
        inspirationPanel.inspirationpanel("update", currentProfile);
    };

    // registers for the change event from the profile selector
    // plugin to update the viewport and controls when the profile
    // or variant selection changes
    profileSelector.bind("profile", function(event, profile) {
        currentProfile = profile;
        refreshProfile();
        updateUrl();
    });

    // registers for the change in the font size range slider
    // to sync the number input and apply the new size
    fontSizeRange.bind("input", function() {
        fontSizeInput.val(jQuery(this).val());
        applyFontSize();
        updateUrl();
    });

    // registers for the change in the font size number input
    // to sync the range slider and apply the new size
    fontSizeInput.bind("input", function() {
        fontSizeRange.val(jQuery(this).val());
        applyFontSize();
        updateUrl();
    });

    // registers for the change in the font size mode checkbox
    // to toggle between manual and automatic sizing modes
    fontSizeMode.bind("change", function() {
        const isAutomatic = jQuery(this).prop("checked");
        fontSizeInput.prop("disabled", isAutomatic);
        applyFontSize();
        updateUrl();
    });

    // registers for the change in the rulers mode checkbox
    // to toggle the visibility of the viewport rulers
    rulersMode.bind("change", function() {
        const showRulers = jQuery(this).prop("checked");
        if (showRulers) {
            rulerHorizontal.show();
            rulerVertical.show();
        } else {
            rulerHorizontal.hide();
            rulerVertical.hide();
        }
        updateUrl();
    });

    // registers for the change in the zoom range slider
    // to apply the zoom transform to the viewport preview
    zoomRange.bind("input", function() {
        applyZoom();
        updateUrl();
    });

    // registers for the change in the margin input fields
    // to re-render the viewport preview in real time
    jQuery(".margin-input").bind("input", function() {
        renderViewportPreview(currentProfile);
        applyFontSize();
        updateUrl();
    });

    // registers for the change in the crosshair mode checkbox
    // to toggle the visibility of the viewport crosshair lines
    crosshairMode.bind("change", function() {
        if (!crosshairMode.prop("checked")) {
            viewportPreview.removeClass("crosshair-active");
            positionValue.text("-");
        }
        updateUrl();
    });

    // registers for the change in the keyboard mode checkbox
    // to toggle the visibility of the visual keyboard
    keyboardMode.bind("change", function() {
        const showKeyboard = keyboardMode.prop("checked");
        if (showKeyboard) {
            const font = body.data("font");
            if (font === "Cool Emojis") {
                emojisContainer.show();
            } else if (font === "Cool Emojis Pantograph") {
                emojispContainer.show();
            } else if (font) {
                keyboardContainer.show();
            }
        } else {
            keyboardContainer.hide();
            emojisContainer.hide();
            emojispContainer.hide();
        }
        updateUrl();
    });

    // registers for the change in the guidelines mode checkbox
    // to toggle the visibility of the viewport SVG guidelines
    guidelinesMode.bind("change", function() {
        const showGuidelines = guidelinesMode.prop("checked");
        if (showGuidelines) {
            viewportSvg.show();
        } else {
            viewportSvg.hide();
        }
        updateUrl();
    });

    // registers for the change in the caret mode checkbox
    // to toggle the visibility of the blinking caret
    caretMode.bind("change", function() {
        const showCaret = caretMode.prop("checked");
        const caret = viewportContainer.find("> .caret");
        if (showCaret) {
            caret.show();
            viewportContainer.addClass("caret-active");
        } else {
            caret.hide();
            viewportContainer.removeClass("caret-active");
        }
        updateUrl();
    });

    // initializes the calligraphy canvas inside the viewport
    // preview at the zoomed pixel size so that jSignature mouse
    // coordinates match screen space, then applies a counter-scale
    // to fit within the viewport preview transform
    const initCalligraphy = function() {
        if (!currentProfile) return;
        const padding = getMargins();
        const safeW = (currentProfile.width - padding.left - padding.right) * VIEWPORT_SCALE;
        const safeH = (currentProfile.height - padding.top - padding.bottom) * VIEWPORT_SCALE;
        const zoom = parseFloat(zoomRange.val()) || 1;
        const lineWidth = currentProfile.calligraphy
            ? currentProfile.calligraphy.line_width || 2 : 2;
        calligraphyContainer.calligraphy("init", {
            width: Math.round(safeW * zoom),
            height: Math.round(safeH * zoom),
            lineWidth: lineWidth * zoom
        });
        calligraphyContainer.css({
            transform: "scale(" + (1 / zoom) + ")",
            "-o-transform": "scale(" + (1 / zoom) + ")",
            "-ms-transform": "scale(" + (1 / zoom) + ")",
            "-moz-transform": "scale(" + (1 / zoom) + ")",
            "-khtml-transform": "scale(" + (1 / zoom) + ")",
            "-webkit-transform": "scale(" + (1 / zoom) + ")",
            "transform-origin": "0px 0px",
            "-o-transform-origin": "0px 0px",
            "-ms-transform-origin": "0px 0px",
            "-moz-transform-origin": "0px 0px",
            "-khtml-transform-origin": "0px 0px",
            "-webkit-transform-origin": "0px 0px"
        });
    };

    // registers for the change in the calligraphy mode checkbox
    // to toggle between text editing and calligraphy drawing
    calligraphyMode.bind("change", function() {
        const enabled = calligraphyMode.prop("checked");
        if (enabled) {
            viewportPreview.addClass("calligraphy-active");
            fontsContainer.hide();
            keyboardContainer.hide();
            emojisContainer.hide();
            emojispContainer.hide();
            fontSizeContainer.removeClass("visible");
            calligraphyControls.addClass("visible");
            zoomRange.prop("disabled", true);
            initCalligraphy();
            body.data("calligraphy", null);
        } else {
            viewportPreview.removeClass("calligraphy-active");
            calligraphyControls.removeClass("visible");
            zoomRange.prop("disabled", false);
            calligraphyContainer.calligraphy("reset");
            body.data("calligraphy", null);
            const font = body.data("font");
            if (font) {
                fontsContainer.show();
                const showKeyboard = keyboardMode.prop("checked");
                if (showKeyboard) {
                    if (font === "Cool Emojis") {
                        emojisContainer.show();
                    } else if (font === "Cool Emojis Pantograph") {
                        emojispContainer.show();
                    } else {
                        keyboardContainer.show();
                    }
                }
            } else {
                fontsContainer.show();
            }
            if (currentProfile && currentProfile.font_size) {
                fontSizeContainer.addClass("visible");
            }
        }
        updateUrl();
    });

    // registers for the change event from the calligraphy
    // canvas to store the SVG data in the body element
    calligraphyContainer.bind("calligraphy", function(event, hasData) {
        if (hasData) {
            const data = calligraphyContainer.calligraphy("data");
            body.data("calligraphy", data);
        } else {
            body.data("calligraphy", null);
        }
    });

    // registers for the click on the calligraphy undo button
    // to remove the last stroke from the drawing
    calligraphyUndo.click(function() {
        calligraphyContainer.calligraphy("undo");
    });

    // registers for the click on the calligraphy clear button
    // to reset the entire drawing canvas
    calligraphyClear.click(function() {
        calligraphyContainer.calligraphy("reset");
        body.data("calligraphy", null);
    });

    // registers for the mouse move event on the viewport preview
    // to display crosshair lines and update the position readout
    viewportPreview.bind("mousemove", function(event) {
        if (!currentProfile) return;
        const offset = viewportPreview.offset();
        const zoom = parseFloat(zoomRange.val()) || 1;
        const x = (event.pageX - offset.left) / zoom;
        const y = (event.pageY - offset.top) / zoom;
        const mmX = (x / VIEWPORT_SCALE).toFixed(1);
        const mmY = (y / VIEWPORT_SCALE).toFixed(1);
        const unit = currentProfile.unit || "mm";
        if (crosshairMode.prop("checked")) {
            crosshairHorizontal.css("top", y + "px");
            crosshairVertical.css("left", x + "px");
            viewportPreview.addClass("crosshair-active");
        }
        positionValue.text("X " + mmX + " " + unit + "  Y " + mmY + " " + unit);
    });

    // registers for the mouse leave event on the viewport preview
    // to hide the crosshair lines and clear the position readout
    viewportPreview.bind("mouseleave", function() {
        viewportPreview.removeClass("crosshair-active");
        positionValue.text("-");
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
        const showKeyboard = keyboardMode.prop("checked");
        keyboardContainer.removeClass("selected");
        emojisContainer.removeClass("selected");
        emojispContainer.removeClass("selected");
        if (font === "Cool Emojis") {
            keyboardContainer.hide();
            emojispContainer.hide();
            if (showKeyboard) emojisContainer.show();
            emojisContainer.addClass("selected");
        } else if (font === "Cool Emojis Pantograph") {
            keyboardContainer.hide();
            emojisContainer.hide();
            if (showKeyboard) emojispContainer.show();
            emojispContainer.addClass("selected");
        } else {
            emojisContainer.hide();
            emojispContainer.hide();
            if (showKeyboard) keyboardContainer.show();
            keyboardContainer.addClass("selected");
        }
        keyboardContainer.css("font-family", '"' + font + '"');
        inputViewport.css("font-family", '"' + font + '"');
        body.data("font", font);
        updateUrl();
    });
    fontsContainer.bind("defont", function(event, font) {
        keyboardContainer.hide();
        emojisContainer.hide();
        emojispContainer.hide();
        keyboardContainer.removeClass("selected");
        emojisContainer.removeClass("selected");
        emojispContainer.removeClass("selected");
        body.data("font", null);
        updateUrl();
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

    // helper function to update the print button and report
    // URL with the current text state for engraving submission
    const updateButtonState = function(text) {
        const [textSimple, font] = simplifyText(text);
        buttonPrint.attr("data-text", textSimple);
        buttonPrint.attr("data-font", font);
        buttonPrint.data("multifont", multifontText(text, emojiMapping));
        const buttonHref = buttonReport.attr("data-href");
        buttonReport.attr("href", buttonHref + "?text=" + encodeURIComponent(serializeText(text)));
    };

    // updates the browser URL with the current session state
    // using history.replaceState so that the URL can be shared
    // or bookmarked to resume an engraving session later
    const updateUrl = function() {
        if (restoring) return;
        const params = new URLSearchParams();
        const text = body.data("text") || [];
        if (text.length > 0) params.set("text", serializeText(text));
        const font = body.data("font");
        if (font) params.set("font", font);
        const selection = profileSelector.profileselector("value");
        if (selection && selection.key) {
            params.set("profile", selection.key);
            if (selection.variantIndex !== null && selection.variantIndex !== 0) {
                params.set("variant", selection.variantIndex);
            }
        }
        const fontSize = fontSizeInput.val();
        if (fontSize) params.set("font_size", fontSize);
        const isAutomatic = fontSizeMode.prop("checked");
        if (isAutomatic) params.set("font_size_mode", "automatic");
        const zoom = zoomRange.val();
        if (zoom && zoom !== "1") params.set("zoom", zoom);
        const margins = getMargins();
        const marginStr =
            margins.left + "," + margins.right + "," + margins.top + "," + margins.bottom;
        if (marginStr !== "0,0,0,0") params.set("margins", marginStr);
        const showRulers = rulersMode.prop("checked");
        if (!showRulers) params.set("rulers", "0");
        const showCrosshair = crosshairMode.prop("checked");
        if (!showCrosshair) params.set("crosshair", "0");
        const showKeyboard = keyboardMode.prop("checked");
        if (!showKeyboard) params.set("keyboard", "0");
        const showGuidelines = guidelinesMode.prop("checked");
        if (!showGuidelines) params.set("guidelines", "0");
        const showCaret = caretMode.prop("checked");
        if (!showCaret) params.set("caret", "0");
        const fullscreen = urlParams.get("fullscreen");
        if (fullscreen === "1") params.set("fullscreen", "1");
        if (theme !== "default") params.set("theme", theme);
        const query = params.toString();
        const url = window.location.pathname + (query ? "?" + query : "");
        history.replaceState(null, "", url);
    };

    // restores the font selection from the URL query
    // parameters by clicking the matching font element
    const restoreFont = function() {
        const urlFont = urlParams.get("font");
        if (!urlFont) return;
        const fontElement = fontsContainer.find('.font[data-font="' + urlFont + '"]');
        if (fontElement.length > 0) fontElement.click();
    };

    // initializes the text data array from server-rendered
    // content so that the session state is fully restored
    const restoreText = function() {
        const initialText = viewportContainer.attr("data-text");
        if (!initialText) return;
        const textData = deserializeText(initialText);
        if (!textData || textData.length === 0) return;
        body.data("text", textData);
        body.data("caret_position", textData.length - 1);
        viewportContainer.texteditor("bindExisting");
        updateButtonState(textData);
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

    modalOverlayError.modal();
    modalOverlayConfirm.modal();
    modalOverlayConfig.modal();
    modalOverlayInspirations.modal();
    modalOverlayInstructions.modal();
    toast.toast();

    // initializes the text editor plugin on the viewer container
    // and binds the change event to update button state and URL
    viewportContainer.texteditor();
    viewportContainer.texteditor("option", { maxLines: 1 });
    viewportContainer.bind("change", function(event, text) {
        updateButtonState(text);
        if (currentProfile && fontSizeMode.prop("checked")) {
            applyFontSize();
        }
        updateUrl();
    });

    // initializes the inspiration panel plugin and binds the
    // apply event to set the viewport text and configuration
    inspirationPanel.inspirationpanel({
        viewport_scale: VIEWPORT_SCALE,
        font_size_scale: FONT_SIZE_SCALE
    });
    inspirationPanel.bind("apply", function(event, inspiration) {
        if (inspiration && currentProfile) {
            applyInspiration(currentProfile, inspiration);
        }
    });

    formConsole.formconsole();

    restoreFont();
});
