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
