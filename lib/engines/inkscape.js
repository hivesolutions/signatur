const engine = require("./engine");

class Inkscape extends engine.Engine {
    async init() {}

    async destroy() {}

    async convert(req, res, next) {
        //@todo should convert the provided SVG into a proper version
        // of the file using the inkscape
        res.setHeader("Content-Type", "application/json");
        res.send(
            JSON.stringify({})
        );
    }
}

module.exports = {
    Inkscape: Inkscape
};
