(function(jQuery) {
    /**
     * Toast notification plugin that displays temporary
     * messages to the user for a fixed duration of 3 seconds.
     * Operates on a .toast element toggling a .visible class.
     */
    jQuery.fn.toast = function(action, message) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);

            if (action === "show") {
                context.text(message);
                context.addClass("visible");
                setTimeout(function() {
                    context.removeClass("visible");
                }, 3000);
            }
        });

        return this;
    };
})(jQuery);
