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
        res.setHeader("Content-Type", "application/json");
        res.send(JSON.stringify({}));
    }
}

module.exports = {
    Inkscape: Inkscape
};
