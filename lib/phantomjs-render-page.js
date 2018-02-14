var system = require('system');
if (system.args.length === 3) {
	var inputUrl = system.args[1];
	var outputFile = system.args[2];
	var page = require('webpage').create();
	page.open(inputUrl, function() {
		page.render(outputFile);
		phantom.exit(0);
	});
} else {
	phantom.exit(1);
}
