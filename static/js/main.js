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
    const profileSelect = jQuery(".profile-select");
    const variantSelect = jQuery(".variant-select");
    const variantContainer = jQuery(".variant-container");
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

    const fontSizeContainer = jQuery(".font-size-container");
    const fontSizeRange = jQuery(".font-size-range");
    const fontSizeInput = jQuery(".font-size-input");
    const fontSizeMode = jQuery(".font-size-mode");
    const viewportPreview = jQuery(".viewport-preview");
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
            for (const key of keys) {
                const profile = profiles[key];
                const option = jQuery("<option></option>");
                option.attr("value", key);
                option.text(profile.name);
                profileSelect.append(option);
            }
            viewportOptions.addClass("visible");
            modalOverlayConfirm.data("profiles", profiles);

            // restores the session state from the URL query
            // parameters, suppressing URL updates during restore
            restoring = true;
            const urlProfile = urlParams.get("profile");
            if (urlProfile && profiles[urlProfile]) {
                profileSelect.val(urlProfile).trigger("change");
                const urlVariant = urlParams.get("variant");
                if (urlVariant !== null) {
                    variantSelect.val(urlVariant).trigger("change");
                }
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

    // renders the viewport preview SVG based on the selected
    // profile definition including bounds and safe drawable area
    const renderViewportPreview = function(profile) {
        if (!profile) {
            viewportPreview.removeClass("profile-active");
            viewportPreview.css({
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
        const padding = getMargins();

        const svg = viewportSvg.get(0);
        svg.setAttribute("width", width);
        svg.setAttribute("height", height);
        svg.setAttribute("viewBox", "0 0 " + width + " " + height);

        // clears existing SVG content before re-rendering
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
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

        // applies the background image behind the viewport so that
        // the user can preview the engraving on a realistic surface
        if (profile.background) {
            viewportPreview.css({
                "background-image": "url('/static/profiles/" + profile.background + "')",
                "background-size": width + "px " + height + "px",
                "background-repeat": "no-repeat",
                "background-position": "0px 0px"
            });
        } else {
            viewportPreview.css({
                "background-image": "",
                "background-size": "",
                "background-repeat": "",
                "background-position": ""
            });
        }

        viewportPreview.css({ width: width + "px", height: height + "px" });
        viewportPreview.addClass("profile-active");
    };

    // renders the horizontal and vertical rulers adjacent to
    // the viewport preview based on the profile dimensions
    const renderRulers = function(profile) {
        rulerHorizontal.empty();
        rulerVertical.empty();

        if (!profile) return;

        const width = profile.width * VIEWPORT_SCALE;
        const height = profile.height * VIEWPORT_SCALE;
        const unit = profile.unit || "mm";
        const step = 5;

        rulerHorizontal.css("width", width + "px");
        rulerVertical.css("height", height + "px");

        for (let mm = 0; mm <= profile.width; mm += step) {
            const px = mm * VIEWPORT_SCALE;
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
            const px = mm * VIEWPORT_SCALE;
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

        // applies the current rulers visibility based on the
        // show rulers checkbox state in the viewport options
        const showRulers = rulersMode.prop("checked");
        if (!showRulers) {
            rulerHorizontal.hide();
            rulerVertical.hide();
        }
    };

    // applies the current zoom level from the zoom slider
    // using a CSS transform to scale the viewport preview
    // and compensating the layout margins for the scaled size
    const applyZoom = function() {
        const zoom = parseFloat(zoomRange.val()) || 1;
        zoomValue.text(zoom + "x");
        const width = parseFloat(viewportPreview.css("width")) || 0;
        const height = parseFloat(viewportPreview.css("height")) || 0;
        const extraWidth = width * (zoom - 1);
        const extraHeight = height * (zoom - 1);
        viewportPreview.css({
            transform: "scale(" + zoom + ")",
            "-o-transform": "scale(" + zoom + ")",
            "-ms-transform": "scale(" + zoom + ")",
            "-moz-transform": "scale(" + zoom + ")",
            "-khtml-transform": "scale(" + zoom + ")",
            "-webkit-transform": "scale(" + zoom + ")",
            "margin-bottom": 16 * zoom + extraHeight + "px",
            "margin-right": extraWidth + "px"
        });
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
            const fontEl = fontsContainer.find('.font[data-font="' + primaryFont + '"]');
            if (fontEl.length === 0) return;
            if (!fontEl.hasClass("active")) fontEl.click();
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
        } else {
            marginContainer.removeClass("visible");
            viewportOptionsRulers.removeClass("visible");
            viewportOptionsCrosshair.removeClass("visible");
            viewportOptionsGuidelines.removeClass("visible");
            viewportOptionsCaret.removeClass("visible");
            zoomContainer.removeClass("visible");
            positionContainer.removeClass("visible");
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
    };

    // registers for the change in the profile dropdown so
    // that the viewport preview and font size controls update
    profileSelect.bind("change", function() {
        const key = jQuery(this).val();
        const baseProfile = key ? profiles[key] : null;

        // populates the variant dropdown if the profile has variants
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
            currentProfile = applyVariant(baseProfile, baseProfile.variants[0]);
        } else {
            variantContainer.removeClass("visible");
            currentProfile = baseProfile;
        }

        refreshProfile();
        updateUrl();
    });

    // registers for the change in the variant dropdown so
    // that the profile overrides are applied and refreshed
    variantSelect.bind("change", function() {
        const key = profileSelect.val();
        const baseProfile = key ? profiles[key] : null;
        if (!baseProfile) return;
        const index = parseInt(jQuery(this).val());
        const variant = baseProfile.variants ? baseProfile.variants[index] : null;
        currentProfile = variant ? applyVariant(baseProfile, variant) : baseProfile;
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
            positionValue.text("—");
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
        positionValue.text("—");
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
        const profileKey = profileSelect.val();
        if (profileKey) {
            params.set("profile", profileKey);
            const variantIndex = variantSelect.val();
            if (variantIndex && variantIndex !== "0") {
                params.set("variant", variantIndex);
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
        const fontEl = fontsContainer.find('.font[data-font="' + urlFont + '"]');
        if (fontEl.length > 0) fontEl.click();
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
