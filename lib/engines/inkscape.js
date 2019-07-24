const fs = require("fs");
const engine = require("./engine");

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
        console.info(req.body.svg_base64);
        const svgBase64 = req.body.svg_base64;
        const svgBuffer = Buffer.from(svgBase64, "base64");
        const file = await fs.promises.open("temp.svg", "w+");
        try {
            await file.write(svgBuffer);
        } finally {
            await file.close();
        }
        res.setHeader("Content-Type", "image/svg+xml");
        res.send(svgBuffer);
    }
}

module.exports = {
    Inkscape: Inkscape
};
