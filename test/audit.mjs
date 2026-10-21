import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const BASE = 'http://localhost:4175';
const server = await startServer(4175);
const browser = await chromium.launch({
	executablePath: '/usr/bin/chromium-browser',
	args: ['--no-sandbox']
});

const results = [];
const check = (name, ok, detail = '') => {
	results.push({ name, ok, detail });
	console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

function luminance([r, g, b]) {
	const convert = (value) => {
		const channel = value / 255;
		return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

function contrast(a, b) {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}

const parseColor = (value) => value.match(/\d+/g).slice(0, 3).map(Number);

for (const viewport of [
	{ width: 375, height: 812, name: 'mobile' },
	{ width: 1280, height: 900, name: 'desktop' }
]) {
	const page = await browser.newPage({ viewport });
	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

	const metrics = await page.evaluate(() => {
		const style = (selector) => {
			const element = document.querySelector(selector);
			return element ? getComputedStyle(element) : null;
		};
		const nav = style('header.navbar');
		const card = style('.card');
		const primary = style('.btn-primary');
		const h1 = style('h1');
		const body = style('main p');
		const buttons = [...document.querySelectorAll('a.btn, button.btn')]
			.map((element) => {
				const rect = element.getBoundingClientRect();
				return {
					height: Math.round(rect.height),
					width: Math.round(rect.width),
					text: (element.textContent ?? '').trim().slice(0, 24)
				};
			})
			// Hidden responsive duplicates are not rendered touch targets.
			.filter((button) => button.width > 0 && button.height > 0);
		const black = [...document.querySelectorAll('body *')]
			.filter((element) => getComputedStyle(element).color === 'rgb(0, 0, 0)')
			.map((element) => element.tagName);
		return {
			navHeight: nav?.height,
			navBackground: nav?.backgroundColor,
			cardRadius: card?.borderRadius,
			cardPadding: card?.padding,
			cardBackground: card?.backgroundColor,
			primaryBackground: primary?.backgroundColor,
			primaryRadius: primary?.borderRadius,
			primaryHeight: primary?.height,
			h1Size: h1?.fontSize,
			h1Weight: h1?.fontWeight,
			h1LineHeight: h1?.lineHeight,
			bodyColor: body?.color,
			bodySize: body?.fontSize,
			pageBackground: getComputedStyle(document.body).backgroundColor,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			buttons,
			black,
			toolCards: document.querySelectorAll('a[href^="/"] .badge').length,
			docTitle: document.title
		};
	});

	check(`${viewport.name}: no horizontal overflow`, metrics.overflow <= 1, `${metrics.overflow}px`);
	check(`${viewport.name}: nav is 60px`, metrics.navHeight === '60px', metrics.navHeight);
	check(`${viewport.name}: cards use 12px radius`, metrics.cardRadius === '12px', metrics.cardRadius);
	check(`${viewport.name}: cards use 24px padding`, metrics.cardPadding === '24px', metrics.cardPadding);
	check(
		`${viewport.name}: primary button is Toss blue`,
		metrics.primaryBackground === 'rgb(49, 130, 246)',
		metrics.primaryBackground
	);
	check(`${viewport.name}: buttons use 8px radius`, metrics.primaryRadius === '8px', metrics.primaryRadius);
	check(`${viewport.name}: all buttons ≥ 44px tall`, metrics.buttons.every((b) => b.height >= 44), JSON.stringify(metrics.buttons.filter((b) => b.height < 44)));
	check(`${viewport.name}: display-xl is 30px/700`, metrics.h1Size === '30px' && metrics.h1Weight === '700', `${metrics.h1Size}/${metrics.h1Weight}`);
	check(`${viewport.name}: line-height matches 1.33`, metrics.h1LineHeight.startsWith('39.9'), metrics.h1LineHeight);
	check(`${viewport.name}: no pure-black text`, metrics.black.length === 0, metrics.black.join(','));
	check(`${viewport.name}: five tool cards`, metrics.toolCards >= 5, String(metrics.toolCards));

	const bodyContrast = contrast(parseColor(metrics.bodyColor), parseColor(metrics.pageBackground));
	check(`${viewport.name}: body text contrast ≥ 4.5`, bodyContrast >= 4.5, bodyContrast.toFixed(2));

	// Dark mode parity
	await page.getByRole('button', { name: /Switch to dark mode/ }).click();
	// Cards animate their background, so read after the 250ms token transition settles.
	await page.waitForTimeout(400);
	const dark = await page.evaluate(() => ({
		background: getComputedStyle(document.body).backgroundColor,
		text: getComputedStyle(document.querySelector('main p')).color,
		card: getComputedStyle(document.querySelector('.card')).backgroundColor
	}));
	check(`${viewport.name}: dark canvas is #0a0a0a`, dark.background === 'rgb(10, 10, 10)', dark.background);
	check(`${viewport.name}: dark card is #1a1a1a`, dark.card === 'rgb(26, 26, 26)', dark.card);
	const darkContrast = contrast(parseColor(dark.text), parseColor(dark.background));
	check(`${viewport.name}: dark body contrast ≥ 4.5`, darkContrast >= 4.5, darkContrast.toFixed(2));

	await page.close();
}

// Tool page structure
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
for (const slug of ['image-converter', 'word-to-pdf', 'excel-to-pdf', 'pdf-to-word', 'pdf-to-excel']) {
	await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' });
	const structure = await page.evaluate(() => ({
		h1: document.querySelector('h1')?.textContent?.trim(),
		steps: document.querySelectorAll('#how-to-heading ~ ol li').length,
		dropzone: Boolean(document.querySelector('.dropzone')),
		limitsListed: document.body.innerText.includes('10'),
		uploadClaim: document.body.innerText.includes('Nothing is uploaded'),
		overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
	}));
	check(`${slug}: has a single h1`, Boolean(structure.h1));
	check(`${slug}: shows 3 how-to steps`, structure.steps === 3, String(structure.steps));
	check(`${slug}: has a drop zone`, structure.dropzone);
	check(`${slug}: states the upload guarantee`, structure.uploadClaim);
	check(`${slug}: no horizontal overflow`, structure.overflow <= 1, `${structure.overflow}px`);
}

// Converter page with a loaded batch, on the smallest viewport.
{
	const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
	await page.goto(`${BASE}/pdf-to-word`, { waitUntil: 'networkidle' });

	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVQoz2NkYPjPwMDAwMDAwMDAwAAAJgAB0yq1WQAAAABJRU5ErkJggg==',
		'base64'
	);
	await page.setInputFiles('input[type=file]', [
		{ name: 'one.png', mimeType: 'image/png', buffer: png },
		{ name: 'two.png', mimeType: 'image/png', buffer: png },
		{ name: 'three.png', mimeType: 'image/png', buffer: png }
	]);
	await page.waitForTimeout(500);

	const state = await page.evaluate(() => {
		const buttons = [...document.querySelectorAll('button.btn')]
			.map((element) => ({ height: Math.round(element.getBoundingClientRect().height), text: element.textContent?.trim().slice(0, 20) }))
			.filter((button) => button.height > 0);
		return {
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			buttons,
			notices: document.querySelectorAll('.alert').length,
			queued: document.querySelectorAll('button[aria-label^="Remove "]').length
		};
	});

	check('converter/mobile: no horizontal overflow with files', state.overflow <= 1, `${state.overflow}px`);
	check('converter/mobile: all buttons ≥ 44px', state.buttons.every((button) => button.height >= 44), JSON.stringify(state.buttons));
	check('converter/mobile: wrong file type is rejected, not queued', state.queued === 0 && state.notices >= 3, `${state.queued} queued / ${state.notices} notices`);
	await page.close();
}

await browser.close();
server.close();

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} design checks passed`);
if (failed.length > 0) {
	console.log('failures:', failed.map((result) => result.name).join(', '));
	process.exitCode = 1;
}
