const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const uuidv4 = require("uuid/v4");
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
        const identifier = uuidv4();
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
            const inkscape = childProcess.spawn("inkscape", [
                path.resolve(`${identifier}.svg`),
                `--export-pdf=${path.resolve(`${identifier}.pdf`)}`
            ]);
            await new Promise(function(resolve, reject) {
                inkscape.on("error", err => {
                    reject(new Error(`Failed to start subprocess. ${err}`));
                });
                inkscape.on("close", code => {
                    code === 0 ? resolve() : reject(new Error("Unexpected status code"));
                });
            });
        }
        if (["hpgl"].includes(format)) {
            const pstoedit = childProcess.spawn("pstoedit", [
                "-dt",
                "-f",
                "hpgl:",
                path.resolve(`${identifier}.pdf`),
                path.resolve(`${identifier}.hpgl`)
            ]);

            await new Promise(function(resolve, reject) {
                pstoedit.on("error", err => {
                    reject(new Error(`Failed to start subprocess. ${err}`));
                });
                pstoedit.on("close", code => {
                    code === 0 ? resolve() : reject(new Error("Unexpected status code"));
                });
            });
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

    _filename() {
        const dateObj = new Date();
        const month = dateObj.getUTCMonth() + 1;
        const day = dateObj.getUTCDate();
        const year = dateObj.getUTCFullYear();
        return year + "/" + month + "/" + day;
    }
}

module.exports = {
    Inkscape: Inkscape
};
