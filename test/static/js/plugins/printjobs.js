const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const STATIC_PATH = path.resolve(__dirname, "..", "..", "..", "..", "static", "js");
const SCRIPTS = ["plugins/modal.js", "plugins/printjobs.js", "plugins/toast.js"];

// colony print base URL and secret key the engraving jobs are
// tracked against, the server every status poll is sent to
const PRINT_URL = "http://localhost:8080";
const PRINT_KEY = "secret";

// result posted by colony print for an engraving job whose machine
// was not found by the engraving software, with its error code and
// the duration of the job until the error
const MACHINE_NOT_FOUND = {
    result: "error",
    error: "Machine not found after 30.0 seconds (A procurar a máquina ...)",
    error_code: "machine_not_found",
    traceback: "gravo_pilot.errors.MachineNotFound: Machine not found",
    data: { duration: 68, files: [] }
};

// result posted by colony print for an engraving job that failed for
// any other reason, an error that has no code of its own
const FIELD_ERROR = {
    result: "error",
    error: "Could not focus the depth field",
    traceback: "gravo_pilot.errors.GravoPilotException: Could not focus",
    data: { duration: 20, files: [] }
};

// result posted by colony print for an engraving job that was sent
// to the machine once the engraving software found it
const SUCCESS = {
    result: "success",
    handler: "gravo",
    data: { duration: 45, files: [] }
};

