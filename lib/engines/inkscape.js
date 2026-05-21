const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const uuid = require("uuid");
const engine = require("./engine");

const FORMAT_MIME = {
    svg: "image/svg+xml",
    pdf: "application/pdf",
    hpgl: "vector/x-hpgl"
};

/**
 * Inkscape and pstoedit supported conversion engine that
 * uses process creation as a means to SVG to PDF to HPGL
 * conversion.
 *
 * This method is not considered efficient and should only
 * be used when no efficient in-process conversion methods
 * exist.
 */
class Inkscape extends engine.Engine {
    async init() {}

    async destroy() {}

    async info(req, res, next) {
        res.setHeader("Content-Type", "application/json");
        res.send(
            JSON.stringify({
                name: "inkscape",
                description: "Engine that uses both Inkscape and pstoedit for conversion"
            })
        );
    }

    async convert(req, res, next) {
        const format = req.query.format || "hpgl";
        const svgBase64 = req.body.svg_base64;
        const identifier = uuid.v4();
        let buffer = null;
        try {
            buffer = await this._pipeline(identifier, format, svgBase64);
        } finally {
            this._cleanup(identifier);
        }
        res.setHeader("Content-Type", FORMAT_MIME[format]);
        res.setHeader("Content-Disposition", `attachment; filename=${this._filename()}.${format}`);
        res.send(buffer);
    }

    async _pipeline(identifier, format, svgBase64) {
        const svgBuffer = Buffer.from(svgBase64, "base64");
        await this._writeSvg(identifier, svgBuffer);
        const steps = this._pipelineSteps(identifier, format);
        for (const step of steps) {
            await this._tryProcess(step.alternatives);
        }
        let buffer = null;
        const file = await fs.promises.open(`${identifier}.${format}`, "r");
        try {
            buffer = await file.readFile();
        } finally {
            await file.close();
        }
        return buffer;
    }

    async _writeSvg(identifier, svgBuffer) {
        const svgFile = await fs.promises.open(`${identifier}.svg`, "w+");
        try {
            await svgFile.write(svgBuffer);
        } finally {
            await svgFile.close();
        }
    }

    _pipelineSteps(identifier, format) {
        const svgPath = path.resolve(`${identifier}.svg`);
        const pdfPath = path.resolve(`${identifier}.pdf`);
        const psPath = path.resolve(`${identifier}.ps`);
        const hpglPath = path.resolve(`${identifier}.hpgl`);
        const steps = [];
        if (["pdf", "hpgl"].includes(format)) {
            steps.push({
                name: "inkscape",
                output: pdfPath,
                alternatives: [
                    ["inkscape", [svgPath, `--export-pdf=${pdfPath}`]],
                    ["inkscape", [svgPath, `--export-filename=${pdfPath}`]]
                ]
            });
        }
        if (["hpgl"].includes(format)) {
            steps.push({
                name: "ghostscript",
                output: psPath,
                alternatives: [
                    [
                        "gs",
                        [
                            "-q",
                            "-dNOPAUSE",
                            "-dBATCH",
                            "-sDEVICE=ps2write",
                            `-sOutputFile=${psPath}`,
                            pdfPath
                        ]
                    ]
                ]
            });
            steps.push({
                name: "pstoedit",
                output: hpglPath,
                alternatives: [["pstoedit", ["-dt", "-f", "hpgl", psPath, hpglPath]]]
            });
        }
        return steps;
    }

    async probe() {
        return await Promise.all([
            this._probeTool("inkscape", ["--version"]),
            this._probeTool("gs", ["--version"]),
            this._probeTool("pstoedit", ["-help"])
        ]);
    }

    async diagnose(svgBuffer) {
        const identifier = uuid.v4();
        const steps = this._pipelineSteps(identifier, "hpgl");
        const report = [];
        report.push({
            name: "fixture",
            status: "ok",
            outputBytes: svgBuffer.length,
            durationMs: 0
        });
        try {
            await this._writeSvg(identifier, svgBuffer);
            for (const step of steps) {
                const result = await this._diagnoseStep(step);
                report.push(result);
                if (result.status !== "ok") break;
            }
        } finally {
            await this._cleanup(identifier);
        }
        return report;
    }

