import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { unzipSync } from 'fflate';
import { startServer } from './serve.mjs';

process.env.TMPDIR = '/tmp';
const paths = (process.env.BASE_PATH ?? '/converty').replace(/\/+$/, '');
const BASE = `http://localhost:4173${paths}`;
const FIXTURES = join(process.cwd(), 'test', 'fixtures');
const OUT = join(process.cwd(), 'test', 'out');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/chromium-browser';

await mkdir(OUT, { recursive: true });

const results = [];
const check = (name, condition, detail = '') => {
	results.push({ name, ok: Boolean(condition), detail });
	if (!condition) console.log(`FAIL  ${name} ${detail}`);
	else console.log(`ok    ${name}`);
};

const signature = async (path, length = 12) =>
	(await readFile(path)).subarray(0, length).toString('latin1');

/** Per-item detail: font sizes, positions and the page MediaBox, for fidelity checks. */
async function pdfDetail(path) {
	const loadingTask = getDocument({
		data: new Uint8Array(await readFile(path)),
		standardFontDataUrl: join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/'),
		useSystemFonts: false,
		disableFontFace: true,
		verbosity: 0
	});
	const doc = await loadingTask.promise;
	const pages = [];
	for (let page = 1; page <= doc.numPages; page += 1) {
		const p = await doc.getPage(page);
		const viewport = p.getViewport({ scale: 1 });
		const content = await p.getTextContent();
		const items = content.items
			.filter((item) => 'str' in item && item.str)
			.map((item) => ({
				str: item.str,
				size: item.transform[3] || item.height,
				x: item.transform[4]
			}));
		pages.push({ width: viewport.width, height: viewport.height, items });
		p.cleanup();
	}
	await loadingTask.destroy();
	return pages;
}

async function pdfText(path) {
	const loadingTask = getDocument({
		data: new Uint8Array(await readFile(path)),
		standardFontDataUrl: join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/'),
		useSystemFonts: false,
		disableFontFace: true,
		verbosity: 0
	});
	const doc = await loadingTask.promise;
	let text = '';
	for (let page = 1; page <= doc.numPages; page += 1) {
		const content = await (await doc.getPage(page)).getTextContent();
		text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
	}
	await loadingTask.destroy();
	// PDF text items arrive per token, including whitespace-only runs; collapse them
	// so content assertions are not sensitive to how the writer split a line.
	return text.replace(/\s+/g, ' ').trim();
}

const server = await startServer(4173);
const browser = await chromium.launch({
	executablePath: CHROME,
	args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });

// Count worker construction so the suite can prove conversions left the UI thread.
await context.addInitScript(() => {
	window.__workerCount = 0;
	const Native = window.Worker;
	window.Worker = class extends Native {
		constructor(url, options) {
			super(url, options);
			window.__workerCount += 1;
		}
	};
});

const consoleErrors = [];
const nonGetRequests = [];
const requestsWithBody = [];

const page = await context.newPage();
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
	if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
});
page.on('request', (request) => {
	if (request.method() !== 'GET') nonGetRequests.push(`${request.method()} ${request.url()}`);
	if (request.postData()) requestsWithBody.push(`${request.method()} ${request.url()}`);
});

async function addFiles(files) {
	await page.setInputFiles('input[type=file]', files);
}

async function convert(slug, files, countLabel, optionValues = {}) {
	await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' });
	await page.waitForSelector('h1');
	for (const [key, value] of Object.entries(optionValues)) {
		const field = page.locator(`#option-${key}`);
		const tag = await field.evaluate((element) => element.tagName);
		if (tag === 'SELECT') await page.selectOption(`#option-${key}`, value);
		else await field.fill(value);
	}
	await addFiles(files);

	const button = page.getByRole('button', { name: new RegExp(`Convert ${countLabel}`) });
	await button.waitFor({ state: 'visible', timeout: 15_000 });
	await page.waitForFunction(
		() => !document.querySelector('button.btn-primary')?.hasAttribute('disabled')
	);
	await button.click();

	// The queue never auto-downloads; the user picks files individually or zips the batch.
	await page.waitForSelector('.alert-success', { timeout: 120_000 });
	const downloadButton = page.locator('button[aria-label^="Download "]').first();
	await downloadButton.waitFor({ state: 'visible', timeout: 30_000 });

	const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
	await downloadButton.click();
	const download = await downloadPromise;
	const target = join(OUT, `${slug}-${download.suggestedFilename()}`);
	await download.saveAs(target);
	return target;
}

