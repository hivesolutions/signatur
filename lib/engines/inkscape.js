const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const engine = require("./engine");

const FORMAT_MIME = {
    svg: "image/svg+xml",
    pdf: "application/pdf",
    hpgl: "vector/x-hpgl"
};

class Inkscape extends engine.Engine {
    async init() {}

    async destroy() {}

    async info(req, res, next) {
        res.setHeader("Content-Type", "application/json");
        res.send(
            JSON.stringify({
                name: "inkscape"
            })
        );
    }

    async convert(req, res, next) {
        const format = req.query.format || "hpgl";
        const svgBase64 = req.body.svg_base64;
        const svgBuffer = Buffer.from(svgBase64, "base64");
        const svgFile = await fs.promises.open("temp.svg", "w+");
        try {
            await svgFile.write(svgBuffer);
        } finally {
            await svgFile.close();
        }
        if (["pdf", "hpgl"].includes(format)) {
            const inkscape = childProcess.spawn("inkscape", [
                path.resolve("temp.svg"),
                `--export-pdf=${path.resolve("temp.pdf")}`
            ]);
            await new Promise(function(resolve, reject) {
                inkscape.on("close", code => {
                    resolve();
                });
            });
        }
        if (["hpgl"].includes(format)) {
            const pstoedit = childProcess.spawn("pstoedit", [
                "-dt",
                "-f",
                "hpgl:",
                path.resolve("temp.pdf"),
                path.resolve("temp.hpgl")
            ]);
            await new Promise(function(resolve, reject) {
                pstoedit.on("close", code => {
                    resolve();
                });
            });
        }
        let buffer = null;
        const file = await fs.promises.open(`temp.${format}`, "r");
        try {
            buffer = await file.readFile();
        } finally {
            await file.close();
        }
        for (const name of ["temp.svg", "temp.pdf", "temp.hpgl"]) {
            try {
                await fs.promises.unlink(path.resolve(name));
            } catch (err) {}
        }
        res.setHeader("Content-Type", FORMAT_MIME[format]);
        res.setHeader("Content-Disposition", `attachment; filename=${this._filename()}.${format}`);
        res.send(buffer);
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
