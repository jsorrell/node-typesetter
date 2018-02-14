'use-strict';
const util = require('util');
const path = require('path');
const url = require('url');
const connect = require('connect');
const http = require('http');
const auth = require('http-auth');
const execFile = require('child_process').execFile;
const serveStatic = require('serve-static');
const autoprefixer = require('autoprefixer');
const postcssMiddleware = require('postcss-middleware');
const sodium = require('sodium').api;
const phantomPath = require('phantomjs-prebuilt').path;
const pjson = require('../package.json'); // package information

//FIXME: smarter port choosing
const port = 49874;
const user = 'typesetter-user';
const passwordLengthBytes = 64;

const defaultOptions = {
	loadImages: true,
	rootDir: ""
}

function typesetter (options) {
	var optionsObj = defaultOptions;
	for (optName in options) {
		optionsObj[optName] = options[optName];
	}
	var obj = {};
	obj.typesetSync = function (htmlInputFileU, outputFileU) {
		const htmlInputFile = path.resolve(htmlInputFileU);
		const outputFile = path.resolve(outputFileU);
		const rootDir = optionsObj.rootDir === '' ? path.dirname(htmlInputFile) : path.normalize(optionsObj.rootDir);
		if (!htmlInputFile.startsWith(rootDir)) {
			return new Error('Input file ' + htmlInputFile + ' isn\'t in the rootDir ' + rootDir);
		}

		var pass = generateRandomPassword();

		var server = serveFiles(rootDir, pass);

		var urlPath = path.join('/', path.relative(rootDir, htmlInputFile));

		var inputUrl = new url.URL('http://localhost/');
		inputUrl.port = port;
		inputUrl.pathname = urlPath;
		inputUrl.username = 'typesetter-user';
		inputUrl.password = pass;

		var childArgs = [
			path.join(__dirname, 'phantomjs-render-page.js'),
			inputUrl.href,
			outputFile
		];
		const child = execFile(phantomPath, childArgs, (err, stdout, stderr) => {
			if (err) {
				server.close();
				return err;
			} else {
				server.close();
				return null;
			}

		});
	}
	return obj;
}

function serveFiles(rootDir, pass) {
	var app = connect();

	var basic = auth.basic({
		realm: "typesetter"
	}, (username, password, callback) => {
		callback(username === user && password === pass);
	});

	app.use(auth.connect(basic));

	// only use on css files
	app.use((req, res, next) => {
		if (path.extname(req.url) == '.css') { //TODO: think about this a bit
			postcssMiddleware({
				plugins: [autoprefixer({cascade: false, browsers: pjson.browserslist})], // TODO: better way?
				src: function(req) {
					return path.join(rootDir, req.url);
				}
			})(req, res, next);
		} else {
			next();
		}
	});

	app.use(serveStatic(rootDir));
	return http.createServer(app).listen(port);
}

function generateRandomPassword() {
	var passwordBytes = Buffer.allocUnsafe(passwordLengthBytes);
	sodium.randombytes_buf(passwordBytes, passwordLengthBytes);
	return passwordBytes.toString('hex');
}

// page.settings = {
//         loadImages: true,
//         localToRemoteUrlAccessEnabled: true,
//         javascriptEnabled: true,
//         loadPlugins: false
//        };
//       page.set('viewportSize', { width: 800, height: 600 });
//       page.set('paperSize', { format: 'A4', orientation: 'portrait', border: '1cm' });
//       page.set('content', html, function (error) {
//         if (error) {
//           console.log('Error setting content: ', error);
//         }
//       });

typesetter.version = pjson.version;
module.exports = typesetter;
