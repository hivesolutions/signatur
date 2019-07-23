const engine = require("./engine");

class Inkscape extends engine.Engine {
    async init() {}

    async destroy() {}

    async convert(req, res, next) {
        res.setHeader("Content-Type", "application/json");
        res.send(
            JSON.stringify({})
        );
    }
}

module.exports = {
    Inkscape: Inkscape
};
