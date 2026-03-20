const assert = require("assert");
const lib = require("../../../lib");

describe("Profile", function() {
    describe("#validateProfile()", function() {
        it("should validate a complete valid profile", () => {
            const errors = lib.validateProfile({
                id: "small-medal",
                name: "Small Medal",
                description: "A small medal.",
                width: 80,
                height: 100,
                unit: "mm",
                orientation: "portrait",
                padding: { top: 5, right: 5, bottom: 5, left: 5 },
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 },
                preview: { show_bounds: true, show_safe_area: true },
                machine: { viewport_width: 80, viewport_height: 100 }
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should validate a minimal valid profile", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "landscape",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should reject a non-object profile", () => {
            const errors = lib.validateProfile(null);
            assert.deepStrictEqual(errors, ["profile must be an object"]);
        });

        it("should require all mandatory fields", () => {
            const errors = lib.validateProfile({});
            assert.strictEqual(true, errors.includes("id is required and must be a string"));
            assert.strictEqual(true, errors.includes("name is required and must be a string"));
            assert.strictEqual(true, errors.includes("width is required"));
            assert.strictEqual(true, errors.includes("height is required"));
            assert.strictEqual(true, errors.includes("unit is required"));
            assert.strictEqual(true, errors.includes("orientation is required"));
            assert.strictEqual(true, errors.includes("font_size is required"));
        });

        it("should reject invalid id patterns", () => {
            let errors;

            errors = lib.validateProfile({
                id: "Invalid ID",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "portrait",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.strictEqual(
                true,
                errors.includes("id must match pattern: lowercase alphanumeric with hyphens")
            );

            errors = lib.validateProfile({
                id: "valid-id",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "portrait",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should reject invalid unit values", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "cm",
                orientation: "portrait",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.strictEqual(true, errors.includes("unit must be one of: mm, px"));
        });

        it("should reject invalid orientation values", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "diagonal",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.strictEqual(
                true,
                errors.includes("orientation must be one of: portrait, landscape")
            );
        });

        it("should validate a complete valid circular profile", () => {
            const errors = lib.validateProfile({
                id: "small-medal",
                name: "Small Medal",
                description: "A small circular medal.",
                width: 14,
                height: 14,
                unit: "mm",
                orientation: "landscape",
                shape: "circle",
                padding: { top: 2, right: 2, bottom: 2, left: 2 },
                font_size: { mode: "manual", default: 6, min: 3, max: 10, step: 1 },
                text: { max_lines: 2, align: "center" },
                preview: { show_bounds: true, show_safe_area: true },
                machine: { viewport_width: 14, viewport_height: 14 }
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should accept valid shape values", () => {
            const base = {
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "portrait",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            };

            let errors = lib.validateProfile({ ...base, shape: "rectangle" });
            assert.deepStrictEqual(errors, []);

            errors = lib.validateProfile({ ...base, shape: "circle" });
            assert.deepStrictEqual(errors, []);

            errors = lib.validateProfile({ ...base, shape: "heart" });
            assert.deepStrictEqual(errors, []);
        });

        it("should reject invalid shape values", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "portrait",
                shape: "triangle",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.strictEqual(
                true,
                errors.includes("shape must be one of: rectangle, circle, heart")
            );
        });

        it("should accept valid background value", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "portrait",
                background: "test.png",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should reject non-string background value", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "portrait",
                background: 123,
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.strictEqual(true, errors.includes("background must be a string"));
        });

        it("should accept profile without background (optional field)", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "portrait",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.strictEqual(false, errors.includes("background must be a string"));
        });

        it("should accept valid inspirations field", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "portrait",
                inspirations: "test.inspirations.json",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should reject non-string inspirations value", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "portrait",
                inspirations: 123,
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.strictEqual(true, errors.includes("inspirations must be a string"));
        });

        it("should accept profile without shape (optional field)", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 100,
                height: 50,
                unit: "mm",
                orientation: "portrait",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.strictEqual(false, errors.includes("shape must be one of: rectangle, circle"));
        });

        it("should reject non-positive dimensions", () => {
            const errors = lib.validateProfile({
                id: "test",
                name: "Test",
                width: 0,
                height: -10,
                unit: "mm",
                orientation: "portrait",
                font_size: { mode: "manual", default: 12, min: 8, max: 24, step: 1 }
            });
            assert.strictEqual(true, errors.includes("width must be a positive number"));
            assert.strictEqual(true, errors.includes("height must be a positive number"));
        });
    });

    describe("#validatePadding()", function() {
        it("should validate correct padding", () => {
            const errors = lib.validatePadding({
                top: 5,
                right: 10,
                bottom: 5,
                left: 10
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should allow zero padding values", () => {
            const errors = lib.validatePadding({
                top: 0,
                right: 0,
                bottom: 0,
                left: 0
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should reject missing padding fields", () => {
            const errors = lib.validatePadding({ top: 5 });
            assert.strictEqual(true, errors.includes("padding.right is required"));
            assert.strictEqual(true, errors.includes("padding.bottom is required"));
            assert.strictEqual(true, errors.includes("padding.left is required"));
        });

        it("should reject negative padding values", () => {
            const errors = lib.validatePadding({
                top: -1,
                right: 5,
                bottom: 5,
                left: 5
            });
            assert.strictEqual(true, errors.includes("padding.top must be a non-negative number"));
        });

        it("should reject non-object padding", () => {
            const errors = lib.validatePadding("invalid");
            assert.deepStrictEqual(errors, ["padding must be an object"]);
        });
    });

    describe("#validateExtraPadding()", function() {
        it("should accept valid extra_padding", () => {
            const errors = lib.validateExtraPadding({
                top: 2,
                right: 3,
                bottom: 2,
                left: 3
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should accept zero values", () => {
            const errors = lib.validateExtraPadding({
                top: 0,
                right: 0,
                bottom: 0,
                left: 0
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should reject negative values", () => {
            const errors = lib.validateExtraPadding({
                top: -1,
                right: 3,
                bottom: 2,
                left: 3
            });
            assert.strictEqual(
                true,
                errors.includes("extra_padding.top must be a non-negative number")
            );
        });

        it("should reject missing fields", () => {
            const errors = lib.validateExtraPadding({});
            assert.strictEqual(true, errors.includes("extra_padding.top is required"));
            assert.strictEqual(true, errors.includes("extra_padding.right is required"));
            assert.strictEqual(true, errors.includes("extra_padding.bottom is required"));
            assert.strictEqual(true, errors.includes("extra_padding.left is required"));
        });

        it("should reject non-object extra_padding", () => {
            const errors = lib.validateExtraPadding("invalid");
            assert.deepStrictEqual(errors, ["extra_padding must be an object"]);
        });
    });

    describe("#validateFontSize()", function() {
        it("should validate manual font size", () => {
            const errors = lib.validateFontSize({
                mode: "manual",
                default: 12,
                min: 8,
                max: 24,
                step: 1
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should validate automatic font size", () => {
            const errors = lib.validateFontSize({
                mode: "automatic",
                min: 4,
                max: 8
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should require mode field", () => {
            const errors = lib.validateFontSize({});
            assert.deepStrictEqual(errors, ["font_size.mode is required"]);
        });

        it("should reject invalid mode values", () => {
            const errors = lib.validateFontSize({ mode: "invalid" });
            assert.strictEqual(
                true,
                errors.includes("font_size.mode must be one of: manual, automatic")
            );
        });

        it("should require manual mode fields", () => {
            const errors = lib.validateFontSize({ mode: "manual" });
            assert.strictEqual(
                true,
                errors.includes("font_size.default is required for manual mode")
            );
            assert.strictEqual(true, errors.includes("font_size.min is required for manual mode"));
            assert.strictEqual(true, errors.includes("font_size.max is required for manual mode"));
            assert.strictEqual(true, errors.includes("font_size.step is required for manual mode"));
        });

        it("should require automatic mode fields", () => {
            const errors = lib.validateFontSize({ mode: "automatic" });
            assert.strictEqual(
                true,
                errors.includes("font_size.min is required for automatic mode")
            );
            assert.strictEqual(
                true,
                errors.includes("font_size.max is required for automatic mode")
            );
        });

        it("should reject non-positive font size values", () => {
            const errors = lib.validateFontSize({
                mode: "manual",
                default: 0,
                min: -1,
                max: 24,
                step: 1
            });
            assert.strictEqual(
                true,
                errors.includes("font_size.default must be a positive number")
            );
            assert.strictEqual(true, errors.includes("font_size.min must be a positive number"));
        });
    });

    describe("#validatePreview()", function() {
        it("should validate correct preview", () => {
            const errors = lib.validatePreview({
                show_bounds: true,
                show_safe_area: false
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should validate empty preview", () => {
            const errors = lib.validatePreview({});
            assert.deepStrictEqual(errors, []);
        });

        it("should reject non-boolean values", () => {
            const errors = lib.validatePreview({
                show_bounds: "yes"
            });
            assert.strictEqual(true, errors.includes("preview.show_bounds must be a boolean"));
        });

        it("should validate correct zoom value", () => {
            const errors = lib.validatePreview({
                show_bounds: true,
                zoom: 2
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should reject non-positive zoom values", () => {
            const errors = lib.validatePreview({
                zoom: 0
            });
            assert.strictEqual(true, errors.includes("preview.zoom must be a positive number"));
        });

        it("should reject negative zoom values", () => {
            const errors = lib.validatePreview({
                zoom: -1
            });
            assert.strictEqual(true, errors.includes("preview.zoom must be a positive number"));
        });
    });

    describe("#validateCalligraphy()", function() {
        it("should validate correct calligraphy", () => {
            const errors = lib.validateCalligraphy({
                line_width: 2
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should validate empty calligraphy", () => {
            const errors = lib.validateCalligraphy({});
            assert.deepStrictEqual(errors, []);
        });

        it("should reject non-object calligraphy", () => {
            const errors = lib.validateCalligraphy("invalid");
            assert.strictEqual(true, errors.includes("calligraphy must be an object"));
        });

        it("should reject non-positive line width", () => {
            const errors = lib.validateCalligraphy({ line_width: 0 });
            assert.strictEqual(
                true,
                errors.includes("calligraphy.line_width must be a positive number")
            );
        });

        it("should reject negative line width", () => {
            const errors = lib.validateCalligraphy({ line_width: -1 });
            assert.strictEqual(
                true,
                errors.includes("calligraphy.line_width must be a positive number")
            );
        });

        it("should reject non-number line width", () => {
            const errors = lib.validateCalligraphy({ line_width: "thick" });
            assert.strictEqual(
                true,
                errors.includes("calligraphy.line_width must be a positive number")
            );
        });
    });

    describe("#validateMachine()", function() {
        it("should validate correct machine config", () => {
            const errors = lib.validateMachine({
                viewport_width: 80,
                viewport_height: 100
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should require viewport dimensions", () => {
            const errors = lib.validateMachine({});
            assert.strictEqual(true, errors.includes("machine.viewport_width is required"));
            assert.strictEqual(true, errors.includes("machine.viewport_height is required"));
        });

        it("should reject non-positive viewport dimensions", () => {
            const errors = lib.validateMachine({
                viewport_width: 0,
                viewport_height: -5
            });
            assert.strictEqual(
                true,
                errors.includes("machine.viewport_width must be a positive number")
            );
            assert.strictEqual(
                true,
                errors.includes("machine.viewport_height must be a positive number")
            );
        });
    });

    describe("#validateText()", function() {
        it("should validate correct text config", () => {
            const errors = lib.validateText({
                max_lines: 3,
                align: "center",
                vertical_align: "middle"
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should validate empty text config", () => {
            const errors = lib.validateText({});
            assert.deepStrictEqual(errors, []);
        });

        it("should reject invalid max_lines", () => {
            const errors = lib.validateText({ max_lines: 0 });
            assert.strictEqual(true, errors.includes("text.max_lines must be a positive integer"));
        });

        it("should reject invalid align values", () => {
            const errors = lib.validateText({ align: "justify" });
            assert.strictEqual(
                true,
                errors.includes("text.align must be one of: left, center, right")
            );
        });

        it("should reject invalid vertical_align values", () => {
            const errors = lib.validateText({ vertical_align: "baseline" });
            assert.strictEqual(
                true,
                errors.includes("text.vertical_align must be one of: top, middle, bottom")
            );
        });
    });

    describe("#validateMetadata()", function() {
        it("should validate correct metadata", () => {
            const errors = lib.validateMetadata({
                version: 1,
                tags: ["engraving", "medal"]
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should validate empty metadata", () => {
            const errors = lib.validateMetadata({});
            assert.deepStrictEqual(errors, []);
        });

        it("should reject invalid version", () => {
            const errors = lib.validateMetadata({ version: 0 });
            assert.strictEqual(
                true,
                errors.includes("metadata.version must be a positive integer")
            );
        });

        it("should reject non-array tags", () => {
            const errors = lib.validateMetadata({ tags: "invalid" });
            assert.strictEqual(true, errors.includes("metadata.tags must be an array"));
        });

        it("should reject duplicate tags", () => {
            const errors = lib.validateMetadata({ tags: ["a", "a"] });
            assert.strictEqual(true, errors.includes("metadata.tags must contain unique items"));
        });

        it("should reject non-string tag items", () => {
            const errors = lib.validateMetadata({ tags: [123] });
            assert.strictEqual(true, errors.includes("metadata.tags[0] must be a string"));
        });
    });

    describe("#validateInspiration()", function() {
        it("should validate a complete valid inspiration", () => {
            const errors = lib.validateInspiration(
                {
                    id: "classic-name",
                    title: "Classic Name",
                    description: "A centered name in Script 4L.",
                    author: "Hive Solutions",
                    text: [
                        ["Script 4L", "T"],
                        ["Script 4L", "i"]
                    ],
                    font_size: 4,
                    padding: { top: 4, right: 3, bottom: 5, left: 3 },
                    align: "center"
                },
                0
            );
            assert.deepStrictEqual(errors, []);
        });

        it("should validate a minimal valid inspiration", () => {
            const errors = lib.validateInspiration(
                {
                    id: "minimal",
                    title: "Minimal",
                    description: "A minimal inspiration.",
                    author: "Test",
                    text: [["Helvetica 1L", "A"]],
                    font_size: 8
                },
                0
            );
            assert.deepStrictEqual(errors, []);
        });

        it("should reject a non-object inspiration", () => {
            const errors = lib.validateInspiration("invalid", 0);
            assert.deepStrictEqual(errors, ["inspirations[0] must be an object"]);
        });

        it("should require all mandatory fields", () => {
            const errors = lib.validateInspiration({}, 0);
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].id is required and must be a string")
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].title is required and must be a string")
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].description is required and must be a string")
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].author is required and must be a string")
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].text is required and must be an array")
            );
            assert.strictEqual(true, errors.includes("inspirations[0].font_size is required"));
        });

        it("should reject invalid id patterns", () => {
            const errors = lib.validateInspiration(
                {
                    id: "Invalid ID",
                    title: "Test",
                    description: "Test",
                    author: "Test",
                    text: [["Helvetica 1L", "A"]],
                    font_size: 4
                },
                0
            );
            assert.strictEqual(
                true,
                errors.includes(
                    "inspirations[0].id must match pattern: lowercase alphanumeric with hyphens"
                )
            );
        });

        it("should reject invalid text pairs", () => {
            const errors = lib.validateInspiration(
                {
                    id: "test",
                    title: "Test",
                    description: "Test",
                    author: "Test",
                    text: [["only-one"]],
                    font_size: 4
                },
                0
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].text[0] must be a [font, character] pair")
            );
        });

        it("should reject invalid text pair types", () => {
            const errors = lib.validateInspiration(
                {
                    id: "test",
                    title: "Test",
                    description: "Test",
                    author: "Test",
                    text: [[123, {}]],
                    font_size: 4
                },
                0
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].text[0][0] must be a string or null")
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].text[0][1] must be a string")
            );
        });

        it("should accept null font in text pairs", () => {
            const errors = lib.validateInspiration(
                {
                    id: "test",
                    title: "Test",
                    description: "Test",
                    author: "Test",
                    text: [[null, "\n"]],
                    font_size: 4
                },
                0
            );
            assert.deepStrictEqual(errors, []);
        });

        it("should reject non-positive font size", () => {
            const errors = lib.validateInspiration(
                {
                    id: "test",
                    title: "Test",
                    description: "Test",
                    author: "Test",
                    text: [["Helvetica 1L", "A"]],
                    font_size: 0
                },
                0
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].font_size must be a positive number")
            );
        });

        it("should reject invalid align values", () => {
            const errors = lib.validateInspiration(
                {
                    id: "test",
                    title: "Test",
                    description: "Test",
                    author: "Test",
                    text: [["Helvetica 1L", "A"]],
                    font_size: 4,
                    align: "justify"
                },
                0
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].align must be one of: left, center, right")
            );
        });

        it("should validate optional padding when present", () => {
            const errors = lib.validateInspiration(
                {
                    id: "test",
                    title: "Test",
                    description: "Test",
                    author: "Test",
                    text: [["Helvetica 1L", "A"]],
                    font_size: 4,
                    padding: { top: 2, right: 2, bottom: 2, left: 2 }
                },
                0
            );
            assert.deepStrictEqual(errors, []);
        });

        it("should reject invalid padding in inspiration", () => {
            const errors = lib.validateInspiration(
                {
                    id: "test",
                    title: "Test",
                    description: "Test",
                    author: "Test",
                    text: [["Helvetica 1L", "A"]],
                    font_size: 4,
                    padding: { top: -1, right: 2, bottom: 2, left: 2 }
                },
                0
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].padding.top must be a non-negative number")
            );
        });
    });

    describe("#validateInspirations()", function() {
        it("should validate a correct inspirations array", () => {
            const errors = lib.validateInspirations([
                {
                    id: "test",
                    title: "Test",
                    description: "Test",
                    author: "Test",
                    text: [["Helvetica 1L", "A"]],
                    font_size: 4
                }
            ]);
            assert.deepStrictEqual(errors, []);
        });

        it("should validate an empty inspirations array", () => {
            const errors = lib.validateInspirations([]);
            assert.deepStrictEqual(errors, []);
        });

        it("should reject non-array inspirations", () => {
            const errors = lib.validateInspirations("invalid");
            assert.deepStrictEqual(errors, ["inspirations must be an array"]);
        });

        it("should collect errors from multiple entries", () => {
            const errors = lib.validateInspirations([{}, {}]);
            assert.strictEqual(
                true,
                errors.includes("inspirations[0].id is required and must be a string")
            );
            assert.strictEqual(
                true,
                errors.includes("inspirations[1].id is required and must be a string")
            );
        });
    });

    describe("#validateInstructions()", function() {
        it("should validate correct instructions", () => {
            const errors = lib.validateInstructions({
                title: "Jig Setup",
                description: "Place the plate on the jig.",
                images: ["/images/jig.png"]
            });
            assert.deepStrictEqual(errors, []);
        });

        it("should validate empty instructions", () => {
            const errors = lib.validateInstructions({});
            assert.deepStrictEqual(errors, []);
        });

        it("should reject non-object instructions", () => {
            const errors = lib.validateInstructions("invalid");
            assert.deepStrictEqual(errors, ["instructions must be an object"]);
        });

        it("should reject non-string title", () => {
            const errors = lib.validateInstructions({ title: 123 });
            assert.strictEqual(true, errors.includes("instructions.title must be a string"));
        });

        it("should reject non-string description", () => {
            const errors = lib.validateInstructions({ description: 123 });
            assert.strictEqual(true, errors.includes("instructions.description must be a string"));
        });

        it("should reject non-array images", () => {
            const errors = lib.validateInstructions({ images: "invalid" });
            assert.strictEqual(true, errors.includes("instructions.images must be an array"));
        });

        it("should reject non-string image entries", () => {
            const errors = lib.validateInstructions({ images: [123] });
            assert.strictEqual(true, errors.includes("instructions.images[0] must be a string"));
        });
    });

    describe("#validateVariants()", function() {
        it("should validate correct variants", () => {
            const errors = lib.validateVariants([
                { name: "Silver", background: "silver.png" },
                { name: "Gold", background: "gold.png" }
            ]);
            assert.deepStrictEqual(errors, []);
        });

        it("should validate empty variants array", () => {
            const errors = lib.validateVariants([]);
            assert.deepStrictEqual(errors, []);
        });

        it("should reject non-array variants", () => {
            const errors = lib.validateVariants("invalid");
            assert.deepStrictEqual(errors, ["variants must be an array"]);
        });

        it("should require variant name", () => {
            const errors = lib.validateVariants([{}]);
            assert.strictEqual(true, errors.includes("variants[0].name is required"));
        });

        it("should reject non-string variant name", () => {
            const errors = lib.validateVariants([{ name: 123 }]);
            assert.strictEqual(true, errors.includes("variants[0].name must be a string"));
        });

        it("should reject non-string variant background", () => {
            const errors = lib.validateVariants([{ name: "Test", background: 123 }]);
            assert.strictEqual(true, errors.includes("variants[0].background must be a string"));
        });

        it("should validate variant with padding", () => {
            const errors = lib.validateVariants([
                { name: "Test", padding: { top: 5, right: 5, bottom: 5, left: 5 } }
            ]);
            assert.deepStrictEqual(errors, []);
        });

        it("should reject invalid variant padding", () => {
            const errors = lib.validateVariants([
                { name: "Test", padding: { top: -1, right: 5, bottom: 5, left: 5 } }
            ]);
            assert.strictEqual(
                true,
                errors.includes("variants[0] padding.top must be a non-negative number")
            );
        });
    });
});
