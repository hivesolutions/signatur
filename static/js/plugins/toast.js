(function(jQuery) {
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
