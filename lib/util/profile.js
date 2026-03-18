const VALID_UNITS = ["mm", "px"];
const VALID_ORIENTATIONS = ["portrait", "landscape"];
const VALID_SHAPES = ["rectangle", "circle", "heart"];
const VALID_FONT_SIZE_MODES = ["manual", "automatic"];
const VALID_TEXT_ALIGNS = ["left", "center", "right"];
const VALID_VERTICAL_ALIGNS = ["top", "middle", "bottom"];

const PROFILE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validates that the provided value is a positive number
 * (strictly greater than zero).
 *
 * @param {*} value The value to validate.
 * @param {String} field The field name for the error message.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validatePositiveNumber = (value, field) => {
    if (typeof value !== "number" || value <= 0) {
        return [`${field} must be a positive number`];
    }
    return [];
};

/**
 * Validates that the provided value is a non-negative number
 * (greater than or equal to zero).
 *
 * @param {*} value The value to validate.
 * @param {String} field The field name for the error message.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateNonNegativeNumber = (value, field) => {
    if (typeof value !== "number" || value < 0) {
        return [`${field} must be a non-negative number`];
    }
    return [];
};

/**
 * Validates the padding object of a profile definition,
 * ensuring all four sides are present and non-negative.
 *
 * @param {Object} padding The padding object to validate.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validatePadding = padding => {
    const errors = [];
    if (typeof padding !== "object" || padding === null) {
        return ["padding must be an object"];
    }
    const required = ["top", "right", "bottom", "left"];
    for (const field of required) {
        if (padding[field] === undefined) {
            errors.push(`padding.${field} is required`);
        } else {
            errors.push(...validateNonNegativeNumber(padding[field], `padding.${field}`));
        }
    }
    return errors;
};

/**
 * Validates the extra_padding object of a profile definition,
 * ensuring all four sides are present and non-negative.
 *
 * @param {Object} extraPadding The extra_padding object to validate.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateExtraPadding = extraPadding => {
    const errors = [];
    if (typeof extraPadding !== "object" || extraPadding === null) {
        return ["extra_padding must be an object"];
    }
    const required = ["top", "right", "bottom", "left"];
    for (const field of required) {
        if (extraPadding[field] === undefined) {
            errors.push(`extra_padding.${field} is required`);
        } else {
            errors.push(
                ...validateNonNegativeNumber(extraPadding[field], `extra_padding.${field}`)
            );
        }
    }
    return errors;
};

/**
 * Validates the font_size object of a profile definition,
 * ensuring mode-specific required fields are present.
 *
 * @param {Object} fontSize The font_size object to validate.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateFontSize = fontSize => {
    const errors = [];
    if (typeof fontSize !== "object" || fontSize === null) {
        return ["font_size must be an object"];
    }
    if (!fontSize.mode) {
        return ["font_size.mode is required"];
    }
    if (!VALID_FONT_SIZE_MODES.includes(fontSize.mode)) {
        errors.push(`font_size.mode must be one of: ${VALID_FONT_SIZE_MODES.join(", ")}`);
        return errors;
    }
    if (fontSize.mode === "manual") {
        const required = ["default", "min", "max", "step"];
        for (const field of required) {
            if (fontSize[field] === undefined) {
                errors.push(`font_size.${field} is required for manual mode`);
            } else {
                errors.push(...validatePositiveNumber(fontSize[field], `font_size.${field}`));
            }
        }
    }
    if (fontSize.mode === "automatic") {
        const required = ["min", "max"];
        for (const field of required) {
            if (fontSize[field] === undefined) {
                errors.push(`font_size.${field} is required for automatic mode`);
            } else {
                errors.push(...validatePositiveNumber(fontSize[field], `font_size.${field}`));
            }
        }
    }
    return errors;
};

/**
 * Validates the preview object of a profile definition.
 *
 * @param {Object} preview The preview object to validate.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validatePreview = preview => {
    const errors = [];
    if (typeof preview !== "object" || preview === null) {
        return ["preview must be an object"];
    }
    if (preview.show_bounds !== undefined && typeof preview.show_bounds !== "boolean") {
        errors.push("preview.show_bounds must be a boolean");
    }
    if (preview.show_safe_area !== undefined && typeof preview.show_safe_area !== "boolean") {
        errors.push("preview.show_safe_area must be a boolean");
    }
    if (preview.zoom !== undefined) {
        errors.push(...validatePositiveNumber(preview.zoom, "preview.zoom"));
    }
    return errors;
};

/**
 * Validates the machine object of a profile definition.
 *
 * @param {Object} machine The machine object to validate.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateMachine = machine => {
    const errors = [];
    if (typeof machine !== "object" || machine === null) {
        return ["machine must be an object"];
    }
    if (machine.viewport_width === undefined) {
        errors.push("machine.viewport_width is required");
    } else {
        errors.push(...validatePositiveNumber(machine.viewport_width, "machine.viewport_width"));
    }
    if (machine.viewport_height === undefined) {
        errors.push("machine.viewport_height is required");
    } else {
        errors.push(...validatePositiveNumber(machine.viewport_height, "machine.viewport_height"));
    }
    return errors;
};

/**
 * Validates the text object of a profile definition.
 *
 * @param {Object} text The text object to validate.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateText = text => {
    const errors = [];
    if (typeof text !== "object" || text === null) {
        return ["text must be an object"];
    }
    if (text.max_lines !== undefined) {
        if (!Number.isInteger(text.max_lines) || text.max_lines < 1) {
            errors.push("text.max_lines must be a positive integer");
        }
    }
    if (text.align !== undefined && !VALID_TEXT_ALIGNS.includes(text.align)) {
        errors.push(`text.align must be one of: ${VALID_TEXT_ALIGNS.join(", ")}`);
    }
    if (text.vertical_align !== undefined && !VALID_VERTICAL_ALIGNS.includes(text.vertical_align)) {
        errors.push(`text.vertical_align must be one of: ${VALID_VERTICAL_ALIGNS.join(", ")}`);
    }
    return errors;
};

/**
 * Validates the metadata object of a profile definition.
 *
 * @param {Object} metadata The metadata object to validate.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateMetadata = metadata => {
    const errors = [];
    if (typeof metadata !== "object" || metadata === null) {
        return ["metadata must be an object"];
    }
    if (metadata.version !== undefined) {
        if (!Number.isInteger(metadata.version) || metadata.version < 1) {
            errors.push("metadata.version must be a positive integer");
        }
    }
    if (metadata.tags !== undefined) {
        if (!Array.isArray(metadata.tags)) {
            errors.push("metadata.tags must be an array");
        } else {
            for (let i = 0; i < metadata.tags.length; i++) {
                if (typeof metadata.tags[i] !== "string") {
                    errors.push(`metadata.tags[${i}] must be a string`);
                }
            }
            const unique = new Set(metadata.tags);
            if (unique.size !== metadata.tags.length) {
                errors.push("metadata.tags must contain unique items");
            }
        }
    }
    return errors;
};

/**
 * Validates a single inspiration entry, ensuring all required
 * fields are present and correctly typed.
 *
 * @param {Object} inspiration The inspiration object to validate.
 * @param {Number} index The index of the entry for error messages.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateInspiration = (inspiration, index) => {
    const prefix = `inspirations[${index}]`;
    const errors = [];
    if (typeof inspiration !== "object" || inspiration === null) {
        return [`${prefix} must be an object`];
    }
    if (!inspiration.id || typeof inspiration.id !== "string") {
        errors.push(`${prefix}.id is required and must be a string`);
    } else if (!PROFILE_ID_PATTERN.test(inspiration.id)) {
        errors.push(`${prefix}.id must match pattern: lowercase alphanumeric with hyphens`);
    }
    if (!inspiration.title || typeof inspiration.title !== "string") {
        errors.push(`${prefix}.title is required and must be a string`);
    }
    if (!inspiration.description || typeof inspiration.description !== "string") {
        errors.push(`${prefix}.description is required and must be a string`);
    }
    if (!inspiration.author || typeof inspiration.author !== "string") {
        errors.push(`${prefix}.author is required and must be a string`);
    }
    if (!Array.isArray(inspiration.text)) {
        errors.push(`${prefix}.text is required and must be an array`);
    } else {
        for (let i = 0; i < inspiration.text.length; i++) {
            const item = inspiration.text[i];
            if (!Array.isArray(item) || item.length !== 2) {
                errors.push(`${prefix}.text[${i}] must be a [font, character] pair`);
                continue;
            }
            if (item[0] !== null && typeof item[0] !== "string") {
                errors.push(`${prefix}.text[${i}][0] must be a string or null`);
            }
            if (typeof item[1] !== "string") {
                errors.push(`${prefix}.text[${i}][1] must be a string`);
            }
        }
    }
    if (inspiration.font_size === undefined) {
        errors.push(`${prefix}.font_size is required`);
    } else {
        errors.push(...validatePositiveNumber(inspiration.font_size, `${prefix}.font_size`));
    }
    if (inspiration.padding !== undefined) {
        const paddingErrors = validatePadding(inspiration.padding);
        for (const err of paddingErrors) {
            errors.push(`${prefix}.${err}`);
        }
    }
    if (inspiration.align !== undefined && !VALID_TEXT_ALIGNS.includes(inspiration.align)) {
        errors.push(`${prefix}.align must be one of: ${VALID_TEXT_ALIGNS.join(", ")}`);
    }
    return errors;
};

/**
 * Validates an array of inspiration entries, returning an
 * array of error messages. An empty array indicates valid data.
 *
 * @param {Array} inspirations The inspirations array to validate.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateInspirations = inspirations => {
    const errors = [];
    if (!Array.isArray(inspirations)) {
        return ["inspirations must be an array"];
    }
    for (let i = 0; i < inspirations.length; i++) {
        errors.push(...validateInspiration(inspirations[i], i));
    }
    return errors;
};

/**
 * Validates a profile definition against the viewport template
 * schema, returning an array of error messages. An empty array
 * indicates a valid profile.
 *
 * @param {Object} profile The profile object to validate.
 * @returns {Array} An array of error messages (empty if valid).
 */
