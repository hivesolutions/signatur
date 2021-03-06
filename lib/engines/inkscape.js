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
        const svgFile = await fs.promises.open(`${identifier}.svg`, "w+");
        try {
            await svgFile.write(svgBuffer);
        } finally {
            await svgFile.close();
        }
        if (["pdf", "hpgl"].includes(format)) {
            await this._tryProcess([
                [
                    "inkscape",
                    [
                        path.resolve(`${identifier}.svg`),
                        `--export-pdf=${path.resolve(`${identifier}.pdf`)}`
                    ]
                ],
                [
                    "inkscape",
                    [
                        path.resolve(`${identifier}.svg`),
                        `--export-filename=${path.resolve(`${identifier}.pdf`)}`
                    ]
                ]
            ]);
        }
        if (["hpgl"].includes(format)) {
            await this._executeProcess("pstoedit", [
                "-dt",
                "-f",
                "hpgl",
                path.resolve(`${identifier}.pdf`),
                path.resolve(`${identifier}.hpgl`)
            ]);
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

    async _cleanup(identifier) {
        for (const name of [`${identifier}.svg`, `${identifier}.pdf`, `${identifier}.hpgl`]) {
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
