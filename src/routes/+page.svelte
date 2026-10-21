<script lang="ts">
	import Footer from '#lib/components/Footer.svelte';
	import FidelityBadge from '#lib/components/FidelityBadge.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Nav from '#lib/components/Nav.svelte';
	import type { IconName } from '#lib/components/icon-names';
	import { LIMITS } from '#lib/core/limits';
	import { TOOLS } from '#lib/tools/registry';

	const steps: { icon: IconName; title: string; body: string }[] = [
		{
			icon: 'spark',
			title: 'Pick a converter',
			body: 'Five tools: images, Word, Excel, and PDF in both directions.'
		},
		{
			icon: 'upload',
			title: 'Drop up to 10 files',
			body: 'Files load straight into this tab. Nothing is sent anywhere.'
		},
		{
			icon: 'download',
			title: 'Convert and download',
			body: 'Each file on its own, or the whole batch in one ZIP.'
		}
	];

	const privacyPoints: { icon: IconName; title: string; body: string }[] = [
		{
			icon: 'shield',
			title: 'No upload, by construction',
			body: 'There is no server endpoint that accepts a file. The conversion runs on your own CPU.'
		},
		{
			icon: 'lock',
			title: 'No account, no email',
			body: 'Open the page and convert. Nothing is stored, because nothing is collected.'
		},
		{
			icon: 'spark',
			title: 'Survives a dropped connection',
			body: 'Once the tool has loaded, conversion never needs another network request.'
		},
		{
			icon: 'file',
			title: 'No file-size paywall',
			body: 'The batch cap protects your device’s memory. It is not a subscription prompt.'
		}
	];

	const faqs: { q: string; a: string }[] = [
		{
			q: 'Are my files uploaded?',
			a: 'No. This site is a set of static files. When you pick a file, the browser reads it locally and the conversion happens in the tab. Open DevTools → Network while converting: the only requests are for the page’s own scripts and fonts.'
		},
		{
			q: 'Why isn’t PDF → Word perfect?',
			a: 'A PDF does not contain paragraphs or tables — only glyphs at coordinates. Rebuilding an editable document from that is reconstruction, not recovery. Text and reading order survive; images, columns and exact fonts usually do not.'
		},
		{
			q: 'Can it convert scanned PDFs?',
			a: 'Not yet. A scan is an image with no text layer, so there is nothing to extract without OCR. The tool detects this and tells you instead of producing an empty document.'
		},
		{
			q: 'Is it actually free?',
			a: 'Yes. No account, no watermark, no “upgrade to download”. There are no ads and no trackers on the converter pages either.'
		},
		{
			q: 'What about .doc and .xls files?',
			a: 'Only the modern formats are supported. Open the file in Word or Excel and use Save As to create a .docx or .xlsx, then drop that in.'
		},
		{
			q: 'Why only 10 files at a time?',
			a: 'Each conversion holds a file and its output in memory. Ten files is a safe ceiling for phones and older laptops; the queue processes them one at a time so the page stays responsive.'
		}
	];
</script>

<svelte:head>
	<title>LocalConvert — convert PDF, Word, Excel and images in your browser</title>
	<meta
		name="description"
		content="Convert PDF to Word, Word to PDF, Excel to PDF and images between formats. Runs entirely in your browser — no uploads, no account, up to 10 files per batch."
	/>
</svelte:head>

<Nav />

