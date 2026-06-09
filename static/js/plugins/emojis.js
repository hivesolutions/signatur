(function(jQuery) {
    /**
     * Emojis plugin that uploads a replacement Cool Emojis font
     * (and, optionally, the companion mapping JSON) to the server
     * from the Emojis tab on the settings screen and manages the
     * per glyph engraving `.f3s` payloads listed alongside the
     * display upload form.
     *
     * Operates on a .settings-tab-content[data-tab=emojis] element
     * and discovers its children (.emojis-upload, .emojis-feedback,
     * #emojis-font, #emojis-mapping, .emojis-f3s-upload,
     * .emojis-f3s-feedback, .emojis-f3s-list, #emojis-f3s-name,
     * #emojis-f3s-file) by class name convention.
     */
    jQuery.fn.emojis = function() {
        const elements = jQuery(this);

        // renders the feedback panel inside the requested section
        // using the requested treatment so the caller can swap
        // between the success, the error and the validation
        // flavors without touching the surrounding chrome
        const showFeedback = function(target, status, message) {
            target.attr("data-status", status);
            target.text(message);
            target.prop("hidden", false);
        };

        // formats the file size in bytes into a short human
        // readable string so the installed engraving glyphs list
        // can display the payload size next to the filename
        const formatSize = function(bytes) {
            if (bytes < 1024) return bytes + " B";
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
            return (bytes / (1024 * 1024)).toFixed(1) + " MB";
        };

        // renders the installed engraving glyphs list from the
        // response payload, surfacing the filename, the size and
        // a delete button per row so the admin can both audit the
        // current state and remove stale entries
        const renderF3sList = function(context, fonts, emptyLabel, deleteLabel) {
            const list = jQuery(".emojis-f3s-list", context);
            list.empty();
            if (!fonts || fonts.length === 0) {
                const empty = jQuery("<div></div>");
                empty.addClass("emojis-f3s-empty");
                empty.text(emptyLabel);
                list.append(empty);
                return;
            }
            for (const font of fonts) {
                const row = jQuery("<div></div>");
                row.addClass("emojis-f3s-row");
                row.attr("data-filename", font.name);

                const name = jQuery("<div></div>");
                name.addClass("emojis-f3s-row-name");
                name.text(font.name);
                row.append(name);

                const size = jQuery("<div></div>");
                size.addClass("emojis-f3s-row-size");
                size.text(formatSize(font.size));
                row.append(size);

                const deleteButton = jQuery("<button></button>");
                deleteButton.addClass("button button-ghost emojis-f3s-delete");
                deleteButton.attr("type", "button");
                deleteButton.attr("data-filename", font.name);
                deleteButton.text(deleteLabel);
                row.append(deleteButton);

                list.append(row);
            }
        };

        // fetches the installed engraving glyphs list from the
        // server and renders it, silently ignoring fetch errors
        // so a network glitch does not prevent the upload form
        // from staying usable
        const fetchF3sList = async function(context, emptyLabel, deleteLabel) {
            try {
                const response = await fetch("/settings/emojis/f3s");
                if (response.status !== 200) return;
                const payload = await response.json();
                renderF3sList(context, payload.fonts, emptyLabel, deleteLabel);
            } catch (error) {
                // silently ignores fetch errors
            }
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
            const feedback = jQuery(".emojis-feedback", context);

            const f3sUploadButton = jQuery(".emojis-f3s-upload", context);
            const f3sUploadLabel = f3sUploadButton.text();
            const f3sUploadingLabel = context.attr("data-label-f3s-uploading");
            const f3sRequiredLabel = context.attr("data-label-f3s-required");
            const f3sFilenameRequiredLabel = context.attr("data-label-f3s-filename-required");
            const f3sSuccessLabel = context.attr("data-label-f3s-success");
            const f3sEmptyLabel = context.attr("data-label-f3s-empty");
            const f3sDeleteLabel = context.attr("data-label-f3s-delete");
            const f3sDeletedLabel = context.attr("data-label-f3s-deleted");
            const f3sNetworkErrorLabel = context.attr("data-label-f3s-network-error");
            const f3sFilenameInput = jQuery("#emojis-f3s-name", context);
            const f3sFileInput = jQuery("#emojis-f3s-file", context);
            const f3sFeedback = jQuery(".emojis-f3s-feedback", context);
            const f3sList = jQuery(".emojis-f3s-list", context);

            uploadButton.click(async function(event) {
                event.preventDefault();

                // refuses to start the upload without a font payload
                // so the server never sees a request that is bound to
                // fail validation, surfacing the same hint regardless
                // of whether the user forgot the file or cleared it
                const fontFile = fontInput.get(0).files[0];
                if (!fontFile) {
                    showFeedback(feedback, "error", fontRequiredLabel);
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
                    if (response.status === 200) {
                        showFeedback(feedback, "success", successLabel);
                        fontInput.val("");
                        mappingInput.val("");
                        return;
                    }
                    let messages = [];
                    try {
                        const payload = await response.json();
                        messages = payload.errors || [payload.error || networkErrorLabel];
                    } catch (err) {
                        messages = [networkErrorLabel];
                    }
                    showFeedback(feedback, "error", messages.join(", "));
                } catch (error) {
                    showFeedback(feedback, "error", networkErrorLabel);
                } finally {
                    uploadButton.prop("disabled", false);
                    uploadButton.text(uploadLabel);
                }
            });

            f3sUploadButton.click(async function(event) {
                event.preventDefault();

                // requires both the filename and the payload upfront
                // so the server never receives a request that is bound
                // to fail validation, with the inline feedback making
                // the missing field obvious to the operator
                const filename = (f3sFilenameInput.val() || "").trim();
                if (!filename) {
                    showFeedback(f3sFeedback, "error", f3sFilenameRequiredLabel);
                    return;
                }
                const file = f3sFileInput.get(0).files[0];
                if (!file) {
                    showFeedback(f3sFeedback, "error", f3sRequiredLabel);
                    return;
                }

                const formData = new FormData();
                formData.append("filename", filename);
                formData.append("file", file);

                f3sUploadButton.prop("disabled", true);
                f3sUploadButton.text(f3sUploadingLabel);
                try {
                    const response = await fetch("/settings/emojis/f3s", {
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
                        showFeedback(f3sFeedback, "error", messages.filter(Boolean).join(", "));
                        return;
                    }
                    showFeedback(f3sFeedback, "success", f3sSuccessLabel);
                    f3sFilenameInput.val("");
                    f3sFileInput.val("");
                    await fetchF3sList(context, f3sEmptyLabel, f3sDeleteLabel);
                } catch (error) {
                    showFeedback(f3sFeedback, "error", f3sNetworkErrorLabel);
                } finally {
                    f3sUploadButton.prop("disabled", false);
                    f3sUploadButton.text(f3sUploadLabel);
                }
            });

            // registers a delegated click handler on the installed
            // engraving glyphs list so the per row delete button
            // can be wired up before its row markup is rendered,
            // surviving every refresh that swaps the row nodes out
            f3sList.on("click", ".emojis-f3s-delete", async function(event) {
                event.preventDefault();
                const button = jQuery(this);
                const filename = button.attr("data-filename");
                if (!filename) return;
                button.prop("disabled", true);
                try {
                    const response = await fetch(
                        "/settings/emojis/f3s/" + encodeURIComponent(filename) + "/delete",
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
                        showFeedback(f3sFeedback, "error", messages.filter(Boolean).join(", "));
                        return;
                    }
                    showFeedback(f3sFeedback, "success", f3sDeletedLabel);
                    await fetchF3sList(context, f3sEmptyLabel, f3sDeleteLabel);
                } catch (error) {
                    showFeedback(f3sFeedback, "error", f3sNetworkErrorLabel);
                } finally {
                    button.prop("disabled", false);
                }
            });

            // fetches the installed engraving glyphs list on plain
            // initialization so the operator sees the current state
            // without having to issue any action upfront
            fetchF3sList(context, f3sEmptyLabel, f3sDeleteLabel);
        });

        return elements;
    };
})(jQuery);
