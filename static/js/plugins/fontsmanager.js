(function(jQuery) {
    /**
     * Fonts manager plugin that uploads paired display (`.ttf`)
     * and engraving (`.f3s`) text font payloads from the Fonts tab
     * on the settings screen and renders the installed catalog
     * alongside a per row delete button.
     *
     * Operates on a .settings-tab-content[data-tab=fonts] element
     * and discovers its children (.fonts-upload, .fonts-feedback,
     * .fonts-list, #fonts-name, #fonts-ttf, #fonts-f3s) by class
     * name convention.
     */
    jQuery.fn.fontsmanager = function() {
        const elements = jQuery(this);

        // renders the feedback panel inside the tab using the
        // requested treatment so the caller can swap between the
        // success, the error and the validation flavors without
        // touching the surrounding chrome
        const showFeedback = function(target, status, message) {
            target.attr("data-status", status);
            target.text(message);
            target.prop("hidden", false);
        };

        // formats the file size in bytes into a short human
        // readable string so the installed fonts list can display
        // the payload size next to the filename
        const formatSize = function(bytes) {
            if (bytes < 1024) return bytes + " B";
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
            return (bytes / (1024 * 1024)).toFixed(1) + " MB";
        };

        // renders the installed fonts list from the response
        // payload, surfacing the name, the two halves status and a
        // delete button per row so the admin can both audit the
        // current state and remove stale entries
        const renderFontsList = function(context, fonts, emptyLabel, deleteLabel) {
            const list = jQuery(".fonts-list", context);
            list.empty();
            if (!fonts || fonts.length === 0) {
                const empty = jQuery("<div></div>");
                empty.addClass("fonts-empty");
                empty.text(emptyLabel);
                list.append(empty);
                return;
            }
            for (const font of fonts) {
                const row = jQuery("<div></div>");
                row.addClass("fonts-row");
                row.attr("data-name", font.name);

                const name = jQuery("<div></div>");
                name.addClass("fonts-row-name");
                name.text(font.name);
                row.append(name);

                const halves = jQuery("<div></div>");
                halves.addClass("fonts-row-halves");
                const ttf = jQuery("<span></span>");
                ttf.addClass("fonts-row-half");
                ttf.attr("data-kind", "ttf");
                ttf.attr("data-present", font.ttf ? "1" : "0");
                ttf.text(font.ttf ? "TTF " + formatSize(font.ttf.size) : "TTF —");
                halves.append(ttf);
                const f3s = jQuery("<span></span>");
                f3s.addClass("fonts-row-half");
                f3s.attr("data-kind", "f3s");
                f3s.attr("data-present", font.f3s ? "1" : "0");
                f3s.text(font.f3s ? "F3S " + formatSize(font.f3s.size) : "F3S —");
                halves.append(f3s);
                row.append(halves);

                const deleteButton = jQuery("<button></button>");
                deleteButton.addClass("button button-ghost fonts-delete");
                deleteButton.attr("type", "button");
                deleteButton.attr("data-name", font.name);
                deleteButton.text(deleteLabel);
                row.append(deleteButton);

                list.append(row);
            }
        };

        // fetches the installed fonts list from the server and
        // renders it, silently ignoring fetch errors so a network
        // glitch does not prevent the upload form from staying
        // usable
        const fetchFontsList = async function(context, emptyLabel, deleteLabel) {
            try {
                const response = await fetch("/settings/fonts");
                if (response.status !== 200) return;
                const payload = await response.json();
                renderFontsList(context, payload.fonts, emptyLabel, deleteLabel);
            } catch (error) {
                // silently ignores fetch errors
            }
        };

        elements.each(function() {
            const context = jQuery(this);
            const uploadButton = jQuery(".fonts-upload", context);
            const uploadLabel = uploadButton.text();
            const uploadingLabel = context.attr("data-label-uploading");
            const nameRequiredLabel = context.attr("data-label-name-required");
            const ttfRequiredLabel = context.attr("data-label-ttf-required");
            const f3sRequiredLabel = context.attr("data-label-f3s-required");
            const successLabel = context.attr("data-label-success");
            const emptyLabel = context.attr("data-label-empty");
            const deleteLabel = context.attr("data-label-delete");
            const deletedLabel = context.attr("data-label-deleted");
            const networkErrorLabel = context.attr("data-label-network-error");
            const nameInput = jQuery("#fonts-name", context);
            const ttfInput = jQuery("#fonts-ttf", context);
            const f3sInput = jQuery("#fonts-f3s", context);
            const feedback = jQuery(".fonts-feedback", context);
            const list = jQuery(".fonts-list", context);

            uploadButton.click(async function(event) {
                event.preventDefault();

                // requires the name and both file payloads upfront
                // so the server never receives a request that is
                // bound to fail validation, with the inline feedback
                // making the missing field obvious to the operator
                const name = (nameInput.val() || "").trim();
                if (!name) {
                    showFeedback(feedback, "error", nameRequiredLabel);
                    return;
                }
                const ttfFile = ttfInput.get(0).files[0];
                if (!ttfFile) {
                    showFeedback(feedback, "error", ttfRequiredLabel);
                    return;
                }
                const f3sFile = f3sInput.get(0).files[0];
                if (!f3sFile) {
                    showFeedback(feedback, "error", f3sRequiredLabel);
                    return;
                }

                const formData = new FormData();
                formData.append("name", name);
                formData.append("ttf", ttfFile);
                formData.append("f3s", f3sFile);

                uploadButton.prop("disabled", true);
                uploadButton.text(uploadingLabel);
                try {
                    const response = await fetch("/settings/fonts", {
                        method: "POST",
                        body: formData
                    });
                    if (response.status !== 200) {
                        let messages = [];
                        try {
                            const payload = await response.json();
                            messages = (payload && payload.errors) || [
                                payload && payload.error
                            ];
                        } catch (error) {
                            // silently ignores non JSON error responses
                        }
                        showFeedback(feedback, "error", messages.filter(Boolean).join(", "));
                        return;
                    }
                    showFeedback(feedback, "success", successLabel);
                    nameInput.val("");
                    ttfInput.val("");
                    f3sInput.val("");
                    await fetchFontsList(context, emptyLabel, deleteLabel);
                } catch (error) {
                    showFeedback(feedback, "error", networkErrorLabel);
                } finally {
                    uploadButton.prop("disabled", false);
                    uploadButton.text(uploadLabel);
                }
            });

            // registers a delegated click handler on the installed
            // fonts list so the per row delete button can be wired
            // up before its row markup is rendered, surviving every
            // refresh that swaps the row nodes out
            list.on("click", ".fonts-delete", async function(event) {
                event.preventDefault();
                const button = jQuery(this);
                const name = button.attr("data-name");
                if (!name) return;
                button.prop("disabled", true);
                try {
                    const response = await fetch(
                        "/settings/fonts/" + encodeURIComponent(name) + "/delete",
                        { method: "POST" }
                    );
                    if (response.status !== 200) {
                        let messages = [];
                        try {
                            const payload = await response.json();
                            messages = (payload && payload.errors) || [
                                payload && payload.error
                            ];
                        } catch (error) {
                            // silently ignores non JSON error responses
                        }
                        showFeedback(feedback, "error", messages.filter(Boolean).join(", "));
                        return;
                    }
                    showFeedback(feedback, "success", deletedLabel);
                    await fetchFontsList(context, emptyLabel, deleteLabel);
                } catch (error) {
                    showFeedback(feedback, "error", networkErrorLabel);
                } finally {
                    button.prop("disabled", false);
                }
            });

            // fetches the installed fonts list on plain initialization
            // so the operator sees the current state without having
            // to issue any action upfront
            fetchFontsList(context, emptyLabel, deleteLabel);
        });

        return elements;
    };
})(jQuery);
