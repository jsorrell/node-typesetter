'use-strict';
const util = require('util');
const path = require('path');
const url = require('url');
const connect = require('connect');
const http = require('http');
const auth = require('http-auth');
const execFile = util.promisify(require('child_process').execFile);
const serveStatic = require('serve-static');
const autoprefixer = require('autoprefixer');
const postcssMiddleware = require('postcss-middleware');
const sodium = require('sodium').api;
const phantomPath = require('phantomjs-prebuilt').path;
const pjson = require('../package.json'); // package information

const user = 'typesetter-user';
const passwordLengthBytes = 64;

const defaultOptions = {
	// src: srcfile.html,
	// dest: destfile.pdf,
	loadImages: true,
	root: ""
}

function typesetter (options) {
	var optionsObj = defaultOptions;
	for (optName in options) {
		optionsObj[optName] = options[optName];
	}
	var obj = {};
	obj.typeset = typeset;
	return obj;
}

module.exports.typeset = async function (options) {
	return new Promise((resolve, reject) => {
		/* Validate input and create options obj */
		if (!options.hasOwnProperty('src')) {
			return reject(new Error('src is required'));
		}
		if (!options.hasOwnProperty('dest')) {
			return reject(new Error('dest is required'));
		}
		options.src = path.resolve(options.src);
		options.dest = path.resolve(options.dest);
		options.root = options.hasOwnProperty('root') ? path.normalize(options.root) : path.dirname(options.src);
		if (!options.src.startsWith(options.root)) {
			return reject(new Error('Input file ' + obj.src + ' isn\'t in the root ' + obj.root));
		}

		// Set static default options
		for (optName in defaultOptions) {
			if (!options.hasOwnProperty(optName)) {
				options[optName] = defaultOptions[optName];
			}
		}

		/* Start server */
		var pass = generateRandomPassword();
		var server = serveFiles(options.root, pass);

		server.once('listening', () => {
			var urlPath = path.join('/', path.relative(options.root, options.src));
			var inputUrl = new url.URL('http://localhost/');
			inputUrl.port = server.address().port;
			inputUrl.pathname = urlPath;
			inputUrl.username = 'typesetter-user';
			inputUrl.password = pass;

			renderPage(inputUrl.href, options.dest)
			.then(() => {
				server.close();
				return resolve();
			}).catch(e => {
				server.close();
				return reject(e);
			});
		});
		server.on('error', (e) => {
			return reject(e);
		});
	});
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
	return http.createServer(app).listen(0, 'localhost');
}

function generateRandomPassword() {
	var passwordBytes = Buffer.allocUnsafe(passwordLengthBytes);
	sodium.randombytes_buf(passwordBytes, passwordLengthBytes);
	return passwordBytes.toString('hex');
}

async function renderPage(inputUrl, outputFile) {
	var childArgs = [
		path.join(__dirname, 'phantomjs-render-page.js'),
		inputUrl,
		outputFile
	];
	const {stdout, stderr} = await execFile(phantomPath, childArgs);
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

module.exports.version = pjson.version;
