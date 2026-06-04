(function(jQuery) {
    /**
     * Print jobs indicator plugin that displays one chip per
     * engraving job submitted to colony-print, polling the server
     * every 5 seconds for status updates and exposing the artefacts
     * (screenshots, videos, raw files) produced by each finished
     * job through a dedicated overlay.
     *
     * Operates on a .print-jobs element and discovers its children
     * (.print-jobs-chips, .modal-overlay-print-files) by class name
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

        // returns true when the job ended on a printing error
        // detected by a "finished" status carrying an "error" result
        // payload, since colony-print signals failures through the
        // result field rather than a dedicated status value
        const isFailed = function(job) {
            return job.status === "finished" && job.result === "error";
        };

        // resolves the effective status key for label and styling
        // lookups, mapping a failed job onto the "failed" key so the
        // chip styling and the tooltip diverge from a successful
        // finished outcome
        const effectiveStatus = function(job) {
            if (isFailed(job)) return "failed";
            return job.status;
        };

        // formats the elapsed time between two unix timestamps in
        // seconds as a compact human readable string (e.g. "12s",
        // "3m 14s", "1h 02m") for the chip tooltip
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
        // using KB and MB thresholds so the modal tiles can surface
        // the file size next to the name without overflowing
        const formatSize = function(size) {
            if (size < 1024) return size + " B";
            if (size < 1024 * 1024) return Math.round(size / 1024) + " KB";
            return (size / (1024 * 1024)).toFixed(1) + " MB";
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
            const modalOverlay = jQuery(".modal-overlay-print-files");
            const modalGrid = jQuery(".modal-print-files-grid", modalOverlay);
            const modalEmpty = jQuery(".modal-print-files-empty", modalOverlay);
            const modalTitle = jQuery(".modal-print-files-title", modalOverlay);

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
                failedToast:
                    context.attr("data-label-failed-toast") || "Engraving job failed.",
                filesEmpty:
                    context.attr("data-label-files-empty") || "No files generated.",
                download: context.attr("data-label-download") || "Download"
            };

            // tracks the blob urls created for the files modal so
            // they can be revoked when the overlay is closed and the
            // browser releases the binary data instead of holding it
            // for the rest of the session
            let activeBlobUrls = [];

            // shared timer id so we never run more than one ticker
            // even when several enqueue calls land in quick succession
            let pollTimer = null;

            // builds the multi line tooltip text rendered through the
            // chip title attribute, surfacing the status, printer,
            // node and elapsed time the operator needs to identify a
            // job at a glance
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
                    const spinner = jQuery('<span class="print-jobs-chip-spinner"></span>');
                    chip.append(spinner);
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

                if (existing.length > 0) {
                    existing.replaceWith(chip);
                } else {
                    chipsContainer.append(chip);
                }

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
                for (let i = 0; i < jobs.length; i++) {
                    renderChip(jobs[i]);
                }
                context.addClass("visible");
            };

            // merges the given patch onto the persisted entry that
            // matches the provided id, redraws the chip in place and
            // emits a one shot terminal event when the transition
            // crosses the terminal boundary so the failed toast and
            // any downstream listener fire exactly once per job
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
            // enqueue time so the polling tick does not depend on
            // any global header configuration
            const fetchStatus = async function(job) {
                try {
                    const response = await fetch(job.printUrl + "/jobs/" + job.id, {
                        headers: { "X-Secret-Key": job.key }
                    });
                    if (response.status !== 200) return;
                    const fresh = await response.json();
                    updateJob(job.id, {
                        status: fresh.status || job.status,
                        result: fresh.result !== undefined ? fresh.result : job.result,
                        printer: fresh.printer || job.printer,
                        node_id: fresh.node_id || job.node_id,
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
                if (pollTimer !== null) return;
                pollTimer = setInterval(function() {
                    const jobs = readJobs();
                    const active = jobs.filter(function(job) {
                        return !isTerminal(job.status);
                    });
                    if (active.length === 0) {
                        clearInterval(pollTimer);
                        pollTimer = null;
                        return;
                    }
                    for (let i = 0; i < active.length; i++) {
                        fetchStatus(active[i]);
                    }
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

            // revokes any cached blob urls created for the files
            // modal so the browser can release the underlying binary
            // data once the user closes the overlay or opens a new
            // job, avoiding indefinite memory growth across sessions
            const revokeBlobs = function() {
                for (let i = 0; i < activeBlobUrls.length; i++) {
                    URL.revokeObjectURL(activeBlobUrls[i]);
                }
                activeBlobUrls = [];
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
                    activeBlobUrls.push(url);
                    return url;
                } catch (err) {
                    return null;
                }
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

            // opens the files overlay for the given terminal job
            // populating the grid with thumbnails for images, an
            // inline player for video and download links for any
            // other binary file exposed by colony-print
            const openFiles = async function(job) {
                revokeBlobs();
                modalGrid.empty();
                modalEmpty.hide();
                modalTitle.text(job.name || job.id);
                modalOverlay.modal("show");

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
                    modalEmpty.text(labels.filesEmpty).show();
                    return;
                }

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const tile = jQuery('<div class="modal-print-files-tile"></div>');
                    const preview = jQuery(
                        '<div class="modal-print-files-tile-preview"></div>'
                    );
                    const title = jQuery(
                        '<div class="modal-print-files-tile-name"></div>'
                    );
                    const meta = jQuery(
                        '<div class="modal-print-files-tile-meta"></div>'
                    );
                    title.text(file.name);
                    meta.text(formatSize(file.size));

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
                            '<a class="modal-print-files-tile-download"></a>'
                        );
                        link.text(labels.download);
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
                    modalGrid.append(tile);
                }
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

            // registers for the click on the cancel affordance of a
            // queued chip, stopping propagation so the parent chip
            // click handler does not also open the files overlay
            chipsContainer.on("click", ".print-jobs-chip-cancel", function(event) {
                event.stopPropagation();
                const id = jQuery(this).closest(".print-jobs-chip").attr("data-id");
                const job = findJob(id);
                if (job) cancelJob(job);
            });

            // registers for the click on the dismiss affordance of a
            // terminal chip, removing the entry from the indicator
            // and from the persisted store without touching the
            // remote job that produced it
            chipsContainer.on("click", ".print-jobs-chip-dismiss", function(event) {
                event.stopPropagation();
                const id = jQuery(this).closest(".print-jobs-chip").attr("data-id");
                removeJob(id);
            });

            // registers for the click on the chip body, opening the
            // files overlay only for entries that have reached a
            // terminal state so the operator never lands on an empty
            // listing for a job that is still printing
            chipsContainer.on("click", ".print-jobs-chip", function() {
                const id = jQuery(this).attr("data-id");
                const job = findJob(id);
                if (job && isTerminal(job.status)) openFiles(job);
            });

            // revokes the cached blob urls when the files overlay
            // finishes its dismiss transition so the binary data is
            // released from memory between consecutive openings
            modalOverlay.on("transitionend", function() {
                if (!modalOverlay.hasClass("visible")) revokeBlobs();
            });

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
                    result: jobInfo.result || null,
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
