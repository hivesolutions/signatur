// matches the first four bytes of a TrueType font, the
// signature that every regular `coolemojis.ttf` payload
// must carry on its initial bytes for the browser font
// loader to recognise it
const TTF_MAGIC = Buffer.from([0x00, 0x01, 0x00, 0x00]);

// matches the first four bytes of an OpenType font carrying
// a CFF outline, accepted alongside the TrueType signature
// so that fonts authored in either format can replace the
// existing emoji set
const OTF_MAGIC = Buffer.from([0x4f, 0x54, 0x54, 0x4f]);

// matches the validated filename pattern accepted by the
// emoji `.f3s` upload endpoint, allowing lowercase
// alphanumeric segments separated by hyphens or dots so the
// existing `1101.coracao` style names from the bundled mapping
// can keep working alongside a hyphenated form
const EMOJI_F3S_FILENAME_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*\.f3s$/;

// matches the validated identifier pattern accepted by the
// text font upload endpoint, allowing only lowercase
// alphanumeric segments separated by hyphens so the resulting
// `.ttf` and `.f3s` filenames stay deterministic on disk
const FONT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validates that the provided buffer starts with one of the
 * accepted font magic byte sequences, returning an error
 * message list compatible with the rest of the validators.
 *
 * @param {Buffer} buffer The font payload to inspect.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateEmojisFont = buffer => {
    const errors = [];

    if (!Buffer.isBuffer(buffer)) {
        return ["font payload must be a buffer"];
    }

    // refuses payloads shorter than the four byte font signature
    // so the magic comparison below cannot run against truncated
    // uploads that would otherwise silently fail to load
    if (buffer.length < 4) {
        errors.push("font payload is too short to be a TTF or OTF file");
        return errors;
    }

    const head = buffer.slice(0, 4);
    if (!head.equals(TTF_MAGIC) && !head.equals(OTF_MAGIC)) {
        errors.push("font must be a TTF or OTF file");
    }

    return errors;
};

/**
 * Validates that the provided JSON text parses into a flat
 * object of string to string entries matching the shape of
 * the bundled `coolemojis.mapping.json` so that the existing
 * viewport consumer keeps working after the upload.
 *
 * @param {String} text The mapping payload to inspect.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateEmojisMapping = text => {
    const errors = [];

    if (typeof text !== "string") {
        return ["mapping payload must be a string"];
    }

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        errors.push("mapping must be valid JSON");
        return errors;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        errors.push("mapping must be a plain object");
        return errors;
    }

    // walks every entry and rejects non string values upfront so
    // a malformed mapping cannot land on disk and break the
    // downstream viewport lookup that expects character to name
    // pairs for every glyph in the emoji catalog
    for (const key of Object.keys(parsed)) {
        if (typeof parsed[key] !== "string") {
            errors.push(`mapping entry "${key}" must be a string`);
        }
    }

    return errors;
};

module.exports = {
    EMOJI_F3S_FILENAME_PATTERN: EMOJI_F3S_FILENAME_PATTERN,
    FONT_NAME_PATTERN: FONT_NAME_PATTERN,
    validateEmojisFont: validateEmojisFont,
    validateEmojisMapping: validateEmojisMapping
};
