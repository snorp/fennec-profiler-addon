const fs = require('fs');
const child_process = require('child_process');
const os = require('os');
const dir = require('node-dir');
const { basename } = require('path');
const lodash = require('lodash');

const homedir = process.env['HOME']; 

const ADDR_2_LINE = `${homedir}/.mozbuild/android-ndk-r11c/toolchains/arm-linux-androideabi-4.9/prebuilt/linux-x86_64/bin/arm-linux-androideabi-addr2line`;
const OBJDIR = `${homedir}/source/objdirs/objdir-android-opt/dist`;
const ANDROID_LIBDIR = './remote-libs'; // just 'adb pull /system/lib ./remote-libs'

let NUM_ADDRESSES_PER_CHUNK = 1000;

let libCache = null;

async function readProfile(profilePath) {
	// JSON.parse just barfs
	return new Promise(resolve => {
		const rs = fs.createReadStream(profilePath);

		let bufs = [];
		rs.on('data', function(data) {
			bufs.push(data);
		});

		rs.on('close', function() {
			resolve(JSON.parse(Buffer.concat(bufs)));
		});

		rs.on('error', function(e) {
			console.error(e);
			resolve(null);
		});
	});
}

async function writeProfile(profilePath, profile) {
	return new Promise(resolve => {
		const ws = fs.createWriteStream(profilePath);
		ws.end(JSON.stringify(profile), resolve);
	});
}

function findLib(libs, offset) {
	for (let lib of libs) {
		if (offset >= lib.start && offset < lib.end) {
			return lib;
		}
	}

	return null;
}

async function buildLibCache() {
	let cache = {};

	const addPaths = function addPaths(paths) {
		for (let path of paths.files) {
			cache[basename(path)] = path;
		}
	}

	return new Promise(resolve => {
		dir.paths(OBJDIR, (err, paths) => {
			addPaths(paths);
			dir.paths(ANDROID_LIBDIR, (err, paths) => {
				addPaths(paths);
				resolve(cache);
			});
		});
	});
}

async function findLibPath(name) {
	if (!libCache) {
		libCache = await buildLibCache();
	}

	return libCache[name];
}

async function resolveSymbols(path, chunk) {
	const offsets = chunk.map(item => '0x' + item.offset.toString(16));
	return new Promise(resolve => {
		let args = ['-e', path, '-f', '-C'];
		args = args.concat(offsets);
		let proc = child_process.spawn('addr2line', args);
		
		let bufs = [];
		proc.stdout.on('data', data => {
			bufs.push(data);
		});

		proc.stdout.on('close', () => {
			let lines = Buffer.concat(bufs).toString().split('\n');
			for (let i = 0; i < chunk.length; i++) {
				const location = ('0x' + chunk[i].offset.toString(16) + ' in ' + chunk[i].libName);
				const sym = lines[i * 2];
				chunk[i].symbol = sym ? sym : location;
			}
			resolve(chunk);
		});
	});
}

async function symbolicateThread(libs, thread) {
	const strings = thread.stringTable;
	let libOffsets = {};

	if (!strings) {
		return Promise.resolve(thread);
	}

	for (let i = 0; i < strings.length; i++) {
		const sym = strings[i];
		if (sym.indexOf('0x') != 0) {
			continue;
		}

		const offset = parseInt(sym, 16);
		let lib = findLib(libs, offset);
		if (!lib) {
			continue;
		}

		if (!libOffsets[lib.name]) {
			libOffsets[lib.name] = [];
		}

		const adjOffset = ((offset - lib.start + lib.offset) & ~1) - 1

		libOffsets[lib.name].push({
			index: i,
			libName: lib.name,
			offset: offset - lib.start + lib.offset,
			symbol: null
		});
	}

	let promises = [];

	for (let lib in libOffsets) {
		let chunks = lodash.chunk(libOffsets[lib], NUM_ADDRESSES_PER_CHUNK);
		let libPath = await findLibPath(lib);

		promises.push(Promise.all(chunks.map(chunk => resolveSymbols(libPath, chunk))));
	}

	await Promise.all(promises);

	for (let lib in libOffsets) {
		for (let item of libOffsets[lib]) {
			strings[item.index] = item.symbol;
		}
	}
}

async function main() {
	const profilePath = process.argv[2];
	if (!profilePath) {
		console.error('ERROR: pass as sampler profile path');
		process.exit(1);
	}

	const profile = await readProfile(profilePath);
	if (!profile) {
		console.error('ERROR: failed to read profile');
		process.exit(1);
	}

	const promises = profile.threads.map(thread => symbolicateThread(profile.libs, thread));
	await Promise.all(promises);

	const symProfilePath = profilePath + '.sym';
	await writeProfile(symProfilePath, profile);
	console.log('Wrote symbolicated profile to: ' + symProfilePath);
}

process.on('unhandledRejection', function(err) {
	console.error('ERROR: ', err);
});

main();
