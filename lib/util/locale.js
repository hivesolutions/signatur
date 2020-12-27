const enUs = require("../../res/json/en_us.json");
const ptPt = require("../../res/json/pt_pt.json");

const localeM = {
    en_us: enUs,
    pt_pt: ptPt
};

const localize = (value, locale = "en_us", fallback = null) => {
    if (fallback === null) fallback = value;
    return localeM[locale][value] || fallback;
};

module.exports = {
    localize: localize
};
