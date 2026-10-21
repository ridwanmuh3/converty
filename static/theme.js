(function () {
	try {
		var stored = localStorage.getItem('theme');
		var dark = stored
			? stored === 'dark'
			: window.matchMedia('(prefers-color-scheme: dark)').matches;
		document.documentElement.dataset.theme = dark ? 'dark' : 'light';
	} catch (error) {
		document.documentElement.dataset.theme = 'light';
	}
})();
