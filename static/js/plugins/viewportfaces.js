(function(jQuery) {
    /**
     * Viewport faces plugin that renders the front and back of a
     * double-sided profile as two miniature live-preview thumbnails
     * so the operator can switch which face the editor is editing.
     *
     * Operates on a .viewport-faces element and discovers its
     * children (.viewport-faces-thumbnails) by class name
     * convention, building one .viewport-faces-thumb per face whose
     * preview mirrors the inspiration panel rendering technique.
     *
     * Actions:
     *   "render" - rebuilds the two thumbnails from the given
     *              { profile, front, back, side } options, where each
     *              face is a { text, font_size, padding, align }
     *              object, showing the panel only for double-sided
     *              profiles and highlighting the currently active face
     *   "hide"   - hides the panel, used when the active profile is
     *              not double-sided so single-faced editing stays
     *              exactly as before
     *
     * Events:
     *   "switch" - triggered when a face thumbnail is selected,
     *              passing the chosen side ("front" or "back") as
     *              argument so the editor can swap the active buffer
     */
    jQuery.fn.viewportfaces = function(action, options) {
        const elements = jQuery(this);

        // resolves the scale constants from the options falling back
        // to the same defaults used by the inspiration panel so the
        // face thumbnails render at a comparable visual scale
        const viewportScale = (options && options.viewport_scale) || 3;
        const fontSizeScale = (options && options.font_size_scale) || 1.3;

        // renders a single face preview as a miniature viewport with
        // the text pre-rendered inside it, reusing the same safe area
        // and scaling math as the inspiration thumbnails so the two
        // panels stay visually consistent
        const renderPreview = function(profile, face, container) {
            const width = profile.width * viewportScale;
            const height = profile.height * viewportScale;
            const text = face.text || [];
            const align = face.align;
            const padding = face.padding ||
                profile.padding || { top: 0, right: 0, bottom: 0, left: 0 };
            const fontSize =
                face.font_size || (profile.font_size && profile.font_size.default) || 3;
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
                "text-align": align || "center",
                "align-content": "center",
                display: "flex",
                "flex-wrap": "wrap",
                "justify-content":
                    align === "left"
                        ? "flex-start"
                        : align === "right"
                          ? "flex-end"
                          : "center",
                overflow: "hidden"
            });

            // renders the text items inside the viewer container
            // expanding multi-character entries into individual spans
            for (let i = 0; i < text.length; i++) {
                const font = text[i][0];
                const chars = text[i][1];
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

            // scales the preview to fit inside the fixed height
            // container, centering it on both axes so the thumbnail
            // never overflows regardless of the profile aspect ratio
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
            container.css({ position: "relative" });

            container.append(preview);
        };

        // builds a single face thumbnail with its preview and label,
        // tagging it with the side so the click handler can emit the
        // matching switch event and marking the active face so the
        // styling diverges from the inactive one
        const renderThumb = function(context, profile, side, face, label, active) {
            const thumb = jQuery('<div class="viewport-faces-thumb"></div>');
            thumb.attr("data-side", side);
            if (active) thumb.addClass("active");
            const previewContainer = jQuery('<div class="viewport-faces-thumb-preview"></div>');
            const title = jQuery('<div class="viewport-faces-thumb-title"></div>');
            title.text(label);
            thumb.append(previewContainer);
            thumb.append(title);
            jQuery(".viewport-faces-thumbnails", context).append(thumb);
            renderPreview(profile, face, previewContainer);
        };

        elements.each(function() {
            const context = jQuery(this);
            const thumbnails = jQuery(".viewport-faces-thumbnails", context);
            const frontLabel = context.attr("data-label-front") || "Front";
            const backLabel = context.attr("data-label-back") || "Back";

            // rebuilds both thumbnails from the supplied face buffers,
            // hiding the panel entirely when the profile is not double
            // sided so single-faced editing is left untouched
            if (action === "render") {
                const profile = options.profile;
                if (!profile || !profile.double_sided || !profile.double_sided.enabled) {
                    context.removeClass("visible");
                    return;
                }

                // reveals the panel before the thumbnails are measured
                // and forces a synchronous reflow so the freshly shown
                // preview containers report their final width; without
                // this the first render after a page load measures the
                // not yet laid out containers and the miniature scale
                // stays stale until a manual click repaints it
                thumbnails.empty();
                context.addClass("visible");
                context.get(0).offsetHeight;

                const side = options.side || "front";
                renderThumb(
                    context,
                    profile,
                    "front",
                    options.front || {},
                    frontLabel,
                    side === "front"
                );
                renderThumb(
                    context,
                    profile,
                    "back",
                    options.back || {},
                    backLabel,
                    side === "back"
                );
                return;
            }

            // hides the panel without touching the thumbnails so the
            // caller can collapse it when leaving a double-sided
            // profile for a single-faced one
            if (action === "hide") {
                context.removeClass("visible");
                return;
            }

            // registers a delegated click handler on the thumbnails so
            // selecting a face emits the switch event before its markup
            // is rebuilt, surviving every render that swaps the nodes
            thumbnails.on("click", ".viewport-faces-thumb", function() {
                const side = jQuery(this).attr("data-side");
                if (side) context.triggerHandler("switch", [side]);
            });
        });

        return elements;
    };
})(jQuery);
