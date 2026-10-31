const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "assets", "mas-logo-mark.png");
const outputPath = path.join(root, "assets", "mas-logo-mark-square.png");

const source = PNG.sync.read(fs.readFileSync(sourcePath));
const size = Math.max(source.width, source.height);
const output = new PNG({ width: size, height: size });
output.data.fill(255);

const offsetX = Math.floor((size - source.width) / 2);
const offsetY = Math.floor((size - source.height) / 2);
for (let y = 0; y < source.height; y += 1) {
  for (let x = 0; x < source.width; x += 1) {
    const from = (y * source.width + x) * 4;
    const to = ((y + offsetY) * size + (x + offsetX)) * 4;
    const alpha = source.data[from + 3] / 255;
    output.data[to] = Math.round(source.data[from] * alpha + 255 * (1 - alpha));
    output.data[to + 1] = Math.round(source.data[from + 1] * alpha + 255 * (1 - alpha));
    output.data[to + 2] = Math.round(source.data[from + 2] * alpha + 255 * (1 - alpha));
    output.data[to + 3] = 255;
  }
}

fs.writeFileSync(outputPath, PNG.sync.write(output));
console.log(`Prepared square MAS launcher artwork: ${size}x${size}`);