<main id="main">
	<section class="hero-glow border-b border-line">
		<div class="mx-auto max-w-[1200px] px-5 pb-14 pt-14 md:px-6 md:pb-20 md:pt-20 lg:px-8">
			<div class="max-w-[760px]">
				<span class="badge badge-neutral">
					<span class="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true"></span>
					100% in your browser
				</span>

				<h1 class="t-display-xl mt-5 text-ink">Convert files without uploading them.</h1>

				<p class="t-body-lg mt-4 max-w-[580px] text-body">
					PDF, Word, Excel and images — up to ten files at a time. Nothing is sent to a server,
					because there is no server to send it to.
				</p>

				<div class="mt-8 flex flex-wrap gap-3">
					<a href="#tools" class="btn btn-primary">
						Choose a converter
						<Icon name="arrow-right" size={18} />
					</a>
					<a href="#how" class="btn btn-secondary">See how it works</a>
				</div>

				<ul class="t-body-sm mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-body">
					<li class="flex items-center gap-1.5">
						<Icon name="check" size={16} /> {LIMITS.maxFiles} files per batch
					</li>
					<li class="flex items-center gap-1.5">
						<Icon name="check" size={16} /> {LIMITS.maxFileBytes / 1024 / 1024} MB per file
					</li>
					<li class="flex items-center gap-1.5">
						<Icon name="check" size={16} /> No account, no watermark
					</li>
				</ul>
			</div>
		</div>
	</section>

	<section id="tools" class="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-16 md:px-6 md:py-24 lg:px-8">
		<div class="max-w-[620px]">
			<h2 class="t-display-lg text-ink">Pick a converter</h2>
			<p class="t-body-lg mt-2 text-body">
				Every tool tells you up front how faithful its output is. No surprises after the download.
			</p>
		</div>

		<ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each TOOLS as tool}
				<li>
					<a
						href="/{tool.slug}"
						class="card flex h-full flex-col gap-4 p-6 transition hover:border-line-strong hover:shadow-[var(--shadow-2)]"
					>
						<div class="flex items-start justify-between gap-3">
							<span
								class="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-bone text-ink"
							>
								<Icon name={tool.icon} size={21} />
							</span>
							<FidelityBadge fidelity={tool.fidelity} />
						</div>

						<div>
							<h3 class="t-heading-md text-ink">{tool.name}</h3>
							<p class="t-body-md mt-1 text-body">{tool.tagline}</p>
						</div>

						<span class="t-body-sm mt-auto inline-flex items-center gap-1 font-semibold text-ink">
							Open tool
							<Icon name="arrow-right" size={16} />
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>

	<section id="how" class="scroll-mt-20 border-y border-line bg-bone">
		<div class="mx-auto max-w-[1200px] px-5 py-16 md:px-6 md:py-24 lg:px-8">
			<h2 class="t-display-lg text-ink">Three steps, no sign-up</h2>
			<p class="t-body-lg mt-2 max-w-[560px] text-body">
				The page does the work. Your files stay where they are.
			</p>

			<ol class="mt-8 grid gap-4 md:grid-cols-3">
				{#each steps as step, index}
					<li class="card p-6">
						<div class="flex items-center gap-3">
							<span
								class="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-bone text-ink"
							>
								<Icon name={step.icon} size={20} />
							</span>
							<span class="t-caption tabular text-mute">STEP {index + 1}</span>
						</div>
						<h3 class="t-subtitle mt-4 text-ink">{step.title}</h3>
						<p class="t-body-md mt-1 text-body">{step.body}</p>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<section id="privacy" class="scroll-mt-20">
		<div class="mx-auto max-w-[1200px] px-5 py-16 md:px-6 md:py-24 lg:px-8">
			<div class="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
				<div>
					<span class="badge badge-neutral">Privacy by architecture</span>
					<h2 class="t-display-lg mt-4 text-ink">There is no upload. Not even a small one.</h2>
					<p class="t-body-lg mt-3 max-w-[480px] text-body">
						Most “free” converters upload your file, process it on a server, then ask you to trust
						their deletion policy. Here the file never leaves the tab, so there is no policy to
						trust.
					</p>

					<div class="card mt-6 p-5">
						<p class="t-body-sm font-semibold text-ink">Check it yourself</p>
						<p class="t-body-sm mt-1 text-body">
							Open DevTools → Network, then convert a file. No request carries your document —
							only the page’s own scripts load.
						</p>
					</div>
				</div>

				<ul class="grid gap-3 sm:grid-cols-2">
					{#each privacyPoints as point}
						<li class="card p-5">
							<span
								class="flex h-9 w-9 items-center justify-center rounded-full bg-bone text-ink"
							>
								<Icon name={point.icon} size={18} />
							</span>
							<h3 class="t-subtitle mt-3 text-ink">{point.title}</h3>
							<p class="t-body-sm mt-1 text-body">{point.body}</p>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</section>

	<section id="limits" class="scroll-mt-20 border-y border-line bg-bone">
		<div class="mx-auto max-w-[1200px] px-5 py-16 md:px-6 md:py-24 lg:px-8">
			<div class="max-w-[620px]">
				<h2 class="t-display-lg text-ink">Limits you can plan around</h2>
				<p class="t-body-lg mt-2 text-body">
					These ceilings protect your device’s memory. They are not a paywall, and there is no
					upgrade that raises them.
				</p>
			</div>

			<div class="mt-8 grid gap-4 sm:grid-cols-3">
				<div class="card p-6">
					<p class="t-display-lg tabular text-ink">{LIMITS.maxFiles}</p>
					<p class="t-body-md mt-1 text-body">files per batch</p>
					<p class="t-body-sm mt-2 text-mute">Processed one at a time, in order.</p>
				</div>
				<div class="card p-6">
					<p class="t-display-lg tabular text-ink">{LIMITS.maxFileBytes / 1024 / 1024} MB</p>
					<p class="t-body-md mt-1 text-body">per file</p>
					<p class="t-body-sm mt-2 text-mute">
						{LIMITS.maxTotalBytes / 1024 / 1024} MB total across the batch.
					</p>
				</div>
				<div class="card p-6">
					<p class="t-display-lg tabular text-ink">{LIMITS.maxPdfPages}</p>
					<p class="t-body-md mt-1 text-body">pages per PDF</p>
					<p class="t-body-sm mt-2 text-mute">Applies to PDF inputs. Longer files are rejected.</p>
				</div>
			</div>
		</div>
	</section>

	<section id="faq" class="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-16 md:px-6 md:py-24 lg:px-8">
		<div class="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
			<div>
				<h2 class="t-display-lg text-ink">Questions people actually ask</h2>
				<p class="t-body-md mt-3 text-body">
					If something is missing, the limitation is probably documented on the tool page itself.
				</p>
			</div>

			<div>
				{#each faqs as faq}
					<details class="disclosure">
						<summary>{faq.q}</summary>
						<div class="disclosure-body">{faq.a}</div>
					</details>
				{/each}
			</div>
		</div>
	</section>
</main>

<Footer />
