const Path = require('path');
const Fs = require("fs");

exports.isfile = function(path) {
	return Fs.existsSync(path) && Fs.statSync(path).isFile();
};

exports.isdir = function(path) {
	return Fs.existsSync(path) && Fs.statSync(path).isDirectory();
};

exports.del = function(path) {
	if (Fs.existsSync(path)) {
		Fs.readdirSync(path).forEach(function(file, index) {
			var curPath = path + "/" + file;
			if (Fs.lstatSync(curPath).isDirectory()) { // recurse
				exports.del(curPath);
			} else { // delete file
				Fs.unlinkSync(curPath);
			}
		});
		Fs.rmdirSync(path);
	}
}

exports.read = function(file, encoding) {
	if (exports.isfile(file)) {
		return Fs.readFileSync(file, {
			"encoding": encoding || 'utf8'
		});
	}
}

exports.write = function(file, content, encoding) {
	var dir = Path.dirname(file);
	if (!exports.isdir(dir)) {
		exports.mkdir(dir, 0o755);
	}
	Fs.writeFileSync(file, content, {
		"encoding": encoding || 'utf8'
	});
	return exports.isfile(file);
}

exports.mkdir = function(dir, mode) {
	if (!Fs.existsSync(dir)) {
		var updir = Path.dirname(dir);
		if (!Fs.existsSync(updir)) {
			exports.mkdir(updir, mode);
		}
		return Fs.mkdirSync(dir, mode || 0o755);
	}
}

exports.ls = function( path ){
	if (exports.isdir(path)) {
		return Fs.readdirSync( path )
	}
	return []
}

exports.lsdir = function( path, only_name ){
	var ref = exports.ls(path)
	var dirs = []
	if (ref.length) {
		for (let i=0; i<ref.length; i++){
			let p = Path.join(path, ref[i])
			if (exports.isdir(p)) {
				dirs.push( only_name ? ref[i] : p )
			}
		}
	}
	return dirs
}

exports.lsfile = function( path, only_name ){
	var ref = exports.ls(path)
	var files = []
	if (ref.length) {
		for (let i=0; i<ref.length; i++){
			let p = Path.join(path, ref[i])
			if (exports.isfile(p)) {
				files.push( only_name ? ref[i] : p )
			}
		}
	}
	return files
}