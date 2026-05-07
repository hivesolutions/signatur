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
            }
        });

        return this;
    };
})(jQuery);
