(function(jQuery) {
    /**
     * Diagnostics plugin that runs a self contained check of the
     * engraving pipeline tools and renders the result inside the
     * Diagnostics tab on the settings screen.
     *
     * Operates on a .settings-tab-content[data-tab=diagnostics]
     * element and discovers its children (.diagnostics-run,
     * .diagnostics-empty, .diagnostics-probes,
     * .diagnostics-probe-list, .diagnostics-pipeline,
     * .diagnostics-step-list) by class name convention.
     */
    jQuery.fn.diagnostics = function() {
        const elements = jQuery(this);

        // renders a single probe entry inside the tools section
        // as a one line row with the tool name, the captured
        // version string and a colored status pill
        const renderProbe = function(context, probe) {
            const passLabel = context.attr("data-label-pass");
            const failLabel = context.attr("data-label-fail");
            const status = probe.found && !probe.error ? "ok" : "error";
            const row = jQuery("<div></div>");
            row.addClass("diagnostics-row");
            row.attr("data-status", status);

            const tool = jQuery("<div></div>");
            tool.addClass("diagnostics-row-tool");
            tool.text(probe.tool);
            row.append(tool);

            const version = jQuery("<div></div>");
            version.addClass("diagnostics-row-version");
            version.text(probe.version || probe.error || "");
            row.append(version);

            const badge = jQuery("<div></div>");
            badge.addClass("diagnostics-row-status");
            badge.text(status === "ok" ? passLabel : failLabel);
            row.append(badge);

            return row;
        };

        // renders a single pipeline step inside the pipeline
        // section, showing the resolved command, the output byte
        // count, the elapsed milliseconds and the captured stderr
        // tail so a failure can be diagnosed without ssh
        const renderStep = function(context, step) {
            const passLabel = context.attr("data-label-pass");
            const failLabel = context.attr("data-label-fail");
            const status = step.status === "ok" ? "ok" : "error";
            const row = jQuery("<div></div>");
            row.addClass("diagnostics-row");
            row.attr("data-status", status);

            const head = jQuery("<div></div>");
            head.addClass("diagnostics-row-head");
            const name = jQuery("<div></div>");
            name.addClass("diagnostics-row-tool");
            name.text(step.name);
            head.append(name);
            const badge = jQuery("<div></div>");
            badge.addClass("diagnostics-row-status");
            badge.text(status === "ok" ? passLabel : failLabel);
            head.append(badge);
            row.append(head);

            const meta = jQuery("<div></div>");
            meta.addClass("diagnostics-row-meta");
            const bytes = jQuery("<span></span>");
            bytes.addClass("diagnostics-row-bytes");
            bytes.text(step.outputBytes + " B");
            meta.append(bytes);
            const duration = jQuery("<span></span>");
            duration.addClass("diagnostics-row-duration");
            duration.text(step.durationMs + " ms");
            meta.append(duration);
            row.append(meta);

            if (step.command) {
                const command = jQuery("<code></code>");
                command.addClass("diagnostics-row-command");
                command.text(step.command);
                row.append(command);
            }

            if (step.stderr) {
                const stderr = jQuery("<pre></pre>");
                stderr.addClass("diagnostics-row-stderr");
                stderr.text(step.stderr);
                row.append(stderr);
            }

            return row;
        };

        // populates both sections of the given context with the
        // probe and step entries produced by the server side
        // diagnostics endpoint, hiding the empty hint that is
        // shown before the first run
        const renderResult = function(context, payload) {
            const probeList = jQuery(".diagnostics-probe-list", context);
            const stepList = jQuery(".diagnostics-step-list", context);
            const probeSection = jQuery(".diagnostics-probes", context);
            const stepSection = jQuery(".diagnostics-pipeline", context);
            const empty = jQuery(".diagnostics-empty", context);

            probeList.empty();
            stepList.empty();
            empty.hide();

            for (const probe of payload.probes || []) {
                probeList.append(renderProbe(context, probe));
            }
            for (const step of payload.steps || []) {
                stepList.append(renderStep(context, step));
            }
            probeSection.prop("hidden", false);
            stepSection.prop("hidden", false);
        };

        elements.each(function() {
            const context = jQuery(this);
            const runButton = jQuery(".diagnostics-run", context);
            const runLabel = runButton.text();
            const runningLabel = context.attr("data-label-running");
            const networkErrorLabel = context.attr("data-label-network-error");

            runButton.click(async function(event) {
                event.preventDefault();
                runButton.prop("disabled", true);
                runButton.text(runningLabel);
                try {
                    const response = await fetch("/settings/diagnostics", {
                        method: "POST"
                    });
                    if (response.status !== 200) {
                        throw new Error("unexpected status " + response.status);
                    }
                    const payload = await response.json();
                    renderResult(context, payload);
                } catch (error) {
                    jQuery(".diagnostics-probe-list", context).empty();
                    jQuery(".diagnostics-step-list", context).empty();
                    jQuery(".diagnostics-probes", context).prop("hidden", true);
                    jQuery(".diagnostics-pipeline", context).prop("hidden", true);
                    const empty = jQuery(".diagnostics-empty", context);
                    empty.text(networkErrorLabel);
                    empty.show();
                } finally {
                    runButton.prop("disabled", false);
                    runButton.text(runLabel);
                }
            });
        });

        return elements;
    };
})(jQuery);
