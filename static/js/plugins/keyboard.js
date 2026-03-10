(function(jQuery) {
    jQuery.fn.keyboardcontainer = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const body = jQuery("body");
            const keys = jQuery("> .char", context);

            keys.click(function() {
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
        });

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
