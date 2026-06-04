(function(jQuery) {
    /**
     * Welcome plugin that renders an engraving template catalog
     * with image cards and manages the template selection state
     * for the welcome screen form.
     *
     * Operates on a container element and discovers its children
     * (.catalog, .profile-input, .variant-input, .button-start) by
     * class name convention. On plain initialization the plugin
     * fetches the available profiles from the server and populates
     * the catalog automatically.
     *
     * Actions:
     *   "load"  - populates the catalog with the given profiles
     *             object keyed by profile ID, rendering one card
     *             per profile
     *   "value" - returns the current selection as an object with
     *             the profile key and variant index
     *
     * Events:
     *   "template" - triggered when the template selection changes,
     *                passing the profile, profile key, and variant
     *                index as arguments
     */
    jQuery.fn.welcome = function(action, options) {
        const elements = jQuery(this);

        // resolves the current selection from the given context
        // returning the profile, profile key, and variant index
        const resolveSelection = function(context) {
            const profiles = context.data("_profiles") || {};
            const key = context.data("_selected") || null;
            const variant = context.data("_variant");
            const profile = key ? profiles[key] : null;
            return {
                profile: profile,
                key: key,
                variantIndex: variant === undefined || variant === null ? null : variant
            };
        };

        // resolves the display label for a category slug, mapping
        // a missing or blank value to the canonical "other" bucket
        // and title casing every word in the slug so categories
        // like `necklaces` and `wedding-rings` show up as `Necklaces`
        // and `Wedding Rings` without any per profile metadata; the
        // catch-all label is read from the catalog element data
        // attribute so the en and pt_pt locales can each own their
        // own copy
        const categoryLabel = function(slug, otherLabel) {
            const value = (slug || "other").toString();
            if (value === "other") return otherLabel || "Other";
            return value
                .split(/[-_\s]+/)
                .map(part => (part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
                .join(" ");
        };

        // builds a card element for the given profile key/profile
        // pair, mirroring the card layout shared across the catalog
        // sections so each entry renders the same way regardless of
        // the category it belongs to
        const buildCard = function(key, profile) {
            const card = jQuery("<div></div>");
            card.addClass("catalog-card");
            card.attr("data-profile", key);

            // resolves the background image from the profile
            // definition, falling back to a neutral surface
            // when no image is available for the template
            const image = jQuery("<div></div>");
            image.addClass("catalog-card-image");
            if (profile.background) {
                image.css(
                    "background-image",
                    "url(/static/profiles/" + encodeURI(profile.background) + ")"
                );
            }
            card.append(image);

            const body = jQuery("<div></div>");
            body.addClass("catalog-card-body");

            const name = jQuery("<div></div>");
            name.addClass("catalog-card-name");
            name.text(profile.name);
            body.append(name);

            if (profile.sku) {
                const sku = jQuery("<div></div>");
                sku.addClass("catalog-card-sku");
                sku.text(profile.sku);
                body.append(sku);
            }

            const meta = jQuery("<div></div>");
            meta.addClass("catalog-card-meta");
            const unit = profile.unit || "mm";
            meta.text(profile.width + "x" + profile.height + " " + unit);
            body.append(meta);

            card.append(body);
            return card;
        };

        // populates the catalog of the given context with the
        // provided profiles object and stores it for later lookup,
        // rendering one card per profile entry with image and
        // metadata and pre-selecting the previously chosen entry
        const renderCatalog = function(context, profiles) {
            const catalog = jQuery(".catalog", context);
            const profileInput = jQuery(".profile-input", context);
            const buttonStart = jQuery(".button-start", context);

            context.data("_profiles", profiles);
            catalog.empty();

            const keys = Object.keys(profiles);
            if (keys.length === 0) {
                const grid = jQuery("<div></div>");
                grid.addClass("catalog-section-grid");
                const empty = jQuery("<div></div>");
                empty.addClass("catalog-card empty");
                empty.text("No templates available.");
                grid.append(empty);
                catalog.append(grid);
                return;
            }

            // groups the profiles by their `category` slug, falling
            // back to the canonical "other" bucket when the field is
            // missing so the resulting layout always has a home for
            // every entry in the catalog
            const buckets = {};
            for (const key of keys) {
                const profile = profiles[key];
                const slug = profile.category ? String(profile.category) : "other";
                if (!buckets[slug]) buckets[slug] = [];
                buckets[slug].push(key);
            }

            // collapses to the flat layout when every profile lands
            // in the same bucket so that a catalog without explicit
            // categories keeps the historical look without an empty
            // section heading hovering above the cards
            const otherLabel = catalog.attr("data-label-other") || "Other";
            const slugs = Object.keys(buckets);
            if (slugs.length === 1) {
                const grid = jQuery("<div></div>");
                grid.addClass("catalog-section-grid");
                for (const key of buckets[slugs[0]]) {
                    grid.append(buildCard(key, profiles[key]));
                }
                catalog.append(grid);
            } else {
                // sorts the category slugs alphabetically by their
                // display label, pushing the "other" catch all to
                // the end so categorized entries lead the catalog
                slugs.sort((a, b) => {
                    if (a === "other") return 1;
                    if (b === "other") return -1;
                    return categoryLabel(a, otherLabel).localeCompare(categoryLabel(b, otherLabel));
                });
                for (const slug of slugs) {
                    const section = jQuery("<div></div>");
                    section.addClass("catalog-section");
                    section.attr("data-category", slug);

                    const title = jQuery("<div></div>");
                    title.addClass("catalog-section-title");
                    title.text(categoryLabel(slug, otherLabel));
                    section.append(title);

                    const grid = jQuery("<div></div>");
                    grid.addClass("catalog-section-grid");
                    for (const key of buckets[slug]) {
                        grid.append(buildCard(key, profiles[key]));
                    }
                    section.append(grid);
                    catalog.append(section);
                }
            }

            // renders the catalog with no pre-selected template so
            // the user always lands on the welcome screen with a
            // neutral state and must explicitly pick a profile
            // before the form becomes submittable
            context.data("_selected", null);
            profileInput.val("");
            buttonStart.prop("disabled", true);
        };

        // fetches the available profiles from the server and
        // populates the catalog of the given context, silently
        // ignoring fetch errors so the welcome screen still
        // renders without a populated catalog
        const fetchProfiles = async function(context) {
            try {
                const response = await fetch("/profiles");
                if (response.status !== 200) return;
                const profiles = await response.json();
                renderCatalog(context, profiles);
            } catch (err) {
                // silently ignores fetch errors
            }
        };

        // returns the current selection as an object with the
        // profile key and variant index values from the first
        // matched element only
        if (action === "value") {
            return resolveSelection(elements.first());
        }

        elements.each(function() {
            const context = jQuery(this);
            const catalog = jQuery(".catalog", context);
            const profileInput = jQuery(".profile-input", context);
            const variantInput = jQuery(".variant-input", context);
            const buttonStart = jQuery(".button-start", context);

            // populates the catalog with the given profiles object
            // using the shared render routine, exposing the data
            // sink path for callers that already have the profiles
            if (action === "load") {
                renderCatalog(context, options.profiles);
                return;
            }

            // registers for the click operation on each catalog
            // card so that the selected template is reflected in
            // the hidden form fields and visual selection state
            catalog.on("click", ".catalog-card:not(.empty)", function() {
                const card = jQuery(this);
                const key = card.attr("data-profile");
                const profiles = context.data("_profiles") || {};
                const profile = profiles[key] || null;

                catalog.find(".catalog-card").removeClass("selected");
                card.addClass("selected");

                context.data("_selected", key);
                context.data("_variant", null);
                profileInput.val(key);
                variantInput.val("");
                buttonStart.prop("disabled", false);

                context.triggerHandler("template", [profile, key, null]);
            });

            // registers for the double click on each catalog card
            // to skip the start button and submit the welcome form
            // immediately, routing the user straight to the viewport
            // editor with the chosen template pre-selected
            catalog.on("dblclick", ".catalog-card:not(.empty)", function() {
                context.closest("form").trigger("submit");
            });

            // tracks the previous touchend timestamp and target on
            // each catalog card so that two quick taps on the same
            // card trigger the same submit flow as a double click,
            // since mobile browsers do not fire a reliable dblclick
            let lastTapTime = 0;
            let lastTapTarget = null;
            catalog.on("touchend", ".catalog-card:not(.empty)", function(event) {
                const now = Date.now();
                const card = event.currentTarget;
                if (now - lastTapTime < 300 && lastTapTarget === card) {
                    event.preventDefault();
                    context.closest("form").trigger("submit");
                    lastTapTime = 0;
                    lastTapTarget = null;
                    return;
                }
                lastTapTime = now;
                lastTapTarget = card;
            });

            // fetches and populates the catalog automatically on
            // plain initialization so callers do not need to
            // manage the network request themselves
            fetchProfiles(context);
        });

        return this;
    };
})(jQuery);
