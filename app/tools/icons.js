#!/usr/bin/env node
/**
 * Sinh biểu tượng PNG cho PWA (Android, iOS) – không phụ thuộc thư viện ngoài (chỉ zlib của Node).
 * Hình: nền màu thương hiệu, chữ "Q" trắng (vòng tròn + đuôi), nằm trong vùng an toàn 80% để dùng được làm maskable.
 *   node tools/icons.js  ->  frontend/icons/icon-192.png, icon-512.png, apple-touch-icon.png (180)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'frontend', 'icons');
const BRAND = [0x0f, 0x5c, 0x4a], WHITE = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Độ phủ (0..1) của chữ Q tại điểm (x,y) trong hệ tọa độ đơn vị [0,1]; khử răng cưa bằng lấy mẫu 4x4. */
function coverage(px, py, size) {
  let hit = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const x = (px + (sx + 0.5) / 4) / size, y = (py + (sy + 0.5) / 4) / size;
    const dx = x - 0.5, dy = y - 0.47, r = Math.hypot(dx, dy);
    const ring = r <= 0.24 && r >= 0.155;
    // Đuôi chữ Q: dải chéo từ trong vòng ra góc dưới phải
    const t = ((x - 0.56) + (y - 0.56)) / 2, d = Math.abs((x - 0.56) - (y - 0.56)) / Math.SQRT2;
    const tail = t >= 0 && t <= 0.13 && d <= 0.045;
    if (ring || tail) hit++;
  }
  return hit / 16;
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;                               // bộ lọc: none
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, size), o = y * (size * 3 + 1) + 1 + x * 3;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BRAND[c] * (1 - a) + WHITE[c] * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(OUT, name), png(size));
  console.log('icons: frontend/icons/' + name + ' (' + size + 'x' + size + ')');
}
