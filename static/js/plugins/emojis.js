(function(jQuery) {
    /**
     * Emojis plugin that uploads a replacement Cool Emojis font
     * (and, optionally, the companion mapping JSON) to the server
     * from the Emojis tab on the settings screen.
     *
     * Operates on a .settings-tab-content[data-tab=emojis] element
     * and discovers its children (.emojis-upload, .emojis-feedback,
     * #emojis-font, #emojis-mapping) by class name convention.
     */
    jQuery.fn.emojis = function() {
        const elements = jQuery(this);

        // renders the feedback panel inside the tab using the
        // requested treatment so the caller can swap between the
        // success, the error and the validation flavors without
        // touching the surrounding chrome
        const showFeedback = function(context, status, message) {
            const feedback = jQuery(".emojis-feedback", context);
            feedback.attr("data-status", status);
            feedback.text(message);
            feedback.prop("hidden", false);
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

            uploadButton.click(async function(event) {
                event.preventDefault();

                // refuses to start the upload without a font payload
                // so the server never sees a request that is bound to
                // fail validation, surfacing the same hint regardless
                // of whether the user forgot the file or cleared it
                const fontFile = fontInput.get(0).files[0];
                if (!fontFile) {
                    showFeedback(context, "error", fontRequiredLabel);
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
                        showFeedback(context, "success", successLabel);
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
                    showFeedback(context, "error", messages.join(", "));
                } catch (error) {
                    showFeedback(context, "error", networkErrorLabel);
                } finally {
                    uploadButton.prop("disabled", false);
                    uploadButton.text(uploadLabel);
                }
            });
        });

        return elements;
    };
})(jQuery);
