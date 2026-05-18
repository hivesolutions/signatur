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