describe("PrintJobs", function() {
    let window = null;
    let jQuery = null;
    let container = null;
    let overlay = null;
    let tick = null;
    let served = null;
    let terminals = null;

    // initializes the indicator with the given labels of the locale,
    // as rendered by the viewport view, and registers a job printing
    // on the engrave node, the way the confirm modal does once colony
    // print accepts the job
    const enqueue = function(attributes) {
        container.attr(attributes || {});
        container.printjobs();
        container.printjobs("enqueue", {
            jobInfo: { id: "job", node_id: "engraver", status: "printing", queued_time: 1000 },
            printUrl: PRINT_URL,
            key: PRINT_KEY
        });
    };

    // serves the given state of the job to the next status poll and
    // runs a tick of the poll, resolving once the chip is updated
    const poll = async function(fresh) {
        served = Object.assign({ node_id: "engraver" }, fresh);
        tick();
        await new Promise(resolve => window.setTimeout(resolve, 0));
    };

    // polls the job until colony print reports it as finished with
    // the given result, at the given time, as the node posts it
    const finish = async function(result) {
        await poll({
            status: "finished",
            result: result,
            queued_time: 1000,
            printing_time: 1002,
            finish_time: 1070
        });
    };

    // returns the chip of the job tracked by the indicator
    const chip = function() {
        return container.find('.print-jobs-chip[data-id="job"]');
    };

    // returns the lines of the tooltip of the chip of the job, in the
    // order the operator reads them
    const tooltip = function() {
        return chip()
            .attr("title")
            .split("\n");
    };

    // returns the text and the visibility of the toast, the message
    // shown to the operator at the bottom of the viewport
    const toast = function() {
        const element = jQuery(".toast");
        return element.hasClass("visible") ? element.text() : null;
    };

    // opens the overlay of the job by clicking its chip, as the
    // operator does to inspect the job
    const open = function() {
        chip().click();
    };

    // returns the labels of the rows of the info tab of the overlay,
    // in the order the operator reads them
    const labels = function() {
        return overlay
            .find(".modal-print-job-specs .modal-spec-label")
            .map(function() {
                return jQuery(this).text();
            })
            .get();
    };

    // returns the value listed on the info tab of the overlay for the
    // row with the given label, null when there is none
    const listed = function(label) {
        const index = labels().indexOf(label);
        if (index === -1) return null;
        return overlay
            .find(".modal-print-job-specs .modal-spec-value")
            .eq(index)
            .text();
    };

    beforeEach(function() {
        const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
            url: "http://localhost/viewport",
            runScripts: "outside-only"
        });
        window = dom.window;
        jQuery = require("jquery")(window);

        // keeps the poll ticker of the indicator so that each test runs
        // its ticks on demand, instead of waiting for its interval
        tick = null;
        window.setInterval = function(callback) {
            tick = callback;
            return 1;
        };
        window.clearInterval = function() {
            tick = null;
        };

        // serves the state of the job to the status polls of every job
        // and fails every other request, as there is no server behind
        // the document
        window.fetch = function(url, options) {
            const match = url.match(/^http:\/\/localhost:8080\/jobs\/([^/]+)$/);
            if (match) {
                assert.strictEqual(options.headers["X-Secret-Key"], PRINT_KEY);
                const fresh = Object.assign({}, served, { id: match[1] });
                return Promise.resolve({ status: 200, json: () => Promise.resolve(fresh) });
            }
            return Promise.resolve({ status: 404 });
        };

        const context = dom.getInternalVMContext();
        for (const script of SCRIPTS) {
            const filePath = path.join(STATIC_PATH, script);
            const code = fs.readFileSync(filePath, "utf8");
            new vm.Script(code, { filename: filePath }).runInContext(context);
        }

        // mounts the indicator, its overlay and the toast with the same
        // class names as the viewport view, with only the info tab
        const body = jQuery("body");
        container = jQuery('<div class="print-jobs"></div>').appendTo(body);
        container.append('<div class="print-jobs-chips"></div>');
        overlay = jQuery('<div class="modal-overlay modal-overlay-print-job"></div>');
        overlay.append('<div class="modal-print-job-title"></div>');
        overlay.append('<span class="modal-print-job-tab active" data-tab="info"></span>');
        const info = jQuery('<div class="modal-print-job-tab-content" data-tab="info"></div>');
        info.append('<div class="modal-specs modal-print-job-specs"></div>');
        info.appendTo(overlay);
        overlay.appendTo(body);
        body.append('<div class="toast"></div>');
        overlay.modal();
        terminals = [];
        container.on("terminal", function(event, job) {
            terminals.push(job);
        });
    });

    afterEach(function() {
        window.close();
    });

    describe("#errorCode()", function() {
        it("should give the reason of the machine not found to its code", async () => {
            enqueue();
            await finish(MACHINE_NOT_FOUND);
            assert.strictEqual(tooltip()[1], "Reason: Machine not found");
        });

        it("should give the generic reason to an error without code", async () => {
            enqueue();
            await finish(FIELD_ERROR);
            assert.strictEqual(tooltip()[1], "Reason: Engraving error");
        });

        it("should give the generic reason to an unknown code", async () => {
            enqueue();
            await finish(Object.assign({}, FIELD_ERROR, { error_code: "head_crash" }));
            assert.strictEqual(tooltip()[1], "Reason: Engraving error");
        });

        it("should give the generic reason to a code that is not a string", async () => {
            enqueue();
            await finish(Object.assign({}, MACHINE_NOT_FOUND, { error_code: 7 }));
            assert.strictEqual(tooltip()[1], "Reason: Engraving error");
        });

        it("should give the generic reason to an error result without details", async () => {
            enqueue();
            await finish("error");
            assert.strictEqual(chip().hasClass("print-jobs-chip-failed"), true);
            assert.strictEqual(tooltip()[1], "Reason: Engraving error");
        });

        it("should ignore the code of a job that did not fail", async () => {
            enqueue();
            await finish(Object.assign({}, SUCCESS, { error_code: "machine_not_found" }));
            assert.strictEqual(tooltip()[0], "Finished");
            assert.strictEqual(chip().attr("title").indexOf("Reason"), -1);
        });
    });

    describe("#buildTooltip()", function() {
        it("should list the reason right after the status", async () => {
            enqueue();
            await finish(MACHINE_NOT_FOUND);
            assert.deepStrictEqual(tooltip(), [
                "Not completed",
                "Reason: Machine not found",
                "Node: engraver",
                "Elapsed: 1m 10s"
            ]);
        });

        it("should list no reason while the node searches for the machine", async () => {
            enqueue();
            await poll({ status: "printing", result: null });
            assert.deepStrictEqual(tooltip().slice(0, 2), ["Printing", "Node: engraver"]);
        });

        it("should list no reason for a finished job", async () => {
            enqueue();
            await finish(SUCCESS);
            assert.deepStrictEqual(tooltip(), ["Finished", "Node: engraver", "Elapsed: 1m 10s"]);
        });

        it("should list the reason with the labels of the locale", async () => {
            enqueue({
                "data-label-failed": "Não concluído",
                "data-label-reason": "Motivo",
                "data-label-reason-machine": "Máquina não encontrada",
                "data-label-reason-error": "Erro na gravação",
                "data-label-node": "Nó"
            });
            await finish(MACHINE_NOT_FOUND);
            assert.deepStrictEqual(tooltip().slice(0, 3), [
                "Não concluído",
                "Motivo: Máquina não encontrada",
                "Nó: engraver"
            ]);
        });
    });

    describe("#renderChip()", function() {
        it("should label a failed job as not completed", async () => {
            enqueue();
            await finish(MACHINE_NOT_FOUND);
            assert.strictEqual(chip().hasClass("print-jobs-chip-failed"), true);
            assert.strictEqual(chip().find(".print-jobs-chip-label").text(), "Not completed");
            assert.strictEqual(chip().find(".print-jobs-chip-spinner").length, 0);
            assert.strictEqual(chip().find(".print-jobs-chip-dismiss").length, 1);
        });

        it("should label a failed job with the label of the locale", async () => {
            enqueue({ "data-label-failed": "Não concluído" });
            await finish(FIELD_ERROR);
            assert.strictEqual(chip().find(".print-jobs-chip-label").text(), "Não concluído");
        });

        it("should keep the printing label while the node searches for the machine", async () => {
            enqueue();
            await poll({ status: "printing", result: null });
            assert.strictEqual(chip().hasClass("print-jobs-chip-printing"), true);
            assert.strictEqual(chip().find(".print-jobs-chip-label").text(), "Printing");
            assert.strictEqual(chip().find(".print-jobs-chip-spinner").length, 1);
        });

        it("should label a job sent to the machine as finished", async () => {
            enqueue();
            await finish(SUCCESS);
            assert.strictEqual(chip().hasClass("print-jobs-chip-finished"), true);
            assert.strictEqual(chip().find(".print-jobs-chip-label").text(), "Finished");
        });
    });

    describe("#updateJob()", function() {
        it("should show the machine toast when the machine is not found", async () => {
            enqueue();
            await finish(MACHINE_NOT_FOUND);
            assert.strictEqual(
                toast(),
                "The machine was not found. Check that it is switched on and that the USB cable is plugged in, then send it again."
            );
            assert.strictEqual(terminals.length, 1);
            assert.strictEqual(terminals[0].result.error_code, "machine_not_found");
        });

        it("should show the machine toast of the locale", async () => {
            enqueue({
                "data-label-machine-toast":
                    "A máquina não foi encontrada. Verifique se está ligada e se o cabo USB está ligado, e envie novamente."
            });
            await finish(MACHINE_NOT_FOUND);
            assert.strictEqual(
                toast(),
                "A máquina não foi encontrada. Verifique se está ligada e se o cabo USB está ligado, e envie novamente."
            );
        });

        it("should show the failed toast for the other errors", async () => {
            enqueue();
            await finish(FIELD_ERROR);
            assert.strictEqual(toast(), "Engraving job failed.");
        });

        it("should show no toast while the node searches for the machine", async () => {
            enqueue();
            await poll({ status: "printing", result: null });
            assert.strictEqual(toast(), null);
            assert.strictEqual(terminals.length, 0);
        });

        it("should show no toast when the job is sent to the machine", async () => {
            enqueue();
            await finish(SUCCESS);
            assert.strictEqual(toast(), null);
            assert.strictEqual(terminals.length, 1);
        });

        it("should show the toast of every job that fails", async () => {
            enqueue();
            await finish(MACHINE_NOT_FOUND);
            jQuery(".toast").removeClass("visible");
            container.printjobs("enqueue", {
                jobInfo: { id: "other", node_id: "engraver", status: "printing" },
                printUrl: PRINT_URL,
                key: PRINT_KEY
            });
            await finish(FIELD_ERROR);
            assert.strictEqual(toast(), "Engraving job failed.");
            assert.deepStrictEqual(
                terminals.map(job => job.id),
                ["job", "other"]
            );
        });

        it("should show no toast for a failed job restored on reload", async () => {
            window.localStorage.setItem(
                "print_jobs",
                JSON.stringify([
                    {
                        id: "job",
                        node_id: "engraver",
                        status: "finished",
                        result: MACHINE_NOT_FOUND,
                        queued_time: 1000,
                        finish_time: 1070
                    }
                ])
            );
            container.printjobs();
            assert.strictEqual(chip().find(".print-jobs-chip-label").text(), "Not completed");
            assert.strictEqual(tooltip()[1], "Reason: Machine not found");
            assert.strictEqual(toast(), null);
            assert.strictEqual(tick, null);
        });
    });

    describe("#renderInfoBasic()", function() {
        it("should list the reason right after the status", async () => {
            enqueue();
            await finish(MACHINE_NOT_FOUND);
            open();
            assert.deepStrictEqual(labels().slice(0, 3), ["Status", "Reason", "Job"]);
            assert.strictEqual(listed("Status"), "Not completed");
            assert.strictEqual(listed("Reason"), "Machine not found");
        });

        it("should list the generic reason of the other errors", async () => {
            enqueue();
            await finish(FIELD_ERROR);
            open();
            assert.strictEqual(listed("Reason"), "Engraving error");
        });

        it("should list the end time of a failed job as ended at", async () => {
            enqueue();
            await finish(MACHINE_NOT_FOUND);
            open();
            assert.notStrictEqual(listed("Ended at"), null);
            assert.strictEqual(listed("Finished at"), null);
        });

        it("should list the end time of a finished job as finished at", async () => {
            enqueue();
            await finish(SUCCESS);
            open();
            assert.notStrictEqual(listed("Finished at"), null);
            assert.strictEqual(listed("Ended at"), null);
            assert.strictEqual(listed("Reason"), null);
        });

        it("should list the end time with the label of the locale", async () => {
            enqueue({
                "data-label-failed-at": "Terminado em",
                "data-label-finished-at": "Concluído em"
            });
            await finish(MACHINE_NOT_FOUND);
            open();
            assert.notStrictEqual(listed("Terminado em"), null);
            assert.strictEqual(listed("Concluído em"), null);
        });

        it("should list the reason as plain text", async () => {
            enqueue({ "data-label-reason-machine": "<b>Máquina</b> não encontrada" });
            await finish(MACHINE_NOT_FOUND);
            open();
            assert.strictEqual(listed("Reason"), "<b>Máquina</b> não encontrada");
            assert.strictEqual(overlay.find(".modal-spec-value b").length, 0);
        });

        it("should list the reason once the open job fails", async () => {
            enqueue();
            await poll({ status: "printing", result: null });
            open();
            assert.strictEqual(listed("Reason"), null);
            await finish(MACHINE_NOT_FOUND);
            assert.strictEqual(listed("Status"), "Not completed");
            assert.strictEqual(listed("Reason"), "Machine not found");
        });
    });
});
