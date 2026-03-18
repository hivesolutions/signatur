(function(jQuery) {
    jQuery.fn.keyboardcontainer = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const body = jQuery("body");
            const keys = jQuery("> .char", context);
            let longPressTimer = null;
            let longPressTriggered = false;

            keys.click(function() {
                if (longPressTriggered) return;
                const element = jQuery(this);
                let value = element.text();
                const casing = context.data("casing") || "uppercase";
                value = casing === "lowercase" ? value.toLowerCase() : value;
                if (value === "⇧") {
                    toggleCasing(context);
                } else {
                    const font = body.data("font");
                    context.triggerHandler("key", [font, value]);
                }
            });

            // registers a long press handler on keys that have
            // accented variants defined in the data-accents attribute
            keys.on("mousedown touchstart", function(event) {
                const element = jQuery(this);
                const accents = element.attr("data-accents");
                if (!accents) return;
                longPressTriggered = false;
                longPressTimer = setTimeout(function() {
                    longPressTriggered = true;
                    showAccentPopup(context, element, accents);
                }, 400);
            });

            keys.on("mouseup touchend mouseleave", function() {
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
         * @param {Element} context The keyboard container context.
         * @param {Element} element The key element that was long pressed.
         * @param {String} accents Comma-separated list of accented characters.
         */
        const showAccentPopup = function(context, element, accents) {
            const body = jQuery("body");
            jQuery(".accent-popup").remove();

            const variants = accents.split(",");
            const casing = context.data("casing") || "uppercase";
            const popup = jQuery("<div class=\"accent-popup\"></div>");
            const arrow = jQuery("<div class=\"accent-popup-arrow\"></div>");

            for (let index = 0; index < variants.length; index++) {
                let value = variants[index].trim();
                if (casing === "lowercase") value = value.toLowerCase();
                const option = jQuery(
                    "<span class=\"accent-option\">" + value + "</span>"
                );
                option.on("click", function() {
                    const font = body.data("font");
                    context.triggerHandler("key", [font, value]);
                    popup.remove();
                });
                popup.append(option);
            }

            popup.append(arrow);

            const offset = element.offset();
            const containerOffset = context.offset();
            const left = offset.left - containerOffset.left +
                element.outerWidth() / 2;
            const top = offset.top - containerOffset.top;
            popup.css({ left: left + "px", top: top + "px" });

            context.append(popup);

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

        return this;
    };
})(jQuery);
