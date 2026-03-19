(function(jQuery) {
    jQuery.fn.texteditor = function(action, options) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const body = jQuery("body");

            // stores configuration and state references that
            // can be updated externally via the option action
            let maxLines = context.data("_maxLines") || 0;

            // updates the max lines constraint from the profile
            // configuration to enforce the line limit on newlines
            if (action === "option") {
                if (options && options.maxLines !== undefined) {
                    maxLines = options.maxLines;
                    context.data("_maxLines", maxLines);
                }
                return;
            }

            // loads text data into the editor from an external
            // source such as an inspiration or session restore
            if (action === "loadText") {
                const textData = (options && options.text) || [];
                const caret = jQuery("> .caret", context);
                context.find("> :not(.caret)").remove();
                for (let i = 0; i < textData.length; i++) {
                    const item = textData[i];
                    if (item[1] === "\n") {
                        const element = jQuery('<div class="newline"></div>');
                        caret.before(element);
                        bindCaretClick(element, context, body);
                    } else {
                        const value = item[1] === " " ? "&nbsp;" : item[1];
                        const element = jQuery(
                            "<span style=\"font-family: '" + item[0] + "';\">" + value + "</span>"
                        );
                        caret.before(element);
                        bindCaretClick(element, context, body);
                    }
                }
                body.data("text", textData);
                body.data("caret_position", textData.length - 1);
                return;
            }

            // binds click handlers on pre-rendered DOM elements
            // that were server-rendered in the initial template
            if (action === "bindExisting") {
                context.find("> :not(.caret)").each(function() {
                    const element = jQuery(this);
                    bindCaretClick(element, context, body);
                });
                return;
            }

            // dead key composition map for physical keyboard input,
            // maps a dead key followed by a base letter to the
            // corresponding accented character
            const DEAD_KEY_MAP = {
                "´": { a: "á", e: "é", i: "í", o: "ó", u: "ú" },
                "^": { a: "â", e: "ê", o: "ô" },
                "~": { a: "ã", o: "õ" },
                "`": { a: "à" }
            };

            // builds a set of all valid accented characters so that
            // OS-composed dead key input can bypass keyboard validation
            const ACCENTED_CHARS = new Set();
            for (const deadKey in DEAD_KEY_MAP) {
                for (const base in DEAD_KEY_MAP[deadKey]) {
                    const composed = DEAD_KEY_MAP[deadKey][base];
                    ACCENTED_CHARS.add(composed);
                    ACCENTED_CHARS.add(composed.toUpperCase());
                }
            }

            let pendingDeadKey = null;

            // creates the key handler function responsible for
            // the update of the current text value, both from
            // a visual and logic point of view
            const keyHandler = function(event, font, value) {
                if (value === "⌫") {
                    backspace();
                } else if (value === "⎵") {
                    space(font);
                } else if (value === "↵") {
                    newline();
                } else {
                    type(font, value);
                }
            };

            const keyboardHandler = function(event) {
                // skips keyboard handling when a modal input is focused
                // so that text editing controls work normally in modals
                const target = jQuery(event.target);
                if (target.closest(".modal-overlay.visible").length > 0) return;

                const font = body.data("font");
                let executed = false;
                switch (event.key) {
                    case "Dead":
                        break;

                    case "Backspace":
                        pendingDeadKey = null;
                        executed = backspace();
                        if (executed) {
                            event.stopPropagation();
                            event.preventDefault();
                        }
                        break;

                    case " ":
                        pendingDeadKey = null;
                        executed = space(font);
                        if (executed) {
                            event.stopPropagation();
                            event.preventDefault();
                        }
                        break;

                    case "Enter":
                        pendingDeadKey = null;
                        executed = newline();
                        if (executed) {
                            event.stopPropagation();
                            event.preventDefault();
                        }
                        break;

                    case "Delete":
                        pendingDeadKey = null;
                        executed = deleteForward();
                        if (executed) {
                            event.stopPropagation();
                            event.preventDefault();
                        }
                        break;

                    case "ArrowLeft":
                        pendingDeadKey = null;
                        moveCaret(-1);
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    case "ArrowRight":
                        pendingDeadKey = null;
                        moveCaret(1);
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    case "ArrowUp":
                        pendingDeadKey = null;
                        moveCaretLine(-1);
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    case "ArrowDown":
                        pendingDeadKey = null;
                        moveCaretLine(1);
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    case "Home":
                        pendingDeadKey = null;
                        moveCaretHome();
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    case "End":
                        pendingDeadKey = null;
                        moveCaretEnd();
                        event.stopPropagation();
                        event.preventDefault();
                        break;

                    default:
                        // checks if the current key is a dead key accent
                        // and stores it for composition with the next key
                        if (DEAD_KEY_MAP[event.key]) {
                            pendingDeadKey = event.key;
                            event.stopPropagation();
                            event.preventDefault();
                            break;
                        }

                        // composes the pending dead key with the current
                        // key to produce an accented character if valid
                        if (pendingDeadKey) {
                            const composed = DEAD_KEY_MAP[pendingDeadKey][event.key.toLowerCase()];
                            pendingDeadKey = null;
                            if (composed) {
                                const cased =
                                    event.key === event.key.toUpperCase()
                                        ? composed.toUpperCase()
                                        : composed;
                                type(font, cased, false);
                            }
                            break;
                        }

                        // allows OS-composed accented characters to bypass
                        // the keyboard validation (dead key handled by the OS)
                        if (ACCENTED_CHARS.has(event.key)) {
                            type(font, event.key, false);
                            break;
                        }

                        type(font, event.key, true);
                        break;
                }
            };

            const backspace = function() {
                let [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                if (caretPosition < 0) return false;
                caret.prev().remove();
                text.splice(caretPosition, 1);
                caretPosition--;
                caretPosition = Math.max(caretPosition, -1);
                setText(text, caretPosition);
                return true;
            };

            const deleteForward = function() {
                const [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                if (caretPosition + 1 >= text.length) return false;
                caret.next().remove();
                text.splice(caretPosition + 1, 1);
                setText(text, caretPosition);
                return true;
            };

            const space = function(font) {
                let [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                const element = jQuery("<span style=\"font-family: '" + font + "';\">&nbsp;</span>");
                caret.before(element);
                bindCaretClick(element, context, body);
                text.splice(caretPosition + 1, 0, [font, " "]);
                caretPosition++;
                setText(text, caretPosition);
                return true;
            };

            const newline = function() {
                let [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                maxLines = context.data("_maxLines") || 0;
                if (maxLines > 0 && countLines(text) >= maxLines) return false;
                const element = jQuery('<div class="newline"></div>');
                caret.before(element);
                bindCaretClick(element, context, body);
                text.splice(caretPosition + 1, 0, [null, "\n"]);
                caretPosition++;
                setText(text, caretPosition);
                return true;
            };

            const moveCaret = function(direction) {
                const [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                const newPosition = caretPosition + direction;
                if (newPosition < -1 || newPosition >= text.length) return false;
                const elements = context.children(":not(.caret)");
                if (newPosition === -1) {
                    elements.first().before(caret);
                } else {
                    elements.eq(newPosition).after(caret);
                }
                body.data("caret_position", newPosition);
                return true;
            };

            // splits the text array into lines and determines which
            // line the caret is currently on based on its position
            const getCaretLine = function(text, caretPosition) {
                const lines = [[]];
                for (let i = 0; i < text.length; i++) {
                    if (text[i][1] === "\n") {
                        lines.push([]);
                    } else {
                        lines[lines.length - 1].push(i);
                    }
                }

                // determines the current line by counting newline entries
                // up to the caret position, handling empty lines correctly
                let currentLine = 0;
                if (caretPosition >= 0) {
                    let line = 0;
                    for (let i = 0; i <= caretPosition; i++) {
                        if (text[i][1] === "\n") line++;
                    }
                    currentLine = line;
                }

                return { lines: lines, currentLine: currentLine };
            };

            const moveCaretHome = function() {
                const [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                const { lines, currentLine } = getCaretLine(text, caretPosition);

                // moves the caret to before the first character on the line
                let newPosition;
                if (lines[currentLine].length > 0) {
                    newPosition = lines[currentLine][0] - 1;
                } else {
                    newPosition =
                        currentLine === 0
                            ? -1
                            : lines[currentLine - 1].length > 0
                            ? lines[currentLine - 1][lines[currentLine - 1].length - 1] + 1
                            : currentLine - 1;
                }

                if (newPosition === caretPosition) return false;
                const elements = context.children(":not(.caret)");
                if (newPosition === -1) {
                    elements.first().before(caret);
                } else {
                    elements.eq(newPosition).after(caret);
                }
                body.data("caret_position", newPosition);
                return true;
            };

            const moveCaretEnd = function() {
                const [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                const { lines, currentLine } = getCaretLine(text, caretPosition);

                // moves the caret to after the last character on the line
                let newPosition;
                if (lines[currentLine].length > 0) {
                    newPosition = lines[currentLine][lines[currentLine].length - 1];
                } else {
                    newPosition =
                        currentLine === 0
                            ? -1
                            : lines[currentLine - 1].length > 0
                            ? lines[currentLine - 1][lines[currentLine - 1].length - 1] + 1
                            : currentLine - 1;
                }

                if (newPosition === caretPosition) return false;
                const elements = context.children(":not(.caret)");
                if (newPosition === -1) {
                    elements.first().before(caret);
                } else {
                    elements.eq(newPosition).after(caret);
                }
                body.data("caret_position", newPosition);
                return true;
            };

            const moveCaretLine = function(direction) {
                const [text, caret, caretPosition] = getText();
                if (caret.length === 0) return false;
                const { lines, currentLine } = getCaretLine(text, caretPosition);

                // determines the column within the current line
                let currentCol = 0;
                if (caretPosition === -1) {
                    currentCol = -1;
                } else if (text[caretPosition] && text[caretPosition][1] === "\n") {
                    currentCol = -1;
                } else {
                    const idx = lines[currentLine].indexOf(caretPosition);
                    currentCol = idx !== -1 ? idx : 0;
                }

                const targetLine = currentLine + direction;
                if (targetLine < 0 || targetLine >= lines.length) return false;

                // moves to the same column on the target line or the
                // end of the target line if it is shorter
                let newPosition;
                if (currentCol === -1) {
                    // was before first char, go to before first char of target line
                    if (lines[targetLine].length > 0) {
                        newPosition = lines[targetLine][0] - 1;
                    } else {
                        // target line is empty, find the newline before it
                        newPosition =
                            targetLine === 0
                                ? -1
                                : lines[targetLine - 1].length > 0
                                ? lines[targetLine - 1][lines[targetLine - 1].length - 1] + 1
                                : targetLine - 1;
                    }
                } else if (currentCol >= lines[targetLine].length) {
                    // column exceeds target line length, go to end
                    if (lines[targetLine].length > 0) {
                        newPosition = lines[targetLine][lines[targetLine].length - 1];
                    } else {
                        // target line is empty, position on its preceding newline
                        newPosition =
                            targetLine === 0
                                ? -1
                                : lines[targetLine - 1].length > 0
                                ? lines[targetLine - 1][lines[targetLine - 1].length - 1] + 1
                                : targetLine - 1;
                    }
                } else {
                    newPosition = lines[targetLine][currentCol];
                }

                const elements = context.children(":not(.caret)");
                if (newPosition === -1) {
                    elements.first().before(caret);
                } else {
                    elements.eq(newPosition).after(caret);
                }
                body.data("caret_position", newPosition);
                return true;
            };

            const type = function(font, value, validate) {
                // determines if a key exists in the current selected keyboard that
                // has the value of the provided key and if that's not the case returns
                // the control flow immediately, key is not compatible
                const key = jQuery(
                    `.keyboard-container.selected > span[data-value=\"${value
                        .replace("\\", "\\\\")
                        .replace('"', '\\"')
                        .toUpperCase()}\"]`,
                    body
                );
                if (validate && key.length === 0) return;

                let [text, caret, caretPosition] = getText();
                const element = jQuery(
                    "<span style=\"font-family: '" + font + "';\">" + value + "</span>"
                );
                caret.before(element);
                bindCaretClick(element, context, body);
                text.splice(caretPosition + 1, 0, [font, value]);
                caretPosition++;
                setText(text, caretPosition);
            };

            const getText = function() {
                const text = body.data("text") || [];
                const caret = jQuery("> .caret", context);
                const caretPosition =
                    body.data("caret_position") === undefined ? -1 : body.data("caret_position");
                return [text, caret, caretPosition];
            };

            const setText = function(text, caretPosition) {
                body.data("text", text);
                body.data("caret_position", caretPosition);
                context.triggerHandler("change", [text, caretPosition]);
            };

            // prevents duplicate bindings if already initialized
            if (body.data("_texteditor_initialized")) return;
            body.data("_texteditor_initialized", true);

            // binds the key handler to the virtual keyboard containers
            // so that key presses on the on-screen keyboards are forwarded
            jQuery(".keyboard-container").bind("key", keyHandler);
            jQuery(".emojis-container").bind("key", keyHandler);
            jQuery(".emojisp-container").bind("key", keyHandler);

            body.bind("keydown", keyboardHandler);
        });

        return this;
    };

    /**
     * Binds a click handler on a DOM element that repositions
     * the caret after the clicked element when selected.
     *
     * @param {Element} element The DOM element to bind the click handler on.
     * @param {Element} container The viewer container holding all elements.
     * @param {Element} body The body element used for state storage.
     */
    const bindCaretClick = function(element, container, body) {
        element.click(function() {
            const el = jQuery(this);
            const caret = container.find("> .caret");
            el.after(caret);
            const pos = container.children(":not(.caret)").index(el);
            body.data("caret_position", pos);
        });
    };
})(jQuery);
