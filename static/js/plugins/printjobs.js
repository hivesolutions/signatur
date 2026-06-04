(function(jQuery) {
    /**
     * Print jobs indicator plugin that displays one chip per
     * engraving job submitted to colony-print, polling the server
     * every 5 seconds for status updates and exposing the request
     * payload, the rendered result and the produced artefacts
     * (screenshots, videos, raw files) through a tabbed overlay.
     *
     * Operates on a .print-jobs element and discovers its children
     * (.print-jobs-chips, .modal-overlay-print-job) by class name
     * convention. The list of tracked jobs is persisted to the
     * `print_jobs` localStorage key and rehydrated on every init so
     * the indicator survives reloads and tab restores.
     *
     * Actions:
     *   "enqueue" - registers a new job from a colony-print response
     *               passing { jobInfo, printUrl, key } and starts
     *               polling its status until it reaches a terminal
     *               state
     *   "dismiss" - removes a chip from the indicator and from the
     *               persisted list passing { id }, used when the
     *               operator manually clears a terminal entry
     *   "value"   - returns the current list of tracked jobs as an
     *               array snapshot read from the persisted store
     *
     * Events:
     *   "terminal" - triggered the first time a job reaches a
     *                terminal state (`finished` or `cancelled`),
     *                passing the resolved job entry as argument so
     *                downstream listeners can react once per job
     */
    jQuery.fn.printjobs = function(action, options) {
        const elements = jQuery(this);

        // shared poll cadence used by every job tracked by the
        // plugin so a long running stack never spawns more than a
        // single ticker, matching the 5 second contract documented
        // on the colony-print job lifecycle
        const POLL_INTERVAL = 5000;

        // canonical list of terminal status values that stop the
        // polling cycle for a given entry and switch its chip into
        // the dismiss affordance instead of the cancel one
        const TERMINAL_STATUSES = ["finished", "cancelled"];

        // canonical set of keys excluded from the result summary
        // because they are surfaced through their own tab (raw
        // payload, traceback) or pure binary blobs that would
        // clutter the info tab without adding diagnostic value
        const RESULT_SUMMARY_SKIP = [
            "data",
            "output_data",
            "output_encoding",
            "output_mime_type",
            "traceback"
        ];

        // resolves the current list of tracked jobs from localStorage
        // returning an array snapshot that is safe to mutate without
        // touching the persisted payload until writeJobs is called
        const readJobs = function() {
            try {
                const raw = localStorage.getItem("print_jobs");
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                return [];
            }
        };

        // persists the current list of tracked jobs onto localStorage
        // silently ignoring quota errors so the indicator can keep
        // rendering even when the storage backend is unavailable
        const writeJobs = function(jobs) {
            try {
                localStorage.setItem("print_jobs", JSON.stringify(jobs));
            } catch (err) {
                // silently ignores storage errors
            }
        };

        // returns true when the given status is one of the terminal
        // values defined by the colony-print contract, used to stop
        // polling and flip the chip into the dismiss affordance
        const isTerminal = function(status) {
            return TERMINAL_STATUSES.indexOf(status) !== -1;
        };

        // returns true when the job ended on a printing error,
        // detected by a "finished" status carrying either a literal
        // "error" string or a result object whose nested `result`
        // key equals "error", since colony-print signals failures
        // through the result field rather than a dedicated status
        const isFailed = function(job) {
            if (job.status !== "finished") return false;
            if (job.result === "error") return true;
            if (job.result && typeof job.result === "object") {
                return job.result.result === "error";
            }
            return false;
        };

        // resolves the effective status key for label and styling
        // lookups, mapping a failed job onto the "failed" key so the
        // chip styling and the tooltip diverge from a successful
        // finished outcome
        const effectiveStatus = function(job) {
            if (isFailed(job)) return "failed";
            return job.status;
        };

        // resolves the result object on a job (when present and
        // structured), returning null for the literal "error" string
        // case so callers can treat the value as a plain object
        const resultObject = function(job) {
            if (job.result && typeof job.result === "object") return job.result;
            return null;
        };

        // formats the elapsed time between two unix timestamps in
        // seconds as a compact human readable string (e.g. "12s",
        // "3m 14s", "1h 02m") for the chip tooltip and the info tab
        const formatElapsed = function(from, to) {
            const seconds = Math.max(0, Math.floor((to || from) - from));
            if (seconds < 60) return seconds + "s";
            const minutes = Math.floor(seconds / 60);
            const rest = seconds % 60;
            if (minutes < 60) return minutes + "m " + (rest < 10 ? "0" : "") + rest + "s";
            const hours = Math.floor(minutes / 60);
            const restMin = minutes % 60;
            return hours + "h " + (restMin < 10 ? "0" : "") + restMin + "m";
        };

        // returns a human readable size string for a byte count
        // using KB and MB thresholds so the modal tiles and the
        // data length row surface the value without overflowing
        const formatSize = function(size) {
            if (size < 1024) return size + " B";
            if (size < 1024 * 1024) return Math.round(size / 1024) + " KB";
            return (size / (1024 * 1024)).toFixed(1) + " MB";
        };

        // formats a unix timestamp in seconds as a locale aware
        // date time string, returning a dash when the value is
        // missing so the row stays present but visually empty
        const formatTimestamp = function(timestamp) {
            if (!timestamp) return "-";
            const date = new Date(timestamp * 1000);
            return date.toLocaleString();
        };

        // formats a duration expressed in seconds as a compact
        // human readable string using hours, minutes and seconds,
        // omitting the leading zero units when not needed
        const formatDuration = function(seconds) {
            const total = Math.max(0, Math.floor(seconds));
            const hours = Math.floor(total / 3600);
            const minutes = Math.floor((total % 3600) / 60);
            const rest = total % 60;
            if (hours > 0) return hours + "h " + minutes + "m " + rest + "s";
            if (minutes > 0) return minutes + "m " + rest + "s";
            return rest + "s";
        };

        // escapes the given value through a throwaway span so any
        // user provided text can be safely embedded in a row html
        // without breaking the surrounding markup
        const escapeHtml = function(value) {
            return jQuery("<span>").text(String(value)).html();
        };

        // builds a single spec row using the same dom structure as
        // the confirm engraving modal so every info section carries
        // the same visual treatment of label on the left and value
        // on the right, with the value passed through as raw html
        const buildRow = function(label, value) {
            return (
                '<div class="modal-spec">' +
                '<span class="modal-spec-label">' +
                escapeHtml(label) +
                "</span>" +
                '<span class="modal-spec-value">' +
                value +
                "</span>" +
                "</div>"
            );
        };

        // returns true when the given file name matches one of
        // the image extensions worth showing inline as a thumbnail
        const isImage = function(name) {
            return /\.(png|jpe?g|gif|webp)$/i.test(name);
        };

        // returns true when the given file name matches one of
        // the video extensions worth showing as an inline player
        const isVideo = function(name) {
            return /\.(mp4|webm|mov)$/i.test(name);
        };

        // maps a colony-print log severity to a chip variant class
        // so each log entry carries the same color hierarchy as
        // the rest of the indicator
        const logSeverityVariant = function(level) {
            if (level === "ERROR") return "error";
            if (level === "WARNING") return "warning";
            if (level === "INFO") return "success";
            return "default";
        };

        // returns the current list of tracked jobs as a snapshot
        // from the persisted store without engaging the per element
        // rendering logic, used by callers that just want the data
        if (action === "value") {
            return readJobs();
        }

        elements.each(function() {
            const context = jQuery(this);
            const chipsContainer = jQuery(".print-jobs-chips", context);

            // overlay and tab strip
            const modalOverlay = jQuery(".modal-overlay-print-job");
            const modalTitle = jQuery(".modal-print-job-title", modalOverlay);
            const modalTabs = jQuery(".modal-print-job-tab", modalOverlay);

            // info tab targets
            const infoSpecs = jQuery(".modal-print-job-specs", modalOverlay);
            const infoOptionsSection = jQuery(
                ".modal-print-job-section-options",
                modalOverlay
            );
            const infoOptions = jQuery(".modal-print-job-options", modalOverlay);
            const infoResultSection = jQuery(
                ".modal-print-job-section-result",
                modalOverlay
            );
            const infoResultSummary = jQuery(
                ".modal-print-job-result-summary",
                modalOverlay
            );
            const infoLogsSection = jQuery(
                ".modal-print-job-section-logs",
                modalOverlay
            );
            const infoLogsToggle = jQuery(
                ".modal-print-job-logs-toggle",
                modalOverlay
            );
            const infoLogs = jQuery(".modal-print-job-logs", modalOverlay);

            // files tab targets
            const filesGrid = jQuery(".modal-print-job-files-grid", modalOverlay);
            const filesEmpty = jQuery(".modal-print-job-files-empty", modalOverlay);

            // request, result and traceback tab targets
            const requestPre = jQuery(".modal-print-job-request", modalOverlay);
            const requestEmpty = jQuery(
                ".modal-print-job-request-empty",
                modalOverlay
            );
            const resultPre = jQuery(".modal-print-job-result", modalOverlay);
            const tracebackPre = jQuery(".modal-print-job-traceback", modalOverlay);

            // localized strings read from data-label-* attributes
            // on the container so each locale template owns its own
            // copy following the convention used by the modal plugin
            const labels = {
                queued: context.attr("data-label-queued") || "Queued",
                printing: context.attr("data-label-printing") || "Printing",
                finished: context.attr("data-label-finished") || "Finished",
                cancelled: context.attr("data-label-cancelled") || "Cancelled",
                failed: context.attr("data-label-failed") || "Failed",
                cancel: context.attr("data-label-cancel") || "Cancel",
                dismiss: context.attr("data-label-dismiss") || "Dismiss",
                printer: context.attr("data-label-printer") || "Printer",
                node: context.attr("data-label-node") || "Node",
                elapsed: context.attr("data-label-elapsed") || "Elapsed",
                status: context.attr("data-label-status") || "Status",
                id: context.attr("data-label-id") || "Job",
                name: context.attr("data-label-name") || "Name",
                type: context.attr("data-label-type") || "Type",
                format: context.attr("data-label-format") || "Format",
                dataLength: context.attr("data-label-data-length") || "Data length",
                duration: context.attr("data-label-duration") || "Duration",
                queuedAt: context.attr("data-label-queued-at") || "Queued at",
                printingAt: context.attr("data-label-printing-at") || "Printing at",
                finishedAt: context.attr("data-label-finished-at") || "Finished at",
                cancelledAt: context.attr("data-label-cancelled-at") || "Cancelled at",
                requestEmpty:
                    context.attr("data-label-request-empty") ||
                    "No request payload recorded for this job.",
                failedToast:
                    context.attr("data-label-failed-toast") || "Engraving job failed.",
                filesEmpty:
                    context.attr("data-label-files-empty") || "No files generated.",
                download: context.attr("data-label-download") || "Download"
            };

            // resolves the per container state object that survives
            // every plugin invocation through jQuery `data` so the
            // blob url cache, the shared poll timer id, the bound
            // handler flag, the currently open job id and the logs
            // collapsible state are never duplicated across calls
            let state = context.data("_state");
            if (!state) {
                state = {
                    blobUrls: [],
                    pollTimer: null,
                    bound: false,
                    activeTab: "info",
                    openJobId: null,
                    logsOpen: false
                };
                context.data("_state", state);
            }

            // builds the multi line tooltip text rendered through
            // the chip title attribute, surfacing the status, the
            // printer, the node and the elapsed time the operator
            // needs to identify a job at a glance
            const buildTooltip = function(job) {
                const lines = [];
                lines.push(labels[effectiveStatus(job)] || job.status);
                if (job.printer) lines.push(labels.printer + ": " + job.printer);
                if (job.node_id) lines.push(labels.node + ": " + job.node_id);
                if (job.queued_time) {
                    const now = Date.now() / 1000;
                    const end = job.finish_time || job.cancel_time || now;
                    lines.push(labels.elapsed + ": " + formatElapsed(job.queued_time, end));
                }
                return lines.join("\n");
            };

            // renders a single chip in the container for the given
            // job entry replacing any existing chip with the same id
            // so a poll update reuses the dom node and a fresh status
            // simply swaps the visual treatment
            const renderChip = function(job) {
                const existing = chipsContainer.children('[data-id="' + job.id + '"]');
                const chip = jQuery("<div></div>");
                chip.addClass("print-jobs-chip");
                chip.addClass("print-jobs-chip-" + effectiveStatus(job));
                chip.attr("data-id", job.id);

                const status = effectiveStatus(job);
                if (status === "queued" || status === "printing") {
                    chip.append('<span class="print-jobs-chip-spinner"></span>');
                }

                const label = jQuery('<span class="print-jobs-chip-label"></span>');
                label.text(labels[status] || labels.queued);
                chip.append(label);

                if (job.printer) {
                    const printer = jQuery('<span class="print-jobs-chip-printer"></span>');
                    printer.text(job.printer);
                    chip.append(printer);
                }

                // surfaces the cancel affordance for queued jobs only
                // since colony-print only allows cancellation while
                // the job has not been picked up by the target node
                if (job.status === "queued") {
                    const cancel = jQuery('<span class="print-jobs-chip-cancel"></span>');
                    cancel.attr("title", labels.cancel);
                    cancel.text("×");
                    chip.append(cancel);
                } else if (isTerminal(job.status)) {
                    const dismiss = jQuery('<span class="print-jobs-chip-dismiss"></span>');
                    dismiss.attr("title", labels.dismiss);
                    dismiss.text("×");
                    chip.append(dismiss);
                }

                chip.attr("title", buildTooltip(job));

                if (existing.length > 0) existing.replaceWith(chip);
                else chipsContainer.append(chip);

                context.addClass("visible");
            };

            // renders every persisted entry from scratch, used on
            // init to rehydrate the indicator from localStorage and
            // hide the container entirely when no jobs are tracked
            const renderAll = function() {
                const jobs = readJobs();
                chipsContainer.empty();
                if (jobs.length === 0) {
                    context.removeClass("visible");
                    return;
                }
                for (let i = 0; i < jobs.length; i++) renderChip(jobs[i]);
                context.addClass("visible");
            };

            // resolves the persisted entry that matches the given id
            // returning null when no matching job is tracked so the
            // click handlers can short circuit on a stale chip that
            // was already dismissed from another tab
            const findJob = function(id) {
                const jobs = readJobs();
                for (let i = 0; i < jobs.length; i++) {
                    if (jobs[i].id === id) return jobs[i];
                }
                return null;
            };

            // merges the given patch onto the persisted entry that
            // matches the provided id, redraws the chip in place,
            // refreshes the overlay when the modified job is the one
            // currently on screen and emits a one shot terminal
            // event when the transition crosses the terminal boundary
            const updateJob = function(id, patch) {
                const jobs = readJobs();
                let changed = null;
                let previousStatus = null;
                for (let i = 0; i < jobs.length; i++) {
                    if (jobs[i].id === id) {
                        previousStatus = effectiveStatus(jobs[i]);
                        jobs[i] = Object.assign({}, jobs[i], patch);
                        changed = jobs[i];
                        break;
                    }
                }
                if (!changed) return null;
                writeJobs(jobs);
                renderChip(changed);
                refreshModalIfOpen(changed);
                const currentStatus = effectiveStatus(changed);
                if (
                    currentStatus !== previousStatus &&
                    isTerminal(changed.status)
                ) {
                    context.triggerHandler("terminal", [changed]);
                    if (isFailed(changed)) {
                        jQuery(".toast").toast("show", labels.failedToast);
                    }
                }
                return changed;
            };

            // removes a tracked job from the persisted store and from
            // the dom, used by the dismiss affordance and by the
            // external dismiss action so callers can imperatively
            // clear a chip without going through the chip ui
            const removeJob = function(id) {
                const jobs = readJobs().filter(function(job) {
                    return job.id !== id;
                });
                writeJobs(jobs);
                chipsContainer.children('[data-id="' + id + '"]').remove();
                if (chipsContainer.children().length === 0) {
                    context.removeClass("visible");
                }
            };

            // fetches the current status of a single job from the
            // colony-print server reusing the secret key stored at
            // enqueue time, dropping the chip when the entry has
            // been evicted from the in memory store (500 response)
            // and forwarding every interesting field onto updateJob
            const fetchStatus = async function(job) {
                try {
                    const response = await fetch(job.printUrl + "/jobs/" + job.id, {
                        headers: { "X-Secret-Key": job.key }
                    });
                    if (response.status === 500) {
                        removeJob(job.id);
                        return;
                    }
                    if (response.status !== 200) return;
                    const fresh = await response.json();
                    updateJob(job.id, {
                        status: fresh.status || job.status,
                        result: fresh.result !== undefined ? fresh.result : job.result,
                        printer: fresh.printer || job.printer,
                        node_id: fresh.node_id || job.node_id,
                        type: fresh.type || job.type,
                        format: fresh.format || job.format,
                        options:
                            fresh.options !== undefined ? fresh.options : job.options,
                        data_length:
                            fresh.data_length !== undefined
                                ? fresh.data_length
                                : job.data_length,
                        request_payload:
                            fresh.request_payload !== undefined
                                ? fresh.request_payload
                                : job.request_payload,
                        queued_time: fresh.queued_time || job.queued_time,
                        printing_time: fresh.printing_time || job.printing_time,
                        finish_time: fresh.finish_time || job.finish_time,
                        cancel_time: fresh.cancel_time || job.cancel_time
                    });
                } catch (err) {
                    // silently ignores polling errors so a flaky
                    // network never freezes the indicator, the next
                    // tick will retry the same job from scratch
                }
            };

            // starts the shared poll ticker if there are non terminal
            // jobs to follow, exiting early when one is already
            // running and stopping itself on the first tick that
            // finds no remaining active job
            const startPolling = function() {
                if (state.pollTimer !== null) return;
                state.pollTimer = setInterval(function() {
                    const jobs = readJobs();
                    const active = jobs.filter(function(job) {
                        return !isTerminal(job.status);
                    });
                    if (active.length === 0) {
                        clearInterval(state.pollTimer);
                        state.pollTimer = null;
                        return;
                    }
                    for (let i = 0; i < active.length; i++) fetchStatus(active[i]);
                }, POLL_INTERVAL);
            };

            // posts a cancel request for a queued job and applies the
            // resolved status returned by the server, silently
            // ignoring transport errors so the next poll tick can
            // reconcile state if the server eventually picks it up
            const cancelJob = async function(job) {
                try {
                    const response = await fetch(
                        job.printUrl + "/jobs/" + job.id + "/cancel",
                        {
                            method: "POST",
                            headers: { "X-Secret-Key": job.key }
                        }
                    );
                    if (response.status !== 200) return;
                    const fresh = await response.json();
                    updateJob(job.id, {
                        status: fresh.status || "cancelled",
                        cancel_time: fresh.cancel_time || Date.now() / 1000
                    });
                } catch (err) {
                    // silently ignores cancel errors so the chip
                    // stays visible and the next poll reconciles
                }
            };

            // revokes any cached blob urls created for the files tab
            // so the browser can release the underlying binary data
            // once the user closes the overlay or opens a different
            // job, avoiding indefinite memory growth across sessions
            const revokeBlobs = function() {
                for (let i = 0; i < state.blobUrls.length; i++) {
                    URL.revokeObjectURL(state.blobUrls[i]);
                }
                state.blobUrls = [];
            };

            // fetches a single file from a job's directory as a blob
            // and turns it into an object url so an img or video tag
            // can reference it directly without leaking the secret
            // key through a query parameter
            const fetchBlob = async function(job, name) {
                try {
                    const response = await fetch(
                        job.printUrl +
                            "/jobs/" +
                            job.id +
                            "/files/" +
                            encodeURIComponent(name),
                        { headers: { "X-Secret-Key": job.key } }
                    );
                    if (response.status !== 200) return null;
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    state.blobUrls.push(url);
                    return url;
                } catch (err) {
                    return null;
                }
            };

            // resolves the logs array stored under the nested
            // `result.data.logs` payload, returning an empty array
            // when the structure is missing or not iterable
            const resolveLogs = function(job) {
                const result = resultObject(job);
                if (!result) return [];
                const data = result.data;
                if (!data || typeof data !== "object") return [];
                return Array.isArray(data.logs) ? data.logs : [];
            };

            // resolves the duration value stored under the nested
            // `result.data.duration` payload, returning null when no
            // duration was reported by the printing handler
            const resolveDuration = function(job) {
                const result = resultObject(job);
                if (!result) return null;
                const data = result.data;
                if (!data || typeof data !== "object") return null;
                if (typeof data.duration !== "number") return null;
                return data.duration;
            };

            // renders the basic identity, status and timing rows of
            // the info tab using the same modal-spec dom structure
            // as the confirm engraving modal so the visual treatment
            // carries over without introducing a new pattern
            const renderInfoBasic = function(job) {
                const status = effectiveStatus(job);
                const statusHtml =
                    '<span class="modal-print-job-status modal-print-job-status-' +
                    status +
                    '">' +
                    escapeHtml(labels[status] || job.status) +
                    "</span>";
                let html = "";
                html += buildRow(labels.status, statusHtml);
                html += buildRow(labels.id, escapeHtml(job.id));
                if (job.name && job.name !== job.id) {
                    html += buildRow(labels.name, escapeHtml(job.name));
                }
                if (job.printer) {
                    html += buildRow(labels.printer, escapeHtml(job.printer));
                }
                if (job.node_id) {
                    html += buildRow(labels.node, escapeHtml(job.node_id));
                }
                if (job.type) html += buildRow(labels.type, escapeHtml(job.type));
                if (job.format) html += buildRow(labels.format, escapeHtml(job.format));
                if (job.data_length !== undefined && job.data_length !== null) {
                    html += buildRow(
                        labels.dataLength,
                        escapeHtml(formatSize(job.data_length))
                    );
                }
                if (job.queued_time) {
                    html += buildRow(
                        labels.queuedAt,
                        escapeHtml(formatTimestamp(job.queued_time))
                    );
                }
                if (job.printing_time) {
                    html += buildRow(
                        labels.printingAt,
                        escapeHtml(formatTimestamp(job.printing_time))
                    );
                }
                if (job.finish_time) {
                    html += buildRow(
                        labels.finishedAt,
                        escapeHtml(formatTimestamp(job.finish_time))
                    );
                }
                if (job.cancel_time) {
                    html += buildRow(
                        labels.cancelledAt,
                        escapeHtml(formatTimestamp(job.cancel_time))
                    );
                }
                if (job.queued_time) {
                    const now = Date.now() / 1000;
                    const end = job.finish_time || job.cancel_time || now;
                    html += buildRow(
                        labels.elapsed,
                        escapeHtml(formatElapsed(job.queued_time, end))
                    );
                }
                const duration = resolveDuration(job);
                if (duration !== null) {
                    html += buildRow(
                        labels.duration,
                        escapeHtml(formatDuration(duration))
                    );
                }
                infoSpecs.html(html);
            };

            // renders the options section of the info tab, hiding the
            // whole section when the job carries no options map so the
            // tab stays compact for the simple gravo style jobs
            const renderInfoOptions = function(job) {
                const map = job.options;
                if (!map || typeof map !== "object") {
                    infoOptionsSection.hide();
                    return;
                }
                const keys = Object.keys(map);
                if (keys.length === 0) {
                    infoOptionsSection.hide();
                    return;
                }
                let html = "";
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const value = map[key];
                    if (value === undefined || value === null) continue;
                    const display =
                        typeof value === "object" ? JSON.stringify(value) : String(value);
                    html += buildRow(key, escapeHtml(display));
                }
                infoOptions.html(html);
                infoOptionsSection.css("display", "");
            };

            // renders the scalar fields of the result payload on the
            // info tab, skipping the heavy keys that have their own
            // dedicated surface (the result and traceback tabs) so
            // the section stays focused on the operator summary
            const renderInfoResult = function(job) {
                const result = resultObject(job);
                if (!result) {
                    infoResultSection.hide();
                    return;
                }
                const keys = Object.keys(result);
                let html = "";
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    if (RESULT_SUMMARY_SKIP.indexOf(key) !== -1) continue;
                    const value = result[key];
                    if (value === undefined || value === null) continue;
                    const display =
                        typeof value === "object" ? JSON.stringify(value) : String(value);
                    html += buildRow(key, escapeHtml(display));
                }
                if (!html) {
                    infoResultSection.hide();
                    return;
                }
                infoResultSummary.html(html);
                infoResultSection.css("display", "");
            };

            // renders the collapsible logs section of the info tab,
            // populating the inner list with one row per log entry
            // (timestamp, severity tag, source, message) and hiding
            // the whole section when no logs are present
            const renderInfoLogs = function(job) {
                const entries = resolveLogs(job);
                if (entries.length === 0) {
                    infoLogsSection.hide();
                    return;
                }
                infoLogs.empty();
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    const row = jQuery('<div class="modal-print-job-log"></div>');
                    const time = jQuery(
                        '<span class="modal-print-job-log-time"></span>'
                    ).text(entry[0] || "");
                    const level = jQuery(
                        '<span class="modal-print-job-log-level modal-print-job-log-level-' +
                            logSeverityVariant(entry[2]) +
                            '"></span>'
                    ).text(entry[2] || "");
                    const source = jQuery(
                        '<span class="modal-print-job-log-source"></span>'
                    ).text(entry[1] || "");
                    const message = jQuery(
                        '<span class="modal-print-job-log-message"></span>'
                    ).text(entry[3] || "");
                    row.append(time);
                    row.append(level);
                    row.append(source);
                    row.append(message);
                    infoLogs.append(row);
                }
                applyLogsToggle();
                infoLogsSection.css("display", "");
            };

            // applies the current open / closed state of the logs
            // collapsible to the dom so the toggle label and the
            // logs list stay in sync after every render pass
            const applyLogsToggle = function() {
                const showLabel = infoLogsToggle.attr("data-show-label") || "Show Logs";
                const hideLabel = infoLogsToggle.attr("data-hide-label") || "Hide Logs";
                if (state.logsOpen) {
                    infoLogs.show();
                    infoLogsToggle.text(hideLabel);
                } else {
                    infoLogs.hide();
                    infoLogsToggle.text(showLabel);
                }
            };

            // composes the four info tab sub renderers in the order
            // they appear inside the info tab content, so each tab
            // refresh paints the same predictable layout
            const renderInfoTab = function(job) {
                renderInfoBasic(job);
                renderInfoOptions(job);
                renderInfoResult(job);
                renderInfoLogs(job);
            };

            // renders a single file tile inside the files grid,
            // dispatching the inline preview between image, video
            // and download link based on the file name extension
            const renderFilesTile = function(job, file) {
                const tile = jQuery('<div class="modal-print-job-files-tile"></div>');
                const preview = jQuery(
                    '<div class="modal-print-job-files-tile-preview"></div>'
                );
                const title = jQuery(
                    '<div class="modal-print-job-files-tile-name"></div>'
                ).text(file.name);
                const meta = jQuery(
                    '<div class="modal-print-job-files-tile-meta"></div>'
                ).text(formatSize(file.size));

                if (isImage(file.name)) {
                    const img = jQuery("<img />");
                    preview.append(img);
                    fetchBlob(job, file.name)
                        .then(function(url) {
                            if (url) img.attr("src", url);
                        })
                        .catch(function() {
                            // silently ignores blob fetch errors
                        });
                } else if (isVideo(file.name)) {
                    const video = jQuery("<video controls></video>");
                    preview.append(video);
                    fetchBlob(job, file.name)
                        .then(function(url) {
                            if (url) video.attr("src", url);
                        })
                        .catch(function() {
                            // silently ignores blob fetch errors
                        });
                } else {
                    const link = jQuery(
                        '<a class="modal-print-job-files-tile-download"></a>'
                    ).text(labels.download);
                    preview.append(link);
                    fetchBlob(job, file.name)
                        .then(function(url) {
                            if (url) {
                                link.attr("href", url);
                                link.attr("download", file.name);
                            }
                        })
                        .catch(function() {
                            // silently ignores blob fetch errors
                        });
                }

                tile.append(preview);
                tile.append(title);
                tile.append(meta);
                filesGrid.append(tile);
            };

            // renders the files tab content for the given job entry,
            // populating the grid with one tile per file exposed by
            // colony-print and falling back to a friendly empty state
            // when the job has not produced any files yet
            const renderFilesTab = async function(job) {
                revokeBlobs();
                filesGrid.empty();
                filesEmpty.hide();

                let files = null;
                try {
                    const response = await fetch(
                        job.printUrl + "/jobs/" + job.id + "/files",
                        { headers: { "X-Secret-Key": job.key } }
                    );
                    if (response.status === 200) files = await response.json();
                } catch (err) {
                    // falls through to the empty state below so the
                    // operator gets a friendly hint instead of an
                    // unhandled exception bubbling into the console
                }
                if (!files || files.length === 0) {
                    filesEmpty.text(labels.filesEmpty).show();
                    return;
                }
                for (let i = 0; i < files.length; i++) renderFilesTile(job, files[i]);
            };

            // renders the request tab with the original payload that
            // was sent to colony-print, falling back to a friendly
            // empty hint when the polling has not yet captured the
            // request body from the server
            const renderRequestTab = function(job) {
                const payload = job.request_payload;
                if (payload && Object.keys(payload).length > 0) {
                    requestPre.text(JSON.stringify(payload, null, 4));
                    requestPre.show();
                    requestEmpty.hide();
                } else {
                    requestPre.hide();
                    requestEmpty.text(labels.requestEmpty).show();
                }
            };

            // renders the result tab with the structured response
            // returned by the printing node, leaving the pre empty
            // when no object shaped result is available yet
            const renderResultTab = function(job) {
                const result = resultObject(job);
                resultPre.text(result ? JSON.stringify(result, null, 4) : "");
            };

            // renders the traceback tab with the diagnostic string
            // captured by the printing node when a job fails, kept
            // out of the info tab so the operator can focus on it
            // without scrolling past the summary rows
            const renderTracebackTab = function(job) {
                const result = resultObject(job);
                const traceback = result ? result.traceback : null;
                tracebackPre.text(typeof traceback === "string" ? traceback : "");
            };

            // returns true when the job carries a result object that
            // is worth exposing through the dedicated result tab,
            // skipping the literal "error" string shape and the
            // empty object case so the tab stays out of the way
            const hasResult = function(job) {
                const result = resultObject(job);
                return result !== null && Object.keys(result).length > 0;
            };

            // returns true when the job carries a non empty
            // traceback string nested under the result payload,
            // making the traceback tab worth showing
            const hasTraceback = function(job) {
                const result = resultObject(job);
                if (!result) return false;
                return (
                    typeof result.traceback === "string" && result.traceback.length > 0
                );
            };

            // toggles the visibility of the dynamic tab chips based
            // on the data carried by the given job, so the result
            // and traceback tabs only appear when the operator has
            // something to look at
            const updateTabVisibility = function(job) {
                modalTabs
                    .filter('[data-tab="result"]')
                    .css("display", hasResult(job) ? "" : "none");
                modalTabs
                    .filter('[data-tab="traceback"]')
                    .css("display", hasTraceback(job) ? "" : "none");
            };

            // resolves the currently visible tab key, falling back
            // to the info tab when the persisted selection points
            // at a tab that is currently hidden (typically result
            // or traceback before the underlying data lands)
            const activeTabKey = function() {
                const current = state.activeTab || "info";
                const tab = modalTabs.filter('[data-tab="' + current + '"]');
                if (tab.css("display") === "none") return "info";
                return current;
            };

            // applies the given tab key onto the overlay, swapping
            // the active chip and the visible content pane so the
            // info tab is shown while the others are hidden and
            // vice versa, matching the toggle behavior of settings
            const showTab = function(key) {
                state.activeTab = key;
                modalTabs.removeClass("active");
                modalTabs.filter('[data-tab="' + key + '"]').addClass("active");
                modalOverlay.find(".modal-print-job-tab-content").each(function() {
                    const content = jQuery(this);
                    const visible = content.attr("data-tab") === key;
                    content.css("display", visible ? "" : "none");
                });
            };

            // dispatches the render of the given tab to its dedicated
            // renderer, used both on the initial open and on every
            // polling refresh while the overlay stays on screen
            const renderTab = function(key, job) {
                if (key === "info") renderInfoTab(job);
                else if (key === "files") renderFilesTab(job);
                else if (key === "request") renderRequestTab(job);
                else if (key === "result") renderResultTab(job);
                else if (key === "traceback") renderTracebackTab(job);
            };

            // opens the overlay for the given job, updating the
            // dynamic tab visibility, picking the right active tab
            // and rendering its content with the latest data
            const openJob = function(job) {
                state.openJobId = job.id;
                modalTitle.text(job.name || job.id);
                updateTabVisibility(job);
                showTab(activeTabKey());
                renderTab(activeTabKey(), job);
                modalOverlay.modal("show");
            };

            // refreshes the overlay when the polling loop or the
            // cancel call patches the entry that is currently shown,
            // so the operator does not need to close and reopen the
            // overlay to see the latest status, elapsed time or
            // newly generated files
            const refreshModalIfOpen = function(job) {
                if (!modalOverlay.hasClass("visible")) return;
                if (state.openJobId !== job.id) return;
                modalTitle.text(job.name || job.id);
                updateTabVisibility(job);
                renderTab(activeTabKey(), job);
            };

            // registers a new job from a colony-print response,
            // persisting the entry, drawing its chip and starting
            // the shared poll ticker so the operator sees status
            // updates as the job progresses on the target node
            if (action === "enqueue") {
                const jobInfo = options.jobInfo;
                const entry = {
                    id: jobInfo.id,
                    name: jobInfo.name || jobInfo.id,
                    node_id: jobInfo.node_id,
                    printer: jobInfo.printer || null,
                    printUrl: options.printUrl,
                    key: options.key,
                    status: jobInfo.status || "queued",
                    result: jobInfo.result !== undefined ? jobInfo.result : null,
                    type: jobInfo.type || null,
                    format: jobInfo.format || null,
                    options: jobInfo.options || null,
                    data_length:
                        jobInfo.data_length !== undefined ? jobInfo.data_length : null,
                    request_payload: jobInfo.request_payload || null,
                    queued_time: jobInfo.queued_time || Date.now() / 1000,
                    printing_time: jobInfo.printing_time || null,
                    finish_time: jobInfo.finish_time || null,
                    cancel_time: jobInfo.cancel_time || null
                };
                const jobs = readJobs();
                jobs.push(entry);
                writeJobs(jobs);
                renderChip(entry);
                startPolling();
                return;
            }

            // imperatively removes a tracked job by id without going
            // through the chip ui, used by external callers that
            // already know the entry should disappear (for example
            // after a manual cleanup on the colony-print side)
            if (action === "dismiss") {
                removeJob(options.id);
                return;
            }

            // registers the click and overlay handlers on the bare
            // initialization path only, guarded by a flag on the
            // shared state so that subsequent enqueue and dismiss
            // calls never stack a second copy of the same listener
            // on the chips container or on the files overlay
            if (!state.bound) {
                state.bound = true;

                // cancel affordance on a queued chip
                chipsContainer.on("click", ".print-jobs-chip-cancel", function(event) {
                    event.stopPropagation();
                    const id = jQuery(this).closest(".print-jobs-chip").attr("data-id");
                    const job = findJob(id);
                    if (job) cancelJob(job);
                });

                // dismiss affordance on a terminal chip
                chipsContainer.on("click", ".print-jobs-chip-dismiss", function(event) {
                    event.stopPropagation();
                    const id = jQuery(this).closest(".print-jobs-chip").attr("data-id");
                    removeJob(id);
                });

                // chip body opens the overlay regardless of the
                // current status so the operator can inspect the
                // request payload and timings from the moment the
                // job is queued, not just after it ends
                chipsContainer.on("click", ".print-jobs-chip", function() {
                    const id = jQuery(this).attr("data-id");
                    const job = findJob(id);
                    if (job) openJob(job);
                });

                // tab strip click swaps the visible pane and
                // immediately renders it for the currently open
                // job, so a switch to files or traceback hits the
                // network only when the operator asks for it
                modalTabs.click(function() {
                    if (!state.openJobId) return;
                    const job = findJob(state.openJobId);
                    if (!job) return;
                    const key = jQuery(this).attr("data-tab");
                    showTab(key);
                    renderTab(key, job);
                });

                // logs collapsible toggle flips the open flag on
                // the shared state and applies the corresponding
                // label and visibility through a single helper
                infoLogsToggle.click(function(event) {
                    event.preventDefault();
                    state.logsOpen = !state.logsOpen;
                    applyLogsToggle();
                });

                // overlay dismiss revokes the cached blob urls and
                // clears the open job id so the polling refresh no
                // longer tries to paint a dom that just left the
                // screen, freeing memory between consecutive opens
                modalOverlay.on("transitionend", function() {
                    if (!modalOverlay.hasClass("visible")) {
                        revokeBlobs();
                        state.openJobId = null;
                    }
                });
            }

            // on plain initialization rehydrates the indicator from
            // the persisted store and resumes polling for any entry
            // that has not yet reached a terminal state
            renderAll();
            const persisted = readJobs();
            const hasActive = persisted.some(function(job) {
                return !isTerminal(job.status);
            });
            if (hasActive) startPolling();
        });

        return this;
    };
})(jQuery);
