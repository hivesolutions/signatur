(function(jQuery) {
    jQuery.fn.collapsiblepanel = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const title = jQuery(".collapsible-title", context);
            const body = jQuery(".collapsible-body", context);
            const toggle = jQuery(".collapsible-toggle", context);

            title.click(function() {
                const bodyElement = body.get(0);
                const minimized = context.hasClass("minimized");
                if (minimized) {
                    context.removeClass("minimized");
                    const height = bodyElement.scrollHeight;
                    body.css("max-height", "0px");
                    title.css("margin-bottom", "0px");
                    bodyElement.offsetHeight; // eslint-disable-line no-unused-expressions
                    body.css("max-height", height + "px");
                    title.css("margin-bottom", "");
                    toggle.text("\u25be");
                    body.one("transitionend", function() {
                        body.css("max-height", "");
                    });
                } else {
                    body.css("max-height", bodyElement.scrollHeight + "px");
                    bodyElement.offsetHeight; // eslint-disable-line no-unused-expressions
                    body.css("max-height", "0px");
                    title.css("margin-bottom", "0px");
                    toggle.text("\u25b8");
                    body.one("transitionend", function() {
                        context.addClass("minimized");
                    });
                }
            });
        });

        return this;
    };
})(jQuery);
