(function(jQuery) {
    /**
     * Virtual keyboard plugin that handles character input via
     * clickable key elements with support for long-press accent
     * popups, keyboard casing toggle, and a letters/symbols mode
     * toggle that swaps the visible key set.
     *
     * Operates on a .keyboard-container element and discovers
     * its children (.char) by class name convention. Supports
     * data-accents attribute on keys for accent variant popups.
     *
     * Events:
     *   "key" - triggered when a key is pressed, passing the
     *           current font name and character value
     */
    jQuery.fn.keyboardcontainer = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const body = jQuery("body");
            const keys = jQuery("> .char", context);
            const tabs = jQuery("> .emojis-tabs > .emojis-tab", context);
            let longPressTimer = null;
            let longPressTriggered = false;

            tabs.click(function() {
                const element = jQuery(this);
                const category = element.attr("data-category");
                tabs.removeClass("active");
                element.addClass("active");
                context.attr("data-active", category);
            });

            keys.click(function() {
                if (longPressTriggered) return;
                const element = jQuery(this);
                let value = element.attr("data-value");
                if (value === undefined) value = element.text();
                const casing = context.data("casing") || "uppercase";
                value = casing === "lowercase" ? value.toLowerCase() : value;
                if (value === "⇧") {
                    toggleCasing(context);
                } else if (element.hasClass("mode")) {
                    toggleMode(context, element);
                } else {
                    const font = body.data("font");
                    context.triggerHandler("key", [font, value]);
                }
            });

            // registers a long press handler on keys that have
            // accented variants defined in the data-accents attribute
            keys.on("mousedown touchstart", function(event) {
                longPressTriggered = false;
                const element = jQuery(this);
                const accents = element.attr("data-accents");
                if (!accents) return;
                longPressTimer = setTimeout(function() {
                    longPressTriggered = true;
                    showAccentPopup(context, element, accents);
                }, 400);
            });

            keys.on("mouseup touchend touchcancel mouseleave", function() {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
        });

        /**
         * Shows the accent popup above the pressed key with
         * the available accented character variants.
         *
         * The popup is appended to the document body (instead of the
         * keyboard container) and positioned with fixed coordinates so
         * it is never clipped by the container's overflow handling, which
         * would otherwise hide it for keys on the top keyboard row.
         *
         * @param {Element} context The keyboard container context.
         * @param {Element} element The key element that was long pressed.
         * @param {String} accents Comma-separated list of accented characters.
         */
        const showAccentPopup = function(context, element, accents) {
            const body = jQuery("body");
            jQuery(".accent-popup").remove();

            const variants = accents.split(",");
            const casing = context.data("casing") || "uppercase";
            const popup = jQuery('<div class="accent-popup"></div>');
            const arrow = jQuery('<div class="accent-popup-arrow"></div>');

            for (let index = 0; index < variants.length; index++) {
                let value = variants[index].trim();
                if (casing === "lowercase") value = value.toLowerCase();
                const option = jQuery('<span class="accent-option">' + value + "</span>");
                option.on("mouseup touchend click", function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    const font = body.data("font");
                    context.triggerHandler("key", [font, value]);
                    popup.remove();
                });
                popup.append(option);
            }

            popup.append(arrow);

            // positions the popup using viewport coordinates and anchors it
            // to the body so it escapes the keyboard container's clipping
            const rect = element[0].getBoundingClientRect();
            const left = rect.left + rect.width / 2;
            const top = rect.top;
            popup.css({ left: left + "px", top: top + "px" });

            body.append(popup);

            // dismisses the popup when clicking outside of it
            // by registering a one-time click handler on the document
            setTimeout(function() {
                jQuery(document).one("click", function(event) {
                    if (jQuery(event.target).closest(".accent-popup").length > 0) return;
                    popup.remove();
                });
            }, 0);
        };

        /**
         * Toggle the casing of the keyboard.
         *
         * @param {Element} context The context that is going to be used
         * for the toggling.
         */
        const toggleCasing = function(context) {
            const casing = context.data("casing") || "uppercase";
            if (casing === "uppercase") {
                context.data("casing", "lowercase");
                context.addClass("lowercase");
            } else {
                context.data("casing", "uppercase");
                context.removeClass("lowercase");
            }
        };

        /**
         * Toggle the keyboard between the letters layout and the
         * symbols layout, swapping the visible key set and updating
         * the mode key label to mirror the active state.
         *
         * @param {Element} context The context that is going to be used
         * for the toggling.
         * @param {Element} element The mode toggle key element whose label
         * is going to be updated to reflect the new state.
         */
        const toggleMode = function(context, element) {
            const mode = context.data("mode") || "letters";
            if (mode === "letters") {
                context.data("mode", "symbols");
                context.addClass("symbols");
                element.text("ABC");
            } else {
                context.data("mode", "letters");
                context.removeClass("symbols");
                element.text("123");
            }
        };

        return this;
    };
})(jQuery);
