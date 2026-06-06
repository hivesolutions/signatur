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
     *             canvas with the given width, height, line width,
     *             and optional resolution multiplier that upscales
     *             the canvas backing store for sharper strokes
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
                const resolution = options.resolution || 1;

                // captures the existing stroke data and the canvas
                // dimensions that produced it so the previous drawing
                // can be replayed after the canvas is recreated at the
                // new width and height, scaling the stroke coordinates
                // to keep the shape consistent across variant, zoom,
                // and thickness changes; the stroke data lives on the
                // canvas element via the `jSignature.data` jQuery data
                // key set by the plugin during initialization
                let previousData = null;
                let previousWidth = 0;
                let previousHeight = 0;
                if (context.data("_calligraphy_initialized")) {
                    const previousCanvas = context.find("canvas");
                    previousData =
                        previousCanvas.length > 0
                            ? previousCanvas.data("jSignature.data") || null
                            : null;
                    previousWidth = context.data("_calligraphy_width") || 0;
                    previousHeight = context.data("_calligraphy_height") || 0;
                    context.empty();
                    context.data("_calligraphy_initialized", false);
                }
                const restoredData = scaleStrokes(
                    previousData,
                    previousWidth,
                    previousHeight,
                    width,
                    height
                );

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
                context.data("_calligraphy_width", width);
                context.data("_calligraphy_height", height);

                // upscales the canvas backing store while keeping the
                // css width and height pinned to the original values
                // so that strokes render at the higher pixel density
                // without breaking the jQuery offset based coordinate
                // math jSignature uses for pointer to canvas mapping;
                // the 2d context is pre scaled so the existing draw
                // calls hit the right bitmap coordinates and the line
                // width compensates for the extra device pixels, and
                // the stroke style settings jSignature configured on
                // the context are reapplied since assigning to the
                // canvas width resets every 2d context property
                if (resolution > 1) {
                    const canvas = context.find("canvas").get(0);
                    if (canvas) {
                        canvas.width = Math.round(width * resolution);
                        canvas.height = Math.round(height * resolution);
                        canvas.style.width = width + "px";
                        canvas.style.height = height + "px";
                        const ctx = canvas.getContext("2d");
                        if (ctx) {
                            ctx.scale(resolution, resolution);
                            ctx.lineWidth = lineWidth;
                            ctx.lineCap = "round";
                            ctx.lineJoin = "round";
                            ctx.strokeStyle = "#000000";
                        }
                    }
                }

                // restores the previously captured strokes onto the
                // newly created canvas so the drawing survives the
                // re-initialization triggered by variant, zoom, and
                // thickness changes; setData runs after the canvas
                // backing store has been resized for the high pixel
                // density rendering so the strokes paint at the same
                // resolution as new strokes drawn afterwards
                if (restoredData) {
                    context.jSignature("setData", restoredData, "native");
                }

                // hides the jSignature undo button since we
                // provide our own undo control in the options panel
                context.find("input[type=button]").hide();

                // listens for changes in the drawing so that
                // the calligraphy event can be forwarded to consumers,
                // unbinding any previous handler first so the listener
                // does not stack across successive re-initializations
                context.off("change.calligraphy");
                context.on("change.calligraphy", function() {
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
            }
        });

        return this;
    };

    /**
     * Scales a jSignature stroke data array from a previous canvas
     * size to a new canvas size so the drawing keeps the same shape
     * across resize operations, returning a fresh array so the
     * caller can pass it back through the constructor data option.
     *
     * @param {Array} data The previous stroke data array.
     * @param {Number} prevWidth The width of the canvas that produced the data.
     * @param {Number} prevHeight The height of the canvas that produced the data.
     * @param {Number} nextWidth The width of the canvas being created.
     * @param {Number} nextHeight The height of the canvas being created.
     * @returns {Array} A scaled copy of the stroke data, or null when there is nothing to restore.
     */
    const scaleStrokes = function(data, prevWidth, prevHeight, nextWidth, nextHeight) {
        if (!data || data.length === 0) return null;
        if (!prevWidth || !prevHeight) return null;
        const scaleX = nextWidth / prevWidth;
        const scaleY = nextHeight / prevHeight;
        const result = [];
        for (const stroke of data) {
            const scaled = { x: [], y: [] };
            if (stroke.x) for (const value of stroke.x) scaled.x.push(value * scaleX);
            if (stroke.y) for (const value of stroke.y) scaled.y.push(value * scaleY);
            result.push(scaled);
        }
        return result;
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
                    bodyElement.offsetHeight;
                    body.css("max-height", height + "px");
                    title.css("margin-bottom", "");
                    toggle.text("\u25be");
                    body.one("transitionend", function() {
                        body.css("max-height", "");
                    });
                } else {
                    body.css("max-height", bodyElement.scrollHeight + "px");
                    bodyElement.offsetHeight;
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
     * Diagnostics plugin that runs a self contained check of the
     * engraving pipeline tools and renders the result inside the
     * Diagnostics tab on the settings screen.
     *
     * Operates on a .settings-tab-content[data-tab=diagnostics]
     * element and discovers its children (.diagnostics-run,
     * .diagnostics-empty, .diagnostics-probes,
     * .diagnostics-probe-list, .diagnostics-pipeline,
     * .diagnostics-step-list) by class name convention.
     */
    jQuery.fn.diagnostics = function() {
        const elements = jQuery(this);

        // renders a single probe entry inside the tools section
        // as a one line row with the tool name, the captured
        // version string and a colored status pill
        const renderProbe = function(context, probe) {
            const passLabel = context.attr("data-label-pass");
            const failLabel = context.attr("data-label-fail");
            const status = probe.found && !probe.error ? "ok" : "error";
            const row = jQuery("<div></div>");
            row.addClass("diagnostics-row");
            row.attr("data-status", status);

            const tool = jQuery("<div></div>");
            tool.addClass("diagnostics-row-tool");
            tool.text(probe.tool);
            row.append(tool);

            const version = jQuery("<div></div>");
            version.addClass("diagnostics-row-version");
            version.text(probe.version || probe.error || "");
            row.append(version);

            const badge = jQuery("<div></div>");
            badge.addClass("diagnostics-row-status");
            badge.text(status === "ok" ? passLabel : failLabel);
            row.append(badge);

            return row;
        };

        // renders a single pipeline step inside the pipeline
        // section, showing the resolved command, the output byte
        // count, the elapsed milliseconds and the captured stderr
        // tail so a failure can be diagnosed without ssh
        const renderStep = function(context, step) {
            const passLabel = context.attr("data-label-pass");
            const failLabel = context.attr("data-label-fail");
            const status = step.status === "ok" ? "ok" : "error";
            const row = jQuery("<div></div>");
            row.addClass("diagnostics-row");
            row.attr("data-status", status);

            const head = jQuery("<div></div>");
            head.addClass("diagnostics-row-head");
            const name = jQuery("<div></div>");
            name.addClass("diagnostics-row-tool");
            name.text(step.name);
            head.append(name);
            const badge = jQuery("<div></div>");
            badge.addClass("diagnostics-row-status");
            badge.text(status === "ok" ? passLabel : failLabel);
            head.append(badge);
            row.append(head);

            const meta = jQuery("<div></div>");
            meta.addClass("diagnostics-row-meta");
            const bytes = jQuery("<span></span>");
            bytes.addClass("diagnostics-row-bytes");
            bytes.text(step.outputBytes + " B");
            meta.append(bytes);
            const duration = jQuery("<span></span>");
            duration.addClass("diagnostics-row-duration");
            duration.text(step.durationMs + " ms");
            meta.append(duration);
            row.append(meta);

            if (step.command) {
                const command = jQuery("<code></code>");
                command.addClass("diagnostics-row-command");
                command.text(step.command);
                row.append(command);
            }

            if (step.stderr) {
                const stderr = jQuery("<pre></pre>");
                stderr.addClass("diagnostics-row-stderr");
                stderr.text(step.stderr);
                row.append(stderr);
            }

            return row;
        };

        // populates both sections of the given context with the
        // probe and step entries produced by the server side
        // diagnostics endpoint, hiding the empty hint that is
        // shown before the first run
        const renderResult = function(context, payload) {
            const probeList = jQuery(".diagnostics-probe-list", context);
            const stepList = jQuery(".diagnostics-step-list", context);
            const probeSection = jQuery(".diagnostics-probes", context);
            const stepSection = jQuery(".diagnostics-pipeline", context);
            const empty = jQuery(".diagnostics-empty", context);

            probeList.empty();
            stepList.empty();
            empty.hide();

            for (const probe of payload.probes || []) {
                probeList.append(renderProbe(context, probe));
            }
            for (const step of payload.steps || []) {
                stepList.append(renderStep(context, step));
            }
            probeSection.prop("hidden", false);
            stepSection.prop("hidden", false);
        };

        elements.each(function() {
            const context = jQuery(this);
            const runButton = jQuery(".diagnostics-run", context);
            const runLabel = runButton.text();
            const runningLabel = context.attr("data-label-running");
            const networkErrorLabel = context.attr("data-label-network-error");

            runButton.click(async function(event) {
                event.preventDefault();
                runButton.prop("disabled", true);
                runButton.text(runningLabel);
                try {
                    const response = await fetch("/settings/diagnostics", {
                        method: "POST"
                    });
                    if (response.status !== 200) {
                        throw new Error("unexpected status " + response.status);
                    }
                    const payload = await response.json();
                    renderResult(context, payload);
                } catch (error) {
                    jQuery(".diagnostics-probe-list", context).empty();
                    jQuery(".diagnostics-step-list", context).empty();
                    jQuery(".diagnostics-probes", context).prop("hidden", true);
                    jQuery(".diagnostics-pipeline", context).prop("hidden", true);
                    const empty = jQuery(".diagnostics-empty", context);
                    empty.text(networkErrorLabel);
                    empty.show();
                } finally {
                    runButton.prop("disabled", false);
                    runButton.text(runLabel);
                }
            });
        });

        return elements;
    };
})(jQuery);

(function(jQuery) {
    /**
     * Emojis plugin that uploads a replacement Cool Emojis font
     * (and, optionally, the companion mapping JSON) to the server
     * from the Emojis tab on the settings screen.
     *
     * Operates on a .settings-tab-content[data-tab=emojis] element
     * and discovers its children (.emojis-upload, .emojis-feedback,
     * #emojis-font, #emojis-mapping) by class name convention.
     */
    jQuery.fn.emojis = function() {
        const elements = jQuery(this);

        // renders the feedback panel inside the tab using the
        // requested treatment so the caller can swap between the
        // success, the error and the validation flavors without
        // touching the surrounding chrome
        const showFeedback = function(context, status, message) {
            const feedback = jQuery(".emojis-feedback", context);
            feedback.attr("data-status", status);
            feedback.text(message);
            feedback.prop("hidden", false);
        };

        elements.each(function() {
            const context = jQuery(this);
            const uploadButton = jQuery(".emojis-upload", context);
            const uploadLabel = uploadButton.text();
            const uploadingLabel = context.attr("data-label-uploading");
            const fontRequiredLabel = context.attr("data-label-font-required");
            const successLabel = context.attr("data-label-success");
            const networkErrorLabel = context.attr("data-label-network-error");
            const fontInput = jQuery("#emojis-font", context);
            const mappingInput = jQuery("#emojis-mapping", context);

            uploadButton.click(async function(event) {
                event.preventDefault();

                // refuses to start the upload without a font payload
                // so the server never sees a request that is bound to
                // fail validation, surfacing the same hint regardless
                // of whether the user forgot the file or cleared it
                const fontFile = fontInput.get(0).files[0];
                if (!fontFile) {
                    showFeedback(context, "error", fontRequiredLabel);
                    return;
                }

                const mappingFile = mappingInput.get(0).files[0];
                const formData = new FormData();
                formData.append("font", fontFile);
                if (mappingFile) formData.append("mapping", mappingFile);

                uploadButton.prop("disabled", true);
                uploadButton.text(uploadingLabel);
                try {
                    const response = await fetch("/settings/emojis", {
                        method: "POST",
                        body: formData
                    });
                    const payload = await response.json();
                    if (response.status !== 200) {
                        const messages = (payload && payload.errors) || [];
                        showFeedback(context, "error", messages.join(", "));
                        return;
                    }
                    showFeedback(context, "success", successLabel);
                    fontInput.val("");
                    mappingInput.val("");
                } catch (error) {
                    showFeedback(context, "error", networkErrorLabel);
                } finally {
                    uploadButton.prop("disabled", false);
                    uploadButton.text(uploadLabel);
                }
            });
        });

        return elements;
    };
})(jQuery);

