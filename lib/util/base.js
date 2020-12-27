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
 * @returns {Array} The array of tuples that define the font and the
 * value for the font (character or characters).
 */
const deserializeText = text => {
    if (!text) return null;
    const textL = [];
    const pairs = text.split(/-/);
    for (const pair of pairs) {
        const [font, value] = pair.split(":");
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
 * @returns {String} The name of the most relevant font in the provided
 * normalized text sequence.
 */
const fontText = text => {
    const textL = deserializeText(text);
    if (!textL || textL.length === 0) return null;
    return textL[0][0];
};

module.exports = {
    ENGINES: ENGINES,
    init: init,
    destroy: destroy,
    verifyKey: verifyKey,
    deserializeText: deserializeText,
    fontText: fontText
};
