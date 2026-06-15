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
 * object whose entries are either the plain glyph name string
 * matching the bundled `coolemojis.mapping.json` shape or the
 * extended object form carrying an optional category and order
 * so the viewport can lay the emoji keyboard out from the same
 * mapping the upload replaces.
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

    // walks every entry and accepts both the plain string form and
    // the extended object form upfront so a malformed mapping cannot
    // land on disk and break the downstream viewport lookup that
    // expects a glyph name for every character in the emoji catalog
    for (const key of Object.keys(parsed)) {
        const value = parsed[key];
        if (typeof value === "string") {
            continue;
        }
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            errors.push(`mapping entry "${key}" must be a string or an object`);
            continue;
        }
        if (typeof value.name !== "string") {
            errors.push(`mapping entry "${key}" must have a string "name"`);
        }
        if (value.category !== undefined && typeof value.category !== "string") {
            errors.push(`mapping entry "${key}" must have a string "category"`);
        }
        if (value.order !== undefined && typeof value.order !== "number") {
            errors.push(`mapping entry "${key}" must have a numeric "order"`);
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
