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
