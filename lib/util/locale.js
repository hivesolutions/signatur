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

const resolveLocale = locale => {
    if (locale === "en_us") return "";
    return Object.keys(localeM).includes(locale) ? locale : "";
};

module.exports = {
    localize: localize,
    resolveLocale: resolveLocale
};
