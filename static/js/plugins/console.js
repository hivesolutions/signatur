(function(jQuery) {
    /**
     * Debug console plugin that evaluates arbitrary JavaScript
     * commands entered in a text input and displays the result.
     *
     * Operates on a .form-console element and discovers its
     * children (.button, .input[name=command]) by class name
     * convention.
     */
    jQuery.fn.formconsole = function() {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const button = jQuery(".button", context);
            const command = jQuery(".input[name=command]", context);

            button.click(function() {
                const commandValue = command.val();
                try {
                    // eslint-disable-next-line no-eval
                    const result = eval(commandValue);
                    if (result) alert(result);
                    else alert("executed");
                } catch (err) {
                    alert(err);
                }
                command.val("");
            });
        });

        return this;
    };
})(jQuery);
