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
    const profileInfoTitle = jQuery(".profile-info-title");
    const profileInfoToggle = jQuery(".profile-info-toggle");
    const viewportOptionsTitle = jQuery(".viewport-options-title");
    const viewportOptionsToggle = jQuery(".viewport-options-toggle");

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

    const profileInfoBody = jQuery(".profile-info-body");
    const viewportOptionsBody = jQuery(".viewport-options-body");

    // toggles a collapsible panel between expanded and minimized
    // states using a smooth max-height transition on the body
    const togglePanel = function(panel, panelBody, panelTitle, toggleIcon) {
        const bodyEl = panelBody.get(0);
        const minimized = panel.hasClass("minimized");
        if (minimized) {
            panel.removeClass("minimized");
            const height = bodyEl.scrollHeight;
            panelBody.css("max-height", "0px");
            panelTitle.css("margin-bottom", "0px");
            bodyEl.offsetHeight; // eslint-disable-line no-unused-expressions
            panelBody.css("max-height", height + "px");
            panelTitle.css("margin-bottom", "");
            toggleIcon.text("▾");
            panelBody.one("transitionend", function() {
                panelBody.css("max-height", "");
            });
        } else {
            panelBody.css("max-height", bodyEl.scrollHeight + "px");
            bodyEl.offsetHeight; // eslint-disable-line no-unused-expressions
            panelBody.css("max-height", "0px");
            panelTitle.css("margin-bottom", "0px");
            toggleIcon.text("▸");
            panelBody.one("transitionend", function() {
                panel.addClass("minimized");
            });
        }
    };

    // registers for the click operation on the profile info
    // title to toggle the panel between expanded and minimized
    profileInfoTitle.click(function() {
        togglePanel(profileInfo, profileInfoBody, profileInfoTitle, profileInfoToggle);
    });

    // registers for the click operation on the viewport options
    // title to toggle the panel between expanded and minimized
    viewportOptionsTitle.click(function() {
        togglePanel(
            viewportOptions,
            viewportOptionsBody,
            viewportOptionsTitle,
            viewportOptionsToggle
        );
    });

    const fontSizeContainer = jQuery(".font-size-container");
    const fontSizeRange = jQuery(".font-size-range");
    const fontSizeValue = jQuery(".font-size-value");
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
    const inspirationPanelTitle = jQuery(".inspiration-panel-title");
    const inspirationPanelBody = jQuery(".inspiration-panel-body");
    const inspirationPanelToggle = jQuery(".inspiration-panel-toggle");
    const inspirationThumbnails = jQuery(".inspiration-thumbnails");
    const buttonViewAll = jQuery(".button-view-all");
    const modalInspirationsGrid = jQuery(".modal-inspirations-grid");
    const modalSearchInput = jQuery(".modal-search-input");
    const toast = jQuery(".toast");

    inspirationPanelTitle.click(function() {
        togglePanel(
            inspirationPanel,
            inspirationPanelBody,
            inspirationPanelTitle,
            inspirationPanelToggle
        );
    });

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
            specs.font_size = fontSizeRange.val() + (unit ? " " + unit : "");
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
                fontSizeRange.prop("disabled", true);
            }
            const urlFontSize = urlParams.get("font_size");
            if (urlFontSize) {
                fontSizeRange.val(urlFontSize);
                fontSizeValue.text(urlFontSize);
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

    // renders a single inspiration thumbnail as a miniature
    // viewport preview with the text pre-rendered inside it
    const renderInspirationPreview = function(profile, inspiration, container) {
        const width = profile.width * VIEWPORT_SCALE;
        const height = profile.height * VIEWPORT_SCALE;
        const padding = inspiration.padding || profile.padding || { top: 0, right: 0, bottom: 0, left: 0 };
        const fontSize = inspiration.font_size || 3;
        const scaledSize = fontSize * VIEWPORT_SCALE * FONT_SIZE_SCALE;

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
        const safeX = padding.left * VIEWPORT_SCALE;
        const safeY = padding.top * VIEWPORT_SCALE;
        const safeW = width - (padding.left + padding.right) * VIEWPORT_SCALE;
        const safeH = height - (padding.top + padding.bottom) * VIEWPORT_SCALE;
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
            "text-align": inspiration.align || "left",
            "align-content": "center",
            display: "flex",
            "flex-wrap": "wrap",
            "justify-content": inspiration.align === "center" ? "center" : (inspiration.align === "right" ? "flex-end" : "flex-start"),
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
                    viewer.append("<span style=\"font-family: '" + font + "';\">" + value + "</span>");
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
    const renderInspirationPanel = function(profile) {
        inspirationThumbnails.empty();

        if (!profile || !profile._inspirations || profile._inspirations.length === 0) {
            inspirationPanel.removeClass("visible");
            return;
        }

        const entries = profile._inspirations.slice(0, 3);
        for (let i = 0; i < entries.length; i++) {
            const inspiration = entries[i];
            const thumb = jQuery('<div class="inspiration-thumb"></div>');
            const previewContainer = jQuery('<div class="inspiration-thumb-preview"></div>');
            const title = jQuery('<div class="inspiration-thumb-title"></div>');
            title.text(inspiration.title);
            thumb.append(previewContainer);
            thumb.append(title);
            thumb.data("inspiration", inspiration);
            inspirationThumbnails.append(thumb);
            renderInspirationPreview(profile, inspiration, previewContainer);
        }

        inspirationPanel.addClass("visible");
    };

    // renders all inspirations in the full-screen modal grid
    // with viewport previews and metadata for each entry
    const renderInspirationModal = function(profile, filter) {
        modalInspirationsGrid.empty();

        if (!profile || !profile._inspirations) return;

        const query = (filter || "").toLowerCase();
        const entries = profile._inspirations.filter(function(insp) {
            if (!query) return true;
            const haystack = [
                insp.title || "",
                insp.description || "",
                insp.author || "",
                (insp.text || []).map(function(t) { return t[1]; }).join("")
            ].join(" ").toLowerCase();
            return haystack.indexOf(query) !== -1;
        });

        if (entries.length === 0) {
            modalInspirationsGrid.append(
                '<div class="inspiration-empty">No inspirations found.</div>'
            );
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
            modalInspirationsGrid.append(card);
            renderInspirationPreview(profile, inspiration, previewContainer);
        }
    };

    // applies an inspiration configuration to the viewport
    // setting the text, font size, margins, and font selection
    const applyInspiration = function(profile, inspiration) {
        // clears the current viewport content
        viewportContainer.find("> :not(.caret)").remove();
        const caret = viewportContainer.find("> .caret");

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

        // rebuilds the DOM elements from the expanded text
        for (let i = 0; i < text.length; i++) {
            const item = text[i];
            if (item[1] === "\n") {
                const element = jQuery('<div class="newline"></div>');
                caret.before(element);
                element.click(function() {
                    const el = jQuery(this);
                    el.after(caret);
                    const pos = el.index(".viewer-container > :not(.caret)");
                    body.data("caret_position", pos);
                });
            } else {
                const value = item[1] === " " ? "&nbsp;" : item[1];
                const element = jQuery("<span style=\"font-family: '" + item[0] + "';\">" + value + "</span>");
                caret.before(element);
                element.click(function() {
                    const el = jQuery(this);
                    el.after(caret);
                    const pos = el.index(".viewer-container > :not(.caret)");
                    body.data("caret_position", pos);
                });
            }
        }

        // updates the text data and caret position
        body.data("text", text);
        body.data("caret_position", text.length - 1);

        // applies the font size from the inspiration
        if (inspiration.font_size) {
            fontSizeRange.val(inspiration.font_size);
            fontSizeValue.text(inspiration.font_size);
        }

        // applies the padding overrides if defined
        if (inspiration.padding) {
            marginLeft.val(inspiration.padding.left);
            marginRight.val(inspiration.padding.right);
            marginTop.val(inspiration.padding.top);
            marginBottom.val(inspiration.padding.bottom);
            renderViewportPreview(profile);
        }

        // applies the font size and recalculates layout
        applyFontSize();

        // determines the primary font from the text entries
        // and clicks the corresponding font element to select it
        let primaryFont = null;
        for (let i = 0; i < text.length; i++) {
            if (text[i][0] !== null) {
                primaryFont = text[i][0];
                break;
            }
        }
        if (primaryFont) {
            const fontEl = fontsContainer.find('.font[data-font="' + primaryFont + '"]');
            if (fontEl.length > 0 && !fontEl.hasClass("active")) {
                fontEl.click();
            }
        }

        // updates the print button and report URL
        const [textSimple, font] = simplifyText(text);
        buttonPrint.attr("data-text", textSimple);
        buttonPrint.attr("data-font", font);
        buttonPrint.data("multifont", multifontText(text, emojiMapping));
        const buttonHref = buttonReport.attr("data-href");
        buttonReport.attr("href", buttonHref + "?text=" + encodeURIComponent(serializeText(text)));

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
                fontSizeValue.text(size);
            }
        } else {
            size = parseInt(fontSizeRange.val());
        }

        if (size) {
            const scaledSize = size * VIEWPORT_SCALE * FONT_SIZE_SCALE;
            viewportContainer.css("font-size", scaledSize + "px");
            viewportContainer.css("line-height", Math.round(scaledSize * 1.2) + "px");
        }
    };

    // registers for the change in the profile dropdown so
    // that the viewport preview and font size controls update
    profileSelect.bind("change", function() {
        const key = jQuery(this).val();
        currentProfile = key ? profiles[key] : null;
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
        renderViewportPreview(currentProfile);
        renderRulers(currentProfile);
        applyZoom();
        updateProfileInfo(currentProfile);
        updateFontSizeControls(currentProfile);
        applyFontSize();
        renderInspirationPanel(currentProfile);
        updateUrl();
    });

    // registers for the change in the font size range slider
    // to update the displayed value and apply the new size
    fontSizeRange.bind("input", function() {
        const size = jQuery(this).val();
        fontSizeValue.text(size);
        applyFontSize();
        updateUrl();
    });

    // registers for the change in the font size mode checkbox
    // to toggle between manual and automatic sizing modes
    fontSizeMode.bind("change", function() {
        const isAutomatic = jQuery(this).prop("checked");
        fontSizeRange.prop("disabled", isAutomatic);
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
        } else {
            caret.hide();
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

            case "Enter":
                executed = newline();
                if (executed) {
                    event.stopPropagation();
                    event.preventDefault();
                }
                break;

            case "Delete":
                executed = deleteForward();
                if (executed) {
                    event.stopPropagation();
                    event.preventDefault();
                }
                break;

            case "ArrowLeft":
                moveCaret(-1);
                event.stopPropagation();
                event.preventDefault();
                break;

            case "ArrowRight":
                moveCaret(1);
                event.stopPropagation();
                event.preventDefault();
                break;

            case "ArrowUp":
                moveCaretLine(-1);
                event.stopPropagation();
                event.preventDefault();
                break;

            case "ArrowDown":
                moveCaretLine(1);
                event.stopPropagation();
                event.preventDefault();
                break;

            default:
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
        const element = jQuery("<span style=\"font-family: '" + font + "';\">&nbsp;</span>");
        caret.before(element);
        element.click(function() {
            const element = jQuery(this);
            element.after(caret);
            caretPosition = element.index(".viewer-container > :not(.caret)");
            body.data("caret_position", caretPosition);
        });
        text.splice(caretPosition + 1, 0, [font, " "]);
        caretPosition++;
        setText(text, caretPosition);
        return true;
    };

    const newline = function() {
        let [text, caret, caretPosition] = getText();
        if (caret.length === 0) return false;
        const maxLines = currentProfile
            ? currentProfile.text
                ? currentProfile.text.max_lines || 0
                : 0
            : 1;
        if (maxLines > 0 && countLines(text) >= maxLines) return false;
        const element = jQuery('<div class="newline"></div>');
        caret.before(element);
        element.click(function() {
            const element = jQuery(this);
            element.after(caret);
            caretPosition = element.index(".viewer-container > :not(.caret)");
            body.data("caret_position", caretPosition);
        });
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
        const elements = viewportContainer.children(":not(.caret)");
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

        // splits the text array into lines separated by newline
        // entries to determine the current line and column
        const lines = [[]];
        for (let i = 0; i < text.length; i++) {
            if (text[i][1] === "\n") {
                lines.push([]);
            } else {
                lines[lines.length - 1].push(i);
            }
        }

        // determines which line and column the caret is on
        let currentLine = 0;
        let currentCol = 0;
        if (caretPosition === -1) {
            currentLine = 0;
            currentCol = -1;
        } else if (text[caretPosition] && text[caretPosition][1] === "\n") {
            // caret is on a newline, treat as end of that line
            for (let l = 0; l < lines.length - 1; l++) {
                const lineEnd = lines[l].length > 0 ? lines[l][lines[l].length - 1] : -1;
                if (caretPosition === lineEnd + 1) {
                    currentLine = l;
                    currentCol = lines[l].length;
                    break;
                }
            }
        } else {
            for (let l = 0; l < lines.length; l++) {
                const idx = lines[l].indexOf(caretPosition);
                if (idx !== -1) {
                    currentLine = l;
                    currentCol = idx;
                    break;
                }
            }
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

        const elements = viewportContainer.children(":not(.caret)");
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
        const element = jQuery("<span style=\"font-family: '" + font + "';\">" + value + "</span>");
        caret.before(element);
        element.click(function() {
            const element = jQuery(this);
            element.after(caret);
            caretPosition = element.index(".viewer-container > :not(.caret)");
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
        if (currentProfile) {
            const keys = Object.keys(profiles);
            for (const key of keys) {
                if (profiles[key] === currentProfile) {
                    params.set("profile", key);
                    break;
                }
            }
        }
        const fontSize = fontSizeRange.val();
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
        viewportContainer.find("> :not(.caret)").each(function() {
            const element = jQuery(this);
            element.click(function() {
                const element = jQuery(this);
                viewportContainer.find("> .caret").insertAfter(element);
                const caretPosition = element.index(".viewer-container > :not(.caret)");
                body.data("caret_position", caretPosition);
            });
        });
        const [textSimple, font] = simplifyText(textData);
        buttonPrint.attr("data-text", textSimple);
        buttonPrint.attr("data-font", font);
        buttonPrint.data("multifont", multifontText(textData, emojiMapping));
        const buttonHref = buttonReport.attr("data-href");
        buttonReport.attr(
            "href",
            buttonHref + "?text=" + encodeURIComponent(serializeText(textData))
        );
    };

    const setText = function(text, caretPosition) {
        body.data("text", text);
        body.data("caret_position", caretPosition);

        const buttonHref = buttonReport.attr("data-href");
        buttonReport.attr("href", buttonHref + "?text=" + encodeURIComponent(serializeText(text)));

        const [textSimple, font] = simplifyText(text);
        buttonPrint.attr("data-text", textSimple);
        buttonPrint.attr("data-font", font);
        buttonPrint.data("multifont", multifontText(text, emojiMapping));

        // recalculates the automatic font size when the
        // text content changes to fit the viewport
        if (currentProfile && fontSizeMode.prop("checked")) {
            applyFontSize();
        }

        updateUrl();
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
    modalOverlayInspirations.modal();
    toast.toast();

    // registers click handlers for the inspiration panel
    // thumbnails to apply the selected inspiration preset
    inspirationThumbnails.on("click", ".inspiration-thumb", function() {
        const inspiration = jQuery(this).data("inspiration");
        if (inspiration && currentProfile) {
            applyInspiration(currentProfile, inspiration);
        }
    });

    // registers for the view all button to open the
    // full-screen inspirations modal with all entries
    buttonViewAll.click(function() {
        if (!currentProfile || !currentProfile._inspirations) return;
        modalSearchInput.val("");
        renderInspirationModal(currentProfile);
        modalOverlayInspirations.modal("show");
    });

    // registers click handlers for the modal inspiration
    // cards to apply the selected preset and close the modal
    modalInspirationsGrid.on("click", ".inspiration-card", function() {
        const inspiration = jQuery(this).data("inspiration");
        if (inspiration && currentProfile) {
            applyInspiration(currentProfile, inspiration);
            modalOverlayInspirations.modal("hide");
        }
    });

    // registers for the search input to filter the
    // inspirations grid in the full-screen modal
    modalSearchInput.bind("input", function() {
        const query = jQuery(this).val();
        renderInspirationModal(currentProfile, query);
    });

    formConsole.formconsole();

    body.bind("keydown", keyboardHandler);

    restoreFont();
});