(function(jQuery) {
    /**
     * Feedback plugin that wires the post engraving feedback modal
     * end to end so the multiple choice satisfaction picker and the
     * optional notes textarea collect a payload that is then posted
     * to the `/feedback` endpoint and dismissed with a toast on
     * success.
     *
     * Operates on a .modal-overlay-feedback element and discovers
     * its children (.modal-feedback-satisfaction, .modal-feedback-notes,
     * .button-modal-feedback-submit) by class name convention; the
     * companion floating CTA (.button-feedback-cta) and the optional
     * shared overlays (.modal-overlay-error, .toast) are looked up
     * at the document level so the plugin stays self contained.
     *
     * Options (passed on init):
     *   "profileSelector" - an optional jQuery element wrapping the
     *                       profile selector plugin so the current
     *                       profile and variant are attached to the
     *                       submitted feedback payload
     *
     * Events listened to:
     *   "show"   - triggered by the modal plugin when the overlay
     *              becomes visible, resets the satisfaction chip
     *              selection and the notes textarea so a stale value
     *              is not carried over from a previous submission
     */
    jQuery.fn.feedback = function(options) {
        const elements = jQuery(this);
        const settings = options || {};

        elements.each(function() {
            const context = jQuery(this);
            const satisfaction = jQuery(
                ".modal-feedback-satisfaction input[name=feedback_satisfaction]",
                context
            );
            const notes = jQuery(".modal-feedback-notes", context);
            const submit = jQuery(".button-modal-feedback-submit", context);
            const cta = jQuery(".button-feedback-cta");
            const errorOverlay = jQuery(".modal-overlay-error");
            const toast = jQuery(".toast");
            const profileSelector = settings.profileSelector || jQuery();

            // resets the satisfaction chip selection and the notes
            // textarea every time the modal becomes visible so a
            // stale value is not carried over from a previous
            // engraving submission
            context.bind("show", function() {
                satisfaction.prop("checked", false);
                notes.val("");
                submit.addClass("disabled");
            });

            // toggles the submit button between disabled and enabled
            // based on whether a satisfaction option is currently
            // selected so the user cannot send an empty feedback
            // payload to the server
            satisfaction.bind("change", function() {
                const selected = jQuery(
                    ".modal-feedback-satisfaction input[name=feedback_satisfaction]:checked",
                    context
                ).val();
                if (selected) submit.removeClass("disabled");
                else submit.addClass("disabled");
            });

            // registers for the click on the feedback submit button
            // to collect the selected satisfaction option and the
            // optional notes, post them to the feedback endpoint and
            // close the modal with a toast confirmation when the
            // request succeeds, surfacing the existing error overlay
            // otherwise; a local in flight flag guards the handler
            // against duplicate submissions while the network request
            // is pending so a double tap on a slow connection does
            // not persist the same feedback multiple times
            let submitting = false;
            submit.click(async function() {
                if (submitting) return;
                if (jQuery(this).hasClass("disabled")) return;
                const selectedSatisfaction = jQuery(
                    ".modal-feedback-satisfaction input[name=feedback_satisfaction]:checked",
                    context
                ).val();
                if (!selectedSatisfaction) return;
                const notesValue = notes.val() || "";
                const selection =
                    profileSelector.length > 0 ? profileSelector.profileselector("value") : null;
                const profileKey = selection && selection.key ? selection.key : "";
                const variantIndex =
                    selection && selection.variantIndex !== null && selection.variantIndex !== undefined
                        ? String(selection.variantIndex)
                        : "";
                submitting = true;
                submit.addClass("disabled");
                try {
                    const feedbackResponse = await fetch("/feedback", {
                        method: "POST",
                        body: new URLSearchParams([
                            ["satisfaction", selectedSatisfaction],
                            ["notes", notesValue],
                            ["profile", profileKey],
                            ["variant", variantIndex]
                        ])
                    });
                    if (feedbackResponse.status !== 200) {
                        const error = await feedbackResponse.json();
                        const errorMessage = error.message || error.error || "unset";
                        errorOverlay.modal(
                            "show",
                            "Error while submitting feedback: " + errorMessage
                        );
                        return;
                    }
                    context.modal("hide");
                    toast.toast("show", "Thanks for your feedback.");
                } catch (err) {
                    errorOverlay.modal("show", String(err));
                } finally {
                    // releases the in flight guard so a subsequent
                    // submission attempt is honored, restoring the
                    // submit enabled state when a satisfaction option
                    // is still selected so an error path leaves the
                    // button usable for an immediate retry while a
                    // success path falls back to the modal show event
                    // that resets the chip selection
                    submitting = false;
                    const selected = jQuery(
                        ".modal-feedback-satisfaction input[name=feedback_satisfaction]:checked",
                        context
                    ).val();
                    if (selected) submit.removeClass("disabled");
                }
            });

            // registers for the click on the floating feedback CTA so
            // the user can open the feedback modal on an ad hoc basis
            // without having to wait for the next successful engrave
            // submission
            cta.click(function() {
                context.modal("show");
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

                // scales the preview to fit inside the container,
                // honoring a CSS-set fixed height when present so
                // the consumer can pin a uniform card height and
                // have the preview shrink to fit both axes instead
                // of overflowing on tall profile aspect ratios
                const containerWidth = container.width() || 72;
                const containerHeight = container.height();
                const widthScale = containerWidth / width;
                const heightScale = containerHeight > 0 ? containerHeight / height : Infinity;
                const scale = Math.min(widthScale, heightScale);
                const scaledWidth = width * scale;
                const scaledHeight = height * scale;
                preview.css({
                    transform: "scale(" + scale + ")",
                    "transform-origin": "0 0",
                    left: Math.max(0, (containerWidth - scaledWidth) / 2) + "px",
                    position: "absolute",
                    top: Math.max(0, (containerHeight - scaledHeight) / 2) + "px"
                });
                if (containerHeight <= 0) {
                    container.css({
                        height: Math.ceil(scaledHeight) + "px",
                        position: "relative"
                    });
                } else {
                    container.css({ position: "relative" });
                }

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
                    bodyElement.offsetHeight;
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
                    bodyElement.offsetHeight;
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
     * JSON highlight plugin that overlays a syntax colored preview
     * on top of a regular textarea so the user keeps native input
     * behavior (selection, copy paste, autocomplete, native scroll)
     * while seeing the value colored as it is typed.
     *
     * Operates on a textarea element and wraps it in a container
     * with a sibling pre element that mirrors the textarea contents
     * tokenized as JSON. The textarea text is rendered transparent
     * so only the colored overlay is visible to the reader, while
     * the caret remains visible at the textarea native position.
     */
    jQuery.fn.jsonhighlight = function(action, options) {
        const elements = jQuery(this);

        // escapes the given string so it can be safely embedded in
        // the highlight overlay without breaking the surrounding
        // markup or being interpreted as html by the browser
        const escapeHtml = function(value) {
            return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };

        // tokenizes the given json text into a sequence of colored
        // spans, recognising strings (telling keys apart from values
        // by the trailing colon), numbers, booleans, null, and the
        // structural punctuation that holds the document together
        const tokenize = function(text) {
            const pattern =
                /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}\[\],:]|\s+|[^\s]+/g;
            let output = "";
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const token = match[0];
                if (token[0] === '"') {
                    // peeks at the upcoming characters to tell a key
                    // (string followed by a colon) apart from a plain
                    // string value so the two get different colors
                    const rest = text.slice(pattern.lastIndex);
                    const isKey = /^\s*:/.test(rest);
                    const cls = isKey ? "jsonhighlight-key" : "jsonhighlight-string";
                    output += '<span class="' + cls + '">' + escapeHtml(token) + "</span>";
                } else if (token === "true" || token === "false") {
                    output += '<span class="jsonhighlight-boolean">' + token + "</span>";
                } else if (token === "null") {
                    output += '<span class="jsonhighlight-null">null</span>';
                } else if (/^-?\d/.test(token)) {
                    output += '<span class="jsonhighlight-number">' + token + "</span>";
                } else if (/^[{}\[\],:]$/.test(token)) {
                    output +=
                        '<span class="jsonhighlight-punctuation">' + escapeHtml(token) + "</span>";
                } else if (/^\s+$/.test(token)) {
                    output += token;
                } else {
                    // forwards any leftover slice unchanged so that
                    // a partial token during typing does not break
                    // the overlay layout
                    output += escapeHtml(token);
                }
            }
            return output;
        };

        elements.each(function() {
            const textarea = jQuery(this);

            // refreshes the overlay markup from the current textarea
            // value, appending a trailing space so the highlighter
            // matches the textarea height when the value ends on a
            // newline character
            const refresh = function() {
                const wrapper = textarea.data("_jsonhighlight_wrapper");
                if (!wrapper) return;
                const code = jQuery("code", wrapper);
                const value = textarea.val() || "";
                code.html(tokenize(value) + "\n");
            };

            // mirrors the textarea scroll position onto the overlay
            // so the colored content stays aligned with the caret
            // even after the user has scrolled past the viewport
            const syncScroll = function() {
                const wrapper = textarea.data("_jsonhighlight_wrapper");
                if (!wrapper) return;
                const overlay = jQuery(".jsonhighlight-overlay", wrapper).get(0);
                if (!overlay) return;
                overlay.scrollTop = textarea.get(0).scrollTop;
                overlay.scrollLeft = textarea.get(0).scrollLeft;
            };

            // refreshes the overlay programmatically so external
            // updates (template apply, edit mode, validate) keep
            // the colored preview in sync with the textarea value
            if (action === "refresh") {
                refresh();
                return;
            }

            // prevents duplicate wrapping when the plugin is invoked
            // more than once on the same element so the overlay does
            // not get nested inside another overlay
            if (textarea.data("_jsonhighlight_initialized")) return;
            textarea.data("_jsonhighlight_initialized", true);

            const wrapper = jQuery("<div></div>");
            wrapper.addClass("jsonhighlight-wrapper");
            const overlay = jQuery("<pre></pre>");
            overlay.addClass("jsonhighlight-overlay");
            overlay.attr("aria-hidden", "true");
            const code = jQuery("<code></code>");
            overlay.append(code);
            textarea.before(wrapper);
            wrapper.append(overlay);
            wrapper.append(textarea);
            textarea.data("_jsonhighlight_wrapper", wrapper);
            textarea.addClass("jsonhighlight-input");

            textarea.on("input", refresh);
            textarea.on("scroll", syncScroll);

            refresh();
            syncScroll();
        });

        return this;
    };
})(jQuery);

(function(jQuery) {
    /**
     * Virtual keyboard plugin that handles character input via
     * clickable key elements with support for long-press accent
     * popups, keyboard casing toggle, and a letters/symbols mode
     * toggle that swaps the visible key set.
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
            const tabs = jQuery("> .emojis-tabs > .emojis-tab", context);
            let longPressTimer = null;
            let longPressTriggered = false;

            tabs.click(function() {
                const element = jQuery(this);
                const category = element.attr("data-category");
                tabs.removeClass("active");
                element.addClass("active");
                context.attr("data-active", category);
            });

            keys.click(function() {
                if (longPressTriggered) return;
                const element = jQuery(this);
                let value = element.attr("data-value");
                if (value === undefined) value = element.text();
                const casing = context.data("casing") || "uppercase";
                value = casing === "lowercase" ? value.toLowerCase() : value;
                if (value === "⇧") {
                    toggleCasing(context);
                } else if (element.hasClass("mode")) {
                    toggleMode(context, element);
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

        /**
         * Toggle the keyboard between the letters layout and the
         * symbols layout, swapping the visible key set and updating
         * the mode key label to mirror the active state.
         *
         * @param {Element} context The context that is going to be used
         * for the toggling.
         * @param {Element} element The mode toggle key element whose label
         * is going to be updated to reflect the new state.
         */
        const toggleMode = function(context, element) {
            const mode = context.data("mode") || "letters";
            if (mode === "letters") {
                context.data("mode", "symbols");
                context.addClass("symbols");
                element.text("ABC");
            } else {
                context.data("mode", "letters");
                context.removeClass("symbols");
                element.text("123");
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
     *
     * Events:
     *   "show"     - triggered after the modal becomes visible so
     *                downstream plugins can reset transient state
     *                (for example clearing a previous form submission)
     *                every time the overlay is opened
     *   "printjob" - triggered on the confirm overlay after a print
     *                submission succeeds, passing an options object
     *                with the colony-print job info, the print url
     *                and the secret key so the host can hand the
     *                entry to the print jobs indicator
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
                        // emits a printjob enqueue event with the
                        // freshly minted job info so main.js can
                        // bridge it to the print jobs indicator,
                        // following the plugin to host communication
                        // convention through `triggerHandler`
                        const jobInfo = await printResponse.json();
                        context.triggerHandler("printjob", [
                            { jobInfo: jobInfo, printUrl: printUrl, key: key }
                        ]);
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

(function(jQuery) {
    /**
     * Print jobs indicator plugin that displays one chip per
     * engraving job submitted to colony-print, polling the server
     * every 5 seconds for status updates and exposing the request
     * payload, the rendered result and the produced artefacts
     * (screenshots, videos, raw files) through a tabbed overlay.
     *
     * Operates on a .print-jobs element and discovers its children
     * (.print-jobs-chips, .modal-overlay-print-job) by class name
     * convention. The list of tracked jobs is persisted to the
     * `print_jobs` localStorage key and rehydrated on every init so
     * the indicator survives reloads and tab restores.
     *
     * Actions:
     *   "enqueue" - registers a new job from a colony-print response
     *               passing { jobInfo, printUrl, key } and starts
     *               polling its status until it reaches a terminal
     *               state
     *   "dismiss" - removes a chip from the indicator and from the
     *               persisted list passing { id }, used when the
     *               operator manually clears a terminal entry
     *   "value"   - returns the current list of tracked jobs as an
     *               array snapshot read from the persisted store
     *
     * Events:
     *   "terminal" - triggered the first time a job reaches a
     *                terminal state (`finished` or `cancelled`),
     *                passing the resolved job entry as argument so
     *                downstream listeners can react once per job
     */
    jQuery.fn.printjobs = function(action, options) {
        const elements = jQuery(this);

        // shared poll cadence used by every job tracked by the
        // plugin so a long running stack never spawns more than a
        // single ticker, matching the 5 second contract documented
        // on the colony-print job lifecycle
        const POLL_INTERVAL = 5000;

        // canonical list of terminal status values that stop the
        // polling cycle for a given entry and switch its chip into
        // the dismiss affordance instead of the cancel one
        const TERMINAL_STATUSES = ["finished", "cancelled"];

        // canonical set of keys excluded from the result summary
        // because they are surfaced through their own tab (raw
        // payload, traceback) or pure binary blobs that would
        // clutter the info tab without adding diagnostic value
        const RESULT_SUMMARY_SKIP = [
            "data",
            "output_data",
            "output_encoding",
            "output_mime_type",
            "traceback"
        ];

        // resolves the current list of tracked jobs from localStorage
        // returning an array snapshot that is safe to mutate without
        // touching the persisted payload until writeJobs is called
        const readJobs = function() {
            try {
                const raw = localStorage.getItem("print_jobs");
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                return [];
            }
        };

        // persists the current list of tracked jobs onto localStorage
        // silently ignoring quota errors so the indicator can keep
        // rendering even when the storage backend is unavailable
        const writeJobs = function(jobs) {
            try {
                localStorage.setItem("print_jobs", JSON.stringify(jobs));
            } catch (err) {
                // silently ignores storage errors
            }
        };

        // returns true when the given status is one of the terminal
        // values defined by the colony-print contract, used to stop
        // polling and flip the chip into the dismiss affordance
        const isTerminal = function(status) {
            return TERMINAL_STATUSES.indexOf(status) !== -1;
        };

        // returns true when the job ended on a printing error,
        // detected by a "finished" status carrying either a literal
        // "error" string or a result object whose nested `result`
        // key equals "error", since colony-print signals failures
        // through the result field rather than a dedicated status
        const isFailed = function(job) {
            if (job.status !== "finished") return false;
            if (job.result === "error") return true;
            if (job.result && typeof job.result === "object") {
                return job.result.result === "error";
            }
            return false;
        };

        // resolves the effective status key for label and styling
        // lookups, mapping a failed job onto the "failed" key so the
        // chip styling and the tooltip diverge from a successful
        // finished outcome
        const effectiveStatus = function(job) {
            if (isFailed(job)) return "failed";
            return job.status;
        };

        // resolves the result object on a job (when present and
        // structured), returning null for the literal "error" string
        // case so callers can treat the value as a plain object
        const resultObject = function(job) {
            if (job.result && typeof job.result === "object") return job.result;
            return null;
        };

        // formats the elapsed time between two unix timestamps in
        // seconds as a compact human readable string (e.g. "12s",
        // "3m 14s", "1h 02m") for the chip tooltip and the info tab
        const formatElapsed = function(from, to) {
            const seconds = Math.max(0, Math.floor((to || from) - from));
            if (seconds < 60) return seconds + "s";
            const minutes = Math.floor(seconds / 60);
            const rest = seconds % 60;
            if (minutes < 60) return minutes + "m " + (rest < 10 ? "0" : "") + rest + "s";
            const hours = Math.floor(minutes / 60);
            const restMin = minutes % 60;
            return hours + "h " + (restMin < 10 ? "0" : "") + restMin + "m";
        };

        // returns a human readable size string for a byte count
        // using KB and MB thresholds so the modal tiles and the
        // data length row surface the value without overflowing
        const formatSize = function(size) {
            if (size < 1024) return size + " B";
            if (size < 1024 * 1024) return Math.round(size / 1024) + " KB";
            return (size / (1024 * 1024)).toFixed(1) + " MB";
        };

        // formats a unix timestamp in seconds as a locale aware
        // date time string, returning a dash when the value is
        // missing so the row stays present but visually empty
        const formatTimestamp = function(timestamp) {
            if (!timestamp) return "-";
            const date = new Date(timestamp * 1000);
            return date.toLocaleString();
        };

        // formats a duration expressed in seconds as a compact
        // human readable string using hours, minutes and seconds,
        // omitting the leading zero units when not needed
        const formatDuration = function(seconds) {
            const total = Math.max(0, Math.floor(seconds));
            const hours = Math.floor(total / 3600);
            const minutes = Math.floor((total % 3600) / 60);
            const rest = total % 60;
            if (hours > 0) return hours + "h " + minutes + "m " + rest + "s";
            if (minutes > 0) return minutes + "m " + rest + "s";
            return rest + "s";
        };

        // escapes the given value through a throwaway span so any
        // user provided text can be safely embedded in a row html
        // without breaking the surrounding markup
        const escapeHtml = function(value) {
            return jQuery("<span>").text(String(value)).html();
        };

        // builds a single spec row using the same dom structure as
        // the confirm engraving modal so every info section carries
        // the same visual treatment of label on the left and value
        // on the right, with the value passed through as raw html
        const buildRow = function(label, value) {
            return (
                '<div class="modal-spec">' +
                '<span class="modal-spec-label">' +
                escapeHtml(label) +
                "</span>" +
                '<span class="modal-spec-value">' +
                value +
                "</span>" +
                "</div>"
            );
        };

        // returns true when the given file name matches one of
        // the image extensions worth showing inline as a thumbnail
        const isImage = function(name) {
            return /\.(png|jpe?g|gif|webp)$/i.test(name);
        };

        // returns true when the given file name matches one of
        // the video extensions worth showing as an inline player
        const isVideo = function(name) {
            return /\.(mp4|webm|mov)$/i.test(name);
        };

        // maps a colony-print log severity to a chip variant class
        // so each log entry carries the same color hierarchy as
        // the rest of the indicator
        const logSeverityVariant = function(level) {
            if (level === "ERROR") return "error";
            if (level === "WARNING") return "warning";
            if (level === "INFO") return "success";
            return "default";
        };

        // returns the current list of tracked jobs as a snapshot
        // from the persisted store without engaging the per element
        // rendering logic, used by callers that just want the data
        if (action === "value") {
            return readJobs();
        }

        elements.each(function() {
            const context = jQuery(this);
            const chipsContainer = jQuery(".print-jobs-chips", context);

            // overlay and tab strip
            const modalOverlay = jQuery(".modal-overlay-print-job");
            const modalTitle = jQuery(".modal-print-job-title", modalOverlay);
            const modalTabs = jQuery(".modal-print-job-tab", modalOverlay);

            // info tab targets
            const infoSpecs = jQuery(".modal-print-job-specs", modalOverlay);
            const infoOptionsSection = jQuery(
                ".modal-print-job-section-options",
                modalOverlay
            );
            const infoOptions = jQuery(".modal-print-job-options", modalOverlay);
            const infoResultSection = jQuery(
                ".modal-print-job-section-result",
                modalOverlay
            );
            const infoResultSummary = jQuery(
                ".modal-print-job-result-summary",
                modalOverlay
            );
            const infoLogsSection = jQuery(
                ".modal-print-job-section-logs",
                modalOverlay
            );
            const infoLogsToggle = jQuery(
                ".modal-print-job-logs-toggle",
                modalOverlay
            );
            const infoLogs = jQuery(".modal-print-job-logs", modalOverlay);

            // files tab targets
            const filesGrid = jQuery(".modal-print-job-files-grid", modalOverlay);
            const filesEmpty = jQuery(".modal-print-job-files-empty", modalOverlay);

            // request, result and traceback tab targets
            const requestPre = jQuery(".modal-print-job-request", modalOverlay);
            const requestEmpty = jQuery(
                ".modal-print-job-request-empty",
                modalOverlay
            );
            const resultPre = jQuery(".modal-print-job-result", modalOverlay);
            const tracebackPre = jQuery(".modal-print-job-traceback", modalOverlay);

            // localized strings read from data-label-* attributes
            // on the container so each locale template owns its own
            // copy following the convention used by the modal plugin
            const labels = {
                queued: context.attr("data-label-queued") || "Queued",
                printing: context.attr("data-label-printing") || "Printing",
                finished: context.attr("data-label-finished") || "Finished",
                cancelled: context.attr("data-label-cancelled") || "Cancelled",
                failed: context.attr("data-label-failed") || "Failed",
                cancel: context.attr("data-label-cancel") || "Cancel",
                dismiss: context.attr("data-label-dismiss") || "Dismiss",
                printer: context.attr("data-label-printer") || "Printer",
                node: context.attr("data-label-node") || "Node",
                elapsed: context.attr("data-label-elapsed") || "Elapsed",
                status: context.attr("data-label-status") || "Status",
                id: context.attr("data-label-id") || "Job",
                name: context.attr("data-label-name") || "Name",
                type: context.attr("data-label-type") || "Type",
                format: context.attr("data-label-format") || "Format",
                dataLength: context.attr("data-label-data-length") || "Data length",
                duration: context.attr("data-label-duration") || "Duration",
                queuedAt: context.attr("data-label-queued-at") || "Queued at",
                printingAt: context.attr("data-label-printing-at") || "Printing at",
                finishedAt: context.attr("data-label-finished-at") || "Finished at",
                cancelledAt: context.attr("data-label-cancelled-at") || "Cancelled at",
                requestEmpty:
                    context.attr("data-label-request-empty") ||
                    "No request payload recorded for this job.",
                failedToast:
                    context.attr("data-label-failed-toast") || "Engraving job failed.",
                filesEmpty:
                    context.attr("data-label-files-empty") || "No files generated.",
                download: context.attr("data-label-download") || "Download"
            };

            // resolves the per container state object that survives
            // every plugin invocation through jQuery `data` so the
            // blob url cache, the shared poll timer id, the bound
            // handler flag, the currently open job id and the logs
            // collapsible state are never duplicated across calls
            let state = context.data("_state");
            if (!state) {
                state = {
                    blobUrls: [],
                    pollTimer: null,
                    bound: false,
                    activeTab: "info",
                    openJobId: null,
                    logsOpen: false,
                    inFlight: {},
                    filesRequestId: 0
                };
                context.data("_state", state);
            }

            // builds the multi line tooltip text rendered through
            // the chip title attribute, surfacing the status, the
            // printer, the node and the elapsed time the operator
            // needs to identify a job at a glance
            const buildTooltip = function(job) {
                const lines = [];
                lines.push(labels[effectiveStatus(job)] || job.status);
                if (job.printer) lines.push(labels.printer + ": " + job.printer);
                if (job.node_id) lines.push(labels.node + ": " + job.node_id);
                if (job.queued_time) {
                    const now = Date.now() / 1000;
                    const end = job.finish_time || job.cancel_time || now;
                    lines.push(labels.elapsed + ": " + formatElapsed(job.queued_time, end));
                }
                return lines.join("\n");
            };

            // renders a single chip in the container for the given
            // job entry replacing any existing chip with the same id
            // so a poll update reuses the dom node and a fresh status
            // simply swaps the visual treatment; the chip body and
            // its affordances are rendered as real buttons so the
            // entire indicator can be operated by keyboard users
            const renderChip = function(job) {
                const existing = chipsContainer.children('[data-id="' + job.id + '"]');
                const chip = jQuery('<button type="button"></button>');
                chip.addClass("print-jobs-chip");
                chip.addClass("print-jobs-chip-" + effectiveStatus(job));
                chip.attr("data-id", job.id);

                const status = effectiveStatus(job);
                if (status === "queued" || status === "printing") {
                    chip.append('<span class="print-jobs-chip-spinner"></span>');
                }

                const label = jQuery('<span class="print-jobs-chip-label"></span>');
                label.text(labels[status] || labels.queued);
                chip.append(label);

                if (job.printer) {
                    const printer = jQuery('<span class="print-jobs-chip-printer"></span>');
                    printer.text(job.printer);
                    chip.append(printer);
                }

                // surfaces the cancel affordance for queued jobs only
                // since colony-print only allows cancellation while
                // the job has not been picked up by the target node
                if (job.status === "queued") {
                    const cancel = jQuery('<button type="button" class="print-jobs-chip-cancel"></button>');
                    cancel.attr("title", labels.cancel);
                    cancel.attr("aria-label", labels.cancel);
                    cancel.text("×");
                    chip.append(cancel);
                } else if (isTerminal(job.status)) {
                    const dismiss = jQuery('<button type="button" class="print-jobs-chip-dismiss"></button>');
                    dismiss.attr("title", labels.dismiss);
                    dismiss.attr("aria-label", labels.dismiss);
                    dismiss.text("×");
                    chip.append(dismiss);
                }

                chip.attr("title", buildTooltip(job));

                if (existing.length > 0) existing.replaceWith(chip);
                else chipsContainer.append(chip);

                context.addClass("visible");
            };

            // renders every persisted entry from scratch, used on
            // init to rehydrate the indicator from localStorage and
            // hide the container entirely when no jobs are tracked
            const renderAll = function() {
                const jobs = readJobs();
                chipsContainer.empty();
                if (jobs.length === 0) {
                    context.removeClass("visible");
                    return;
                }
                for (let i = 0; i < jobs.length; i++) renderChip(jobs[i]);
                context.addClass("visible");
            };

            // resolves the persisted entry that matches the given id
            // returning null when no matching job is tracked so the
            // click handlers can short circuit on a stale chip that
            // was already dismissed from another tab
            const findJob = function(id) {
                const jobs = readJobs();
                for (let i = 0; i < jobs.length; i++) {
                    if (jobs[i].id === id) return jobs[i];
                }
                return null;
            };

            // merges the given patch onto the persisted entry that
            // matches the provided id, redraws the chip in place,
            // refreshes the overlay when the modified job is the one
            // currently on screen and emits a one shot terminal
            // event when the transition crosses the terminal boundary
            const updateJob = function(id, patch) {
                const jobs = readJobs();
                let changed = null;
                let previousStatus = null;
                for (let i = 0; i < jobs.length; i++) {
                    if (jobs[i].id === id) {
                        previousStatus = effectiveStatus(jobs[i]);
                        jobs[i] = Object.assign({}, jobs[i], patch);
                        changed = jobs[i];
                        break;
                    }
                }
                if (!changed) return null;
                writeJobs(jobs);
                renderChip(changed);
                refreshModalIfOpen(changed);
                const currentStatus = effectiveStatus(changed);
                if (
                    currentStatus !== previousStatus &&
                    isTerminal(changed.status)
                ) {
                    context.triggerHandler("terminal", [changed]);
                    if (isFailed(changed)) {
                        jQuery(".toast").toast("show", labels.failedToast);
                    }
                }
                return changed;
            };

            // removes a tracked job from the persisted store and from
            // the dom, used by the dismiss affordance and by the
            // external dismiss action so callers can imperatively
            // clear a chip without going through the chip ui
            const removeJob = function(id) {
                const jobs = readJobs().filter(function(job) {
                    return job.id !== id;
                });
                writeJobs(jobs);
                chipsContainer.children('[data-id="' + id + '"]').remove();
                if (chipsContainer.children().length === 0) {
                    context.removeClass("visible");
                }
            };

            // fetches the current status of a single job from the
            // colony-print server reusing the secret key stored at
            // enqueue time, dropping the chip when the entry has
            // been evicted from the in memory store (500 response)
            // and forwarding every interesting field onto updateJob,
            // guarded by a per job in flight flag so a slow tick
            // never races a newer one and overwrites a terminal
            // state with stale data
            const fetchStatus = async function(job) {
                if (state.inFlight[job.id]) return;
                state.inFlight[job.id] = true;
                try {
                    const response = await fetch(job.printUrl + "/jobs/" + job.id, {
                        headers: { "X-Secret-Key": job.key }
                    });
                    if (response.status === 500) {
                        removeJob(job.id);
                        return;
                    }
                    if (response.status !== 200) return;
                    const fresh = await response.json();
                    updateJob(job.id, {
                        status: fresh.status || job.status,
                        result: fresh.result !== undefined ? fresh.result : job.result,
                        printer: fresh.printer || job.printer,
                        node_id: fresh.node_id || job.node_id,
                        type: fresh.type || job.type,
                        format: fresh.format || job.format,
                        options:
                            fresh.options !== undefined ? fresh.options : job.options,
                        data_length:
                            fresh.data_length !== undefined
                                ? fresh.data_length
                                : job.data_length,
                        request_payload:
                            fresh.request_payload !== undefined
                                ? fresh.request_payload
                                : job.request_payload,
                        queued_time: fresh.queued_time || job.queued_time,
                        printing_time: fresh.printing_time || job.printing_time,
                        finish_time: fresh.finish_time || job.finish_time,
                        cancel_time: fresh.cancel_time || job.cancel_time
                    });
                } catch (err) {
                    // silently ignores polling errors so a flaky
                    // network never freezes the indicator, the next
                    // tick will retry the same job from scratch
                } finally {
                    delete state.inFlight[job.id];
                }
            };

            // starts the shared poll ticker if there are non terminal
            // jobs to follow, exiting early when one is already
            // running and stopping itself on the first tick that
            // finds no remaining active job
            const startPolling = function() {
                if (state.pollTimer !== null) return;
                state.pollTimer = setInterval(function() {
                    const jobs = readJobs();
                    const active = jobs.filter(function(job) {
                        return !isTerminal(job.status);
                    });
                    if (active.length === 0) {
                        clearInterval(state.pollTimer);
                        state.pollTimer = null;
                        return;
                    }
                    for (let i = 0; i < active.length; i++) fetchStatus(active[i]);
                }, POLL_INTERVAL);
            };

            // posts a cancel request for a queued job and applies the
            // resolved status returned by the server, silently
            // ignoring transport errors so the next poll tick can
            // reconcile state if the server eventually picks it up
            const cancelJob = async function(job) {
                try {
                    const response = await fetch(
                        job.printUrl + "/jobs/" + job.id + "/cancel",
                        {
                            method: "POST",
                            headers: { "X-Secret-Key": job.key }
                        }
                    );
                    if (response.status !== 200) return;
                    const fresh = await response.json();
                    updateJob(job.id, {
                        status: fresh.status || "cancelled",
                        cancel_time: fresh.cancel_time || Date.now() / 1000
                    });
                } catch (err) {
                    // silently ignores cancel errors so the chip
                    // stays visible and the next poll reconciles
                }
            };

            // revokes any cached blob urls created for the files tab
            // so the browser can release the underlying binary data
            // once the user closes the overlay or opens a different
            // job, avoiding indefinite memory growth across sessions
            const revokeBlobs = function() {
                for (let i = 0; i < state.blobUrls.length; i++) {
                    URL.revokeObjectURL(state.blobUrls[i]);
                }
                state.blobUrls = [];
            };

            // fetches a single file from a job's directory as a blob
            // and turns it into an object url so an img or video tag
            // can reference it directly without leaking the secret
            // key through a query parameter
            const fetchBlob = async function(job, name) {
                try {
                    const response = await fetch(
                        job.printUrl +
                            "/jobs/" +
                            job.id +
                            "/files/" +
                            encodeURIComponent(name),
                        { headers: { "X-Secret-Key": job.key } }
                    );
                    if (response.status !== 200) return null;
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    state.blobUrls.push(url);
                    return url;
                } catch (err) {
                    return null;
                }
            };

            // resolves the logs array stored under the nested
            // `result.data.logs` payload, returning an empty array
            // when the structure is missing or not iterable
            const resolveLogs = function(job) {
                const result = resultObject(job);
                if (!result) return [];
                const data = result.data;
                if (!data || typeof data !== "object") return [];
                return Array.isArray(data.logs) ? data.logs : [];
            };

            // resolves the duration value stored under the nested
            // `result.data.duration` payload, returning null when no
            // duration was reported by the printing handler
            const resolveDuration = function(job) {
                const result = resultObject(job);
                if (!result) return null;
                const data = result.data;
                if (!data || typeof data !== "object") return null;
                if (typeof data.duration !== "number") return null;
                return data.duration;
            };

            // renders the basic identity, status and timing rows of
            // the info tab using the same modal-spec dom structure
            // as the confirm engraving modal so the visual treatment
            // carries over without introducing a new pattern
            const renderInfoBasic = function(job) {
                const status = effectiveStatus(job);
                const statusHtml =
                    '<span class="modal-print-job-status modal-print-job-status-' +
                    status +
                    '">' +
                    escapeHtml(labels[status] || job.status) +
                    "</span>";
                // composes the admin ui job url for the current
                // entry so the id row becomes a deep link into the
                // colony print admin where the operator can inspect
                // the full job detail in a separate tab
                let idHtml = escapeHtml(job.id);
                if (job.printUrl) {
                    const href =
                        job.printUrl.replace(/\/+$/, "") +
                        "/admin-ui/jobs/" +
                        encodeURIComponent(job.id);
                    idHtml =
                        '<a class="modal-print-job-link" href="' +
                        escapeHtml(href) +
                        '" target="_blank" rel="noopener noreferrer">' +
                        escapeHtml(job.id) +
                        "</a>";
                }
                let html = "";
                html += buildRow(labels.status, statusHtml);
                html += buildRow(labels.id, idHtml);
                if (job.name && job.name !== job.id) {
                    html += buildRow(labels.name, escapeHtml(job.name));
                }
                if (job.printer) {
                    html += buildRow(labels.printer, escapeHtml(job.printer));
                }
                if (job.node_id) {
                    html += buildRow(labels.node, escapeHtml(job.node_id));
                }
                if (job.type) html += buildRow(labels.type, escapeHtml(job.type));
                if (job.format) html += buildRow(labels.format, escapeHtml(job.format));
                if (job.data_length !== undefined && job.data_length !== null) {
                    html += buildRow(
                        labels.dataLength,
                        escapeHtml(formatSize(job.data_length))
                    );
                }
                if (job.queued_time) {
                    html += buildRow(
                        labels.queuedAt,
                        escapeHtml(formatTimestamp(job.queued_time))
                    );
                }
                if (job.printing_time) {
                    html += buildRow(
                        labels.printingAt,
                        escapeHtml(formatTimestamp(job.printing_time))
                    );
                }
                if (job.finish_time) {
                    html += buildRow(
                        labels.finishedAt,
                        escapeHtml(formatTimestamp(job.finish_time))
                    );
                }
                if (job.cancel_time) {
                    html += buildRow(
                        labels.cancelledAt,
                        escapeHtml(formatTimestamp(job.cancel_time))
                    );
                }
                if (job.queued_time) {
                    const now = Date.now() / 1000;
                    const end = job.finish_time || job.cancel_time || now;
                    html += buildRow(
                        labels.elapsed,
                        escapeHtml(formatElapsed(job.queued_time, end))
                    );
                }
                const duration = resolveDuration(job);
                if (duration !== null) {
                    html += buildRow(
                        labels.duration,
                        escapeHtml(formatDuration(duration))
                    );
                }
                infoSpecs.html(html);
            };

            // renders the options section of the info tab, hiding the
            // whole section when the job carries no options map so the
            // tab stays compact for the simple gravo style jobs
            const renderInfoOptions = function(job) {
                const map = job.options;
                if (!map || typeof map !== "object") {
                    infoOptionsSection.hide();
                    return;
                }
                const keys = Object.keys(map);
                if (keys.length === 0) {
                    infoOptionsSection.hide();
                    return;
                }
                let html = "";
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const value = map[key];
                    if (value === undefined || value === null) continue;
                    const display =
                        typeof value === "object" ? JSON.stringify(value) : String(value);
                    html += buildRow(key, escapeHtml(display));
                }
                infoOptions.html(html);
                infoOptionsSection.css("display", "");
            };

            // renders the scalar fields of the result payload on the
            // info tab, skipping the heavy keys that have their own
            // dedicated surface (the result and traceback tabs) so
            // the section stays focused on the operator summary
            const renderInfoResult = function(job) {
                const result = resultObject(job);
                if (!result) {
                    infoResultSection.hide();
                    return;
                }
                const keys = Object.keys(result);
                let html = "";
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    if (RESULT_SUMMARY_SKIP.indexOf(key) !== -1) continue;
                    const value = result[key];
                    if (value === undefined || value === null) continue;
                    const display =
                        typeof value === "object" ? JSON.stringify(value) : String(value);
                    html += buildRow(key, escapeHtml(display));
                }
                if (!html) {
                    infoResultSection.hide();
                    return;
                }
                infoResultSummary.html(html);
                infoResultSection.css("display", "");
            };

            // renders the collapsible logs section of the info tab,
            // populating the inner list with one row per log entry
            // (timestamp, severity tag, source, message) and hiding
            // the whole section when no logs are present
            const renderInfoLogs = function(job) {
                const entries = resolveLogs(job);
                if (entries.length === 0) {
                    infoLogsSection.hide();
                    return;
                }
                infoLogs.empty();
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    const row = jQuery('<div class="modal-print-job-log"></div>');
                    const time = jQuery(
                        '<span class="modal-print-job-log-time"></span>'
                    ).text(entry[0] || "");
                    const level = jQuery(
                        '<span class="modal-print-job-log-level modal-print-job-log-level-' +
                            logSeverityVariant(entry[2]) +
                            '"></span>'
                    ).text(entry[2] || "");
                    const source = jQuery(
                        '<span class="modal-print-job-log-source"></span>'
                    ).text(entry[1] || "");
                    const message = jQuery(
                        '<span class="modal-print-job-log-message"></span>'
                    ).text(entry[3] || "");
                    row.append(time);
                    row.append(level);
                    row.append(source);
                    row.append(message);
                    infoLogs.append(row);
                }
                applyLogsToggle();
                infoLogsSection.css("display", "");
            };

            // applies the current open / closed state of the logs
            // collapsible to the dom so the toggle label and the
            // logs list stay in sync after every render pass
            const applyLogsToggle = function() {
                const showLabel = infoLogsToggle.attr("data-show-label") || "Show Logs";
                const hideLabel = infoLogsToggle.attr("data-hide-label") || "Hide Logs";
                if (state.logsOpen) {
                    infoLogs.show();
                    infoLogsToggle.text(hideLabel);
                } else {
                    infoLogs.hide();
                    infoLogsToggle.text(showLabel);
                }
            };

            // composes the four info tab sub renderers in the order
            // they appear inside the info tab content, so each tab
            // refresh paints the same predictable layout
            const renderInfoTab = function(job) {
                renderInfoBasic(job);
                renderInfoOptions(job);
                renderInfoResult(job);
                renderInfoLogs(job);
            };

            // renders a single file tile inside the files grid,
            // dispatching the inline preview between image, video
            // and download link based on the file name extension,
            // gated by the request id captured when the files tab
            // was opened so a late blob from a previous chip never
            // mutates the dom of the currently visible one
            const renderFilesTile = function(job, file, requestId) {
                const tile = jQuery('<div class="modal-print-job-files-tile"></div>');
                const preview = jQuery(
                    '<div class="modal-print-job-files-tile-preview"></div>'
                );
                const title = jQuery(
                    '<div class="modal-print-job-files-tile-name"></div>'
                ).text(file.name);
                const meta = jQuery(
                    '<div class="modal-print-job-files-tile-meta"></div>'
                ).text(formatSize(file.size));

                if (isImage(file.name)) {
                    const img = jQuery("<img />");
                    preview.append(img);
                    fetchBlob(job, file.name)
                        .then(function(url) {
                            if (requestId !== state.filesRequestId) return;
                            if (url) img.attr("src", url);
                        })
                        .catch(function() {
                            // silently ignores blob fetch errors
                        });
                } else if (isVideo(file.name)) {
                    const video = jQuery("<video controls></video>");
                    preview.append(video);
                    fetchBlob(job, file.name)
                        .then(function(url) {
                            if (requestId !== state.filesRequestId) return;
                            if (url) video.attr("src", url);
                        })
                        .catch(function() {
                            // silently ignores blob fetch errors
                        });
                } else {
                    const link = jQuery(
                        '<a class="modal-print-job-files-tile-download"></a>'
                    ).text(labels.download);
                    preview.append(link);
                    fetchBlob(job, file.name)
                        .then(function(url) {
                            if (requestId !== state.filesRequestId) return;
                            if (url) {
                                link.attr("href", url);
                                link.attr("download", file.name);
                            }
                        })
                        .catch(function() {
                            // silently ignores blob fetch errors
                        });
                }

                tile.append(preview);
                tile.append(title);
                tile.append(meta);
                filesGrid.append(tile);
            };

            // renders the files tab content for the given job entry,
            // populating the grid with one tile per file exposed by
            // colony-print and falling back to a friendly empty state
            // when the job has not produced any files yet; the
            // request id captured up front guards every later mutation
            // so a slower response for a previously open job can no
            // longer paint into the modal of the newly opened one
            const renderFilesTab = async function(job) {
                const requestId = ++state.filesRequestId;
                revokeBlobs();
                filesGrid.empty();
                filesEmpty.hide();

                let files = null;
                try {
                    const response = await fetch(
                        job.printUrl + "/jobs/" + job.id + "/files",
                        { headers: { "X-Secret-Key": job.key } }
                    );
                    if (response.status === 200) files = await response.json();
                } catch (err) {
                    // falls through to the empty state below so the
                    // operator gets a friendly hint instead of an
                    // unhandled exception bubbling into the console
                }
                if (requestId !== state.filesRequestId) return;
                if (!files || files.length === 0) {
                    filesEmpty.text(labels.filesEmpty).show();
                    return;
                }
                for (let i = 0; i < files.length; i++) {
                    renderFilesTile(job, files[i], requestId);
                }
            };

            // renders the request tab with the original payload that
            // was sent to colony-print, falling back to a friendly
            // empty hint when the polling has not yet captured the
            // request body from the server
            const renderRequestTab = function(job) {
                const payload = job.request_payload;
                if (payload && Object.keys(payload).length > 0) {
                    requestPre.text(JSON.stringify(payload, null, 4));
                    requestPre.show();
                    requestEmpty.hide();
                } else {
                    requestPre.hide();
                    requestEmpty.text(labels.requestEmpty).show();
                }
            };

            // renders the result tab with the structured response
            // returned by the printing node, leaving the pre empty
            // when no object shaped result is available yet
            const renderResultTab = function(job) {
                const result = resultObject(job);
                resultPre.text(result ? JSON.stringify(result, null, 4) : "");
            };

            // renders the traceback tab with the diagnostic string
            // captured by the printing node when a job fails, kept
            // out of the info tab so the operator can focus on it
            // without scrolling past the summary rows
            const renderTracebackTab = function(job) {
                const result = resultObject(job);
                const traceback = result ? result.traceback : null;
                tracebackPre.text(typeof traceback === "string" ? traceback : "");
            };

            // returns true when the job carries a result object that
            // is worth exposing through the dedicated result tab,
            // skipping the literal "error" string shape and the
            // empty object case so the tab stays out of the way
            const hasResult = function(job) {
                const result = resultObject(job);
                return result !== null && Object.keys(result).length > 0;
            };

            // returns true when the job carries a non empty
            // traceback string nested under the result payload,
            // making the traceback tab worth showing
            const hasTraceback = function(job) {
                const result = resultObject(job);
                if (!result) return false;
                return (
                    typeof result.traceback === "string" && result.traceback.length > 0
                );
            };

            // toggles the visibility of the dynamic tab chips based
            // on the data carried by the given job, so the result
            // and traceback tabs only appear when the operator has
            // something to look at
            const updateTabVisibility = function(job) {
                modalTabs
                    .filter('[data-tab="result"]')
                    .css("display", hasResult(job) ? "" : "none");
                modalTabs
                    .filter('[data-tab="traceback"]')
                    .css("display", hasTraceback(job) ? "" : "none");
            };

            // resolves the currently visible tab key, falling back
            // to the info tab when the persisted selection points
            // at a tab that is currently hidden (typically result
            // or traceback before the underlying data lands)
            const activeTabKey = function() {
                const current = state.activeTab || "info";
                const tab = modalTabs.filter('[data-tab="' + current + '"]');
                if (tab.css("display") === "none") return "info";
                return current;
            };

            // applies the given tab key onto the overlay, swapping
            // the active chip and the visible content pane so the
            // info tab is shown while the others are hidden and
            // vice versa, matching the toggle behavior of settings
            const showTab = function(key) {
                state.activeTab = key;
                modalTabs.removeClass("active");
                modalTabs.filter('[data-tab="' + key + '"]').addClass("active");
                modalOverlay.find(".modal-print-job-tab-content").each(function() {
                    const content = jQuery(this);
                    const visible = content.attr("data-tab") === key;
                    content.css("display", visible ? "" : "none");
                });
            };

            // dispatches the render of the given tab to its dedicated
            // renderer, used both on the initial open and on every
            // polling refresh while the overlay stays on screen
            const renderTab = function(key, job) {
                if (key === "info") renderInfoTab(job);
                else if (key === "files") renderFilesTab(job);
                else if (key === "request") renderRequestTab(job);
                else if (key === "result") renderResultTab(job);
                else if (key === "traceback") renderTracebackTab(job);
            };

            // opens the overlay for the given job, updating the
            // dynamic tab visibility, picking the right active tab
            // and rendering its content with the latest data
            const openJob = function(job) {
                state.openJobId = job.id;
                modalTitle.text(job.name || job.id);
                updateTabVisibility(job);
                showTab(activeTabKey());
                renderTab(activeTabKey(), job);
                modalOverlay.modal("show");
            };

            // refreshes the overlay when the polling loop or the
            // cancel call patches the entry that is currently shown,
            // so the operator does not need to close and reopen the
            // overlay to see the latest status, elapsed time or
            // newly generated files
            const refreshModalIfOpen = function(job) {
                if (!modalOverlay.hasClass("visible")) return;
                if (state.openJobId !== job.id) return;
                modalTitle.text(job.name || job.id);
                updateTabVisibility(job);
                renderTab(activeTabKey(), job);
            };

            // registers a new job from a colony-print response,
            // persisting the entry, drawing its chip and starting
            // the shared poll ticker so the operator sees status
            // updates as the job progresses on the target node
            if (action === "enqueue") {
                const jobInfo = options.jobInfo;
                const entry = {
                    id: jobInfo.id,
                    name: jobInfo.name || jobInfo.id,
                    node_id: jobInfo.node_id,
                    printer: jobInfo.printer || null,
                    printUrl: options.printUrl,
                    key: options.key,
                    status: jobInfo.status || "queued",
                    result: jobInfo.result !== undefined ? jobInfo.result : null,
                    type: jobInfo.type || null,
                    format: jobInfo.format || null,
                    options: jobInfo.options || null,
                    data_length:
                        jobInfo.data_length !== undefined ? jobInfo.data_length : null,
                    request_payload: jobInfo.request_payload || null,
                    queued_time: jobInfo.queued_time || Date.now() / 1000,
                    printing_time: jobInfo.printing_time || null,
                    finish_time: jobInfo.finish_time || null,
                    cancel_time: jobInfo.cancel_time || null
                };
                // upserts the entry into the persisted list so a
                // duplicate enqueue for the same job id replaces
                // the previous record in place instead of leaving
                // a stale copy behind that the polling loop would
                // keep ticking against forever
                const jobs = readJobs();
                let replaced = false;
                for (let i = 0; i < jobs.length; i++) {
                    if (jobs[i].id === entry.id) {
                        jobs[i] = Object.assign({}, jobs[i], entry);
                        replaced = true;
                        break;
                    }
                }
                if (!replaced) jobs.push(entry);
                writeJobs(jobs);
                renderChip(entry);
                startPolling();
                return;
            }

            // imperatively removes a tracked job by id without going
            // through the chip ui, used by external callers that
            // already know the entry should disappear (for example
            // after a manual cleanup on the colony-print side)
            if (action === "dismiss") {
                removeJob(options.id);
                return;
            }

            // registers the click and overlay handlers on the bare
            // initialization path only, guarded by a flag on the
            // shared state so that subsequent enqueue and dismiss
            // calls never stack a second copy of the same listener
            // on the chips container or on the files overlay
            if (!state.bound) {
                state.bound = true;

                // cancel affordance on a queued chip
                chipsContainer.on("click", ".print-jobs-chip-cancel", function(event) {
                    event.stopPropagation();
                    const id = jQuery(this).closest(".print-jobs-chip").attr("data-id");
                    const job = findJob(id);
                    if (job) cancelJob(job);
                });

                // dismiss affordance on a terminal chip
                chipsContainer.on("click", ".print-jobs-chip-dismiss", function(event) {
                    event.stopPropagation();
                    const id = jQuery(this).closest(".print-jobs-chip").attr("data-id");
                    removeJob(id);
                });

                // chip body opens the overlay regardless of the
                // current status so the operator can inspect the
                // request payload and timings from the moment the
                // job is queued, not just after it ends
                chipsContainer.on("click", ".print-jobs-chip", function() {
                    const id = jQuery(this).attr("data-id");
                    const job = findJob(id);
                    if (job) openJob(job);
                });

                // tab strip click swaps the visible pane and
                // immediately renders it for the currently open
                // job, so a switch to files or traceback hits the
                // network only when the operator asks for it
                modalTabs.click(function() {
                    if (!state.openJobId) return;
                    const job = findJob(state.openJobId);
                    if (!job) return;
                    const key = jQuery(this).attr("data-tab");
                    showTab(key);
                    renderTab(key, job);
                });

                // logs collapsible toggle flips the open flag on
                // the shared state and applies the corresponding
                // label and visibility through a single helper
                infoLogsToggle.click(function(event) {
                    event.preventDefault();
                    state.logsOpen = !state.logsOpen;
                    applyLogsToggle();
                });

                // overlay dismiss revokes the cached blob urls and
                // clears the open job id so the polling refresh no
                // longer tries to paint a dom that just left the
                // screen, freeing memory between consecutive opens
                modalOverlay.on("transitionend", function() {
                    if (!modalOverlay.hasClass("visible")) {
                        revokeBlobs();
                        state.openJobId = null;
                    }
                });
            }

            // on plain initialization rehydrates the indicator from
            // the persisted store and resumes polling for any entry
            // that has not yet reached a terminal state
            renderAll();
            const persisted = readJobs();
            const hasActive = persisted.some(function(job) {
                return !isTerminal(job.status);
            });
            if (hasActive) startPolling();
        });

        return this;
    };
})(jQuery);

(function(jQuery) {
    /**
     * Profile manager plugin that owns the behavior of the profile
     * manager screen at `/profiles/manager`, including the inline
     * JSON editors, the reference dropdown, the live preview, the
     * background asset manager, the validate and save flows, and
     * the create / edit mode transitions backed by the matching
     * REST endpoints under `/profiles`.
     *
     * Operates on a .form-manager element and discovers its
     * children (.manager-edit-banner, .manager-validation,
     * .manager-field-editor, .manager-reference-select, etc.)
     * by class name convention.
     */
    jQuery.fn.profilemanager = function(action, options) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const managerToast = jQuery(".toast");
            const templateTab = jQuery("[data-tab-content=template]", context);
            const previewTab = jQuery("[data-tab-content=preview]", context);
            const backgroundsTab = jQuery("[data-tab-content=backgrounds]", context);
            const profileEditor = jQuery("#manager-profile-json", context);
            const inspirationsEditor = jQuery("#manager-inspirations-json", context);
            const editTargetInput = jQuery(".manager-edit-target", context);
            const heroEyebrow = jQuery(".welcome-hero-eyebrow");
            const buttonSave = jQuery(".button-save", context);
            const editBanner = jQuery(".manager-edit-banner", context);
            const editBannerTarget = jQuery(".manager-edit-banner-target", editBanner);
            const editBannerExit = jQuery(".manager-edit-banner-exit", editBanner);
            const validationContainer = jQuery(".manager-validation", context);
            const buttonValidate = jQuery(".button-validate", context);
            const editorSelect = jQuery(".manager-editor-select", context);
            const editorFields = jQuery(".manager-field[data-editor]", context);
            const referenceSelect = jQuery(".manager-reference-select", context);
            const referenceEmpty = jQuery(".manager-reference-empty", templateTab);
            const referenceDetail = jQuery(".manager-reference-detail", templateTab);
            const referenceDetailImage = jQuery(".manager-reference-detail-image", templateTab);
            const referenceDetailName = jQuery(".manager-reference-detail-name", templateTab);
            const referenceDetailMeta = jQuery(".manager-reference-detail-meta", templateTab);
            const referenceDetailStatus = jQuery(".manager-reference-detail-status", templateTab);
            const referenceDetailApply = jQuery(".manager-reference-detail-apply", templateTab);
            const referenceDetailEdit = jQuery(".manager-reference-detail-edit", templateTab);
            const referenceDetailToggle = jQuery(".manager-reference-detail-toggle", templateTab);
            const referenceDetailDelete = jQuery(".manager-reference-detail-delete", templateTab);
            const previewInvalid = jQuery(".manager-reference-preview-invalid", previewTab);
            const previewDetail = jQuery(".manager-reference-preview", previewTab);
            const previewDetailImage = jQuery(".manager-reference-detail-image", previewTab);
            const previewDetailName = jQuery(".manager-reference-detail-name", previewTab);
            const previewDetailMeta = jQuery(".manager-reference-detail-meta", previewTab);
            const modalDeleteProfile = jQuery(".modal-overlay-delete-profile");
            const modalDeleteTarget = jQuery(".modal-target", modalDeleteProfile);
            const buttonModalDelete = jQuery(".button-modal-delete", modalDeleteProfile);
            const assetsGrid = jQuery(".manager-assets-grid", backgroundsTab);
            const assetsEmpty = jQuery(".manager-assets-empty", backgroundsTab);
            const assetsErrors = jQuery(".manager-assets-errors", backgroundsTab);
            const assetsFilename = jQuery(".manager-assets-filename", backgroundsTab);
            const assetsFile = jQuery(".manager-assets-file", backgroundsTab);
            const assetsPicker = jQuery(".manager-assets-picker", backgroundsTab);
            const assetsSubmit = jQuery(".manager-assets-submit", backgroundsTab);
            const modalDeleteAsset = jQuery(".modal-overlay-delete-asset");
            const modalDeleteAssetTarget = jQuery(".modal-target", modalDeleteAsset);
            const buttonModalDeleteAsset = jQuery(".button-modal-delete-asset", modalDeleteAsset);
            const bundleTab = jQuery("[data-tab-content=bundle]", context);
            const bundleErrors = jQuery(".manager-bundle-errors", bundleTab);
            const bundleFile = jQuery(".manager-bundle-file", bundleTab);
            const bundlePicker = jQuery(".manager-bundle-picker", bundleTab);
            const bundleSubmit = jQuery(".manager-bundle-submit", bundleTab);
            const modalRestoreBundle = jQuery(".modal-overlay-restore-bundle");
            const buttonModalRestoreBundle = jQuery(
                ".button-modal-restore-bundle",
                modalRestoreBundle
            );
            const dismissLabel = context.attr("data-dismiss-label") || "Dismiss";
            const disabledSuffix = context.attr("data-disabled-suffix") || " (disabled)";
            const metaIdLabel = context.attr("data-meta-id-label") || "ID";
            const metaSizeLabel = context.attr("data-meta-size-label") || "Size";
            const metaOrientationLabel =
                context.attr("data-meta-orientation-label") || "Orientation";
            const metaShapeLabel = context.attr("data-meta-shape-label") || "Shape";
            const metaMaxLinesLabel = context.attr("data-meta-max-lines-label") || "Max Lines";
            const metaInspirationsLabel =
                context.attr("data-meta-inspirations-label") || "Inspirations";
            const assetErrorFilename =
                context.attr("data-asset-error-filename") || "filename is required";
            const assetErrorFile = context.attr("data-asset-error-file") || "file is required";
            const validationOkLabel = context.attr("data-validation-ok") || "Looks good";
            const validationIssuesSingular =
                context.attr("data-validation-issues-singular") || "{n} issue found";
            const validationIssuesPlural =
                context.attr("data-validation-issues-plural") || "{n} issues found";
            const saveErrorTitle =
                context.attr("data-save-error-title") || "Could not save profile";
            let cachedProfiles = null;
            let selectedKey = null;
            let pendingDeleteKey = null;
            let pendingDeleteAsset = null;
            let previewTimer = null;

            // appends a single key / value row to the given meta
            // container so the metadata table stays consistent across
            // every preview rendered for the picked or edited profile
            const appendMetaRow = function(container, label, value) {
                if (value === undefined || value === null || value === "") return;
                const row = jQuery("<div></div>");
                row.addClass("manager-reference-detail-meta-row");
                const key = jQuery("<span></span>");
                key.addClass("manager-reference-detail-meta-key");
                key.text(label);
                const val = jQuery("<span></span>");
                val.addClass("manager-reference-detail-meta-value");
                val.text(String(value));
                row.append(key);
                row.append(val);
                container.append(row);
            };

            // renders a preview card with the background image, display
            // name, and a small metadata table that mirrors the most
            // relevant fields of the profile schema, used by both the
            // template tab and the live preview tab
            const renderDetail = function(
                profile,
                imageElement,
                nameElement,
                metaElement,
                imageUrl
            ) {
                if (imageUrl) {
                    imageElement.css("background-image", "url(" + imageUrl + ")");
                } else if (profile.background) {
                    imageElement.css(
                        "background-image",
                        "url(/static/profiles/" + encodeURI(profile.background) + ")"
                    );
                } else {
                    imageElement.css("background-image", "none");
                }
                nameElement.text(profile.name || profile.id || "");
                metaElement.empty();
                appendMetaRow(metaElement, metaIdLabel, profile.id);
                const unit = profile.unit || "mm";
                if (profile.width !== undefined && profile.height !== undefined) {
                    appendMetaRow(
                        metaElement,
                        metaSizeLabel,
                        profile.width + "x" + profile.height + " " + unit
                    );
                }
                if (profile.orientation) {
                    appendMetaRow(metaElement, metaOrientationLabel, profile.orientation);
                }
                if (profile.shape) appendMetaRow(metaElement, metaShapeLabel, profile.shape);
                if (profile.text && profile.text.max_lines !== undefined) {
                    appendMetaRow(metaElement, metaMaxLinesLabel, profile.text.max_lines);
                }
                if (profile._inspirations && profile._inspirations.length) {
                    appendMetaRow(metaElement, metaInspirationsLabel, profile._inspirations.length);
                }
            };

            // refreshes the live preview from the current editor contents
            // by parsing the profile JSON, falling back to a placeholder
            // when the payload is invalid so the panel never spams errors
            // while the user is typing
            const refreshPreview = function() {
                const text = profileEditor.val() || "";
                let profile = null;
                try {
                    profile = JSON.parse(text);
                } catch (err) {
                    profile = null;
                }
                if (!profile || typeof profile !== "object") {
                    previewDetail.prop("hidden", true);
                    previewInvalid.prop("hidden", false);
                    return;
                }
                renderDetail(
                    profile,
                    previewDetailImage,
                    previewDetailName,
                    previewDetailMeta,
                    null
                );
                previewInvalid.prop("hidden", true);
                previewDetail.prop("hidden", false);
            };

            // debounces the live preview update so that fast keystrokes
            // do not thrash the JSON parser on every input event while
            // still feeling responsive after a brief pause
            const schedulePreview = function() {
                if (previewTimer !== null) clearTimeout(previewTimer);
                previewTimer = setTimeout(refreshPreview, 400);
            };

            // populates the dropdown with one option per available
            // profile and caches the catalog so subsequent selections
            // do not need to hit the server again
            const renderReferenceSelect = async function() {
                try {
                    const response = await fetch("/profiles?include_disabled=1");
                    if (response.status !== 200) return;
                    cachedProfiles = await response.json();
                    const previousValue = referenceSelect.val() || "";
                    referenceSelect.children("option:not([value=''])").remove();
                    const keys = Object.keys(cachedProfiles);
                    for (const key of keys) {
                        const profile = cachedProfiles[key];
                        const option = jQuery("<option></option>");
                        option.attr("value", key);
                        const label = profile.name || key;
                        option.text(profile.enabled === false ? label + disabledSuffix : label);
                        referenceSelect.append(option);
                    }
                    if (previousValue && cachedProfiles[previousValue]) {
                        referenceSelect.val(previousValue);
                    } else if (previousValue) {
                        referenceSelect.val("");
                        selectedKey = null;
                        referenceDetail.prop("hidden", true);
                        referenceEmpty.prop("hidden", false);
                    }
                } catch (err) {
                    // silently ignores fetch errors so the manager screen
                    // still renders without a populated reference dropdown
                }
            };
            renderReferenceSelect();
            refreshPreview();

            // switches the active reference tab by toggling the visible
            // tab content and the highlighted tab button so the right
            // pane can flip between the existing profiles, the live
            // preview, and the background asset manager
            jQuery(".manager-reference-tab", context).click(function() {
                const tab = jQuery(this);
                const target = tab.attr("data-tab");
                jQuery(".manager-reference-tab", context).removeClass("active");
                tab.addClass("active");
                jQuery(".manager-reference-tab-content", context).prop("hidden", true);
                jQuery("[data-tab-content=" + target + "]", context).prop("hidden", false);
                if (target === "preview") refreshPreview();
            });

            // shows the selected editor and hides the other so only one
            // textarea occupies the vertical space at a time, also
            // refreshing the JSON highlight overlay since the editor was
            // hidden when the underlying value last changed
            const selectEditor = function(target) {
                if (!target) return;
                editorFields.each(function() {
                    const field = jQuery(this);
                    const active = field.attr("data-editor") === target;
                    field.prop("hidden", !active);
                });
                if (editorSelect.val() !== target) {
                    editorSelect.val(target);
                }
                if (target === "profile") profileEditor.jsonhighlight("refresh");
                if (target === "inspirations") inspirationsEditor.jsonhighlight("refresh");
            };
            editorSelect.on("change", function() {
                selectEditor(editorSelect.val());
            });
            selectEditor(editorSelect.val() || "profile");

            // shows the preview for the picked profile and remembers
            // the selection so the apply, edit, and delete buttons can
            // later operate on the same template
            referenceSelect.on("change", function() {
                const key = referenceSelect.val();
                selectedKey = key || null;
                if (!key || !cachedProfiles || !cachedProfiles[key]) {
                    referenceDetail.prop("hidden", true);
                    referenceEmpty.prop("hidden", false);
                    return;
                }
                const profile = cachedProfiles[key];
                renderDetail(
                    profile,
                    referenceDetailImage,
                    referenceDetailName,
                    referenceDetailMeta,
                    null
                );
                const disabled = profile.enabled === false;
                referenceDetail.toggleClass("disabled", disabled);
                referenceDetailStatus.prop("hidden", !disabled);
                referenceDetailToggle.text(
                    disabled
                        ? referenceDetailToggle.attr("data-enable-label")
                        : referenceDetailToggle.attr("data-disable-label")
                );
                referenceEmpty.prop("hidden", true);
                referenceDetail.prop("hidden", false);
            });

            // loads the picked profile into the editor textareas as
            // the starting point of the new profile, copying the
            // matching inspirations entries when the profile carries
            // them so both editors stay in sync, and forces create mode
            // so a previous edit selection does not leak into the new
            // save submission
            referenceDetailApply.click(function() {
                if (!selectedKey || !cachedProfiles) return;
                const profile = cachedProfiles[selectedKey];
                if (!profile) return;
                const sanitized = Object.assign({}, profile);
                const attachedInspirations = sanitized._inspirations || null;
                delete sanitized._inspirations;
                profileEditor.val(JSON.stringify(sanitized, null, 4));
                if (attachedInspirations) {
                    inspirationsEditor.val(JSON.stringify(attachedInspirations, null, 4));
                } else {
                    inspirationsEditor.val("");
                }
                editTargetInput.val("");
                heroEyebrow.text(heroEyebrow.attr("data-create-label"));
                buttonSave.text(buttonSave.attr("data-create-label"));
                editBannerTarget.text("");
                editBanner.prop("hidden", true);
                profileEditor.jsonhighlight("refresh");
                inspirationsEditor.jsonhighlight("refresh");
                refreshPreview();
            });

            // loads the picked profile into the editor textareas and
            // flips the form into edit mode so the next save overwrites
            // the existing profile instead of creating a duplicate
            referenceDetailEdit.click(function() {
                if (!selectedKey || !cachedProfiles) return;
                const profile = cachedProfiles[selectedKey];
                if (!profile) return;
                const sanitized = Object.assign({}, profile);
                const attachedInspirations = sanitized._inspirations || null;
                delete sanitized._inspirations;
                profileEditor.val(JSON.stringify(sanitized, null, 4));
                if (attachedInspirations) {
                    inspirationsEditor.val(JSON.stringify(attachedInspirations, null, 4));
                } else {
                    inspirationsEditor.val("");
                }
                editTargetInput.val(selectedKey);
                heroEyebrow.text(heroEyebrow.attr("data-edit-label"));
                buttonSave.text(buttonSave.attr("data-edit-label"));
                editBannerTarget.text(selectedKey);
                editBanner.prop("hidden", false);
                profileEditor.jsonhighlight("refresh");
                inspirationsEditor.jsonhighlight("refresh");
                refreshPreview();
            });

            // exits the edit mode without leaving the manager screen so
            // the user can pivot from editing an existing profile to
            // creating a new one without reloading or navigating away
            editBannerExit.click(function() {
                editTargetInput.val("");
                heroEyebrow.text(heroEyebrow.attr("data-create-label"));
                buttonSave.text(buttonSave.attr("data-create-label"));
                editBannerTarget.text("");
                editBanner.prop("hidden", true);
            });

            // dismisses an error or validation banner when its close
            // button is clicked so the panels do not stay sticky after
            // the user has acknowledged the message and moved on
            context.on("click", ".manager-banner-close", function() {
                const banner = jQuery(this).closest(".manager-errors, .manager-validation");
                if (banner.hasClass("manager-validation")) {
                    banner.prop("hidden", true);
                } else {
                    banner.remove();
                }
            });

            // flips the enabled flag of the picked profile via the
            // dedicated toggle endpoint, refreshing the catalog so the
            // dropdown and detail panel reflect the new state and the
            // welcome and viewport selectors filter accordingly
            referenceDetailToggle.click(async function() {
                if (!selectedKey || !cachedProfiles) return;
                const profile = cachedProfiles[selectedKey];
                const nextEnabled = profile.enabled === false;
                referenceDetailToggle.prop("disabled", true);
                try {
                    const formData = new FormData();
                    formData.append("enabled", nextEnabled ? "1" : "0");
                    const response = await fetch(
                        "/profiles/" + encodeURIComponent(selectedKey) + "/enabled",
                        { method: "POST", body: formData }
                    );
                    if (response.status !== 200) return;
                    const previousKey = selectedKey;
                    await renderReferenceSelect();
                    referenceSelect.val(previousKey).trigger("change");
                } finally {
                    referenceDetailToggle.prop("disabled", false);
                }
            });

            // opens the delete confirmation modal pre-populated with
            // the picked profile identifier so the user can review
            // exactly which profile is about to be removed
            referenceDetailDelete.click(function() {
                if (!selectedKey) return;
                pendingDeleteKey = selectedKey;
                modalDeleteTarget.text(selectedKey);
                modalDeleteProfile.modal("show");
            });

            // posts the delete request for the pending profile and
            // reloads the page on success so the dropdown is refreshed
            // without the removed entry
            buttonModalDelete.click(async function() {
                if (!pendingDeleteKey) return;
                try {
                    const response = await fetch(
                        "/profiles/" + encodeURIComponent(pendingDeleteKey) + "/delete",
                        { method: "POST" }
                    );
                    if (response.status !== 200) return;
                    window.location.reload();
                } catch (err) {
                    // silently ignores delete errors so the manager screen
                    // stays interactive when the network is unavailable
                }
            });

            // reads the picked file as text and stuffs the result into
            // the textarea referenced by the picker's data-target so
            // the editor remains the source of truth for the submission
            jQuery(".manager-field-loader-input", context).on("change", function() {
                const input = this;
                if (!input.files || input.files.length === 0) return;
                const targetId = jQuery(input).attr("data-target");
                const target = jQuery("#" + targetId);
                if (target.length === 0) return;
                const reader = new FileReader();
                reader.onload = function() {
                    target.val(reader.result);
                    input.value = "";
                    target.jsonhighlight("refresh");
                    schedulePreview();
                };
                reader.readAsText(input.files[0]);
            });

            // schedules a live preview refresh on every input event so
            // the right pane stays in sync with whatever is currently
            // in the editor textareas
            profileEditor.on("input", schedulePreview);
            inspirationsEditor.on("input", schedulePreview);

            // initializes the json syntax highlighter overlay on both
            // editor textareas so the user sees colored tokens while
            // typing without losing native textarea behavior
            profileEditor.jsonhighlight();
            inspirationsEditor.jsonhighlight();

            // initializes the delete confirmation modals so the modal
            // plugin can manage their show, hide, and dismiss behaviors
            modalDeleteProfile.modal();

            // renders the asset list as a thumbnail grid, falling back
            // to a neutral empty state when no PNG file lives in the
            // profiles directory so the panel never looks broken
            const renderAssets = async function() {
                try {
                    const response = await fetch("/profiles/assets");
                    if (response.status !== 200) return;
                    const payload = await response.json();
                    const assets = payload.assets || [];
                    assetsGrid.empty();
                    if (assets.length === 0) {
                        assetsEmpty.prop("hidden", false);
                        return;
                    }
                    assetsEmpty.prop("hidden", true);
                    for (const filename of assets) {
                        const card = jQuery("<div></div>");
                        card.addClass("manager-assets-card");
                        card.attr("data-filename", filename);
                        const image = jQuery("<div></div>");
                        image.addClass("manager-assets-card-image");
                        image.css(
                            "background-image",
                            "url(/static/profiles/" + encodeURI(filename) + ")"
                        );
                        card.append(image);
                        const name = jQuery("<div></div>");
                        name.addClass("manager-assets-card-name");
                        name.text(filename);
                        card.append(name);
                        const download = jQuery("<a></a>");
                        download.attr("href", "/static/profiles/" + encodeURI(filename));
                        download.attr("download", filename);
                        download.addClass("manager-assets-card-download");
                        download.text("↓");
                        card.append(download);
                        const remove = jQuery("<button></button>");
                        remove.attr("type", "button");
                        remove.addClass("manager-assets-card-delete");
                        remove.text("×");
                        card.append(remove);
                        assetsGrid.append(card);
                    }
                } catch (err) {
                    // silently ignores fetch errors so the manager screen
                    // stays interactive even when the assets endpoint is
                    // momentarily unavailable
                }
            };
            renderAssets();

            // renders the asset upload error banner from the structured
            // list returned by the server so the failure look matches
            // the existing inline error treatment of the profile editor
            const renderAssetErrors = function(errors) {
                if (!errors || errors.length === 0) {
                    assetsErrors.empty().prop("hidden", true);
                    return;
                }
                assetsErrors.empty();
                for (const error of errors) {
                    const item = jQuery("<div></div>");
                    item.addClass("manager-assets-errors-item");
                    item.text(error);
                    assetsErrors.append(item);
                }
                assetsErrors.prop("hidden", false);
            };

            // visually marks the asset picker when a file is queued so
            // the user can tell at a glance whether the next upload
            // submission already has a payload attached, and pre-fills
            // the filename input with the picked file name unless the
            // user has already typed a custom value
            assetsFile.on("change", function() {
                if (this.files && this.files.length > 0) {
                    assetsPicker.addClass("has-file");
                    if (!(assetsFilename.val() || "").trim()) {
                        assetsFilename.val(this.files[0].name);
                    }
                } else {
                    assetsPicker.removeClass("has-file");
                }
            });

            // uploads the queued PNG under the requested filename via
            // a multipart request to the asset endpoint, refreshing the
            // grid on success and surfacing server errors inline
            assetsSubmit.click(async function() {
                const filename = (assetsFilename.val() || "").trim();
                const file = assetsFile.get(0).files[0];
                const localErrors = [];
                if (!filename) localErrors.push(assetErrorFilename);
                if (!file) localErrors.push(assetErrorFile);
                if (localErrors.length > 0) {
                    renderAssetErrors(localErrors);
                    return;
                }
                assetsSubmit.prop("disabled", true);
                try {
                    const formData = new FormData();
                    formData.append("filename", filename);
                    formData.append("file", file);
                    const response = await fetch("/profiles/assets", {
                        method: "POST",
                        body: formData
                    });
                    if (response.status === 200) {
                        renderAssetErrors([]);
                        assetsFilename.val("");
                        assetsFile.val("");
                        assetsPicker.removeClass("has-file");
                        await renderAssets();
                        const message =
                            context.attr("data-toast-asset-saved") || "Background uploaded";
                        managerToast.toast("show", message);
                        return;
                    }
                    let errors = [];
                    try {
                        const payload = await response.json();
                        errors = payload.errors || [];
                    } catch (err) {
                        errors = ["unexpected server response"];
                    }
                    renderAssetErrors(errors);
                } catch (err) {
                    renderAssetErrors([String(err)]);
                } finally {
                    assetsSubmit.prop("disabled", false);
                }
            });

            // opens the asset delete confirmation modal pre-populated
            // with the filename so the user can review exactly which
            // PNG asset is about to be removed
            assetsGrid.on("click", ".manager-assets-card-delete", function() {
                const card = jQuery(this).closest(".manager-assets-card");
                const filename = card.attr("data-filename");
                if (!filename) return;
                pendingDeleteAsset = filename;
                modalDeleteAssetTarget.text(filename);
                modalDeleteAsset.modal("show");
            });

            // posts the delete request for the pending asset and
            // refreshes the grid in place on success so the removed
            // entry disappears without a hard page reload
            buttonModalDeleteAsset.click(async function() {
                if (!pendingDeleteAsset) return;
                try {
                    const response = await fetch(
                        "/profiles/assets/" + encodeURIComponent(pendingDeleteAsset) + "/delete",
                        { method: "POST" }
                    );
                    if (response.status !== 200) return;
                    await renderAssets();
                    const message =
                        context.attr("data-toast-asset-deleted") || "Background removed";
                    managerToast.toast("show", message);
                } catch (err) {
                    // silently ignores delete errors so the manager screen
                    // stays interactive when the network is unavailable
                } finally {
                    pendingDeleteAsset = null;
                    modalDeleteAsset.modal("hide");
                }
            });

            // initializes the asset delete confirmation modal so the
            // modal plugin can manage its show, hide, and dismiss
            // behaviors alongside the profile delete modal
            modalDeleteAsset.modal();

            // renders the bundle import error banner from the structured
            // payload returned by the server so the failure look matches
            // the existing inline error treatment of the asset panel
            const renderBundleErrors = function(errors) {
                if (!errors || errors.length === 0) {
                    bundleErrors.empty().prop("hidden", true);
                    return;
                }
                bundleErrors.empty();
                for (const error of errors) {
                    const item = jQuery("<div></div>");
                    item.addClass("manager-assets-errors-item");
                    item.text(error);
                    bundleErrors.append(item);
                }
                bundleErrors.prop("hidden", false);
            };

            // visually marks the bundle picker when a zip is queued so
            // the user can tell at a glance whether the next restore
            // submission already has a payload attached
            bundleFile.on("change", function() {
                if (this.files && this.files.length > 0) {
                    bundlePicker.addClass("has-file");
                } else {
                    bundlePicker.removeClass("has-file");
                }
            });

            // opens the restore confirmation modal so the user can
            // review the destructive full replace semantics before
            // the on disk profiles directory is wiped and rebuilt
            bundleSubmit.click(function() {
                if (!bundleFile.get(0).files[0]) {
                    renderBundleErrors(["file is required"]);
                    return;
                }
                renderBundleErrors([]);
                modalRestoreBundle.modal("show");
            });

            // posts the queued bundle to the server which wipes the
            // profiles directory and unpacks the archive in place,
            // then reloads the page so every cached profile list and
            // dropdown reflects the freshly restored catalog
            buttonModalRestoreBundle.click(async function() {
                const file = bundleFile.get(0).files[0];
                if (!file) {
                    modalRestoreBundle.modal("hide");
                    return;
                }
                buttonModalRestoreBundle.prop("disabled", true);
                try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const response = await fetch("/profiles/bundle", {
                        method: "POST",
                        body: formData
                    });
                    if (response.status === 200) {
                        const message =
                            context.attr("data-toast-bundle-restored") || "Bundle restored";
                        managerToast.toast("show", message);
                        window.location.reload();
                        return;
                    }
                    let errors = [];
                    try {
                        const payload = await response.json();
                        errors = payload.errors || [payload.error || "unexpected server response"];
                    } catch (err) {
                        errors = ["unexpected server response"];
                    }
                    modalRestoreBundle.modal("hide");
                    renderBundleErrors(errors);
                } catch (err) {
                    modalRestoreBundle.modal("hide");
                    renderBundleErrors([String(err)]);
                } finally {
                    buttonModalRestoreBundle.prop("disabled", false);
                }
            });

            // initializes the restore confirmation modal so the modal
            // plugin can manage its show, hide, and dismiss behaviors
            // alongside the delete confirmation modals
            modalRestoreBundle.modal();

            // runs the profile and inspirations payloads through the
            // server side validator without persisting anything and
            // surfaces the resulting messages inline so the user can
            // iterate on the editor before committing to a save
            buttonValidate.click(async function() {
                buttonValidate.prop("disabled", true);
                try {
                    const formData = new FormData();
                    formData.append("profile_json", profileEditor.val() || "");
                    formData.append("inspirations_json", inspirationsEditor.val() || "");
                    formData.append("edit_target", editTargetInput.val() || "");
                    const response = await fetch("/profiles/validate", {
                        method: "POST",
                        body: formData
                    });
                    if (response.status !== 200) return;
                    const payload = await response.json();
                    const errors = payload.errors || [];
                    validationContainer.empty();
                    const close = jQuery('<button type="button"></button>');
                    close.addClass("manager-banner-close");
                    close.attr("aria-label", dismissLabel);
                    close.text(dismissLabel);
                    validationContainer.append(close);
                    if (errors.length === 0) {
                        validationContainer.addClass("valid");
                        const title = jQuery("<div></div>");
                        title.addClass("manager-validation-title");
                        title.text(validationOkLabel);
                        validationContainer.append(title);
                    } else {
                        validationContainer.removeClass("valid");
                        const title = jQuery("<div></div>");
                        title.addClass("manager-validation-title");
                        const template =
                            errors.length === 1 ? validationIssuesSingular : validationIssuesPlural;
                        title.text(template.replace("{n}", errors.length));
                        validationContainer.append(title);
                        const list = jQuery("<ul></ul>");
                        list.addClass("manager-validation-list");
                        for (const error of errors) {
                            const item = jQuery("<li></li>");
                            item.addClass("manager-validation-item");
                            item.text(error);
                            list.append(item);
                        }
                        validationContainer.append(list);

                        // routes the user to the editor that owns the
                        // first reported error so the failing payload is
                        // immediately visible instead of being hidden by
                        // the dropdown selection of the other editor
                        const firstError = errors[0] || "";
                        if (firstError.indexOf("inspirations:") === 0) {
                            selectEditor("inspirations");
                        } else if (firstError.indexOf("profile:") === 0) {
                            selectEditor("profile");
                        }
                    }
                    validationContainer.prop("hidden", false);
                } catch (err) {
                    // silently ignores validation request errors so the
                    // manager screen stays interactive when offline
                } finally {
                    buttonValidate.prop("disabled", false);
                }
            });

            // renders the same red error banner the server side render
            // path produced before the form was switched to AJAX so the
            // failure look stays consistent across both interaction modes
            const renderManagerErrors = function(errors) {
                const existing = jQuery(".manager-errors", context);
                if (existing.length > 0) existing.remove();
                if (!errors || errors.length === 0) return;
                const banner = jQuery("<div></div>");
                banner.addClass("manager-errors");
                const close = jQuery('<button type="button"></button>');
                close.addClass("manager-banner-close");
                close.attr("aria-label", dismissLabel);
                close.text(dismissLabel);
                banner.append(close);
                const title = jQuery("<div></div>");
                title.addClass("manager-errors-title");
                title.text(saveErrorTitle);
                banner.append(title);
                const list = jQuery("<ul></ul>");
                list.addClass("manager-errors-list");
                for (const error of errors) {
                    const item = jQuery("<li></li>");
                    item.addClass("manager-errors-item");
                    item.text(error);
                    list.append(item);
                }
                banner.append(list);
                editBanner.after(banner);

                // routes the user to the editor that owns the first
                // reported error so the failing payload is immediately
                // visible after a save attempt rather than hidden behind
                // the dropdown selection of the other editor
                const firstError = errors[0] || "";
                if (firstError.indexOf("inspirations:") === 0) {
                    selectEditor("inspirations");
                } else if (firstError.indexOf("profile:") === 0) {
                    selectEditor("profile");
                }
            };

            // intercepts the form submission so the save runs as an AJAX
            // request that keeps the user on the profile manager, refreshes
            // the reference dropdown with the newly saved entry, and signals
            // success through the existing toast plugin without losing the
            // current editor context
            context.submit(async function(event) {
                event.preventDefault();
                buttonSave.prop("disabled", true);
                try {
                    const formData = new FormData(context.get(0));
                    const response = await fetch("/profiles", {
                        method: "POST",
                        body: formData
                    });
                    if (response.status === 200) {
                        const payload = await response.json();
                        renderManagerErrors([]);
                        validationContainer.empty().prop("hidden", true);

                        // updates the edit target so a subsequent save
                        // applies to the freshly persisted profile id and
                        // the banner reflects the same identifier after a
                        // rename, switching the form into edit mode when
                        // a brand new profile was just created
                        const savedId = payload.id || "";
                        editTargetInput.val(savedId);
                        heroEyebrow.text(heroEyebrow.attr("data-edit-label"));
                        buttonSave.text(buttonSave.attr("data-edit-label"));
                        editBannerTarget.text(savedId);
                        editBanner.prop("hidden", false);

                        // refreshes the reference dropdown so the newly
                        // saved or renamed profile appears immediately
                        // without forcing a hard page reload
                        await renderReferenceSelect();

                        const savedMessage = context.attr("data-toast-saved") || "Profile saved";
                        managerToast.toast("show", savedMessage);
                        return;
                    }
                    let errors = [];
                    try {
                        const payload = await response.json();
                        errors = payload.errors || [];
                    } catch (err) {
                        errors = ["unexpected server response"];
                    }
                    renderManagerErrors(errors);
                } catch (err) {
                    renderManagerErrors([String(err)]);
                } finally {
                    buttonSave.prop("disabled", false);
                }
            });
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
            const variant =
                baseProfile && baseProfile.variants ? baseProfile.variants[index] : null;
            const mergedProfile = variant ? applyVariant(baseProfile, variant) : baseProfile;
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
     *   "change"      - triggered when the text content changes,
     *                   passing the updated text array as argument
     *   "caretchange" - triggered when the caret position changes
     *                   without altering the text content, passing
     *                   the text array and new caret position as
     *                   arguments
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
                notifyCaretChange(newPosition);
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
                notifyCaretChange(newPosition);
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
                notifyCaretChange(newPosition);
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
                notifyCaretChange(newPosition);
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

            // notifies listeners that the caret has moved without
            // changing the text content so that downstream consumers
            // (e.g. the font selector) can react to the new position
            const notifyCaretChange = function(caretPosition) {
                const text = body.data("text") || [];
                context.triggerHandler("caretchange", [text, caretPosition]);
            };

            // prevents duplicate bindings if already initialized
            if (body.data("_texteditor_initialized")) return;
            body.data("_texteditor_initialized", true);

            // binds the key handler to the virtual keyboard containers
            // so that key presses on the on-screen keyboards are forwarded
            jQuery(".keyboard-container").bind("key", keyHandler);
            jQuery(".emojis-container").bind("key", keyHandler);
            jQuery(".emojisp-container").bind("key", keyHandler);

            // binds the fallback caret click handler on the container
            // itself so taps that miss any character span by a few
            // pixels still resolve to the nearest character
            bindContainerCaretClick(context, body);

            body.bind("keydown", keyboardHandler);
        });

        return this;
    };

    /**
     * Binds a click handler on a DOM element that repositions
     * the caret either before or after the clicked element based
     * on which horizontal half of the element received the click,
     * so that all caret positions including the start of a line
     * are reachable by mouse; the handler is also bound on the
     * container itself with event delegation so that taps landing
     * on the container padding around the first or last character
     * still resolve to the nearest character span, working around
     * iOS Safari's touch hit-test that occasionally promotes the
     * click target to the closest interactive ancestor when the
     * tap falls in the few pixel gap before or after a span.
     *
     * @param {Element} element The DOM element to bind the click handler on.
     * @param {Element} container The viewer container holding all elements.
     * @param {Element} body The body element used for state storage.
     */
    const bindCaretClick = function(element, container, body) {
        element.click(function(event) {
            event.stopPropagation();
            placeCaretFromClick(jQuery(this), event, container, body);
        });
    };

    /**
     * Places the caret at the appropriate position based on the
     * clicked element and the click event coordinates, splitting
     * the clicked element horizontally so that the left half places
     * the caret before it and the right half places it after.
     *
     * @param {Element} el The clicked element wrapped in jQuery.
     * @param {Event} event The original click event for the x coord.
     * @param {Element} container The viewer container holding all elements.
     * @param {Element} body The body element used for state storage.
     */
    const placeCaretFromClick = function(el, event, container, body) {
        const caret = container.find("> .caret");
        const index = container.children(":not(.caret)").index(el);
        if (index < 0) return;

        let pos;
        if (el.hasClass("newline")) {
            el.after(caret);
            pos = index;
        } else {
            const rect = el.get(0).getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            if (event.clientX < midpoint) {
                el.before(caret);
                pos = index - 1;
            } else {
                el.after(caret);
                pos = index;
            }
        }

        body.data("caret_position", pos);
        const text = body.data("text") || [];
        container.triggerHandler("caretchange", [text, pos]);
    };

    /**
     * Binds a fallback click handler on the viewer container that
     * resolves taps landing outside any character span to the
     * nearest character, so that iOS Safari touches that miss the
     * span by a few pixels still position the caret correctly.
     *
     * @param {Element} container The viewer container element.
     * @param {Element} body The body element used for state storage.
     */
    const bindContainerCaretClick = function(container, body) {
        container.click(function(event) {
            if (event.target !== container.get(0)) return;
            const children = container.children(":not(.caret)");
            if (children.length === 0) return;

            // walks every character span looking for the one whose
            // horizontal range covers the click x coordinate, with
            // a small tolerance on both sides so taps in the gap
            // between characters still resolve to a span
            let nearest = null;
            let nearestDistance = Infinity;
            children.each(function() {
                const rect = this.getBoundingClientRect();
                if (event.clientX >= rect.left && event.clientX <= rect.right) {
                    nearest = this;
                    nearestDistance = 0;
                    return false;
                }
                const distance = Math.min(
                    Math.abs(event.clientX - rect.left),
                    Math.abs(event.clientX - rect.right)
                );
                if (distance < nearestDistance) {
                    nearest = this;
                    nearestDistance = distance;
                }
            });

            if (nearest) placeCaretFromClick(jQuery(nearest), event, container, body);
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
                    jQuery("> .viewport-background", context).remove();
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

                // applies the background image behind the viewport using
                // an inline img element so the user can preview the
                // engraving on a realistic surface; the dedicated element
                // is used in place of a CSS background-image because iOS
                // Safari does not re-rasterize bitmap backgrounds when a
                // parent css transform scales them up, producing a low
                // resolution look at higher zoom levels
                context.css({
                    "background-image": "",
                    "background-size": "",
                    "background-repeat": "",
                    "background-position": ""
                });
                let backgroundImage = jQuery("> .viewport-background", context);
                if (profile.background) {
                    if (backgroundImage.length === 0) {
                        backgroundImage = jQuery('<img class="viewport-background" />');
                        context.prepend(backgroundImage);
                    }
                    backgroundImage.attr("src", "/static/profiles/" + profile.background);
                    backgroundImage.css({
                        height: height + "px",
                        left: "0px",
                        position: "absolute",
                        top: "0px",
                        width: width + "px"
                    });
                } else if (backgroundImage.length > 0) {
                    backgroundImage.remove();
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

            // applies the given zoom level using the css zoom property
            // instead of a css transform scale because iOS Safari does
            // not re-rasterize transformed content at the higher device
            // pixel ratio and ends up bitmap stretching the svg, the
            // background image and the engraving text into a noticeably
            // pixelated rendering at any zoom level above 1; the zoom
            // property keeps the layout flow honest so the surrounding
            // margins do not need to be compensated by hand
            if (action === "zoom") {
                const zoom = options.zoom || 1;
                context.css({
                    transform: "",
                    "-o-transform": "",
                    "-ms-transform": "",
                    "-moz-transform": "",
                    "-khtml-transform": "",
                    "-webkit-transform": "",
                    "margin-bottom": "",
                    "margin-right": "",
                    zoom: zoom
                });
            }
        });

        return this;
    };
})(jQuery);

