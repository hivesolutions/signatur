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

const deserializeText = function(text, separator = "|") {
    if (!text) return null;
    const textL = [];
    const pairs = text.split(new RegExp("\\" + separator));
    for (let index = 0; index < pairs.length; index++) {
        const pair = pairs[index];
        if (pair === "\\n") {
            textL.push([null, "\n"]);
            continue;
        }
        let font, value;
        const offset = pair.indexOf(":");
        if (offset === -1) {
            font = pair;
            value = null;
        } else {
            font = pair.slice(0, offset);
            value = pair.slice(offset + 1);
        }
        textL.push([font, value]);
    }
    return textL;
};

const serializeText = function(text, separator = "|") {
    const buffer = [];
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        if (item[1] === "\n") {
            buffer.push("\\n");
        } else {
            buffer.push(item[0] + ":" + item[1]);
        }
    }
    return buffer.join(separator);
};

const simplifyText = function(text, separator = "") {
    const buffer = [];
    let font = null;
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        if (item[0] !== null) font = item[0];
        buffer.push(item[1]);
    }
    return [buffer.join(separator), font];
};

const multifontText = function(text, emojiMapping) {
    const result = [];
    for (let index = 0; index < text.length; index++) {
        const item = text[index];
        const font = item[0];
        const value = item[1];
        if (value === "\n") {
            result.push([null, "\n"]);
            continue;
        }
        if (font === "Cool Emojis") {
            const mapped = emojiMapping[value];
            if (mapped) {
                result.push([mapped, "a"]);
            } else if (value === " ") {
                result.push(["HELVETICA 4L", " "]);
            }
            continue;
        }
        if (font === "Cool Emojis Pantograph") continue;
        const last = result.length > 0 ? result[result.length - 1] : null;
        if (last && last[0] === font && last[1] !== "\n") {
            last[1] += value;
        } else {
            result.push([font, value]);
        }
    }
    return result;
};

const hasUnsupportedFont = function(text) {
    for (let index = 0; index < text.length; index++) {
        if (text[index][0] === "Cool Emojis Pantograph") return true;
    }
    return false;
};

const countLines = function(text) {
    let lines = 1;
    for (let index = 0; index < text.length; index++) {
        if (text[index][1] === "\n") lines++;
    }
    return lines;
};
