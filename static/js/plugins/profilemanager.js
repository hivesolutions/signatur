(function(jQuery) {
    /**
     * Profile manager plugin that owns the behavior of the profile
     * manager screen at `/profiles/manager`, including the inline
     * JSON editors, the reference dropdown, the live preview, the
     * background asset manager, the validate and save flows, and
     * the create / edit mode transitions backed by the matching
     * REST endpoints under `/profiles`.
     *
     * Operates on a .form-manager element and discovers its
     * children (.manager-edit-banner, .manager-validation,
     * .manager-field-editor, .manager-reference-select, etc.)
     * by class name convention.
     */
    jQuery.fn.profilemanager = function(action, options) {
        const elements = jQuery(this);

        elements.each(function() {
            const context = jQuery(this);
            const managerToast = jQuery(".toast");
            const templateTab = jQuery("[data-tab-content=template]", context);
            const previewTab = jQuery("[data-tab-content=preview]", context);
            const backgroundsTab = jQuery("[data-tab-content=backgrounds]", context);
            const profileEditor = jQuery("#manager-profile-json", context);
            const inspirationsEditor = jQuery("#manager-inspirations-json", context);
            const editTargetInput = jQuery(".manager-edit-target", context);
            const heroEyebrow = jQuery(".welcome-hero-eyebrow");
            const buttonSave = jQuery(".button-save", context);
            const editBanner = jQuery(".manager-edit-banner", context);
            const editBannerTarget = jQuery(".manager-edit-banner-target", editBanner);
            const editBannerExit = jQuery(".manager-edit-banner-exit", editBanner);
            const validationContainer = jQuery(".manager-validation", context);
            const buttonValidate = jQuery(".button-validate", context);
            const referenceSelect = jQuery(".manager-reference-select", context);
            const referenceEmpty = jQuery(".manager-reference-empty", templateTab);
            const referenceDetail = jQuery(".manager-reference-detail", templateTab);
            const referenceDetailImage = jQuery(".manager-reference-detail-image", templateTab);
            const referenceDetailName = jQuery(".manager-reference-detail-name", templateTab);
            const referenceDetailMeta = jQuery(".manager-reference-detail-meta", templateTab);
            const referenceDetailStatus = jQuery(".manager-reference-detail-status", templateTab);
            const referenceDetailApply = jQuery(".manager-reference-detail-apply", templateTab);
            const referenceDetailEdit = jQuery(".manager-reference-detail-edit", templateTab);
            const referenceDetailToggle = jQuery(".manager-reference-detail-toggle", templateTab);
            const referenceDetailDelete = jQuery(".manager-reference-detail-delete", templateTab);
            const previewInvalid = jQuery(".manager-reference-preview-invalid", previewTab);
            const previewDetail = jQuery(".manager-reference-preview", previewTab);
            const previewDetailImage = jQuery(".manager-reference-detail-image", previewTab);
            const previewDetailName = jQuery(".manager-reference-detail-name", previewTab);
            const previewDetailMeta = jQuery(".manager-reference-detail-meta", previewTab);
            const modalDeleteProfile = jQuery(".modal-overlay-delete-profile");
            const modalDeleteTarget = jQuery(".modal-target", modalDeleteProfile);
            const buttonModalDelete = jQuery(".button-modal-delete", modalDeleteProfile);
            const assetsGrid = jQuery(".manager-assets-grid", backgroundsTab);
            const assetsEmpty = jQuery(".manager-assets-empty", backgroundsTab);
            const assetsErrors = jQuery(".manager-assets-errors", backgroundsTab);
            const assetsFilename = jQuery(".manager-assets-filename", backgroundsTab);
            const assetsFile = jQuery(".manager-assets-file", backgroundsTab);
            const assetsPicker = jQuery(".manager-assets-picker", backgroundsTab);
            const assetsSubmit = jQuery(".manager-assets-submit", backgroundsTab);
            const modalDeleteAsset = jQuery(".modal-overlay-delete-asset");
            const modalDeleteAssetTarget = jQuery(".modal-target", modalDeleteAsset);
            const buttonModalDeleteAsset = jQuery(".button-modal-delete-asset", modalDeleteAsset);
            const bundleTab = jQuery("[data-tab-content=bundle]", context);
            const bundleErrors = jQuery(".manager-bundle-errors", bundleTab);
            const bundleFile = jQuery(".manager-bundle-file", bundleTab);
            const bundlePicker = jQuery(".manager-bundle-picker", bundleTab);
            const bundleSubmit = jQuery(".manager-bundle-submit", bundleTab);
            const modalRestoreBundle = jQuery(".modal-overlay-restore-bundle");
            const buttonModalRestoreBundle = jQuery(
                ".button-modal-restore-bundle",
                modalRestoreBundle
            );
            const dismissLabel = context.attr("data-dismiss-label") || "Dismiss";
            const disabledSuffix = context.attr("data-disabled-suffix") || " (disabled)";
            const metaIdLabel = context.attr("data-meta-id-label") || "ID";
            const metaSizeLabel = context.attr("data-meta-size-label") || "Size";
            const metaOrientationLabel =
                context.attr("data-meta-orientation-label") || "Orientation";
            const metaShapeLabel = context.attr("data-meta-shape-label") || "Shape";
            const metaMaxLinesLabel = context.attr("data-meta-max-lines-label") || "Max Lines";
            const metaInspirationsLabel =
                context.attr("data-meta-inspirations-label") || "Inspirations";
            const assetErrorFilename =
                context.attr("data-asset-error-filename") || "filename is required";
            const assetErrorFile = context.attr("data-asset-error-file") || "file is required";
            const validationOkLabel = context.attr("data-validation-ok") || "Looks good";
            const validationIssuesSingular =
                context.attr("data-validation-issues-singular") || "{n} issue found";
            const validationIssuesPlural =
                context.attr("data-validation-issues-plural") || "{n} issues found";
            const saveErrorTitle =
                context.attr("data-save-error-title") || "Could not save profile";
            let cachedProfiles = null;
            let selectedKey = null;
            let pendingDeleteKey = null;
            let pendingDeleteAsset = null;
            let previewTimer = null;

            // appends a single key / value row to the given meta
            // container so the metadata table stays consistent across
            // every preview rendered for the picked or edited profile
            const appendMetaRow = function(container, label, value) {
                if (value === undefined || value === null || value === "") return;
                const row = jQuery("<div></div>");
                row.addClass("manager-reference-detail-meta-row");
                const key = jQuery("<span></span>");
                key.addClass("manager-reference-detail-meta-key");
                key.text(label);
                const val = jQuery("<span></span>");
                val.addClass("manager-reference-detail-meta-value");
                val.text(String(value));
                row.append(key);
                row.append(val);
                container.append(row);
            };

            // renders a preview card with the background image, display
            // name, and a small metadata table that mirrors the most
            // relevant fields of the profile schema, used by both the
            // template tab and the live preview tab
            const renderDetail = function(
                profile,
                imageElement,
                nameElement,
                metaElement,
                imageUrl
            ) {
                if (imageUrl) {
                    imageElement.css("background-image", "url(" + imageUrl + ")");
                } else if (profile.background) {
                    imageElement.css(
                        "background-image",
                        "url(/static/profiles/" + encodeURI(profile.background) + ")"
                    );
                } else {
                    imageElement.css("background-image", "none");
                }
                nameElement.text(profile.name || profile.id || "");
                metaElement.empty();
                appendMetaRow(metaElement, metaIdLabel, profile.id);
                const unit = profile.unit || "mm";
                if (profile.width !== undefined && profile.height !== undefined) {
                    appendMetaRow(
                        metaElement,
                        metaSizeLabel,
                        profile.width + "x" + profile.height + " " + unit
                    );
                }
                if (profile.orientation) {
                    appendMetaRow(metaElement, metaOrientationLabel, profile.orientation);
                }
                if (profile.shape) appendMetaRow(metaElement, metaShapeLabel, profile.shape);
                if (profile.text && profile.text.max_lines !== undefined) {
                    appendMetaRow(metaElement, metaMaxLinesLabel, profile.text.max_lines);
                }
                if (profile._inspirations && profile._inspirations.length) {
                    appendMetaRow(metaElement, metaInspirationsLabel, profile._inspirations.length);
                }
            };

            // refreshes the live preview from the current editor contents
            // by parsing the profile JSON, falling back to a placeholder
            // when the payload is invalid so the panel never spams errors
            // while the user is typing
            const refreshPreview = function() {
                const text = profileEditor.val() || "";
                let profile = null;
                try {
                    profile = JSON.parse(text);
                } catch (err) {
                    profile = null;
                }
                if (!profile || typeof profile !== "object") {
                    previewDetail.prop("hidden", true);
                    previewInvalid.prop("hidden", false);
                    return;
                }
                renderDetail(
                    profile,
                    previewDetailImage,
                    previewDetailName,
                    previewDetailMeta,
                    null
                );
                previewInvalid.prop("hidden", true);
                previewDetail.prop("hidden", false);
            };

            // debounces the live preview update so that fast keystrokes
            // do not thrash the JSON parser on every input event while
            // still feeling responsive after a brief pause
            const schedulePreview = function() {
                if (previewTimer !== null) clearTimeout(previewTimer);
                previewTimer = setTimeout(refreshPreview, 400);
            };

            // populates the dropdown with one option per available
            // profile and caches the catalog so subsequent selections
            // do not need to hit the server again
            const renderReferenceSelect = async function() {
                try {
                    const response = await fetch("/profiles?include_disabled=1");
                    if (response.status !== 200) return;
                    cachedProfiles = await response.json();
                    const previousValue = referenceSelect.val() || "";
                    referenceSelect.children("option:not([value=''])").remove();
                    const keys = Object.keys(cachedProfiles);
                    for (const key of keys) {
                        const profile = cachedProfiles[key];
                        const option = jQuery("<option></option>");
                        option.attr("value", key);
                        const label = profile.name || key;
                        option.text(profile.enabled === false ? label + disabledSuffix : label);
                        referenceSelect.append(option);
                    }
                    if (previousValue && cachedProfiles[previousValue]) {
                        referenceSelect.val(previousValue);
                    } else if (previousValue) {
                        referenceSelect.val("");
                        selectedKey = null;
                        referenceDetail.prop("hidden", true);
                        referenceEmpty.prop("hidden", false);
                    }
                } catch (err) {
                    // silently ignores fetch errors so the manager screen
                    // still renders without a populated reference dropdown
                }
            };
            renderReferenceSelect();
            refreshPreview();

            // switches the active reference tab by toggling the visible
            // tab content and the highlighted tab button so the right
            // pane can flip between the existing profiles, the live
            // preview, and the background asset manager
            jQuery(".manager-reference-tab", context).click(function() {
                const tab = jQuery(this);
                const target = tab.attr("data-tab");
                jQuery(".manager-reference-tab", context).removeClass("active");
                tab.addClass("active");
                jQuery(".manager-reference-tab-content", context).prop("hidden", true);
                jQuery("[data-tab-content=" + target + "]", context).prop("hidden", false);
                if (target === "preview") refreshPreview();
            });

            // shows the preview for the picked profile and remembers
            // the selection so the apply, edit, and delete buttons can
            // later operate on the same template
            referenceSelect.on("change", function() {
                const key = referenceSelect.val();
                selectedKey = key || null;
                if (!key || !cachedProfiles || !cachedProfiles[key]) {
                    referenceDetail.prop("hidden", true);
                    referenceEmpty.prop("hidden", false);
                    return;
                }
                const profile = cachedProfiles[key];
                renderDetail(
                    profile,
                    referenceDetailImage,
                    referenceDetailName,
                    referenceDetailMeta,
                    null
                );
                const disabled = profile.enabled === false;
                referenceDetail.toggleClass("disabled", disabled);
                referenceDetailStatus.prop("hidden", !disabled);
                referenceDetailToggle.text(
                    disabled
                        ? referenceDetailToggle.attr("data-enable-label")
                        : referenceDetailToggle.attr("data-disable-label")
                );
                referenceEmpty.prop("hidden", true);
                referenceDetail.prop("hidden", false);
            });

            // loads the picked profile into the editor textareas as
            // the starting point of the new profile, copying the
            // matching inspirations entries when the profile carries
            // them so both editors stay in sync, and forces create mode
            // so a previous edit selection does not leak into the new
            // save submission
            referenceDetailApply.click(function() {
                if (!selectedKey || !cachedProfiles) return;
                const profile = cachedProfiles[selectedKey];
                if (!profile) return;
                const sanitized = Object.assign({}, profile);
                const attachedInspirations = sanitized._inspirations || null;
                delete sanitized._inspirations;
                profileEditor.val(JSON.stringify(sanitized, null, 4));
                if (attachedInspirations) {
                    inspirationsEditor.val(JSON.stringify(attachedInspirations, null, 4));
                } else {
                    inspirationsEditor.val("");
                }
                editTargetInput.val("");
                heroEyebrow.text(heroEyebrow.attr("data-create-label"));
                buttonSave.text(buttonSave.attr("data-create-label"));
                editBannerTarget.text("");
                editBanner.prop("hidden", true);
                profileEditor.jsonhighlight("refresh");
                inspirationsEditor.jsonhighlight("refresh");
                refreshPreview();
            });

            // loads the picked profile into the editor textareas and
            // flips the form into edit mode so the next save overwrites
            // the existing profile instead of creating a duplicate
            referenceDetailEdit.click(function() {
                if (!selectedKey || !cachedProfiles) return;
                const profile = cachedProfiles[selectedKey];
                if (!profile) return;
                const sanitized = Object.assign({}, profile);
                const attachedInspirations = sanitized._inspirations || null;
                delete sanitized._inspirations;
                profileEditor.val(JSON.stringify(sanitized, null, 4));
                if (attachedInspirations) {
                    inspirationsEditor.val(JSON.stringify(attachedInspirations, null, 4));
                } else {
                    inspirationsEditor.val("");
                }
                editTargetInput.val(selectedKey);
                heroEyebrow.text(heroEyebrow.attr("data-edit-label"));
                buttonSave.text(buttonSave.attr("data-edit-label"));
                editBannerTarget.text(selectedKey);
                editBanner.prop("hidden", false);
                profileEditor.jsonhighlight("refresh");
                inspirationsEditor.jsonhighlight("refresh");
                refreshPreview();
            });

            // exits the edit mode without leaving the manager screen so
            // the user can pivot from editing an existing profile to
            // creating a new one without reloading or navigating away
            editBannerExit.click(function() {
                editTargetInput.val("");
                heroEyebrow.text(heroEyebrow.attr("data-create-label"));
                buttonSave.text(buttonSave.attr("data-create-label"));
                editBannerTarget.text("");
                editBanner.prop("hidden", true);
            });

            // dismisses an error or validation banner when its close
            // button is clicked so the panels do not stay sticky after
            // the user has acknowledged the message and moved on
            context.on("click", ".manager-banner-close", function() {
                const banner = jQuery(this).closest(".manager-errors, .manager-validation");
                if (banner.hasClass("manager-validation")) {
                    banner.prop("hidden", true);
                } else {
                    banner.remove();
                }
            });

            // flips the enabled flag of the picked profile via the
            // dedicated toggle endpoint, refreshing the catalog so the
            // dropdown and detail panel reflect the new state and the
            // welcome and viewport selectors filter accordingly
            referenceDetailToggle.click(async function() {
                if (!selectedKey || !cachedProfiles) return;
                const profile = cachedProfiles[selectedKey];
                const nextEnabled = profile.enabled === false;
                referenceDetailToggle.prop("disabled", true);
                try {
                    const formData = new FormData();
                    formData.append("enabled", nextEnabled ? "1" : "0");
                    const response = await fetch(
                        "/profiles/" + encodeURIComponent(selectedKey) + "/enabled",
                        { method: "POST", body: formData }
                    );
                    if (response.status !== 200) return;
                    const previousKey = selectedKey;
                    await renderReferenceSelect();
                    referenceSelect.val(previousKey).trigger("change");
                } finally {
                    referenceDetailToggle.prop("disabled", false);
                }
            });

            // opens the delete confirmation modal pre-populated with
            // the picked profile identifier so the user can review
            // exactly which profile is about to be removed
            referenceDetailDelete.click(function() {
                if (!selectedKey) return;
                pendingDeleteKey = selectedKey;
                modalDeleteTarget.text(selectedKey);
                modalDeleteProfile.modal("show");
            });

            // posts the delete request for the pending profile and
            // reloads the page on success so the dropdown is refreshed
            // without the removed entry
            buttonModalDelete.click(async function() {
                if (!pendingDeleteKey) return;
                try {
                    const response = await fetch(
                        "/profiles/" + encodeURIComponent(pendingDeleteKey) + "/delete",
                        { method: "POST" }
                    );
                    if (response.status !== 200) return;
                    window.location.reload();
                } catch (err) {
                    // silently ignores delete errors so the manager screen
                    // stays interactive when the network is unavailable
                }
            });

            // reads the picked file as text and stuffs the result into
            // the textarea referenced by the picker's data-target so
            // the editor remains the source of truth for the submission
            jQuery(".manager-field-loader-input", context).on("change", function() {
                const input = this;
                if (!input.files || input.files.length === 0) return;
                const targetId = jQuery(input).attr("data-target");
                const target = jQuery("#" + targetId);
                if (target.length === 0) return;
                const reader = new FileReader();
                reader.onload = function() {
                    target.val(reader.result);
                    input.value = "";
                    target.jsonhighlight("refresh");
                    schedulePreview();
                };
                reader.readAsText(input.files[0]);
            });

            // schedules a live preview refresh on every input event so
            // the right pane stays in sync with whatever is currently
            // in the editor textareas
            profileEditor.on("input", schedulePreview);
            inspirationsEditor.on("input", schedulePreview);

            // initializes the json syntax highlighter overlay on both
            // editor textareas so the user sees colored tokens while
            // typing without losing native textarea behavior
            profileEditor.jsonhighlight();
            inspirationsEditor.jsonhighlight();

            // initializes the delete confirmation modals so the modal
            // plugin can manage their show, hide, and dismiss behaviors
            modalDeleteProfile.modal();

            // renders the asset list as a thumbnail grid, falling back
            // to a neutral empty state when no PNG file lives in the
            // profiles directory so the panel never looks broken
            const renderAssets = async function() {
                try {
                    const response = await fetch("/profiles/assets");
                    if (response.status !== 200) return;
                    const payload = await response.json();
                    const assets = payload.assets || [];
                    assetsGrid.empty();
                    if (assets.length === 0) {
                        assetsEmpty.prop("hidden", false);
                        return;
                    }
                    assetsEmpty.prop("hidden", true);
                    for (const filename of assets) {
                        const card = jQuery("<div></div>");
                        card.addClass("manager-assets-card");
                        card.attr("data-filename", filename);
                        const image = jQuery("<div></div>");
                        image.addClass("manager-assets-card-image");
                        image.css(
                            "background-image",
                            "url(/static/profiles/" + encodeURI(filename) + ")"
                        );
                        card.append(image);
                        const name = jQuery("<div></div>");
                        name.addClass("manager-assets-card-name");
                        name.text(filename);
                        card.append(name);
                        const download = jQuery("<a></a>");
                        download.attr("href", "/static/profiles/" + encodeURI(filename));
                        download.attr("download", filename);
                        download.addClass("manager-assets-card-download");
                        download.text("↓");
                        card.append(download);
                        const remove = jQuery("<button></button>");
                        remove.attr("type", "button");
                        remove.addClass("manager-assets-card-delete");
                        remove.text("×");
                        card.append(remove);
                        assetsGrid.append(card);
                    }
                } catch (err) {
                    // silently ignores fetch errors so the manager screen
                    // stays interactive even when the assets endpoint is
                    // momentarily unavailable
                }
            };
            renderAssets();

            // renders the asset upload error banner from the structured
            // list returned by the server so the failure look matches
            // the existing inline error treatment of the profile editor
            const renderAssetErrors = function(errors) {
                if (!errors || errors.length === 0) {
                    assetsErrors.empty().prop("hidden", true);
                    return;
                }
                assetsErrors.empty();
                for (const error of errors) {
                    const item = jQuery("<div></div>");
                    item.addClass("manager-assets-errors-item");
                    item.text(error);
                    assetsErrors.append(item);
                }
                assetsErrors.prop("hidden", false);
            };

            // visually marks the asset picker when a file is queued so
            // the user can tell at a glance whether the next upload
            // submission already has a payload attached, and pre-fills
            // the filename input with the picked file name unless the
            // user has already typed a custom value
            assetsFile.on("change", function() {
                if (this.files && this.files.length > 0) {
                    assetsPicker.addClass("has-file");
                    if (!(assetsFilename.val() || "").trim()) {
                        assetsFilename.val(this.files[0].name);
                    }
                } else {
                    assetsPicker.removeClass("has-file");
                }
            });

            // uploads the queued PNG under the requested filename via
            // a multipart request to the asset endpoint, refreshing the
            // grid on success and surfacing server errors inline
            assetsSubmit.click(async function() {
                const filename = (assetsFilename.val() || "").trim();
                const file = assetsFile.get(0).files[0];
                const localErrors = [];
                if (!filename) localErrors.push(assetErrorFilename);
                if (!file) localErrors.push(assetErrorFile);
                if (localErrors.length > 0) {
                    renderAssetErrors(localErrors);
                    return;
                }
                assetsSubmit.prop("disabled", true);
                try {
                    const formData = new FormData();
                    formData.append("filename", filename);
                    formData.append("file", file);
                    const response = await fetch("/profiles/assets", {
                        method: "POST",
                        body: formData
                    });
                    if (response.status === 200) {
                        renderAssetErrors([]);
                        assetsFilename.val("");
                        assetsFile.val("");
                        assetsPicker.removeClass("has-file");
                        await renderAssets();
                        const message =
                            context.attr("data-toast-asset-saved") || "Background uploaded";
                        managerToast.toast("show", message);
                        return;
                    }
                    let errors = [];
                    try {
                        const payload = await response.json();
                        errors = payload.errors || [];
                    } catch (err) {
                        errors = ["unexpected server response"];
                    }
                    renderAssetErrors(errors);
                } catch (err) {
                    renderAssetErrors([String(err)]);
                } finally {
                    assetsSubmit.prop("disabled", false);
                }
            });

            // opens the asset delete confirmation modal pre-populated
            // with the filename so the user can review exactly which
            // PNG asset is about to be removed
            assetsGrid.on("click", ".manager-assets-card-delete", function() {
                const card = jQuery(this).closest(".manager-assets-card");
                const filename = card.attr("data-filename");
                if (!filename) return;
                pendingDeleteAsset = filename;
                modalDeleteAssetTarget.text(filename);
                modalDeleteAsset.modal("show");
            });

            // posts the delete request for the pending asset and
            // refreshes the grid in place on success so the removed
            // entry disappears without a hard page reload
            buttonModalDeleteAsset.click(async function() {
                if (!pendingDeleteAsset) return;
                try {
                    const response = await fetch(
                        "/profiles/assets/" + encodeURIComponent(pendingDeleteAsset) + "/delete",
                        { method: "POST" }
                    );
                    if (response.status !== 200) return;
                    await renderAssets();
                    const message =
                        context.attr("data-toast-asset-deleted") || "Background removed";
                    managerToast.toast("show", message);
                } catch (err) {
                    // silently ignores delete errors so the manager screen
                    // stays interactive when the network is unavailable
                } finally {
                    pendingDeleteAsset = null;
                    modalDeleteAsset.modal("hide");
                }
            });

            // initializes the asset delete confirmation modal so the
            // modal plugin can manage its show, hide, and dismiss
            // behaviors alongside the profile delete modal
            modalDeleteAsset.modal();

            // renders the bundle import error banner from the structured
            // payload returned by the server so the failure look matches
            // the existing inline error treatment of the asset panel
            const renderBundleErrors = function(errors) {
                if (!errors || errors.length === 0) {
                    bundleErrors.empty().prop("hidden", true);
                    return;
                }
                bundleErrors.empty();
                for (const error of errors) {
                    const item = jQuery("<div></div>");
                    item.addClass("manager-assets-errors-item");
                    item.text(error);
                    bundleErrors.append(item);
                }
                bundleErrors.prop("hidden", false);
            };

            // visually marks the bundle picker when a zip is queued so
            // the user can tell at a glance whether the next restore
            // submission already has a payload attached
            bundleFile.on("change", function() {
                if (this.files && this.files.length > 0) {
                    bundlePicker.addClass("has-file");
                } else {
                    bundlePicker.removeClass("has-file");
                }
            });

            // opens the restore confirmation modal so the user can
            // review the destructive full replace semantics before
            // the on disk profiles directory is wiped and rebuilt
            bundleSubmit.click(function() {
                if (!bundleFile.get(0).files[0]) {
                    renderBundleErrors(["file is required"]);
                    return;
                }
                renderBundleErrors([]);
                modalRestoreBundle.modal("show");
            });

            // posts the queued bundle to the server which wipes the
            // profiles directory and unpacks the archive in place,
            // then reloads the page so every cached profile list and
            // dropdown reflects the freshly restored catalog
            buttonModalRestoreBundle.click(async function() {
                const file = bundleFile.get(0).files[0];
                if (!file) {
                    modalRestoreBundle.modal("hide");
                    return;
                }
                buttonModalRestoreBundle.prop("disabled", true);
                try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const response = await fetch("/profiles/bundle", {
                        method: "POST",
                        body: formData
                    });
                    if (response.status === 200) {
                        const message =
                            context.attr("data-toast-bundle-restored") || "Bundle restored";
                        managerToast.toast("show", message);
                        window.location.reload();
                        return;
                    }
                    let errors = [];
                    try {
                        const payload = await response.json();
                        errors = payload.errors || [payload.error || "unexpected server response"];
                    } catch (err) {
                        errors = ["unexpected server response"];
                    }
                    modalRestoreBundle.modal("hide");
                    renderBundleErrors(errors);
                } catch (err) {
                    modalRestoreBundle.modal("hide");
                    renderBundleErrors([String(err)]);
                } finally {
                    buttonModalRestoreBundle.prop("disabled", false);
                }
            });

            // initializes the restore confirmation modal so the modal
            // plugin can manage its show, hide, and dismiss behaviors
            // alongside the delete confirmation modals
            modalRestoreBundle.modal();

            // runs the profile and inspirations payloads through the
            // server side validator without persisting anything and
            // surfaces the resulting messages inline so the user can
            // iterate on the editor before committing to a save
            buttonValidate.click(async function() {
                buttonValidate.prop("disabled", true);
                try {
                    const formData = new FormData();
                    formData.append("profile_json", profileEditor.val() || "");
                    formData.append("inspirations_json", inspirationsEditor.val() || "");
                    formData.append("edit_target", editTargetInput.val() || "");
                    const response = await fetch("/profiles/validate", {
                        method: "POST",
                        body: formData
                    });
                    if (response.status !== 200) return;
                    const payload = await response.json();
                    const errors = payload.errors || [];
                    validationContainer.empty();
                    const close = jQuery('<button type="button"></button>');
                    close.addClass("manager-banner-close");
                    close.attr("aria-label", dismissLabel);
                    close.text(dismissLabel);
                    validationContainer.append(close);
                    if (errors.length === 0) {
                        validationContainer.addClass("valid");
                        const title = jQuery("<div></div>");
                        title.addClass("manager-validation-title");
                        title.text(validationOkLabel);
                        validationContainer.append(title);
                    } else {
                        validationContainer.removeClass("valid");
                        const title = jQuery("<div></div>");
                        title.addClass("manager-validation-title");
                        const template =
                            errors.length === 1 ? validationIssuesSingular : validationIssuesPlural;
                        title.text(template.replace("{n}", errors.length));
                        validationContainer.append(title);
                        const list = jQuery("<ul></ul>");
                        list.addClass("manager-validation-list");
                        for (const error of errors) {
                            const item = jQuery("<li></li>");
                            item.addClass("manager-validation-item");
                            item.text(error);
                            list.append(item);
                        }
                        validationContainer.append(list);
                    }
                    validationContainer.prop("hidden", false);
                } catch (err) {
                    // silently ignores validation request errors so the
                    // manager screen stays interactive when offline
                } finally {
                    buttonValidate.prop("disabled", false);
                }
            });

            // renders the same red error banner the server side render
            // path produced before the form was switched to AJAX so the
            // failure look stays consistent across both interaction modes
            const renderManagerErrors = function(errors) {
                const existing = jQuery(".manager-errors", context);
                if (existing.length > 0) existing.remove();
                if (!errors || errors.length === 0) return;
                const banner = jQuery("<div></div>");
                banner.addClass("manager-errors");
                const close = jQuery('<button type="button"></button>');
                close.addClass("manager-banner-close");
                close.attr("aria-label", dismissLabel);
                close.text(dismissLabel);
                banner.append(close);
                const title = jQuery("<div></div>");
                title.addClass("manager-errors-title");
                title.text(saveErrorTitle);
                banner.append(title);
                const list = jQuery("<ul></ul>");
                list.addClass("manager-errors-list");
                for (const error of errors) {
                    const item = jQuery("<li></li>");
                    item.addClass("manager-errors-item");
                    item.text(error);
                    list.append(item);
                }
                banner.append(list);
                editBanner.after(banner);
            };

            // intercepts the form submission so the save runs as an AJAX
            // request that keeps the user on the profile manager, refreshes
            // the reference dropdown with the newly saved entry, and signals
            // success through the existing toast plugin without losing the
            // current editor context
            context.submit(async function(event) {
                event.preventDefault();
                buttonSave.prop("disabled", true);
                try {
                    const formData = new FormData(context.get(0));
                    const response = await fetch("/profiles", {
                        method: "POST",
                        body: formData
                    });
                    if (response.status === 200) {
                        const payload = await response.json();
                        renderManagerErrors([]);
                        validationContainer.empty().prop("hidden", true);

                        // updates the edit target so a subsequent save
                        // applies to the freshly persisted profile id and
                        // the banner reflects the same identifier after a
                        // rename, switching the form into edit mode when
                        // a brand new profile was just created
                        const savedId = payload.id || "";
                        editTargetInput.val(savedId);
                        heroEyebrow.text(heroEyebrow.attr("data-edit-label"));
                        buttonSave.text(buttonSave.attr("data-edit-label"));
                        editBannerTarget.text(savedId);
                        editBanner.prop("hidden", false);

                        // refreshes the reference dropdown so the newly
                        // saved or renamed profile appears immediately
                        // without forcing a hard page reload
                        await renderReferenceSelect();

                        const savedMessage = context.attr("data-toast-saved") || "Profile saved";
                        managerToast.toast("show", savedMessage);
                        return;
                    }
                    let errors = [];
                    try {
                        const payload = await response.json();
                        errors = payload.errors || [];
                    } catch (err) {
                        errors = ["unexpected server response"];
                    }
                    renderManagerErrors(errors);
                } catch (err) {
                    renderManagerErrors([String(err)]);
                } finally {
                    buttonSave.prop("disabled", false);
                }
            });
        });

        return this;
    };
})(jQuery);
