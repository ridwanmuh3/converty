import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

process.env.TMPDIR = '/tmp';
const BASE = `http://localhost:4175${(process.env.BASE_PATH ?? '/converty').replace(/\/+$/, '')}`;
const server = await startServer(4175);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium-browser',
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

/** Walks every text node in the given regions and reports AA contrast failures. */
async function contrastIssues(page, selector) {
	return page.evaluate((scope) => {
		const parseRgb = (value) => {
			const nums = (value ?? '').match(/[\d.]+/g);
			return nums && nums.length >= 3 ? nums.slice(0, 3).map(Number) : null;
		};
		const channel = (value) => {
			const c = value / 255;
			return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		};
		const luminance = ([r, g, b]) =>
			0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
		const ratio = (a, b) => {
			const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
			return (light + 0.05) / (dark + 0.05);
		};
		const backgroundOf = (element) => {
			let node = element;
			while (node) {
				const background = getComputedStyle(node).backgroundColor;
				if (background && !/rgba\(0, 0, 0, 0\)/.test(background)) {
					const parsed = parseRgb(background);
					if (parsed) return parsed;
				}
				node = node.parentElement;
			}
			return [255, 255, 255];
		};

		const issues = [];
		for (const root of document.querySelectorAll(scope)) {
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			while (walker.nextNode()) {
				const text = (walker.currentNode.textContent ?? '').trim();
				if (!text) continue;
				const element = walker.currentNode.parentElement;
				if (!element) continue;
				const style = getComputedStyle(element);
				if (
					style.display === 'none' ||
					style.visibility === 'hidden' ||
					Number(style.opacity) === 0 ||
					element.closest('[aria-hidden="true"]')
				) continue;
				const fg = parseRgb(style.color);
				if (!fg) continue;
				const size = parseFloat(style.fontSize);
				const weight = Number(style.fontWeight) || 400;
				const large = size >= 24 || (size >= 18.66 && weight >= 700);
				const value = ratio(fg, backgroundOf(element));
				if (value < (large ? 3 : 4.5)) {
					const classes = typeof element.className === 'string' ? element.className.split(' ')[0] : '';
					issues.push(
						`${element.tagName.toLowerCase()}${classes ? '.' + classes : ''} "${text.slice(0, 24)}" ${value.toFixed(2)}`
					);
				}
			}
		}
		return issues;
	}, selector);
}

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
		`${viewport.name}: primary button uses AA-safe blue`,
		metrics.primaryBackground === 'rgb(26, 111, 224)',
		metrics.primaryBackground
	);
	check(`${viewport.name}: buttons use 8px radius`, metrics.primaryRadius === '8px', metrics.primaryRadius);
	check(`${viewport.name}: all buttons ≥ 44px tall`, metrics.buttons.every((b) => b.height >= 44), JSON.stringify(metrics.buttons.filter((b) => b.height < 44)));
	check(`${viewport.name}: display-xl is 30px/700`, metrics.h1Size === '30px' && metrics.h1Weight === '700', `${metrics.h1Size}/${metrics.h1Weight}`);
	check(`${viewport.name}: line-height matches 1.33`, metrics.h1LineHeight.startsWith('39.9'), metrics.h1LineHeight);
	check(`${viewport.name}: no pure-black text`, metrics.black.length === 0, metrics.black.join(','));
	check(`${viewport.name}: one card per tool`, metrics.toolCards >= 4, String(metrics.toolCards));

	const bodyContrast = contrast(parseColor(metrics.bodyColor), parseColor(metrics.pageBackground));
	check(`${viewport.name}: body text contrast ≥ 4.5`, bodyContrast >= 4.5, bodyContrast.toFixed(2));

	const lightIssues = await contrastIssues(page, 'main, footer, header');
	check(
		`${viewport.name}: every text style meets AA contrast`,
		lightIssues.length === 0,
		lightIssues.slice(0, 6).join(' | ')
	);

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

	const darkIssues = await contrastIssues(page, 'main, footer, header');
	check(
		`${viewport.name}: dark mode text meets AA contrast`,
		darkIssues.length === 0,
		darkIssues.slice(0, 6).join(' | ')
	);

	await page.close();
}