(function(jQuery) {
    /**
     * Welcome plugin that renders an engraving template catalog
     * with image cards and manages the template selection state
     * for the welcome screen form.
     *
     * Operates on a container element and discovers its children
     * (.catalog, .profile-input, .variant-input, .button-start) by
     * class name convention. On plain initialization the plugin
     * fetches the available profiles from the server and populates
     * the catalog automatically.
     *
     * Actions:
     *   "load"  - populates the catalog with the given profiles
     *             object keyed by profile ID, rendering one card
     *             per profile
     *   "value" - returns the current selection as an object with
     *             the profile key and variant index
     *
     * Events:
     *   "template" - triggered when the template selection changes,
     *                passing the profile, profile key, and variant
     *                index as arguments
     */
    jQuery.fn.welcome = function(action, options) {
        const elements = jQuery(this);

        // resolves the current selection from the given context
        // returning the profile, profile key, and variant index
        const resolveSelection = function(context) {
            const profiles = context.data("_profiles") || {};
            const key = context.data("_selected") || null;
            const variant = context.data("_variant");
            const profile = key ? profiles[key] : null;
            return {
                profile: profile,
                key: key,
                variantIndex: variant === undefined || variant === null ? null : variant
            };
        };

        // resolves the display label for a category slug, mapping
        // a missing or blank value to the canonical "other" bucket
        // and title casing every word in the slug so categories
        // like `necklaces` and `wedding-rings` show up as `Necklaces`
        // and `Wedding Rings` without any per profile metadata; the
        // catch-all label is read from the catalog element data
        // attribute so the en and pt_pt locales can each own their
        // own copy
        const categoryLabel = function(slug, otherLabel) {
            const value = (slug || "other").toString();
            if (value === "other") return otherLabel || "Other";
            return value
                .split(/[-_\s]+/)
                .map(part => (part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
                .join(" ");
        };

        // builds a card element for the given profile key/profile
        // pair, mirroring the card layout shared across the catalog
        // sections so each entry renders the same way regardless of
        // the category it belongs to
        const buildCard = function(key, profile) {
            const card = jQuery("<div></div>");
            card.addClass("catalog-card");
            card.attr("data-profile", key);

            // resolves the background image from the profile
            // definition, falling back to a neutral surface
            // when no image is available for the template
            const image = jQuery("<div></div>");
            image.addClass("catalog-card-image");
            if (profile.background) {
                image.css(
                    "background-image",
                    "url(/static/profiles/" + encodeURI(profile.background) + ")"
                );
            }
            card.append(image);

            const body = jQuery("<div></div>");
            body.addClass("catalog-card-body");

            const name = jQuery("<div></div>");
            name.addClass("catalog-card-name");
            name.text(profile.name);
            body.append(name);

            if (profile.sku) {
                const sku = jQuery("<div></div>");
                sku.addClass("catalog-card-sku");
                sku.text(profile.sku);
                body.append(sku);
            }

            const meta = jQuery("<div></div>");
            meta.addClass("catalog-card-meta");
            const unit = profile.unit || "mm";
            meta.text(profile.width + "x" + profile.height + " " + unit);
            body.append(meta);

            card.append(body);
            return card;
        };

        // populates the catalog of the given context with the
        // provided profiles object and stores it for later lookup,
        // rendering one card per profile entry with image and
        // metadata and pre-selecting the previously chosen entry
        const renderCatalog = function(context, profiles) {
            const catalog = jQuery(".catalog", context);
            const profileInput = jQuery(".profile-input", context);
            const buttonStart = jQuery(".button-start", context);

            context.data("_profiles", profiles);
            catalog.empty();

            const keys = Object.keys(profiles);
            if (keys.length === 0) {
                const grid = jQuery("<div></div>");
                grid.addClass("catalog-section-grid");
                const empty = jQuery("<div></div>");
                empty.addClass("catalog-card empty");
                empty.text("No templates available.");
                grid.append(empty);
                catalog.append(grid);
                return;
            }

            // groups the profiles by their `category` slug, falling
            // back to the canonical "other" bucket when the field is
            // missing so the resulting layout always has a home for
            // every entry in the catalog
            const buckets = {};
            for (const key of keys) {
                const profile = profiles[key];
                const slug = profile.category ? String(profile.category) : "other";
                if (!buckets[slug]) buckets[slug] = [];
                buckets[slug].push(key);
            }

            // collapses to the flat layout when every profile lands
            // in the same bucket so that a catalog without explicit
            // categories keeps the historical look without an empty
            // section heading hovering above the cards
            const otherLabel = catalog.attr("data-label-other") || "Other";
            const slugs = Object.keys(buckets);
            if (slugs.length === 1) {
                const grid = jQuery("<div></div>");
                grid.addClass("catalog-section-grid");
                for (const key of buckets[slugs[0]]) {
                    grid.append(buildCard(key, profiles[key]));
                }
                catalog.append(grid);
            } else {
                // sorts the category slugs alphabetically by their
                // display label, pushing the "other" catch all to
                // the end so categorized entries lead the catalog
                slugs.sort((a, b) => {
                    if (a === "other") return 1;
                    if (b === "other") return -1;
                    return categoryLabel(a, otherLabel).localeCompare(categoryLabel(b, otherLabel));
                });
                for (const slug of slugs) {
                    const section = jQuery("<div></div>");
                    section.addClass("catalog-section");
                    section.attr("data-category", slug);

                    const title = jQuery("<div></div>");
                    title.addClass("catalog-section-title");
                    title.text(categoryLabel(slug, otherLabel));
                    section.append(title);

                    const grid = jQuery("<div></div>");
                    grid.addClass("catalog-section-grid");
                    for (const key of buckets[slug]) {
                        grid.append(buildCard(key, profiles[key]));
                    }
                    section.append(grid);
                    catalog.append(section);
                }
            }

            // renders the catalog with no pre-selected template so
            // the user always lands on the welcome screen with a
            // neutral state and must explicitly pick a profile
            // before the form becomes submittable
            context.data("_selected", null);
            profileInput.val("");
            buttonStart.prop("disabled", true);
        };

        // fetches the available profiles from the server and
        // populates the catalog of the given context, silently
        // ignoring fetch errors so the welcome screen still
        // renders without a populated catalog
        const fetchProfiles = async function(context) {
            try {
                const response = await fetch("/profiles");
                if (response.status !== 200) return;
                const profiles = await response.json();
                renderCatalog(context, profiles);
            } catch (err) {
                // silently ignores fetch errors
            }
        };

        // returns the current selection as an object with the
        // profile key and variant index values from the first
        // matched element only
        if (action === "value") {
            return resolveSelection(elements.first());
        }

        elements.each(function() {
            const context = jQuery(this);
            const catalog = jQuery(".catalog", context);
            const profileInput = jQuery(".profile-input", context);
            const variantInput = jQuery(".variant-input", context);
            const buttonStart = jQuery(".button-start", context);

            // populates the catalog with the given profiles object
            // using the shared render routine, exposing the data
            // sink path for callers that already have the profiles
            if (action === "load") {
                renderCatalog(context, options.profiles);
                return;
            }

            // registers for the click operation on each catalog
            // card so that the selected template is reflected in
            // the hidden form fields and visual selection state
            catalog.on("click", ".catalog-card:not(.empty)", function() {
                const card = jQuery(this);
                const key = card.attr("data-profile");
                const profiles = context.data("_profiles") || {};
                const profile = profiles[key] || null;

                catalog.find(".catalog-card").removeClass("selected");
                card.addClass("selected");

                context.data("_selected", key);
                context.data("_variant", null);
                profileInput.val(key);
                variantInput.val("");
                buttonStart.prop("disabled", false);

                context.triggerHandler("template", [profile, key, null]);
            });

            // registers for the double click on each catalog card
            // to skip the start button and submit the welcome form
            // immediately, routing the user straight to the viewport
            // editor with the chosen template pre-selected
            catalog.on("dblclick", ".catalog-card:not(.empty)", function() {
                context.closest("form").trigger("submit");
            });

            // tracks the previous touchend timestamp and target on
            // each catalog card so that two quick taps on the same
            // card trigger the same submit flow as a double click,
            // since mobile browsers do not fire a reliable dblclick
            let lastTapTime = 0;
            let lastTapTarget = null;
            catalog.on("touchend", ".catalog-card:not(.empty)", function(event) {
                const now = Date.now();
                const card = event.currentTarget;
                if (now - lastTapTime < 300 && lastTapTarget === card) {
                    event.preventDefault();
                    context.closest("form").trigger("submit");
                    lastTapTime = 0;
                    lastTapTarget = null;
                    return;
                }
                lastTapTime = now;
                lastTapTarget = card;
            });

            // fetches and populates the catalog automatically on
            // plain initialization so callers do not need to
            // manage the network request themselves
            fetchProfiles(context);
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
    const viewportOptions = jQuery(".viewport-options");
    const profileInfo = jQuery(".profile-info");
    const profileInfoDimensions = jQuery(".profile-info-dimensions");
    const profileInfoOrientation = jQuery(".profile-info-orientation");
    const profileInfoLines = jQuery(".profile-info-lines");
    const profileInfoRawToggle = jQuery(".profile-info-raw-toggle");
    const profileInfoRaw = jQuery(".profile-info-raw");
    const profileSelector = jQuery(".viewport-options-body");
    const profileSkuContainer = jQuery(".profile-sku-container");
    const profileSkuValue = jQuery(".profile-sku-value");
    const profileInfoTitle = jQuery(".profile-info-title");
    const viewportOptionsInstructions = jQuery(".viewport-options-instructions");
    const modalOverlayInstructions = jQuery(".modal-overlay-instructions");
    const modalInstructionsTitle = jQuery(".modal-instructions-title");
    const modalInstructionsDescription = jQuery(".modal-instructions-description");
    const modalInstructionsImages = jQuery(".modal-instructions-images");
    const welcomeContainer = jQuery(".form-welcome");
    const formManager = jQuery(".form-manager");
    const diagnosticsContainer = jQuery(".settings-tab-content[data-tab='diagnostics']");
    const emojisSettings = jQuery(".settings-tab-content[data-tab='emojis']");
    const printJobs = jQuery(".print-jobs");

    // registers for the click operation on the raw profile
    // toggle link to show or hide the formatted JSON contents
    profileInfoRawToggle.click(function(event) {
        event.preventDefault();
        const visible = profileInfoRaw.is(":visible");
        if (visible) {
            profileInfoRaw.hide();
            profileInfoRawToggle.text(profileInfoRawToggle.attr("data-show-label") || "Show Raw");
        } else {
            profileInfoRaw.show();
            profileInfoRawToggle.text(profileInfoRawToggle.attr("data-hide-label") || "Hide Raw");
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
            const source = images[i];
            const resolved = /^(\/|[a-z][a-z0-9+.-]*:\/\/)/i.test(source)
                ? source
                : "/static/profiles/" + encodeURI(source);
            img.attr("src", resolved);
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

    // initializes the welcome plugin on the welcome screen
    // template catalog container, which fetches and populates
    // the available profiles from the server on its own
    welcomeContainer.welcome();

    // initializes the profile manager plugin on the profile
    // manager screen form, which owns its editors and tabs
    formManager.profilemanager();

    // initializes the diagnostics plugin on the diagnostics tab
    // of the settings screen, which owns the run button and the
    // probe and pipeline rendering
    diagnosticsContainer.diagnostics();

    // initializes the emojis plugin on the emojis tab of the
    // settings screen, which owns the upload button and the
    // success and error feedback rendering
    emojisSettings.emojis();

    // initializes the print jobs indicator plugin on the header
    // container, rehydrating any tracked jobs from localStorage
    // and resuming the polling loop on its own
    printJobs.printjobs();

    // bridges the modal confirm overlay onto the print jobs
    // indicator so a successful engrave submission enqueues a
    // chip without the modal plugin having to reach into the
    // indicator directly, honoring the plugin to host plugin
    // communication convention through `triggerHandler`
    jQuery(".modal-overlay-confirm").bind("printjob", function(event, options) {
        printJobs.printjobs("enqueue", options);
    });

    // wires the settings tab strip so clicking a tab swaps the
    // visible tab content while keeping a single form submission
    // for all tabs combined
    const settingsTabs = jQuery(".settings-tabs > .settings-tab");
    const settingsTabContents = jQuery(".settings-tab-content");
    settingsTabs.click(function() {
        const tab = jQuery(this).attr("data-tab");
        settingsTabs.removeClass("active");
        jQuery(this).addClass("active");
        settingsTabContents.each(function() {
            const content = jQuery(this);
            const visible = content.attr("data-tab") === tab;
            content.css("display", visible ? "" : "none");
        });
    });

    // populates the printing inputs on the settings screen with
    // the effective colony print configuration by resolving the
    // localStorage overrides against the server side defaults so
    // operators see the value the application is actually using
    // for each scenario and can edit it in place
    jQuery(".settings-printing-row").each(function() {
        const row = jQuery(this);
        const key = row.attr("data-key");
        const legacy = row.attr("data-legacy");
        const stored = localStorage.getItem(key);
        const fallback = legacy ? localStorage.getItem(legacy) : null;
        const override = stored || fallback || "";
        row.find(".settings-printing-effective").val(override);
    });

    // persists the printing tab inputs to the matching localStorage
    // keys when the settings form is submitted, removing the entry
    // entirely when the input is blank so the server side base value
    // takes over again instead of an empty string overriding it
    jQuery(".form-settings").bind("submit", function() {
        jQuery(".settings-printing-row").each(function() {
            const row = jQuery(this);
            const key = row.attr("data-key");
            const value = (row.find(".settings-printing-effective").val() || "").trim();
            if (value) localStorage.setItem(key, value);
            else localStorage.removeItem(key);
        });
    });

    const fontSizeContainer = jQuery(".font-size-container");
    const fontSizeRange = jQuery(".font-size-range");
    const fontSizeInput = jQuery(".font-size-input");
    const fontSizeMode = jQuery(".font-size-mode");
    const fontSizePresets = jQuery(".font-size-preset");
    const fontSizeBubble = jQuery(".font-size-bubble");
    const viewportPreview = jQuery(".viewport > .main-container > .viewport-preview");
    const viewportSvg = jQuery(".viewport-svg");
    const rulerHorizontal = jQuery(".ruler-horizontal");
    const rulerVertical = jQuery(".ruler-vertical");
    const rulersMode = jQuery(".rulers-mode");
    const viewportOptionsRulers = jQuery(".viewport-options-rulers");
    const crosshairMode = jQuery(".crosshair-mode");
    const viewportOptionsCrosshair = jQuery(".viewport-options-crosshair");
    const keyboardMode = jQuery(".keyboard-mode");
    const viewportOptionsKeyboard = jQuery(".viewport-options-keyboard");
    const guidelinesMode = jQuery(".guidelines-mode");
    const viewportOptionsGuidelines = jQuery(".viewport-options-guidelines");
    const caretMode = jQuery(".caret-mode");
    const viewportOptionsCaret = jQuery(".viewport-options-caret");
    const zoomContainer = jQuery(".zoom-container");
    const zoomRange = jQuery(".zoom-range");
    const zoomPresets = jQuery(".zoom-preset");
    const zoomBubble = jQuery(".zoom-bubble");
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

    // shows a keyboard container with the soft fade-up animation
    // already defined by the CSS, clearing any leftover leaving
    // class so the enter keyframe always plays cleanly
    const showKeyboardContainer = function(element) {
        element.removeClass("keyboard-leaving").show();
    };

    // hides a keyboard container by playing the reverse keyframe
    // first and only actually setting `display: none` after the
    // animation finishes, so the keyboard fades out instead of
    // snapping away; the optional callback runs once the fade is
    // complete so callers can chain the appearance of a sibling
    // keyboard onto the end of the leave animation
    const hideKeyboardContainer = function(element, onComplete) {
        if (element.css("display") === "none") {
            if (onComplete) onComplete();
            return;
        }
        element.addClass("keyboard-leaving");
        setTimeout(function() {
            element.hide().removeClass("keyboard-leaving");
            if (onComplete) onComplete();
        }, 250);
    };
    const viewportContainer = jQuery(".viewer-container");
    const calligraphyContainer = jQuery(".calligraphy-container");
    const calligraphyMode = jQuery(".calligraphy-mode");
    const calligraphyModeContainer = jQuery(".calligraphy-mode-container");
    const calligraphyControls = jQuery(".calligraphy-controls");
    const calligraphyUndo = jQuery(".calligraphy-undo");
    const calligraphyClear = jQuery(".calligraphy-clear");
    const calligraphyThicknessContainer = jQuery(".calligraphy-thickness-container");
    const calligraphyThicknessRange = jQuery(".calligraphy-thickness-range");
    const calligraphyThicknessPresets = jQuery(".calligraphy-thickness-preset");
    const calligraphyThicknessBubble = jQuery(".calligraphy-thickness-bubble");
    const formConsole = jQuery(".form-console");
    const inputViewport = jQuery(".input-viewport");
    const signature = jQuery(".signature");
    const modalOverlayError = jQuery(".modal-overlay-error");
    const modalOverlayConfirm = jQuery(".modal-overlay-confirm");
    const modalOverlayInspirations = jQuery(".modal-overlay-inspirations");
    const modalOverlayPrintJob = jQuery(".modal-overlay-print-job");
    const modalOverlayFeedback = jQuery(".modal-overlay-feedback");
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

        // resolves the colony print configuration falling back from
        // the engrave specific localStorage keys to the legacy
        // unprefixed ones and finally to the data attribute rendered
        // by the server side configuration so existing installs
        // keep working without any reconfiguration
        const printUrl = localStorage.getItem("url") || element.attr("data-url") || null;
        const node =
            localStorage.getItem("engrave_node") ||
            localStorage.getItem("node") ||
            element.attr("data-node") ||
            null;
        const printer =
            localStorage.getItem("engrave_printer") ||
            localStorage.getItem("printer") ||
            element.attr("data-printer") ||
            null;
        const printKey = localStorage.getItem("key") || element.attr("data-key") || null;

        // verifies that the engrave configuration is fully set before
        // trying to run the print operation, showing a modal otherwise
        // so the operator is pointed to the settings screen to fix it
        if (!printUrl || !node || !printer || !printKey) {
            modalOverlayError.modal(
                "show",
                body.attr("data-message-no-printer") ||
                    "No printer configured, please set the engrave printer in the settings."
            );
            return;
        }

        // verifies that the text does not contain any unsupported
        // fonts that cannot be sent to colony-print for engraving
        if (hasUnsupportedFont(textData)) {
            modalOverlayError.modal(
                "show",
                body.attr("data-message-pantograph") ||
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
                body.addClass("rulers-off");
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

            // forces the rulers, crosshair and guidelines off when
            // the viewport is running in store mode by routing the
            // change through the existing checkbox handlers so the
            // URL state and the visuals stay in sync with the off
            // position regardless of the previous URL parameters
            if (body.hasClass("store-mode")) {
                rulersMode.prop("checked", false).trigger("change");
                crosshairMode.prop("checked", false).trigger("change");
                guidelinesMode.prop("checked", false).trigger("change");
            }

            // restores the calligraphy mode from the URL
            // query parameters if it was previously saved
            const urlCalligraphy = urlParams.get("calligraphy");
            if (urlCalligraphy === "1" && currentProfile) {
                calligraphyMode.prop("checked", true).trigger("change");
            }
            restoring = false;
            updateUrl("restore");
        } catch (err) {
            restoring = false;
            // silently ignores profile loading errors
        } finally {
            // clears the loading guard so the legacy text box that
            // is rendered by default can decide whether to reveal
            // itself based on the resolved profile state instead of
            // flashing for a split second during the initial restore
            body.removeClass("profiles-loading");
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
        refreshZoomBubble();
        refreshZoomPresets();
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
        updateUrl("restore");
    };

    // updates the floating profile info block with the
    // currently selected profile summary information
    const updateProfileInfo = function(profile) {
        const defaultTitle = profileInfoTitle.attr("data-default-label") || "Profile ";
        const showLabel = profileInfoRawToggle.attr("data-show-label") || "Show Raw";
        if (!profile) {
            profileInfo.removeClass("visible");
            profileInfoRaw.hide();
            profileInfoRawToggle.text(showLabel);
            profileInfoTitle.contents().first().replaceWith(defaultTitle);
            profileSkuValue.text("-");
            profileSkuContainer.removeClass("visible");
            viewportOptionsInstructions.removeClass("visible");
            return;
        }

        const unit = profile.unit || "";
        profileInfoTitle
            .contents()
            .first()
            .replaceWith(profile.name + " ");
        if (profile.sku) {
            profileSkuValue.text(profile.sku);
            profileSkuContainer.addClass("visible");
        } else {
            profileSkuValue.text("-");
            profileSkuContainer.removeClass("visible");
        }
        profileInfoDimensions.text(
            profile.width + " x " + profile.height + (unit ? " " + unit : "")
        );
        profileInfoOrientation.text(profile.orientation || "");
        const text = profile.text || {};
        const maxLines = text.max_lines || 0;
        if (maxLines > 0) {
            const template =
                maxLines === 1
                    ? profileInfoLines.attr("data-singular") || "max {n} line"
                    : profileInfoLines.attr("data-plural") || "max {n} lines";
            profileInfoLines.text(template.replace("{n}", maxLines));
        } else {
            profileInfoLines.text("");
        }
        profileInfoRaw.text(JSON.stringify(profile, null, 4));
        profileInfoRaw.hide();
        profileInfoRawToggle.text(showLabel);
        profileInfo.addClass("visible");
        if (profile.instructions) {
            viewportOptionsInstructions.addClass("visible");
        } else {
            viewportOptionsInstructions.removeClass("visible");
        }
    };

    // computes the four named preset values (S/M/L/XL) by anchoring
    // them at relative positions within the profile font size range
    // and rounding to the configured step so each preset always lands
    // on a value the slider can actually take
    const computeFontSizePresets = function(min, max, step) {
        const snap = function(value) {
            const steps = Math.round((value - min) / step);
            return min + steps * step;
        };
        return {
            s: snap(min),
            m: snap(min + (max - min) * 0.33),
            l: snap(min + (max - min) * 0.66),
            xl: snap(max)
        };
    };

    // tracks the current per-profile preset value map so the chip
    // click handlers and the chip active state sync can pick the
    // right value without recomputing it on every change
    let currentFontSizePresets = {};

    // refreshes the active state of the preset chips so the chip
    // that matches the current value (or `auto` when automatic mode
    // is on) is highlighted; falls back to no active chip when the
    // value sits between two named presets so the user knows they
    // are in a custom range
    const refreshFontSizePresets = function() {
        fontSizePresets.removeClass("active");
        if (fontSizeMode.prop("checked")) {
            fontSizePresets.filter('[data-preset="auto"]').addClass("active");
            return;
        }
        const value = parseFloat(fontSizeRange.val());
        for (const name of ["s", "m", "l", "xl"]) {
            if (currentFontSizePresets[name] === value) {
                fontSizePresets.filter('[data-preset="' + name + '"]').addClass("active");
                return;
            }
        }
    };

    // refreshes a slider bubble label and horizontal position so it
    // floats above the slider thumb showing the live value as the
    // user drags, delegating the value formatting to the caller so
    // each slider can pick its own unit suffix
    const refreshSliderBubble = function(range, bubble, formatter) {
        const value = parseFloat(range.val());
        const min = parseFloat(range.attr("min")) || 0;
        const max = parseFloat(range.attr("max")) || 1;
        const ratio = max === min ? 0 : (value - min) / (max - min);
        bubble.text(formatter ? formatter(value) : value);
        bubble.css("left", ratio * 100 + "%");
    };

    // refreshes the font size bubble using the slider helper with
    // the current profile unit as the formatter suffix
    const refreshFontSizeBubble = function() {
        refreshSliderBubble(fontSizeRange, fontSizeBubble, function(value) {
            const unit = currentProfile && currentProfile.unit ? currentProfile.unit : "";
            return value + (unit ? " " + unit : "");
        });
    };

    // refreshes the zoom bubble using the slider helper with the
    // `x` suffix that matches the chip preset labels
    const refreshZoomBubble = function() {
        refreshSliderBubble(zoomRange, zoomBubble, function(value) {
            return value + "x";
        });
    };

    // refreshes the active state of the zoom preset chips so the
    // chip that matches the current value is highlighted, falling
    // back to no active chip when the value sits between two named
    // presets so the user knows they are in a custom zoom level
    const refreshZoomPresets = function() {
        zoomPresets.removeClass("active");
        const value = parseFloat(zoomRange.val());
        zoomPresets.each(function() {
            const preset = parseFloat(jQuery(this).attr("data-preset"));
            if (preset === value) jQuery(this).addClass("active");
        });
    };

    // refreshes the calligraphy thickness bubble using the slider
    // helper with no unit suffix since the line width value is a
    // raw stroke pixel count in the unzoomed coordinate space
    const refreshCalligraphyThicknessBubble = function() {
        refreshSliderBubble(
            calligraphyThicknessRange,
            calligraphyThicknessBubble,
            function(value) {
                return value;
            }
        );
    };

    // refreshes the active state of the calligraphy thickness preset
    // chips so the chip that matches the current value is highlighted
    const refreshCalligraphyThicknessPresets = function() {
        calligraphyThicknessPresets.removeClass("active");
        const value = parseFloat(calligraphyThicknessRange.val());
        calligraphyThicknessPresets.each(function() {
            const preset = parseFloat(jQuery(this).attr("data-preset"));
            if (preset === value) jQuery(this).addClass("active");
        });
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

        currentFontSizePresets = computeFontSizePresets(min, max, step);
        refreshFontSizePresets();
        refreshFontSizeBubble();

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
                refreshFontSizeBubble();
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
    // currently selected profile and variant combination,
    // optionally preserving the calligraphy canvas when only
    // the variant changed within the same profile so the user
    // does not lose their drawing while flipping between
    // padding, background, or font size overrides
    const refreshProfile = function(variantOnly) {
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
            calligraphyThicknessContainer.removeClass("visible");
        }
        // seeds the calligraphy thickness slider with the profile
        // line width so the slider starts at the configured default
        // for the current profile while keeping the value editable,
        // skipping the seed when only the variant changed so the
        // user does not lose their chosen thickness
        if (!variantOnly) {
            const defaultThickness =
                currentProfile && currentProfile.calligraphy
                    ? currentProfile.calligraphy.line_width || 2
                    : 2;
            calligraphyThicknessRange.val(defaultThickness);
            refreshCalligraphyThicknessBubble();
            refreshCalligraphyThicknessPresets();
        }
        // resets the calligraphy canvas when switching profiles
        // since the canvas dimensions change with the profile,
        // skipping the reset when only the variant changed so the
        // strokes survive the variant switch and are scaled by the
        // plugin to fit the new safe area dimensions
        if (!variantOnly) {
            calligraphyContainer.calligraphy("reset");
            body.data("calligraphy", null);
        }

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
        applyDefaultFont(currentProfile);

        // re-initializes the calligraphy canvas if the mode
        // is still active after the profile switch completes
        if (calligraphyMode.prop("checked") && currentProfile) {
            initCalligraphy();
        }
    };

    // applies the profile's default font on initial load by clicking
    // the matching font element so the keyboard plugin selects the
    // corresponding keyboard, skipping when a font is already active
    // or when the URL font parameter takes precedence
    const applyDefaultFont = function(profile) {
        if (!profile || !profile.default_font) return;
        if (body.data("font")) return;
        if (urlParams.get("font")) return;
        const fontElement = fontsContainer.find('.font[data-font="' + profile.default_font + '"]');
        if (fontElement.length > 0) fontElement.click();
    };

    // registers for the change event from the profile selector
    // plugin to update the viewport and controls when the profile
    // or variant selection changes, tracking the previous profile
    // key so the calligraphy canvas can preserve its strokes when
    // only the variant changes within the same profile
    let previousProfileKey = null;
    profileSelector.bind("profile", function(event, profile, baseProfile, key) {
        const variantOnly = previousProfileKey !== null && previousProfileKey === key;
        previousProfileKey = key;
        currentProfile = profile;
        refreshProfile(variantOnly);
        updateUrl("profile");
    });

    // registers for the change in the font size range slider
    // to sync the number input and apply the new size
    fontSizeRange.bind("input", function() {
        fontSizeInput.val(jQuery(this).val());
        applyFontSize();
        refreshFontSizePresets();
        refreshFontSizeBubble();
        updateUrl("font_size");
    });

    // registers for the change in the font size number input
    // to sync the range slider and apply the new size
    fontSizeInput.bind("input", function() {
        fontSizeRange.val(jQuery(this).val());
        applyFontSize();
        refreshFontSizePresets();
        refreshFontSizeBubble();
        updateUrl("font_size");
    });

    // registers for the change in the font size mode checkbox
    // to toggle between manual and automatic sizing modes
    fontSizeMode.bind("change", function() {
        const isAutomatic = jQuery(this).prop("checked");
        fontSizeInput.prop("disabled", isAutomatic);
        fontSizeRange.prop("disabled", isAutomatic);
        applyFontSize();
        refreshFontSizePresets();
        refreshFontSizeBubble();
        updateUrl("font_size");
    });

    // registers for the click on each font size preset chip so
    // the slider, the hidden inputs and the automatic mode toggle
    // stay in sync with the named preset that was picked, routing
    // every change through the existing input handlers so the URL
    // update and the viewport render run through their normal paths
    fontSizePresets.click(function() {
        const preset = jQuery(this).attr("data-preset");
        if (preset === "auto") {
            if (!fontSizeMode.prop("checked")) {
                fontSizeMode.prop("checked", true).trigger("change");
            }
            return;
        }
        if (fontSizeMode.prop("checked")) {
            fontSizeMode.prop("checked", false).trigger("change");
        }
        const value = currentFontSizePresets[preset];
        if (value === undefined) return;
        fontSizeRange.val(value).trigger("input");
    });

    // shows the bubble while the user is actively interacting with
    // the slider so the live value is visible above the thumb, and
    // hides it again when the interaction ends so the bubble does
    // not linger over the panel
    fontSizeRange.bind("mousedown touchstart focus", function() {
        fontSizeContainer.addClass("slider-dragging");
    });
    fontSizeRange.bind("mouseup touchend touchcancel blur", function() {
        fontSizeContainer.removeClass("slider-dragging");
    });

    // registers for the change in the rulers mode checkbox
    // to toggle the visibility of the viewport rulers
    rulersMode.bind("change", function() {
        const showRulers = jQuery(this).prop("checked");
        if (showRulers) {
            rulerHorizontal.show();
            rulerVertical.show();
            body.removeClass("rulers-off");
        } else {
            rulerHorizontal.hide();
            rulerVertical.hide();
            body.addClass("rulers-off");
        }
        updateUrl("toggle");
    });

    // registers for the change in the zoom range slider
    // to apply the zoom transform to the viewport preview
    zoomRange.bind("input", function() {
        applyZoom();
        updateUrl("zoom");
    });

    // registers for the click on each zoom preset chip so the
    // slider jumps to the preset value and routes the change
    // through the existing zoom input handler so the URL update
    // and the preview transform run through their normal paths
    zoomPresets.click(function() {
        const value = parseFloat(jQuery(this).attr("data-preset"));
        if (isNaN(value)) return;
        zoomRange.val(value).trigger("input");
    });

    // shows the bubble while the user is actively interacting with
    // the zoom slider so the live value is visible above the thumb,
    // and hides it again when the interaction ends so the bubble
    // does not linger over the panel
    zoomRange.bind("mousedown touchstart focus", function() {
        zoomContainer.addClass("slider-dragging");
    });
    zoomRange.bind("mouseup touchend touchcancel blur", function() {
        zoomContainer.removeClass("slider-dragging");
    });

    // registers for the change in the calligraphy thickness slider
    // to reinitialize the canvas with the new line width so the
    // next stroke uses the updated value; the previous strokes
    // keep their original width since jSignature stores it inline
    calligraphyThicknessRange.bind("input", function() {
        refreshCalligraphyThicknessBubble();
        refreshCalligraphyThicknessPresets();
        if (calligraphyMode.prop("checked")) initCalligraphy();
    });

    // registers for the click on each calligraphy thickness preset
    // chip so the slider jumps to the preset value and routes the
    // change through the existing input handler
    calligraphyThicknessPresets.click(function() {
        const value = parseFloat(jQuery(this).attr("data-preset"));
        if (isNaN(value)) return;
        calligraphyThicknessRange.val(value).trigger("input");
    });

    // shows the bubble while the user is actively interacting with
    // the calligraphy thickness slider so the live value is visible
    // above the thumb, and hides it again when the interaction ends
    calligraphyThicknessRange.bind("mousedown touchstart focus", function() {
        calligraphyThicknessContainer.addClass("slider-dragging");
    });
    calligraphyThicknessRange.bind("mouseup touchend touchcancel blur", function() {
        calligraphyThicknessContainer.removeClass("slider-dragging");
    });

    // registers for the change in the margin input fields
    // to re-render the viewport preview in real time
    jQuery(".margin-input").bind("input", function() {
        renderViewportPreview(currentProfile);
        applyFontSize();
        updateUrl("margins");
    });

    // registers for the change in the crosshair mode checkbox
    // to toggle the visibility of the viewport crosshair lines
    crosshairMode.bind("change", function() {
        if (!crosshairMode.prop("checked")) {
            viewportPreview.removeClass("crosshair-active");
            positionValue.text("-");
        }
        updateUrl("toggle");
    });

    // registers for the change in the keyboard mode checkbox
    // to toggle the visibility of the visual keyboard
    keyboardMode.bind("change", function() {
        const showKeyboard = keyboardMode.prop("checked");
        if (showKeyboard) {
            const font = body.data("font");
            if (font === "Cool Emojis") {
                showKeyboardContainer(emojisContainer);
            } else if (font === "Cool Emojis Pantograph") {
                showKeyboardContainer(emojispContainer);
            } else if (font) {
                showKeyboardContainer(keyboardContainer);
            }
        } else {
            hideKeyboardContainer(keyboardContainer);
            hideKeyboardContainer(emojisContainer);
            hideKeyboardContainer(emojispContainer);
        }
        updateUrl("toggle");
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
        updateUrl("toggle");
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
        updateUrl("toggle");
    });

    // tracks the previous visibility state of the visual toggles so
    // exiting preview mode restores exactly the configuration the
    // user had before entering
    let previewModeSnapshot = null;
    const previewToggles = [rulersMode, crosshairMode, guidelinesMode, caretMode];

    // enters preview mode by flipping the body class, hiding the
    // visual toggles through their own change handlers so the URL
    // state stays consistent, bumping the zoom level by 1.2x so the
    // preview grows visibly, and snapshotting the previous state
    // so exit can put things back exactly as they were; the
    // restoring flag is briefly raised while the toggles are flipped
    // so the temporary off state does not get persisted to the URL
    const enterPreviewMode = function() {
        if (body.hasClass("preview-mode")) return;
        previewModeSnapshot = previewToggles.map(function(toggle) {
            return toggle.prop("checked");
        });
        const wasRestoring = restoring;
        restoring = true;
        try {
            for (const toggle of previewToggles) {
                if (toggle.prop("checked")) {
                    toggle.prop("checked", false).trigger("change");
                }
            }
        } finally {
            restoring = wasRestoring;
        }
        body.addClass("preview-mode");
    };

    // exits preview mode by flipping the body class back, restoring
    // each visual toggle to its prior state through the matching
    // change handler so the visuals and URL state sync up again,
    // resetting the zoom to the snapshotted value so the preview
    // scales back down, and briefly holding an exiting class so
    // the reverse transition still plays during the animation
    const exitPreviewMode = function() {
        if (!body.hasClass("preview-mode")) return;
        body.removeClass("preview-mode").addClass("preview-mode-exiting");
        setTimeout(function() {
            body.removeClass("preview-mode-exiting");
        }, 600);
        if (previewModeSnapshot) {
            const wasRestoring = restoring;
            restoring = true;
            try {
                for (let i = 0; i < previewToggles.length; i++) {
                    const toggle = previewToggles[i];
                    const wasChecked = previewModeSnapshot[i];
                    if (wasChecked && !toggle.prop("checked")) {
                        toggle.prop("checked", true).trigger("change");
                    }
                }
            } finally {
                restoring = wasRestoring;
            }
            previewModeSnapshot = null;
        }
    };

    // wires the header preview button and the floating exit hint
    // so a click on the button toggles into preview mode while the
    // hint or the Escape key reverses the action
    jQuery(".button-preview").click(enterPreviewMode);
    jQuery(".preview-mode-hint").click(exitPreviewMode);
    body.bind("keydown", function(event) {
        if (event.key !== "Escape") return;
        if (!body.hasClass("preview-mode")) return;
        event.stopPropagation();
        event.preventDefault();
        exitPreviewMode();
    });

    // upscale factor applied on top of the device pixel ratio so
    // the calligraphy canvas backing store renders strokes crisply
    // even when the captured svg payload is later rendered at a
    // larger physical size by the engraver
    const CALLIGRAPHY_RESOLUTION = 2;

    // initializes the calligraphy canvas inside the viewport
    // preview at the zoomed safe area size with a counter zoom
    // on the container so the visual placement stays unchanged
    // while jSignature operates in the unzoomed coordinate space;
    // this sidesteps jQuery offset not accounting for the parent
    // css zoom on iOS Safari which would otherwise misalign the
    // strokes against the magnified touch coordinates
    const initCalligraphy = function() {
        if (!currentProfile) return;
        const padding = getMargins();
        const safeW = (currentProfile.width - padding.left - padding.right) * VIEWPORT_SCALE;
        const safeH = (currentProfile.height - padding.top - padding.bottom) * VIEWPORT_SCALE;
        const safeX = padding.left * VIEWPORT_SCALE;
        const safeY = padding.top * VIEWPORT_SCALE;
        const zoom = parseFloat(zoomRange.val()) || 1;
        const dpr = window.devicePixelRatio || 1;
        const lineWidth = parseFloat(calligraphyThicknessRange.val()) || 2;
        calligraphyContainer.calligraphy("init", {
            width: Math.round(safeW * zoom),
            height: Math.round(safeH * zoom),
            lineWidth: lineWidth * zoom,
            resolution: dpr * CALLIGRAPHY_RESOLUTION
        });
        calligraphyContainer.css({
            zoom: 1 / zoom,
            left: safeX * zoom + "px",
            top: safeY * zoom + "px"
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
            viewportOptionsKeyboard.hide();
            viewportOptionsCaret.hide();
            calligraphyControls.addClass("visible");
            calligraphyThicknessContainer.addClass("visible");
            zoomRange.prop("disabled", true);
            initCalligraphy();
            body.data("calligraphy", null);
        } else {
            viewportPreview.removeClass("calligraphy-active");
            calligraphyControls.removeClass("visible");
            calligraphyThicknessContainer.removeClass("visible");
            viewportOptionsKeyboard.show();
            viewportOptionsCaret.show();
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
        updateUrl("calligraphy");
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

        // resolves the target keyboard for the newly selected font
        // and the previously visible keyboard so the show can be
        // chained onto the end of the previous fade out and the
        // two keyboards never appear at the same time
        let target;
        if (font === "Cool Emojis") {
            target = emojisContainer;
        } else if (font === "Cool Emojis Pantograph") {
            target = emojispContainer;
        } else {
            target = keyboardContainer;
        }
        target.addClass("selected");
        const allKeyboards = [keyboardContainer, emojisContainer, emojispContainer];
        const leaving = allKeyboards.find(function(candidate) {
            return candidate.get(0) !== target.get(0) && candidate.css("display") !== "none";
        });
        const reveal = function() {
            if (showKeyboard) showKeyboardContainer(target);
        };
        if (leaving) {
            hideKeyboardContainer(leaving, reveal);
        } else {
            reveal();
        }

        keyboardContainer.css("font-family", '"' + font + '"');
        inputViewport.css("font-family", '"' + font + '"');
        body.data("font", font);
        updateUrl("font");
    });
    fontsContainer.bind("defont", function(event, font) {
        hideKeyboardContainer(keyboardContainer);
        hideKeyboardContainer(emojisContainer);
        hideKeyboardContainer(emojispContainer);
        keyboardContainer.removeClass("selected");
        emojisContainer.removeClass("selected");
        emojispContainer.removeClass("selected");
        body.data("font", null);
        updateUrl("font");
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

    // updates the browser URL with the current viewport state
    // using history.replaceState so that the URL can be shared
    // or bookmarked to resume an engraving session later; the
    // function is scoped to a specific action so callers only
    // refresh the URL fragment they are responsible for and the
    // remaining viewport-only fields are preserved verbatim from
    // the previous query string instead of being recomputed from
    // possibly stale DOM state; the semantic state (`text`,
    // `profile`, `variant`, `fullscreen`) is always rewritten so
    // page navigation can resume the session, and the function
    // bails out entirely when the viewport editor is not mounted
    // on the current page so non viewport pages never end up
    // with viewport only query parameters in their address bar
    const updateUrl = function(action) {
        if (restoring) return;
        if (viewportContainer.length === 0) return;
        const params = new URLSearchParams(window.location.search);
        const text = body.data("text") || [];
        params.delete("text");
        if (text.length > 0) params.set("text", serializeText(text));
        const selection = profileSelector.profileselector("value");
        params.delete("profile");
        params.delete("variant");
        if (selection && selection.key) {
            params.set("profile", selection.key);
            if (selection.variantIndex !== null && selection.variantIndex !== 0) {
                params.set("variant", selection.variantIndex);
            }
        }
        if (action === "font" || action === "restore") {
            params.delete("font");
            const font = body.data("font");
            if (font) params.set("font", font);
        }
        if (action === "font_size" || action === "restore") {
            params.delete("font_size");
            params.delete("font_size_mode");
            const fontSize = fontSizeInput.val();
            if (fontSize) params.set("font_size", fontSize);
            const isAutomatic = fontSizeMode.prop("checked");
            if (isAutomatic) params.set("font_size_mode", "automatic");
        }
        if (action === "zoom" || action === "restore") {
            params.delete("zoom");
            const zoom = zoomRange.val();
            if (zoom && zoom !== "1") params.set("zoom", zoom);
        }
        if (action === "margins" || action === "restore") {
            params.delete("margins");
            const margins = getMargins();
            const marginStr =
                margins.left + "," + margins.right + "," + margins.top + "," + margins.bottom;
            if (marginStr !== "0,0,0,0") params.set("margins", marginStr);
        }
        if (action === "toggle" || action === "restore") {
            params.delete("rulers");
            params.delete("crosshair");
            params.delete("keyboard");
            params.delete("guidelines");
            params.delete("caret");
            if (!rulersMode.prop("checked")) params.set("rulers", "0");
            if (!crosshairMode.prop("checked")) params.set("crosshair", "0");
            if (!keyboardMode.prop("checked")) params.set("keyboard", "0");
            if (!guidelinesMode.prop("checked")) params.set("guidelines", "0");
            if (!caretMode.prop("checked")) params.set("caret", "0");
        }
        if (action === "calligraphy" || action === "restore") {
            params.delete("calligraphy");
            if (calligraphyMode.prop("checked")) params.set("calligraphy", "1");
        }
        params.delete("fullscreen");
        params.delete("theme");
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

        // resolves the colony print configuration falling back from
        // the receipt specific localStorage keys to the legacy
        // unprefixed ones and finally to the data attribute rendered
        // by the server side configuration so existing installs
        // keep working without any reconfiguration
        const printUrl =
            localStorage.getItem("url") ||
            element.attr("data-url") ||
            "https://colony-print.stage.hive.pt";
        const node =
            localStorage.getItem("receipt_node") ||
            localStorage.getItem("node") ||
            element.attr("data-node") ||
            "default";
        const printer =
            localStorage.getItem("receipt_printer") ||
            localStorage.getItem("printer") ||
            element.attr("data-printer") ||
            "printer";
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
    modalOverlayInspirations.modal();
    modalOverlayPrintJob.modal();
    modalOverlayInstructions.modal();
    modalOverlayFeedback.modal();
    modalOverlayFeedback.feedback({ profileSelector: profileSelector });
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
        updateUrl("text");
    });

    // registers for the caret change event from the text editor
    // to keep the selected font in sync with the character around
    // the caret, falling back to the right-side character when the
    // caret sits before the first character of the text
    viewportContainer.bind("caretchange", function(event, text, caretPosition) {
        // searches left from the caret for the nearest character
        // that has a font defined, skipping newline entries since
        // they have no visual font of their own
        let font = null;
        for (let i = caretPosition; i >= 0; i--) {
            if (text[i] && text[i][0]) {
                font = text[i][0];
                break;
            }
        }

        // searches right from the caret when no character was found
        // to the left, applying the same newline skipping logic so
        // that a caret at position -1 picks the first visible font
        if (!font) {
            for (let i = caretPosition + 1; i < text.length; i++) {
                if (text[i] && text[i][0]) {
                    font = text[i][0];
                    break;
                }
            }
        }

        if (!font) return;
        if (body.data("font") === font) return;
        const fontElement = fontsContainer.find('.font[data-font="' + font + '"]');
        if (fontElement.length === 0) return;
        fontElement.click();
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
