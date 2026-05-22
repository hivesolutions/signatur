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
    const profileInfoTitle = jQuery(".profile-info-title");
    const viewportOptionsInstructions = jQuery(".viewport-options-instructions");
    const modalOverlayInstructions = jQuery(".modal-overlay-instructions");
    const modalInstructionsTitle = jQuery(".modal-instructions-title");
    const modalInstructionsDescription = jQuery(".modal-instructions-description");
    const modalInstructionsImages = jQuery(".modal-instructions-images");
    const welcomeContainer = jQuery(".form-welcome");
    const formManager = jQuery(".form-manager");
    const diagnosticsContainer = jQuery(".settings-tab-content[data-tab='diagnostics']");

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
    const modalOverlayFeedback = jQuery(".modal-overlay-feedback");
    const feedbackSatisfaction = jQuery(".modal-feedback-satisfaction input[name=feedback_satisfaction]");
    const feedbackNotes = jQuery(".modal-feedback-notes");
    const feedbackSubmit = jQuery(".button-modal-feedback-submit");
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
    modalOverlayInstructions.modal();
    modalOverlayFeedback.modal();
    toast.toast();

    // resets the feedback modal selections every time the modal
    // becomes visible so a stale satisfaction chip or notes value
    // is not carried over from a previous engraving submission
    modalOverlayFeedback.bind("show", function() {
        feedbackSatisfaction.prop("checked", false);
        feedbackNotes.val("");
        feedbackSubmit.addClass("disabled");
    });

    // toggles the submit button between disabled and enabled based
    // on whether a satisfaction option is currently selected so the
    // user cannot send an empty feedback payload to the server
    feedbackSatisfaction.bind("change", function() {
        const selected = jQuery(".modal-feedback-satisfaction input[name=feedback_satisfaction]:checked").val();
        if (selected) feedbackSubmit.removeClass("disabled");
        else feedbackSubmit.addClass("disabled");
    });

    // registers for the click on the feedback submit button to
    // collect the selected satisfaction option and the optional
    // notes, post them to the feedback endpoint, and close the
    // modal with a toast confirmation when the request succeeds
    feedbackSubmit.click(async function() {
        if (jQuery(this).hasClass("disabled")) return;
        const satisfaction = jQuery(".modal-feedback-satisfaction input[name=feedback_satisfaction]:checked").val();
        if (!satisfaction) return;
        const notes = feedbackNotes.val() || "";
        const selection = profileSelector.profileselector("value");
        const profileKey = selection && selection.key ? selection.key : "";
        const variantIndex =
            selection && selection.variantIndex !== null && selection.variantIndex !== undefined
                ? String(selection.variantIndex)
                : "";
        try {
            const feedbackResponse = await fetch("/feedback", {
                method: "POST",
                body: new URLSearchParams([
                    ["satisfaction", satisfaction],
                    ["notes", notes],
                    ["profile", profileKey],
                    ["variant", variantIndex]
                ])
            });
            if (feedbackResponse.status !== 200) {
                const error = await feedbackResponse.json();
                const errorMessage = error.message || error.error || "unset";
                modalOverlayError.modal(
                    "show",
                    "Error while submitting feedback: " + errorMessage
                );
                return;
            }
            modalOverlayFeedback.modal("hide");
            toast.toast("show", "Thanks for your feedback.");
        } catch (err) {
            modalOverlayError.modal("show", String(err));
        }
    });

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
