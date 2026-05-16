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
                const empty = jQuery("<div></div>");
                empty.addClass("catalog-card empty");
                empty.text("No templates available.");
                catalog.append(empty);
                return;
            }

            for (const key of keys) {
                const profile = profiles[key];
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

                const meta = jQuery("<div></div>");
                meta.addClass("catalog-card-meta");
                const unit = profile.unit || "mm";
                meta.text(profile.width + "x" + profile.height + " " + unit);
                body.append(meta);

                card.append(body);
                catalog.append(card);
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

                catalog.children(".catalog-card").removeClass("selected");
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
