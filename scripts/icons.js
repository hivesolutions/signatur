const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const IMAGES = path.join(__dirname, "..", "static", "images");

const SIZES = [
    { name: "icon-512.png", size: 512 },
    { name: "icon-180.png", size: 180 },
    { name: "favicon-32.png", size: 32 }
];

const generate = async function() {
    const svg = fs.readFileSync(path.join(IMAGES, "icon.svg"));
    for (const entry of SIZES) {
        const output = path.join(IMAGES, entry.name);
        await sharp(svg).resize(entry.size, entry.size).png().toFile(output);
        console.log("Generated " + output + " (" + entry.size + "x" + entry.size + ")");
    }
};

generate();
