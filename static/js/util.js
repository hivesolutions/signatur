const jQuery = window.jQuery ? window.jQuery : null;

/**
 * Gathers the series of UI and canvas options according to
 * the requested theme.
 *
 * @param {String} theme The name of the theme to retrieve the target
 * options, that change thickness and global UI.
 * @returns {Object} An object with the setting for the current theme.
 */
const getOptions = function(theme) {
    switch (theme) {
        case "ldj":
            return {
                height: "100%",
                lineWidth: 1,
                UndoButton: true
            };
        default:
            return {
                width: "100%",
                height: "100%",
                lineWidth: 4,
                UndoButton: true
            };
    }
};

const drawText = function(ctx) {
    ctx.font = "30px Arial";
    ctx.fillText("Hello World", 10, 500);
};

const serializeText = function(text, separator = "|") {
    const buffer = [];
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        buffer.push(item[0] + ":" + item[1]);
    }
    return buffer.join(separator);
};

const simplifyText = function(text, separator = "") {
    const buffer = [];
    let font = null;
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        font = item[0];
        buffer.push(item[1]);
    }
    return [buffer.join(separator), font];
};
