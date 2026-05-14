(function(jQuery) {
    /**
     * JSON highlight plugin that overlays a syntax colored preview
     * on top of a regular textarea so the user keeps native input
     * behavior (selection, copy paste, autocomplete, native scroll)
     * while seeing the value colored as it is typed.
     *
     * Operates on a textarea element and wraps it in a container
     * with a sibling pre element that mirrors the textarea contents
     * tokenized as JSON. The textarea text is rendered transparent
     * so only the colored overlay is visible to the reader, while
     * the caret remains visible at the textarea native position.
     */
    jQuery.fn.jsonhighlight = function(action, options) {
        const elements = jQuery(this);

        // escapes the given string so it can be safely embedded in
        // the highlight overlay without breaking the surrounding
        // markup or being interpreted as html by the browser
        const escapeHtml = function(value) {
            return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };

        // tokenizes the given json text into a sequence of colored
        // spans, recognising strings (telling keys apart from values
        // by the trailing colon), numbers, booleans, null, and the
        // structural punctuation that holds the document together
        const tokenize = function(text) {
            const pattern =
                /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}\[\],:]|\s+|[^\s]+/g;
            let output = "";
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const token = match[0];
                if (token[0] === '"') {
                    // peeks at the upcoming characters to tell a key
                    // (string followed by a colon) apart from a plain
                    // string value so the two get different colors
                    const rest = text.slice(pattern.lastIndex);
                    const isKey = /^\s*:/.test(rest);
                    const cls = isKey ? "jsonhighlight-key" : "jsonhighlight-string";
                    output += '<span class="' + cls + '">' + escapeHtml(token) + "</span>";
                } else if (token === "true" || token === "false") {
                    output += '<span class="jsonhighlight-boolean">' + token + "</span>";
                } else if (token === "null") {
                    output += '<span class="jsonhighlight-null">null</span>';
                } else if (/^-?\d/.test(token)) {
                    output += '<span class="jsonhighlight-number">' + token + "</span>";
                } else if (/^[{}\[\],:]$/.test(token)) {
                    output +=
                        '<span class="jsonhighlight-punctuation">' + escapeHtml(token) + "</span>";
                } else if (/^\s+$/.test(token)) {
                    output += token;
                } else {
                    // forwards any leftover slice unchanged so that
                    // a partial token during typing does not break
                    // the overlay layout
                    output += escapeHtml(token);
                }
            }
            return output;
        };

        elements.each(function() {
            const textarea = jQuery(this);

            // refreshes the overlay markup from the current textarea
            // value, appending a trailing space so the highlighter
            // matches the textarea height when the value ends on a
            // newline character
            const refresh = function() {
                const wrapper = textarea.data("_jsonhighlight_wrapper");
                if (!wrapper) return;
                const code = jQuery("code", wrapper);
                const value = textarea.val() || "";
                code.html(tokenize(value) + "\n");
            };

            // mirrors the textarea scroll position onto the overlay
            // so the colored content stays aligned with the caret
            // even after the user has scrolled past the viewport
            const syncScroll = function() {
                const wrapper = textarea.data("_jsonhighlight_wrapper");
                if (!wrapper) return;
                const overlay = jQuery(".jsonhighlight-overlay", wrapper).get(0);
                if (!overlay) return;
                overlay.scrollTop = textarea.get(0).scrollTop;
                overlay.scrollLeft = textarea.get(0).scrollLeft;
            };

            // refreshes the overlay programmatically so external
            // updates (template apply, edit mode, validate) keep
            // the colored preview in sync with the textarea value
            if (action === "refresh") {
                refresh();
                return;
            }

            // prevents duplicate wrapping when the plugin is invoked
            // more than once on the same element so the overlay does
            // not get nested inside another overlay
            if (textarea.data("_jsonhighlight_initialized")) return;
            textarea.data("_jsonhighlight_initialized", true);

            const wrapper = jQuery("<div></div>");
            wrapper.addClass("jsonhighlight-wrapper");
            const overlay = jQuery("<pre></pre>");
            overlay.addClass("jsonhighlight-overlay");
            overlay.attr("aria-hidden", "true");
            const code = jQuery("<code></code>");
            overlay.append(code);
            textarea.before(wrapper);
            wrapper.append(overlay);
            wrapper.append(textarea);
            textarea.data("_jsonhighlight_wrapper", wrapper);
            textarea.addClass("jsonhighlight-input");

            textarea.on("input", refresh);
            textarea.on("scroll", syncScroll);

            refresh();
            syncScroll();
        });

        return this;
    };
})(jQuery);