const validateProfile = profile => {
    const errors = [];

    if (typeof profile !== "object" || profile === null) {
        return ["profile must be an object"];
    }

    // validates the required top-level fields
    if (!profile.id || typeof profile.id !== "string") {
        errors.push("id is required and must be a string");
    } else if (!PROFILE_ID_PATTERN.test(profile.id)) {
        errors.push("id must match pattern: lowercase alphanumeric with hyphens");
    }

    if (!profile.name || typeof profile.name !== "string") {
        errors.push("name is required and must be a string");
    }

    if (profile.description !== undefined && typeof profile.description !== "string") {
        errors.push("description must be a string");
    }

    if (profile.width === undefined) {
        errors.push("width is required");
    } else {
        errors.push(...validatePositiveNumber(profile.width, "width"));
    }

    if (profile.height === undefined) {
        errors.push("height is required");
    } else {
        errors.push(...validatePositiveNumber(profile.height, "height"));
    }

    if (!profile.unit) {
        errors.push("unit is required");
    } else if (!VALID_UNITS.includes(profile.unit)) {
        errors.push(`unit must be one of: ${VALID_UNITS.join(", ")}`);
    }

    if (!profile.orientation) {
        errors.push("orientation is required");
    } else if (!VALID_ORIENTATIONS.includes(profile.orientation)) {
        errors.push(`orientation must be one of: ${VALID_ORIENTATIONS.join(", ")}`);
    }

    if (profile.shape !== undefined && !VALID_SHAPES.includes(profile.shape)) {
        errors.push(`shape must be one of: ${VALID_SHAPES.join(", ")}`);
    }

    if (profile.background !== undefined && typeof profile.background !== "string") {
        errors.push("background must be a string");
    }

    if (profile.inspirations !== undefined && typeof profile.inspirations !== "string") {
        errors.push("inspirations must be a string");
    }

    if (!profile.font_size) {
        errors.push("font_size is required");
    } else {
        errors.push(...validateFontSize(profile.font_size));
    }

    // validates the optional fields
    if (profile.padding !== undefined) {
        errors.push(...validatePadding(profile.padding));
    }

    if (profile.extra_padding !== undefined) {
        errors.push(...validateExtraPadding(profile.extra_padding));
    }

    if (profile.preview !== undefined) {
        errors.push(...validatePreview(profile.preview));
    }

    if (profile.machine !== undefined) {
        errors.push(...validateMachine(profile.machine));
    }

    if (profile.text !== undefined) {
        errors.push(...validateText(profile.text));
    }

    if (profile.metadata !== undefined) {
        errors.push(...validateMetadata(profile.metadata));
    }

    return errors;
};

module.exports = {
    validateProfile: validateProfile,
    validatePadding: validatePadding,
    validateExtraPadding: validateExtraPadding,
    validateFontSize: validateFontSize,
    validatePreview: validatePreview,
    validateMachine: validateMachine,
    validateText: validateText,
    validateMetadata: validateMetadata,
    validateInspiration: validateInspiration,
    validateInspirations: validateInspirations
};