/* ---------- 1. Image ---------- */
/* ---------- Audio: WAV, MP3 and MPEG audio ---------- */
{
	const mp3 = await convert('audio-converter', join(FIXTURES, 'tone.wav'), '1 file');
	const bytes = await readFile(mp3);
	check('audio: WAV to MP3 has MPEG audio frames', mp3.endsWith('.mp3') && (bytes[0] === 0xff || bytes.toString('ascii', 0, 3) === 'ID3'));
	// Checked before the next navigation: the marker lives on this page instance.
	const mp3Path = await page.evaluate(() => window.__mp3EncodePath ?? 'none');
	check('perf: MP3 encoding ran in a worker', mp3Path === 'worker', mp3Path);
	const mpeg = join(OUT, 'tone.mpeg');
	await copyFile(mp3, mpeg);
	const wav = await convert('audio-converter', mpeg, '1 file', { format: 'wav' });
	const head = await readFile(wav);
	check('audio: MPEG audio to WAV has PCM header', wav.endsWith('.wav') && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE' && head.readUInt16LE(20) === 1);
	const again = await convert('audio-converter', mp3, '1 file', { format: 'wav' });
	check('audio: MP3 input decodes', (await signature(again, 4)) === 'RIFF');
	check('audio: result shows a waveform', (await page.locator('svg[aria-label^="Waveform"]').count()) > 0);
}

/* ---------- Mobile file actions ---------- */
{
	await page.setViewportSize({ width: 320, height: 800 });
	await page.goto(`${BASE}/audio-converter`, { waitUntil: 'networkidle' });
	// The audio block above chose WAV; per-tool options are remembered across visits.
	await page.getByRole('button', { name: 'Customize' }).waitFor({ timeout: 15_000 });
	check('mobile: options start collapsed', (await page.locator('#option-format').count()) === 0);
	await page.getByRole('button', { name: 'Customize' }).click();
	check('mobile: tool options persist across visits', (await page.locator('#option-format').inputValue()) === 'wav');
	await page.getByRole('button', { name: 'Reset options' }).click();
	check('mobile: reset options restores the default', (await page.locator('#option-format').inputValue()) === 'mp3');
	await page.getByRole('button', { name: 'Hide options' }).click();
	check('mobile: options collapse again', (await page.locator('#option-format').count()) === 0);
	await addFiles(join(FIXTURES, 'tone.wav'));
	check('mobile: queued file does not overflow', await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
	await page.locator('button[data-convert]:visible').click();
	await page.locator('.alert-success').waitFor();
	check('mobile: download label stays visible', await page.getByRole('button', { name: 'Download tone.mp3' }).getByText('Download').isVisible());
	await page.waitForFunction(
		() => /\b\d+:\d{2}\b/.test(document.querySelector('section ul > li')?.innerText ?? ''),
		null,
		{ timeout: 10_000 }
	);
	check(
		'mobile: an audio result shows its duration',
		/\b\d+:\d{2}\b/.test(await page.locator('section ul > li').first().innerText())
	);
	check('mobile: completed batch hides empty Convert action', await page.locator('button.btn-primary').count() === 0);
	check('mobile: audio picker omits PDF limit', !(await page.locator('.dropzone').innerText()).includes('PDFs up to'));
	// Focus follows the result, without stealing focus mid-conversion.
	check(
		'mobile: focus moves to the result summary',
		await page.evaluate(() => document.activeElement?.classList.contains('alert-success') ?? false)
	);
	await page.setViewportSize({ width: 1280, height: 900 });
}

/* ---------- Universal drop entry ---------- */
{
	const home = async () => {
		await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	};
	const drop = async (files) => {
		await page.locator('.dropzone input[type=file]').setInputFiles(files);
	};
	const waitForSlug = (slug) =>
		page.waitForFunction((value) => location.pathname.replace(/\/$/, '').endsWith(value), slug, {
			timeout: 15_000
		});
	const queuedCount = () => page.locator('section ul > li').count();

	// An image has several real outputs (PNG, JPEG, WebP, PDF), so it asks once.
	await home();
	await drop(join(FIXTURES, 'pixel.png'));
	await page.getByRole('dialog').waitFor({ timeout: 15_000 });
	check(
		'universal: an image offers every output',
		(await page.getByRole('button', { name: /Convert to PNG/ }).count()) === 1 &&
			(await page.getByRole('button', { name: /Convert to JPEG/ }).count()) === 1 &&
			(await page.getByRole('button', { name: /Convert to WebP/ }).count()) === 1 &&
			(await page.getByRole('button', { name: /Convert to PDF/ }).count()) === 1
	);
	await page.getByRole('button', { name: /Convert to PNG/ }).click();
	await waitForSlug('/image-converter');
	await page.locator('section ul > li').first().waitFor({ timeout: 15_000 });
	check('universal: choosing PNG opens the image tool', page.url().includes('/image-converter'));
	check('universal: the file lands queued', (await queuedCount()) === 1);
	check(
		'universal: the drop never auto-starts',
		(await page.locator('.alert-success').count()) === 0 &&
			(await page.getByRole('button', { name: /^Convert/ }).count()) === 1
	);
	check(
		'universal: Convert has focus',
		await page.evaluate(() => document.activeElement?.textContent?.includes('Convert') ?? false)
	);

	// .xlsx is a ZIP internally; the extension must still pick the Excel tool.
	await home();
	await drop(join(FIXTURES, 'data.xlsx'));
	await waitForSlug('/excel-to-pdf');
	await page.locator('section ul > li').first().waitFor({ timeout: 15_000 });
	check('universal: a spreadsheet opens the Excel tool', page.url().includes('/excel-to-pdf'));

	// A PDF can become DOCX or JPG, so the chooser has to appear.
	await home();
	await drop(join(FIXTURES, 'report.pdf'));
	await page.getByRole('dialog').waitFor({ timeout: 15_000 });
	check(
		'universal: a PDF offers DOCX and JPG',
		(await page.getByRole('button', { name: /Convert to DOCX/ }).count()) === 1 &&
			(await page.getByRole('button', { name: /Convert to JPG/ }).count()) === 1
	);
	await page.getByRole('button', { name: /Convert to JPG/ }).click();
	await waitForSlug('/pdf-to-jpg');
	await page.locator('section ul > li').first().waitFor({ timeout: 15_000 });
	check('universal: choosing an output opens that tool', (await queuedCount()) === 1);
	check('universal: home stays the only place with a hero drop zone', (await page.locator('.dropzone').count()) === 1);

	// Unsupported files are explained, never silently ignored.
	await home();
	await drop({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a converter input') });
	await page.getByRole('alert').waitFor({ timeout: 15_000 });
	check(
		'universal: an unsupported file is explained',
		(await page.getByRole('alert').innerText()).includes('not recognized')
	);
	check('universal: an unsupported file stays on the home page', !page.url().includes('/image-'));

	// A mixed drop keeps the valid file usable and reports the rest.
	await home();
	await drop([
		{
			name: 'tone.wav',
			mimeType: 'audio/wav',
			buffer: await readFile(join(FIXTURES, 'tone.wav'))
		},
		{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('still not an input') }
	]);
	await page.getByRole('dialog').waitFor({ timeout: 15_000 });
	check(
		'universal: a mixed drop reports the refused file',
		(await page.getByRole('alert').innerText()).includes('not recognized')
	);
	check(
		'universal: a mixed drop keeps the valid file available',
		(await page.getByRole('button', { name: /Convert to MP3/ }).count()) === 1
	);
	await page.getByRole('button', { name: 'Cancel' }).click();

	// Separate file types become separate groups; the rest wait, not vanish.
	await home();
	await drop([join(FIXTURES, 'pixel.png'), join(FIXTURES, 'report.pdf')]);
	await page.getByRole('dialog').waitFor({ timeout: 15_000 });
	check(
		'universal: two file types make two groups',
		(await page.getByText('need different converters').count()) === 1
	);
	await page.getByRole('button', { name: /Convert to PNG/ }).click();
	await waitForSlug('/image-converter');
	await page.getByText(/needs? a different converter/).waitFor({ timeout: 15_000 });
	check(
		'universal: the other group waits instead of vanishing',
		(await page.getByText(/needs? a different converter/).count()) === 1
	);
	await page.getByRole('link', { name: 'Choose for the rest' }).click();
	await page.waitForFunction(() => location.pathname.replace(/\/$/, '').endsWith('/converty'), null, {
		timeout: 15_000
	});
	await page.getByRole('dialog').waitFor({ timeout: 15_000 });
	check(
		'universal: the waiting group comes back on the home page',
		(await page.getByRole('button', { name: /Convert to DOCX/ }).count()) === 1
	);
	await page.getByRole('button', { name: 'Cancel' }).click();

	// Dropping on a tool page adds to that tool instead of navigating away.
	await page.goto(`${BASE}/image-converter`, { waitUntil: 'networkidle' });
	await page.evaluate(() => {
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(
			new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'dropped.png', {
				type: 'image/png'
			})
		);
		window.dispatchEvent(new DragEvent('dragenter', { dataTransfer }));
	});
	await page.waitForFunction(() => document.body.innerText.includes('Drop files anywhere'), null, {
		timeout: 5_000
	});
	check('universal: dragging anywhere shows an overlay', true);
	await page.evaluate(() => {
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(
			new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'dropped.png', {
				type: 'image/png'
			})
		);
		window.dispatchEvent(new DragEvent('drop', { dataTransfer }));
	});
	await page.waitForFunction(() => document.querySelectorAll('section ul > li').length === 1, null, {
		timeout: 15_000
	});
	check('universal: a compatible drop joins the current tool', page.url().includes('/image-converter'));
}

/* ---------- 1. Image ---------- */
{
	const file = await convert('image-converter', join(FIXTURES, 'pixel.png'), '1 file');
	check('image: yields a PNG', (await signature(file, 8)).includes('PNG'), file);
	check('image: filename keeps .png', file.endsWith('.png'), file);

	const largest = await page.evaluate(() =>
		Math.max(...performance.getEntriesByType('resource').map((entry) => entry.encodedBodySize))
	);
	check('perf: image tool never downloads the PDF engine', largest < 200_000, `${largest} bytes`);
}

/* ---------- 1b. Image format → format ---------- */
{
	const jpeg = await convert('image-converter', join(FIXTURES, 'pixel.png'), '1 file', {
		format: 'jpeg'
	});
	check('image: outputs JPEG', (await signature(jpeg, 3)) === '\xFF\xD8\xFF', jpeg);
	check('image: JPEG filename', jpeg.endsWith('.jpg'), jpeg);

	const webp = await convert('image-converter', join(FIXTURES, 'pixel.png'), '1 file', {
		format: 'webp'
	});
	const webpHead = await signature(webp, 12);
	check('image: outputs WebP', webpHead.startsWith('RIFF') && webpHead.endsWith('WEBP'), webp);
	check('image: WebP filename', webp.endsWith('.webp'), webp);
}

/* ---------- 2. Word to PDF: layout fidelity against the DOCX itself ---------- */
{
	const file = await convert('word-to-pdf', join(FIXTURES, 'letter.docx'), '1 file');
	check('word→pdf: yields a PDF', (await signature(file, 5)) === '%PDF-', file);
	const text = await pdfText(file);
	const pages = await pdfDetail(file);

	check('word→pdf: keeps heading text', text.includes('Project update'));
	check('word→pdf: keeps table cells', text.includes('Design') && text.includes('Done'));

	// Geometry comes from the document's own sectPr (A4: 595.28 × 841.89 pt).
	check(
		'word→pdf: page size matches the document sectPr',
		Math.abs(pages[0].width - 595.28) < 1 && Math.abs(pages[0].height - 841.89) < 1,
		`${pages[0].width} × ${pages[0].height} pt`
	);

	// Left margin = 1440 twips = 72 pt; the heading must start there.
	const heading = pages[0].items.find((item) => item.str.includes('Project update'));
	check(
		'word→pdf: text starts at the document margin (72pt)',
		heading && Math.abs(heading.x - 72) <= 4,
		`x=${heading?.x}`
	);

	// Heading run is 16pt in the fixture; body runs are 11pt.
	const body = pages[0].items.find((item) => item.str.includes('paragraph with'));
	check(
		'word→pdf: heading font larger than body font',
		heading && body && heading.size > body.size + 2,
		`heading=${heading?.size}pt body=${body?.size}pt`
	);

	// Document header (right-aligned italic) and footer PAGE/NUMPAGES fields.
	check('word→pdf: renders the document header', text.includes('Confidential draft'));
	check('word→pdf: renders footer PAGE field', /Page \d+ of \d+/.test(text), text.slice(-60));
	check(
		'word→pdf: no injected page markers the document did not ask for',
		!/\d+\s*\/\s*\d+/.test(text),
		text.slice(-60)
	);

	// The first page is rendered only after a click, so no PDF engine is loaded early.
	await page.getByRole('button', { name: 'Preview first page' }).click();
	await page.waitForSelector('img[alt^="First page of"]', { timeout: 20_000 });
	check('word→pdf: previews the first page on demand', await page.locator('img[alt^="First page of"]').isVisible());
}

/* ---------- 3. Excel to PDF ---------- */
{
	const file = await convert('excel-to-pdf', join(FIXTURES, 'data.xlsx'), '1 file');
	check('excel→pdf: yields a PDF', (await signature(file, 5)) === '%PDF-', file);
	const text = await pdfText(file);
	check('excel→pdf: keeps sheet name', text.includes('Sales'));
	check('excel→pdf: keeps values', text.includes('Notebook') && text.includes('1260'));
	const workers = await page.evaluate(() => window.__workerCount ?? 0);
	check('perf: excel→pdf conversion ran in a worker', workers > 0, `${workers} worker(s)`);
	const fallbacks = await page.evaluate(() => window.__workerFallbacks ?? 0);
	check('perf: excel→pdf never fell back to the main thread', fallbacks === 0, `${fallbacks} fallback(s)`);
	check('excel→pdf: reports the page count', (await page.locator('text=/\\d+ pages?/').count()) > 0);
}

/* ---------- 4. PDF to Word ---------- */
{
	const file = await convert('pdf-to-word', join(FIXTURES, 'report.pdf'), '1 file');
	const zip = unzipSync(new Uint8Array(await readFile(file)));
	const xml = zip['word/document.xml'] ? new TextDecoder().decode(zip['word/document.xml']) : '';
	check('pdf→word: valid docx zip', Object.keys(zip).includes('word/document.xml'), file);
	check('pdf→word: keeps first-page text', xml.includes('Quarterly'));
	check('pdf→word: keeps second-page text', xml.includes('Second') && xml.includes('page'));
	check('pdf→word: table is editable cells', /<w:tbl[ >]/.test(xml) && /<w:tc[ >][\s\S]*?North[\s\S]*?<\/w:tc>/.test(xml));
	check('pdf→word: keeps PDF page size', (xml.match(/<w:pgSz w:w="11906" w:h="16838"/g) ?? []).length === 2);
	check('pdf→word: keeps heading sizes', /<w:sz w:val="36"\/>[\s\S]*?Quarterly report/.test(xml) && /<w:sz w:val="28"\/>[\s\S]*?Method notes/.test(xml));
	check('pdf→word: keeps page break', (xml.match(/<w:sectPr/g) ?? []).length === 2);
	const workers = await page.evaluate(() => window.__workerCount ?? 0);
	check('perf: pdf→word conversion ran in a worker', workers > 0, `${workers} worker(s)`);
	const fallbacks = await page.evaluate(() => window.__workerFallbacks ?? 0);
	check('perf: pdf→word never fell back to the main thread', fallbacks === 0, `${fallbacks} fallback(s)`);
}

/* ---------- 5. Image ↔ PDF and worker execution ---------- */
{
	const file = await convert('jpg-to-pdf', join(FIXTURES, 'photo.jpg'), '1 file');
	check('jpg→pdf: yields a PDF', (await signature(file, 5)) === '%PDF-', file);
	const workers = await page.evaluate(() => window.__workerCount ?? 0);
	check('perf: image conversion ran in a worker', workers > 0, `${workers} worker(s)`);
}

{
	const file = await convert('image-to-pdf', join(FIXTURES, 'pixel.png'), '1 file', {
		mode: 'single'
	});
	check('image→pdf: yields a PDF', (await signature(file, 5)) === '%PDF-', file);
}

/* ---------- 5a. Combine images, merge and split PDFs ---------- */
async function convertCombined(slug, files, countLabel, optionValues = {}) {
	await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' });
	await page.waitForSelector('h1');
	for (const [key, value] of Object.entries(optionValues)) {
		await page.selectOption(`#option-${key}`, value);
	}
	await addFiles(files);
	const button = page.getByRole('button', { name: new RegExp(`Convert ${countLabel}`) });
	await button.waitFor({ state: 'visible', timeout: 15_000 });
	await page.waitForFunction(
		() => !document.querySelector('button.btn-primary')?.hasAttribute('disabled')
	);
	await button.click();
	await page.waitForSelector('.alert-success', { timeout: 120_000 });
	const download = page.getByRole('button', { name: /^Download .+\.pdf$/ });
	await download.waitFor({ state: 'visible', timeout: 60_000 });
	const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
	await download.click();
	const saved = await downloadPromise;
	const target = join(OUT, `${slug}-${saved.suggestedFilename()}`);
	await saved.saveAs(target);
	return target;
}

{
	const file = await convertCombined(
		'image-to-pdf',
		[join(FIXTURES, 'wide.png'), join(FIXTURES, 'tall.png')],
		'2 files',
		{ mode: 'combined' }
	);
	check('combine: yields one PDF', (await signature(file, 5)) === '%PDF-', file);
	const pages = await pdfDetail(file);
	check('combine: one page per image', pages.length === 2, `${pages.length} pages`);
	check(
		'combine: pages follow list order and auto-orientation',
		pages[0].width > pages[0].height && pages[1].height > pages[1].width,
		`${Math.round(pages[0].width)}×${Math.round(pages[0].height)} then ${Math.round(pages[1].width)}×${Math.round(pages[1].height)}`
	);
	check('combine: rows show the page order', (await page.getByRole('group', { name: /Order of/ }).count()) === 2);
}

{
	// Reorder with the keyboard/button path, then rebuild the combined PDF.
	await page.getByRole('button', { name: 'Move tall.png up' }).click();
	await page.getByRole('button', { name: 'Re-run with new settings' }).click();
	const download = page.getByRole('button', { name: /^Download .+\.pdf$/ });
	// The old combined file is cleared when the re-run starts; wait for the new one.
	await download.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
	await download.waitFor({ state: 'visible', timeout: 60_000 });
	const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
	await download.click();
	const saved = await downloadPromise;
	const target = join(OUT, 'image-to-pdf-reordered.pdf');
	await saved.saveAs(target);
	const pages = await pdfDetail(target);
	check(
		'combine: reordering changes page order',
		pages[0].height > pages[0].width && pages[1].width > pages[1].height,
		`${Math.round(pages[0].width)}×${Math.round(pages[0].height)} then ${Math.round(pages[1].width)}×${Math.round(pages[1].height)}`
	);
}

{
	// Merge requires two files: Convert stays disabled with one.
	await page.goto(`${BASE}/merge-pdf`, { waitUntil: 'networkidle' });
	await addFiles(join(FIXTURES, 'report.pdf'));
	await page.waitForSelector('button[data-convert]');
	check(
		'merge: one file is not enough',
		await page.locator('button[data-convert]').first().isDisabled()
	);

	const file = await convertCombined(
		'merge-pdf',
		[join(FIXTURES, 'report.pdf'), join(FIXTURES, 'scan.pdf')],
		'2 files'
	);
	check('merge: yields one PDF', (await signature(file, 5)) === '%PDF-', file);
	const pages = await pdfDetail(file);
	check('merge: page count is the sum of inputs', pages.length === 3, `${pages.length} pages`);
	const text = await pdfText(file);
	check('merge: keeps the first document first', text.includes('Quarterly report'));
}

{
	const zipFile = await convert('split-pdf', join(FIXTURES, 'report.pdf'), '1 file', {
		mode: 'every'
	});
	check('split: every page is a ZIP', zipFile.endsWith('.zip'), zipFile);
	const entries = Object.keys(unzipSync(new Uint8Array(await readFile(zipFile)))).sort();
	check('split: one PDF per page', entries.length === 2, entries.join(','));

	const single = await convert('split-pdf', join(FIXTURES, 'report.pdf'), '1 file', {
		mode: 'range',
		ranges: '2'
	});
	check('split: a single range is one PDF', single.endsWith('.pdf'), single);
	const pages = await pdfDetail(single);
	check('split: range keeps the requested page count', pages.length === 1, `${pages.length} pages`);
	check('split: range starts at the requested page', (await pdfText(single)).includes('Method notes'));
}

{
	await page.goto(`${BASE}/split-pdf`, { waitUntil: 'networkidle' });
	await page.fill('#option-ranges', '9');
	await addFiles(join(FIXTURES, 'report.pdf'));
	await page.waitForSelector('button[data-convert]');
	await page.locator('button[data-convert]').first().click();
	await page.getByText(/outside this document/).waitFor({ timeout: 20_000 });
	check('split: an invalid range explains the valid ones', true);
}

/* ---------- 5b. Compress image ---------- */
{
	const input = join(FIXTURES, 'noisy.jpg');
	if (!existsSync(input)) console.log('skip  compress: noisy.jpg is missing (needs ffmpeg)');
	const file = existsSync(input)
		? await convert('compress-image', input, '1 file', { preset: 'smallest' })
		: null;
	const original = (await readFile(input)).length;
	const compressed = file ? (await readFile(file)).length : original;
	check(
		'compress: output is smaller',
		file !== null && compressed < original,
		`${original} → ${compressed} bytes`
	);
	check('compress: output is JPEG', file !== null && (await signature(file, 3)) === '\xFF\xD8\xFF', file ?? '');

	const dimensions = async (path) =>
		page.evaluate(async (base64) => {
			const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
			const bitmap = await createImageBitmap(new Blob([bytes]));
			const size = { width: bitmap.width, height: bitmap.height };
			bitmap.close();
			return size;
		}, (await readFile(path)).toString('base64'));

	const before = await dimensions(input);
	const after = file ? await dimensions(file) : before;
	check(
		'compress: dimensions are preserved',
		before.width === after.width && before.height === after.height,
		`${before.width}×${before.height} → ${after.width}×${after.height}`
	);
}

/* ---------- 5c. PDF to JPG ---------- */
{
	const file = await convert('pdf-to-jpg', join(FIXTURES, 'report.pdf'), '1 file');
	check('pdf→jpg: multi-page output is a ZIP', file.endsWith('.zip'), file);
	const entries = unzipSync(new Uint8Array(await readFile(file)));
	const pages = Object.keys(entries).filter((name) => name.endsWith('.jpg')).sort();
	check('pdf→jpg: one JPG per page', pages.length === 2, pages.join(','));
	check(
		'pdf→jpg: valid JPEG bytes',
		pages.length > 0 && entries[pages[0]][0] === 0xff && entries[pages[0]][1] === 0xd8,
		pages[0]
	);
}

/* ---------- 5b. Audio routes ---------- */
{
	const file = await convert('mp3-converter', join(FIXTURES, 'tone.wav'), '1 file');
	check('mp3-converter: yields an MP3', file.endsWith('.mp3'), file);
}

{
	if (existsSync(join(FIXTURES, 'clip.mp4'))) {
		const file = await convert('mp4-to-mp3', join(FIXTURES, 'clip.mp4'), '1 file');
		const bytes = await readFile(file);
		check(
			'mp4→mp3: yields MPEG audio frames',
			file.endsWith('.mp3') && (bytes[0] === 0xff || bytes.toString('ascii', 0, 3) === 'ID3'),
			file
		);
	} else {
		console.log('skip  mp4→mp3: clip.mp4 fixture is missing (needs ffmpeg)');
	}
}

/* ---------- 6. Batch of 3 + ZIP ---------- */
{
	await page.goto(`${BASE}/image-converter`, { waitUntil: 'networkidle' });
	const batch = [1, 2, 3].map((n) => join(FIXTURES, 'pixel.png'));
	await addFiles(batch);
	await page.waitForSelector('text=3 files');

	await page.getByRole('button', { name: /Convert 3 files/ }).click();
	await page.getByRole('button', { name: 'Download all (3)' }).waitFor({ timeout: 120_000 });
	const zipPromise = page.waitForEvent('download', { timeout: 30_000 });
	await page.getByRole('button', { name: 'Download all (3)' }).click();
	const zipDownload = await zipPromise;
	const zipPath = join(OUT, 'batch.zip');
	await zipDownload.saveAs(zipPath);

	const entries = Object.keys(unzipSync(new Uint8Array(await readFile(zipPath))));
	check('batch: three results in the ZIP', entries.length === 3, entries.join(','));
	check('batch: no duplicate names', new Set(entries).size === 3, entries.join(','));
	check('batch: success summary shown', await page.locator('.alert-success').isVisible());
}

/* ---------- 7. Small files are not subject to an arbitrary count cap ---------- */
{
	await page.goto(`${BASE}/image-converter`, { waitUntil: 'networkidle' });
	const eleven = [];
	for (let index = 0; index < 11; index += 1) {
		const copy = join(OUT, `copy-${index}.png`);
		await copyFile(join(FIXTURES, 'pixel.png'), copy);
		eleven.push(copy);
	}
	await addFiles(eleven);
	await page.waitForTimeout(800);
	check('batch: accepts 11 small files', await page.locator('li:has(.badge-neutral)').count() >= 11);
}

/* ---------- 8. Wrong file type is explained ---------- */
{
	await page.goto(`${BASE}/image-converter`, { waitUntil: 'networkidle' });
	await addFiles(join(FIXTURES, 'report.pdf'));
	await page.waitForSelector('.alert', { timeout: 10_000 });
	const notice = await page.locator('.alert').first().innerText();
	check('validation: rejects a PDF in the image tool', notice.includes('.pdf') || notice.includes('PDF'), notice);
}

/* ---------- 9. Scanned PDF is refused, not silently emptied ---------- */
{
	await page.goto(`${BASE}/pdf-to-word`, { waitUntil: 'networkidle' });
	await addFiles(join(FIXTURES, 'scan.pdf'));
	await page.waitForFunction(
		() => !document.querySelector('button.btn-primary')?.hasAttribute('disabled')
	);
	await page.getByRole('button', { name: /Convert 1 file/ }).click();
	await page.waitForSelector('.badge-danger', { timeout: 30_000 });
	const message = await page.locator('text=/scan|text layer/i').first().innerText();
	check('scan: explains the missing text layer', /scan|text layer/i.test(message), message);
	check('scan: no download offered', (await page.locator('button[aria-label^="Download "]').count()) === 0);
}

/* ---------- 10. Theme toggle + dark mode parity ---------- */
{
	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	const before = await page.evaluate(() => document.documentElement.dataset.theme);
	await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();
	const after = await page.evaluate(() => document.documentElement.dataset.theme);
	check('theme: toggles', before !== after, `${before} → ${after}`);
}

/* ---------- 11. Privacy: no request ever carries a file ---------- */
{
	check('privacy: no non-GET requests', nonGetRequests.length === 0, nonGetRequests.join(', '));
	check('privacy: no request body anywhere', requestsWithBody.length === 0, requestsWithBody.join(', '));
	const thirdParty = await page.evaluate(() =>
		performance
			.getEntriesByType('resource')
			.map((entry) => entry.name)
			.filter((name) => !name.startsWith(location.origin))
	);
	check('privacy: no third-party resources', thirdParty.length === 0, thirdParty.join(', '));
}

/* ---------- 12. PWA: manifest, service worker, offline conversion ---------- */
{
	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
	check('pwa: manifest is linked', Boolean(manifestHref), manifestHref ?? 'missing');
	const manifest = manifestHref
		? await (await fetch(new URL(manifestHref, page.url()))).json()
		: {};
	check(
		'pwa: manifest starts at the base path',
		manifest.name && manifest.start_url === './' && manifest.scope === './',
		JSON.stringify({ start_url: manifest.start_url, scope: manifest.scope })
	);
	const sizes = (manifest.icons ?? []).map((icon) => icon.sizes);
	check(
		'pwa: manifest has 192 and 512 icons',
		['192x192', '512x512'].every((size) => sizes.includes(size)),
		sizes.join(', ')
	);
	check(
		'pwa: manifest has maskable icons',
		(manifest.icons ?? []).some((icon) => icon.purpose === 'maskable')
	);
	check(
		'pwa: theme colour is declared',
		(await page.getAttribute('meta[name="theme-color"]', 'content')) === '#1a6fe0'
	);

	await page.goto(`${BASE}/image-converter`, { waitUntil: 'networkidle' });
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
	await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
		timeout: 20_000
	});
	check('pwa: service worker controls the page', true);
	const cacheKeys = await page.evaluate(() => caches.keys());
	check(
		'pwa: shell cache is versioned',
		cacheKeys.some((key) => key.startsWith('converty-shell-')),
		cacheKeys.join(', ')
	);
	const shellHasPage = await page.evaluate(async () => {
		const key = (await caches.keys()).find((name) => name.startsWith('converty-shell-'));
		if (!key) return false;
		const cache = await caches.open(key);
		return (await cache.keys()).some((request) => /\/split-pdf\/?$/.test(request.url));
	});
	check('pwa: every page is precached', shellHasPage);

	// One online conversion warms the image family's chunks in the runtime cache.
	await convert('image-converter', join(FIXTURES, 'pixel.png'), '1 file');
	await page.waitForTimeout(1_500);
	const cachedBytes = await page.evaluate(async () => {
		let total = 0;
		for (const key of await caches.keys()) {
			const cache = await caches.open(key);
			for (const request of await cache.keys()) {
				const response = await cache.match(request);
				total += response ? (await response.clone().blob()).size : 0;
			}
		}
		return total;
	});
	check(
		'pwa: cache stays under the 50 MB cap',
		cachedBytes < 50 * 1024 * 1024,
		`${Math.round(cachedBytes / 1024)} KB`
	);

	await context.setOffline(true);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('h1');
	check(
		'pwa: offline indicator is shown',
		await page
			.getByText('Offline — tools you have already opened keep working.')
			.isVisible()
			.catch(() => false)
	);
	const offlineHeading = await page.locator('h1').innerText();
	check('pwa: visited tool loads offline', offlineHeading.length > 0, offlineHeading);
	await addFiles(join(FIXTURES, 'pixel.png'));
	await page.getByRole('button', { name: /Convert 1 file/ }).click();
	await page.waitForSelector('.alert-success', { timeout: 120_000 });
	check(
		'pwa: conversion works offline',
		await page
			.locator('button[aria-label^="Download "]')
			.first()
			.isVisible()
			.catch(() => false)
	);
	await context.setOffline(false);
}

check('console: no uncaught errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
	console.log('failures:', failed.map((result) => result.name).join(', '));
	process.exitCode = 1;
}
