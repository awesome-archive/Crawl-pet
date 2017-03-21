
const Path = require('path');
const URL  = require('url');
const File = require('./pet/file')

exports.parse = function(dir, argv) {
	return new Info(dir, argv)
}

class Info {

	constructor( dir, argv ){
		this.argv     = argv
		
		this.filepath = Path.join(dir, "info.json")
		this.rootdir = dir
		this._data     = {}
		this.exist  = false

		var url = argv.get("--url") || argv.get("_")[0]
		if (url && !/^(https?:\/\/|\/\/)/i.test(url)){
			url = "http://" + url
		}

		if (File.isfile(this.filepath)) {
			this.exist = true
			this._data = require(this.filepath)
		} else {
			this._data = {
				"url"      : url,
				"outdir"   : '.',
				"save"     : argv.get("--save") || "url",
				"types"    : argv.get("--types") || "",
				"limit"    : argv.get("--limit") || 5,
				"parser"   : "",
				"sleep"    : 200,
				"timeout"  : 60000*3,
				"headers"  : undefined,
				"proxy"    : argv.get("--parser") || "",
				"maxsize"  : argv.get("--maxsize") || 0,
				"minwidth" : argv.get("--minwidth") || 0,
				"minheight": argv.get("--minheight") || 0
			}
		}
		this.url = this._data.url || url
		
		this.outdir = Path.resolve( dir, this._data["outdir"])
	}

	get data() {
		var data = {}
		data.filepath = this.filepath
		data.rootdir  = this.rootdir
		data.outdir   = this.outdir
		data.url      = this.url

		for (let k in this._data) {
			data[k] = this._data[k]
		}
		for (let k in this.argv._values) {
			if (k.substr(0, 2) === "--") {
				data[k.substr(2)] = this.argv._values[k]
			}
			data[k] = this.argv._values[k]
		}
		return data
	}

	set(name, value){
		if (name === "url"){
			this.url = value
		}
		this._data[name] = value
	}

	get(name){
		var ref = this.argv.get("--"+name, true)
		if (ref !== undefined){
			return ref
		}
		if (this._data[name] !== undefined) {
			return this._data[name]
		}
	}

	save(){
		File.write(this.filepath, JSON.stringify(this._data, null, '    '))
	}

}
