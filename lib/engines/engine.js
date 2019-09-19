const errors = require("../util/errors");

class Engine {
    static singleton() {
        if (this._engine) {
            return this._engine;
        }
        this._engine = new this();
        return this._engine;
    }

    async init() {
        throw new errors.NotImplementedError();
    }

    async destroy() {
        throw new errors.NotImplementedError();
    }

    async info(req, res, next) {
        throw new errors.NotImplementedError();
    }

    async convert(req, res, next) {
        throw new errors.NotImplementedError();
    }
}

module.exports = {
    Engine: Engine
};
