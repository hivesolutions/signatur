(function(jQuery) {
    /**
     * Profile selector plugin that manages the profile and
     * variant dropdown selection with automatic variant merging.
     *
     * Operates on a container element and discovers its children
     * (.profile-select, .variant-select, .variant-container) by
     * class name convention.
     *
     * Actions:
     *   "load"   - populates the profile dropdown with the given
     *              profiles object keyed by profile ID
     *   "select" - programmatically selects a profile and optional
     *              variant by key and index
     *   "value"  - returns the current selection as an object with
     *              profile key and variant index
     *
     * Events:
     *   "profile" - triggered when the profile or variant selection
     *               changes, passing the merged profile, base profile,
     *               profile key, and variant index as arguments
     */
    jQuery.fn.profileselector = function(action, options) {
        const elements = jQuery(this);

        // applies a variant's overrides onto the base profile
        // returning a merged profile object for rendering
        const applyVariant = function(profile, variant) {
            if (!profile || !variant) return profile;
            const merged = Object.assign({}, profile);
            if (variant.padding) merged.padding = variant.padding;
            if (variant.extra_padding) merged.extra_padding = variant.extra_padding;
            if (variant.background) merged.background = variant.background;
            if (variant.font_size) merged.font_size = variant.font_size;
            return merged;
        };

        // resolves the current profile from the given context
        // applying variant overrides if one is selected
        const resolveProfile = function(context) {
            const profileSelect = jQuery(".profile-select", context);
            const variantSelect = jQuery(".variant-select", context);
            const profiles = context.data("_profiles") || {};
            const key = profileSelect.val();
            const baseProfile = key ? profiles[key] : null;
            const index = parseInt(variantSelect.val());
            const variant = baseProfile && baseProfile.variants
                ? baseProfile.variants[index]
                : null;
            const mergedProfile = variant
                ? applyVariant(baseProfile, variant)
                : baseProfile;
            return {
                profile: mergedProfile,
                baseProfile: baseProfile,
                key: key,
                variantIndex: isNaN(index) ? null : index
            };
        };

        // returns the current selection as an object with
        // the profile key and variant index values from
        // the first matched element only
        if (action === "value") {
            return resolveProfile(elements.first());
        }

        elements.each(function() {
            const context = jQuery(this);
            const profileSelect = jQuery(".profile-select", context);
            const variantSelect = jQuery(".variant-select", context);
            const variantContainer = jQuery(".variant-container", context);

            // populates the profile dropdown with the given
            // profiles object and stores it for later lookup
            if (action === "load") {
                const profiles = options.profiles;
                context.data("_profiles", profiles);
                const keys = Object.keys(profiles);
                for (const key of keys) {
                    const profile = profiles[key];
                    const option = jQuery("<option></option>");
                    option.attr("value", key);
                    option.text(profile.name);
                    profileSelect.append(option);
                }
                return;
            }

            // programmatically selects a profile and optional
            // variant by key and index triggering the change event
            if (action === "select") {
                const profileKey = options.profile;
                const variantIndex = options.variant;
                if (profileKey) {
                    profileSelect.val(profileKey).trigger("change");
                    if (variantIndex !== undefined && variantIndex !== null) {
                        variantSelect.val(variantIndex).trigger("change");
                    }
                }
                return;
            }

            // registers for the change in the profile dropdown
            // populating the variant dropdown if variants exist
            profileSelect.bind("change", function() {
                const key = jQuery(this).val();
                const profiles = context.data("_profiles") || {};
                const baseProfile = key ? profiles[key] : null;

                // populates the variant dropdown if the profile
                // has variants defined in its configuration
                variantSelect.empty();
                if (baseProfile && baseProfile.variants && baseProfile.variants.length > 0) {
                    for (let i = 0; i < baseProfile.variants.length; i++) {
                        const variant = baseProfile.variants[i];
                        const option = jQuery("<option></option>");
                        option.attr("value", i);
                        option.text(variant.name);
                        variantSelect.append(option);
                    }
                    variantContainer.addClass("visible");
                } else {
                    variantContainer.removeClass("visible");
                }

                const resolved = resolveProfile(context);
                context.triggerHandler("profile", [
                    resolved.profile,
                    resolved.baseProfile,
                    resolved.key,
                    resolved.variantIndex
                ]);
            });

            // registers for the change in the variant dropdown
            // applying the variant overrides and emitting change
            variantSelect.bind("change", function() {
                const resolved = resolveProfile(context);
                context.triggerHandler("profile", [
                    resolved.profile,
                    resolved.baseProfile,
                    resolved.key,
                    resolved.variantIndex
                ]);
            });
        });

        return this;
    };
})(jQuery);
