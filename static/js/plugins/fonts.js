(function(jQuery) {
    /**
     * Font selection plugin that manages a clickable list of
     * font elements with toggle selection state.
     *
     * Operates on a .fonts-container element and discovers its
     * children (.font) by class name convention.
     *
     * Events:
     *   "font"   - triggered when a font is selected, passing
     *              the font name from the data-font attribute
     *   "defont" - triggered when a font is deselected, passing
     *              the font name from the data-font attribute
     */
    jQuery.fn.fontscontainer = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const fonts = jQuery(".font", context);

            fonts.click(function() {
                const _element = jQuery(this);
                if (_element.hasClass("selected")) {
                    _element.removeClass("selected");
                    context.triggerHandler("defont", [_element.attr("data-font")]);
                    return;
                }
                fonts.removeClass("selected");
                _element.addClass("selected");
                context.triggerHandler("font", [_element.attr("data-font")]);
            });
        });

        return this;
    };
})(jQuery);