// Tool page structure
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
for (const slug of [
	'image-converter',
	'audio-converter',
	'jpg-to-pdf',
	'pdf-to-jpg',
	'mp4-to-mp3',
	'word-to-pdf',
	'excel-to-pdf',
	'pdf-to-word',
	'merge-pdf',
	'split-pdf',
	'compress-image',
	'image-to-pdf'
]) {
	await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' });
	const structure = await page.evaluate(() => ({
		h1: document.querySelector('h1')?.textContent?.trim(),
		strip: /1.*Drop.*2.*Convert.*3.*Download/s.test(
			document.querySelector('main')?.innerText ?? ''
		),
		sideCards: document.querySelectorAll('aside.card').length,
		dropzone: Boolean(document.querySelector('.dropzone')),
		dropzoneName: (() => {
			const input = document.querySelector('.dropzone input[type=file]');
			if (!input) return '';
			return input.labels?.[0]?.innerText?.trim() ?? input.getAttribute('aria-label') ?? '';
		})(),
		uploadClaim: document.body.innerText.includes('Nothing is uploaded'),
		overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
	}));
	check(`${slug}: has a single h1`, Boolean(structure.h1));
	check(`${slug}: shows the compact 1-2-3 strip`, structure.strip);
	check(`${slug}: exactly one sidebar card`, structure.sideCards === 1, String(structure.sideCards));
	check(`${slug}: has a drop zone`, structure.dropzone);
	check(
		`${slug}: file input is labelled by the drop zone`,
		structure.dropzoneName.includes('Drop files here'),
		structure.dropzoneName.slice(0, 48)
	);
	check(`${slug}: states the upload guarantee`, structure.uploadClaim);
	check(`${slug}: no horizontal overflow`, structure.overflow <= 1, `${structure.overflow}px`);

	const toolIssues = await contrastIssues(page, 'main');
	check(`${slug}: every text style meets AA contrast`, toolIssues.length === 0, toolIssues.slice(0, 6).join(' | '));
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

// ---------- Lighthouse-style page performance & SEO ----------
const SITE_ORIGIN = 'https://ridwanmuh3.github.io';
const BASE_DIR = (process.env.BASE_PATH ?? '/converty').replace(/\/+$/, '');
const SEO_PATHS = [
	'',
	'audio-converter/',
	'image-converter/',
	'jpg-to-pdf/',
	'image-to-pdf/',
	'pdf-to-jpg/',
	'heic-to-jpg/',
	'word-to-pdf/',
	'excel-to-pdf/',
	'pdf-to-word/',
	'merge-pdf/',
	'split-pdf/',
	'compress-image/',
	'mp3-converter/',
	'mp4-to-mp3/',
	'video-to-mp3/'
];
const seenTitles = new Map();
const seenDescriptions = new Map();

/**
 * Head scan for every page: title, description, canonical, social preview,
 * indexability, viewport, lang, single h1 and image alt coverage.
 */
{
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	for (const path of SEO_PATHS) {
		const key = path || 'home';
		await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
		const head = await page.evaluate(() => {
			const content = (selector) => document.querySelector(selector)?.content ?? '';
			return {
				title: document.title,
				description: content('meta[name="description"]'),
				canonical: document.querySelector('link[rel="canonical"]')?.href ?? '',
				ogTitle: content('meta[property="og:title"]'),
				ogDescription: content('meta[property="og:description"]'),
				ogUrl: content('meta[property="og:url"]'),
				robots: content('meta[name="robots"]'),
				viewport: content('meta[name="viewport"]'),
				lang: document.documentElement.lang,
				h1s: document.querySelectorAll('h1').length,
				favicon: Boolean(document.querySelector('link[rel="icon"]')),
				imagesWithoutAlt: [...document.querySelectorAll('img')].filter((image) => !image.alt).map((image) => image.src)
			};
		});
		check(`seo/${key}: title is descriptive and short`, head.title.length >= 15 && head.title.length <= 70, `${head.title.length} chars`);
		check(`seo/${key}: description within 50–200`, head.description.length >= 50 && head.description.length <= 200, `${head.description.length} chars`);
		check(
			`seo/${key}: canonical points at the published URL`,
			head.canonical === `${SITE_ORIGIN}${BASE_DIR}/${path}`,
			head.canonical || '(missing)'
		);
		check(
			`seo/${key}: social preview tags match canonical`,
			Boolean(head.ogTitle) && Boolean(head.ogDescription) && head.ogUrl === head.canonical,
			`ogUrl=${head.ogUrl || '(missing)'}`
		);
		check(`seo/${key}: indexable`, !/noindex/i.test(head.robots), head.robots || '(default)');
		check(`seo/${key}: viewport meta`, head.viewport.includes('width=device-width'), head.viewport);
		check(`seo/${key}: lang attribute`, head.lang === 'en', head.lang || '(missing)');
		check(`seo/${key}: exactly one h1`, head.h1s === 1, String(head.h1s));
		check(`seo/${key}: favicon`, head.favicon);
		check(`seo/${key}: every image has alt text`, head.imagesWithoutAlt.length === 0, head.imagesWithoutAlt.slice(0, 2).join(', '));
		if (seenTitles.has(head.title)) {
			check(`seo/${key}: title is unique`, false, `duplicates ${seenTitles.get(head.title)}`);
		} else {
			seenTitles.set(head.title, key);
		}
		if (seenDescriptions.has(head.description)) {
			check(`seo/${key}: description is unique`, false, `duplicates ${seenDescriptions.get(head.description)}`);
		} else {
			seenDescriptions.set(head.description, key);
		}
	}
	check(
		'seo: all 15 tool pages plus the home page are prerendered',
		SEO_PATHS.length === 16 && seenTitles.size === 16,
		`${seenTitles.size} unique titles`
	);
	await page.close();
}

/**
 * Core Web Vitals on the two page shapes (home grid, heaviest converter).
 * Thresholds mirror Lighthouse's 'good' bands where applicable.
 */
async function vitalsCheck(name, suffix) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await context.addInitScript(() => {
		window.__cumulative = { lcp: 0, cls: 0, fcp: 0 };
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (entry.startTime > window.__cumulative.lcp) window.__cumulative.lcp = entry.startTime;
			}
		}).observe({ type: 'largest-contentful-paint', buffered: true });
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (!entry.hadRecentInput) window.__cumulative.cls += entry.value;
			}
		}).observe({ type: 'layout-shift', buffered: true });
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (entry.name === 'first-contentful-paint') window.__cumulative.fcp = entry.startTime;
			}
		}).observe({ type: 'paint', buffered: true });
	});
	const page = await context.newPage();
	await page.goto(`${BASE}${suffix}`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(400);
	const vitals = await page.evaluate(() => {
		const entries = performance.getEntriesByType('resource');
		const navigation = performance.getEntriesByType('navigation')[0];
		const bytes = (entry) => entry.transferSize || entry.encodedBodySize || 0;
		return {
			...window.__cumulative,
			requests: entries.length + (navigation ? 1 : 0),
			kb: Math.round((entries.reduce((sum, entry) => sum + bytes(entry), 0) + (navigation ? bytes(navigation) : 0)) / 1024),
			jsKb: Math.round(entries.filter((entry) => entry.initiatorType === 'script').reduce((sum, entry) => sum + bytes(entry), 0) / 1024)
		};
	});
	check(`perf/${name}: first paint under 2.5s`, vitals.fcp > 0 && vitals.fcp < 2500, `${Math.round(vitals.fcp)}ms`);
	check(`perf/${name}: largest paint under 2.5s`, vitals.lcp > 0 && vitals.lcp < 2500, `${Math.round(vitals.lcp)}ms`);
	check(`perf/${name}: layout shift negligible`, vitals.cls < 0.1, vitals.cls.toFixed(3));
	check(`perf/${name}: ≤ 40 requests`, vitals.requests <= 40, String(vitals.requests));
	check(`perf/${name}: ≤ 500 KB transferred`, vitals.kb <= 500, `${vitals.kb} KB`);
	check(`perf/${name}: ≤ 350 KB script weight`, vitals.jsKb <= 350, `${vitals.jsKb} KB`);
	await context.close();
}

await vitalsCheck('home', '/');
await vitalsCheck('pdf-to-word', '/pdf-to-word/');

await browser.close();
server.close();

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} design checks passed`);
if (failed.length > 0) {
	console.log('failures:', failed.map((result) => result.name).join(', '));
	process.exitCode = 1;
}
