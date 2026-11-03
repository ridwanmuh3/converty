import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

/**
 * Draws the app icon without an image library: a blue rounded square with a
 * white down arrow. Kept as a script so the committed PNGs are reproducible.
 */
const OUT = join(process.cwd(), 'static', 'icons');
const PRIMARY = [26, 111, 224];

function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function png(size, pixels) {
	const stride = size * 4 + 1;
	const raw = Buffer.alloc(stride * size);
	for (let y = 0; y < size; y += 1) {
		raw[y * stride] = 0;
		for (let x = 0; x < size; x += 1) {
			const [r, g, b, a] = pixels(x, y);
			const offset = y * stride + 1 + x * 4;
			raw[offset] = r;
			raw[offset + 1] = g;
			raw[offset + 2] = b;
			raw[offset + 3] = a;
		}
	}
	const chunk = (type, data) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8;
	header[9] = 6;
	return Buffer.concat([
		Buffer.from('89504e470d0a1a0a', 'hex'),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

/** Signed distance to a rounded rectangle, in pixels. */
function insideRounded(x, y, size, radius, inset) {
	const left = inset;
	const right = size - inset;
	const top = inset;
	const bottom = size - inset;
	const dx = Math.max(left + radius - x, 0, x - (right - radius));
	const dy = Math.max(top + radius - y, 0, y - (bottom - radius));
	if (x < left || x > right || y < top || y > bottom) return false;
	return dx * dx + dy * dy <= radius * radius;
}

function drawIcon(size, maskable) {
	// Maskable icons keep their content inside the safe zone (80% circle).
	const inset = maskable ? Math.round(size * 0.1) : 0;
	const radius = maskable ? size * 0.18 : size * 0.22;
	return png(size, (x, y) => {
		if (!insideRounded(x, y, size, radius, inset)) return [0, 0, 0, 0];
		const cx = size / 2;
		// Shaft of the arrow.
		const shaftWidth = size * 0.1;
		const shaftTop = size * 0.26;
		const shaftBottom = size * 0.55;
		if (Math.abs(x - cx) <= shaftWidth && y >= shaftTop && y <= shaftBottom) {
			return [255, 255, 255, 255];
		}
		// Head of the arrow: a downward triangle.
		const headTop = size * 0.5;
		const headBottom = size * 0.72;
		if (y >= headTop && y <= headBottom) {
			const half = ((headBottom - y) / (headBottom - headTop)) * size * 0.22;
			if (Math.abs(x - cx) <= half) return [255, 255, 255, 255];
		}
		return [...PRIMARY, 255];
	});
}

await mkdir(OUT, { recursive: true });
for (const size of [192, 512]) {
	await writeFile(join(OUT, `icon-${size}.png`), drawIcon(size, false));
	await writeFile(join(OUT, `icon-maskable-${size}.png`), drawIcon(size, true));
}
await writeFile(join(OUT, 'favicon-192.png'), drawIcon(192, false));
console.log('icons written to', OUT);