    _probeTool(name, args) {
        return new Promise(resolve => {
            const started = Date.now();
            let stdout = "";
            let stderr = "";
            let resolved = false;
            const settle = payload => {
                if (resolved) return;
                resolved = true;
                resolve(payload);
            };
            let child = null;
            try {
                child = childProcess.spawn(name, args);
            } catch (err) {
                settle({
                    tool: name,
                    command: `${name} ${args.join(" ")}`,
                    found: false,
                    version: "",
                    error: err.message,
                    durationMs: 0
                });
                return;
            }
            child.stdout.on("data", chunk => {
                stdout += chunk.toString();
            });
            child.stderr.on("data", chunk => {
                stderr += chunk.toString();
            });
            child.on("error", err => {
                settle({
                    tool: name,
                    command: `${name} ${args.join(" ")}`,
                    found: false,
                    version: "",
                    error: err.message,
                    durationMs: Date.now() - started
                });
            });
            child.on("close", code => {
                const banner = stderr.split(/\r?\n/).find(line => line.includes(name + ":")) || "";
                const versionLine = [stdout, stderr]
                    .join("\n")
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .find(line => /(?:^|[^\d])\d+\.\d+/.test(line));
                const version = (banner || versionLine || "").trim();
                const ok = Boolean(version) && (code === 0 || /\d+\.\d+/.test(version));
                settle({
                    tool: name,
                    command: `${name} ${args.join(" ")}`,
                    found: true,
                    version: version,
                    exitCode: code,
                    error: ok ? "" : `exit ${code}`,
                    durationMs: Date.now() - started
                });
            });
        });
    }

    async _diagnoseStep(step) {
        const started = Date.now();
        let lastError = null;
        let lastStderr = "";
        let lastCommand = "";
        let lastExitCode = null;
        for (const [name, args] of step.alternatives) {
            const attempt = await this._spawnCapture(name, args);
            lastCommand = `${name} ${args.join(" ")}`;
            lastStderr = attempt.stderr;
            lastExitCode = attempt.exitCode;
            lastError = attempt.error;
            if (!attempt.error && attempt.exitCode === 0) break;
        }
        let outputBytes = 0;
        try {
            const stats = await fs.promises.stat(step.output);
            outputBytes = stats.size;
        } catch (err) {}
        const ok = !lastError && lastExitCode === 0 && outputBytes > 0;
        return {
            name: step.name,
            command: lastCommand,
            status: ok ? "ok" : "error",
            exitCode: lastExitCode,
            stderr: lastStderr.slice(-2000),
            outputBytes: outputBytes,
            durationMs: Date.now() - started
        };
    }

    _spawnCapture(name, args) {
        return new Promise(resolve => {
            let stderr = "";
            let resolved = false;
            const settle = payload => {
                if (resolved) return;
                resolved = true;
                resolve(payload);
            };
            let child = null;
            try {
                child = childProcess.spawn(name, args);
            } catch (err) {
                settle({ stderr: "", exitCode: null, error: err.message });
                return;
            }
            child.stderr.on("data", chunk => {
                stderr += chunk.toString();
            });
            child.on("error", err => {
                settle({ stderr: stderr, exitCode: null, error: err.message });
            });
            child.on("close", code => {
                settle({ stderr: stderr, exitCode: code, error: null });
            });
        });
    }

    async _cleanup(identifier) {
        for (const name of [
            `${identifier}.svg`,
            `${identifier}.pdf`,
            `${identifier}.ps`,
            `${identifier}.hpgl`
        ]) {
            try {
                await fs.promises.unlink(path.resolve(name));
            } catch (err) {}
        }
    }

    /**
     * Tries to run multiple process description alternatives until one of them
     * succeeds, in all of them fails an exception is thrown.
     *
     * @param {Array} alternatives The sequence of alternative process names and
     * arguments to be used in execution tentative.
     * @returns {Object} The process information for the process correctly executed
     * (if any).
     */
    async _tryProcess(alternatives) {
        for (const alternative of alternatives) {
            try {
                const process = await this._executeProcess(...alternative);
                return process;
            } catch (err) {
                continue;
            }
        }
        throw new Error("Not possible to execute any process alternative");
    }

    async _executeProcess(name, args = [], pipe = false) {
        const options = {};
        if (pipe) options.stdio = "inherit";
        const process = childProcess.spawn(name, args, options);
        await new Promise(function(resolve, reject) {
            process.on("error", err => {
                reject(new Error(`Failed to start '${name}' process: ${err}`));
            });
            process.on("close", code => {
                code === 0
                    ? resolve()
                    : reject(new Error(`Unexpected status code '${code}' running '${name}'`));
            });
        });
        return process;
    }

    _filename() {
        const dateObj = new Date();
        const year = String(dateObj.getUTCFullYear()).padStart(2, "0");
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getUTCDate()).padStart(2, "0");
        const hours = String(dateObj.getUTCHours()).padStart(2, "0");
        const minutes = String(dateObj.getUTCMinutes()).padStart(2, "0");
        return `${year}-${month}-${day}_${hours}-${minutes}`;
    }
}

module.exports = {
    Inkscape: Inkscape
};
