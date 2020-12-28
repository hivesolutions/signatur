const config = require("./config");
const inkscape = require("../engines/inkscape");

const ENGINES = {
    inkscape: inkscape.Inkscape
};

const init = () => {
    initEngines();
};

const destroy = () => {
    destroyEngines();
};

/**
 * Initializes the complete set of registered "signatur"
 * engines so that they become ready to be used.
 */
const initEngines = () => {
    Object.keys(ENGINES).forEach(function(key) {
        ENGINES[key].singleton().init();
    });
};

/**
 * Destroys the complete set of "signatur" engines, so that
 * they become unavailable for usage.
 */
const destroyEngines = () => {
    Object.keys(ENGINES).forEach(function(key) {
        ENGINES[key].singleton().destroy();
    });
};

/**
 * Verifies that the key present in the request matches
 * the one defined in the current configuration, ensuring
 * that proper security measures are in place.
 *
 * @param {any} req The request to retrieve the key.
 */
const verifyKey = req => {
    if (!config.conf.KEY) {
        return;
    }
    const _key = req.query.key || req.headers["X-Signatur-Key"] || null;
    if (config.conf.KEY === _key) {
        return;
    }
    throw new Error("Invalid key");
};

/**
 * Deserialize the provided font and characters string according
 * to the canonical format (eg: `arial:A-times:B`).
 *
 * @param {String} text The text that is going to be deserialized by
 * splitting its multiple components around the "-" character.
 * @param {String} separator The separator to be used in the de-serialization
 * of the string, should be safe character as no escaping support exists.
 * @returns {Array} The array of tuples that define the font and the
 * value for the font (character or characters).
 */
const deserializeText = (text, separator = "|") => {
    if (!text) return null;
    const textL = [];
    const pairs = text.split(new RegExp("\\" + separator));
    for (const pair of pairs) {
        let font, value;
        const offset = pair.indexOf(":");
        if (offset === -1) {
            [font, value] = [pair, null];
        } else {
            [font, value] = [pair.slice(0, offset), pair.slice(offset + 1)];
        }
        textL.push([font, value]);
    }
    return textL;
};

/**
 * "Resolved" the name of the most relevant font in the provided text
 * according to a pre-defined heuristic.
 *
 * @param {String} text The text that is going to be deserialized by
 * splitting its multiple components around the "-" character.
 * @param {String} separator The separator to be used in the de-serialization
 * of the string, should be safe character as no escaping support exists.
 * @returns {String} The name of the most relevant font in the provided
 * normalized text sequence.
 */
const fontText = (text, separator = "|") => {
    const textL = deserializeText(text, separator);
    if (!textL || textL.length === 0) return null;
    const fontsM = {};
    let [max, maxFont] = [-1, null];
    textL.forEach(([font, value]) => {
        if (!value || !value.length) return;
        const count = (fontsM[font] || 0) + value.length;
        fontsM[font] = count;
        if (count <= max) return;
        [max, maxFont] = [count, font];
    });
    return maxFont;
};

module.exports = {
    ENGINES: ENGINES,
    init: init,
    destroy: destroy,
    verifyKey: verifyKey,
    deserializeText: deserializeText,
    fontText: fontText
};
