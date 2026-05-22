(function(jQuery) {
    /**
     * Feedback plugin that wires the post engraving feedback modal
     * end to end so the multiple choice satisfaction picker and the
     * optional notes textarea collect a payload that is then posted
     * to the `/feedback` endpoint and dismissed with a toast on
     * success.
     *
     * Operates on a .modal-overlay-feedback element and discovers
     * its children (.modal-feedback-satisfaction, .modal-feedback-notes,
     * .button-modal-feedback-submit) by class name convention; the
     * companion floating CTA (.button-feedback-cta) and the optional
     * shared overlays (.modal-overlay-error, .toast) are looked up
     * at the document level so the plugin stays self contained.
     *
     * Options (passed on init):
     *   "profileSelector" - an optional jQuery element wrapping the
     *                       profile selector plugin so the current
     *                       profile and variant are attached to the
     *                       submitted feedback payload
     *
     * Events listened to:
     *   "show"   - triggered by the modal plugin when the overlay
     *              becomes visible, resets the satisfaction chip
     *              selection and the notes textarea so a stale value
     *              is not carried over from a previous submission
     */
    jQuery.fn.feedback = function(options) {
        const elements = jQuery(this);
        const settings = options || {};

        elements.each(function() {
            const context = jQuery(this);
            const satisfaction = jQuery(
                ".modal-feedback-satisfaction input[name=feedback_satisfaction]",
                context
            );
            const notes = jQuery(".modal-feedback-notes", context);
            const submit = jQuery(".button-modal-feedback-submit", context);
            const cta = jQuery(".button-feedback-cta");
            const errorOverlay = jQuery(".modal-overlay-error");
            const toast = jQuery(".toast");
            const profileSelector = settings.profileSelector || jQuery();

            // resets the satisfaction chip selection and the notes
            // textarea every time the modal becomes visible so a
            // stale value is not carried over from a previous
            // engraving submission
            context.bind("show", function() {
                satisfaction.prop("checked", false);
                notes.val("");
                submit.addClass("disabled");
            });

            // toggles the submit button between disabled and enabled
            // based on whether a satisfaction option is currently
            // selected so the user cannot send an empty feedback
            // payload to the server
            satisfaction.bind("change", function() {
                const selected = jQuery(
                    ".modal-feedback-satisfaction input[name=feedback_satisfaction]:checked",
                    context
                ).val();
                if (selected) submit.removeClass("disabled");
                else submit.addClass("disabled");
            });

            // registers for the click on the feedback submit button
            // to collect the selected satisfaction option and the
            // optional notes, post them to the feedback endpoint and
            // close the modal with a toast confirmation when the
            // request succeeds, surfacing the existing error overlay
            // otherwise; a local in flight flag guards the handler
            // against duplicate submissions while the network request
            // is pending so a double tap on a slow connection does
            // not persist the same feedback multiple times
            let submitting = false;
            submit.click(async function() {
                if (submitting) return;
                if (jQuery(this).hasClass("disabled")) return;
                const selectedSatisfaction = jQuery(
                    ".modal-feedback-satisfaction input[name=feedback_satisfaction]:checked",
                    context
                ).val();
                if (!selectedSatisfaction) return;
                const notesValue = notes.val() || "";
                const selection =
                    profileSelector.length > 0 ? profileSelector.profileselector("value") : null;
                const profileKey = selection && selection.key ? selection.key : "";
                const variantIndex =
                    selection && selection.variantIndex !== null && selection.variantIndex !== undefined
                        ? String(selection.variantIndex)
                        : "";
                submitting = true;
                submit.addClass("disabled");
                try {
                    const feedbackResponse = await fetch("/feedback", {
                        method: "POST",
                        body: new URLSearchParams([
                            ["satisfaction", selectedSatisfaction],
                            ["notes", notesValue],
                            ["profile", profileKey],
                            ["variant", variantIndex]
                        ])
                    });
                    if (feedbackResponse.status !== 200) {
                        const error = await feedbackResponse.json();
                        const errorMessage = error.message || error.error || "unset";
                        errorOverlay.modal(
                            "show",
                            "Error while submitting feedback: " + errorMessage
                        );
                        return;
                    }
                    context.modal("hide");
                    toast.toast("show", "Thanks for your feedback.");
                } catch (err) {
                    errorOverlay.modal("show", String(err));
                } finally {
                    // releases the in flight guard so a subsequent
                    // submission attempt is honored, restoring the
                    // submit enabled state when a satisfaction option
                    // is still selected so an error path leaves the
                    // button usable for an immediate retry while a
                    // success path falls back to the modal show event
                    // that resets the chip selection
                    submitting = false;
                    const selected = jQuery(
                        ".modal-feedback-satisfaction input[name=feedback_satisfaction]:checked",
                        context
                    ).val();
                    if (selected) submit.removeClass("disabled");
                }
            });

            // registers for the click on the floating feedback CTA so
            // the user can open the feedback modal on an ad hoc basis
            // without having to wait for the next successful engrave
            // submission
            cta.click(function() {
                context.modal("show");
            });
        });

        return this;
    };
})(jQuery);
