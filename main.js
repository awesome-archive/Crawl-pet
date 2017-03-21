const Path = require('path');
const Argv = require("nodejs-argv");
const Crawler = require("./pet");
const Info = require("./info");

const PARSER_TMP = `
// Crawler-per parser template

// header method is optional
exports.header = function(options, crawler_handle) {
	// The "options" is request option
}

exports.body = function(url, body, response, crawler_handle) {
	const re = /\\b(href|src)\\s*=\\s*["']([^'"#]+)/ig
	var m = null
	while (m = re.exec(body)){
		let href = m[2]
		if (/\\.(png|gif|jpg|jpeg|mp4)\\b/i.test(href)) {
			crawler_handle.addDown(href)
		}else if(!/\\.(css|js|json|xml|svg)/.test(href)){
			crawler_handle.addPage(href)
		}
	}
	crawler_handle.over()
}
`

var error_message = (function(){
	const starttime = Date.now()
	try {
		var argv = Argv.new([
			["-u", "--url",      "str",         "Destination address"],
			["-o", "--outdir",   "str",         "Save the directory, Default use pwd"],
			["-r", "--restart",                 "Reload all page"],
			["--clear",                         "Clear queue"],
			["--save",           "str",         "Save file rules following options\n= url: Save the path consistent with url\n= simple: Save file in the project path\n= group: Save 500 files in one folder"],
			["--types",          "[]",          "Limit download file type"],
			["--limit",          "num=5",       "Concurrency limit"],
			["--sleep",          "num=200",     "Concurrent interval"],
			["--timeout",        "num=180000",  "Queue timeout"],
			["--proxy",           "str",        "Set up proxy"],
			["--parser",          "str",        "Set crawl rule, it's a js file path!\nThe default load the parser.js file in the project path"],

			["--maxsize",         "num",        "Limit the maximum size of the download file"],
			["--minwidth",        "num",        "Limit the minimum width of the download file"],
			["--minheight",       "num",        "Limit the minimum height of the download file"],

			["-i", "--info",                    "View the configuration file"],
			["-l", "--list",       "[]",        "View the queue data \ne.g. [page/down/queue],0,-1"],
			["-f", "--find",       "[]",        "Find the download URL of the local file"],
			["--json",                          "Print result to json format"],
			["-v", "--version",                 "View version"],
			["-h", "--help",                    "View help"],
			["--create-parser",    "str",       "Create a parser.js file"]
		]).parse()
	}catch(e){
		return `  Crawl-pet options error: r<${e}>\n  Crawl-pet options help:\n${argv.help()}`
	}

	if (argv.get("--version")) {
		return `  Crawl-pet version: g<${argv.version()}>`
	}

	if (argv.get("--help")) {
		return `  Crawl-pet options help:\n\n${argv.help()}\n\n  g<More configuration in info.json file>\n`
	}

	const outdir = Path.resolve(argv.get("--outdir") || "")
	const info   = Info.parse(outdir, argv)

	if (!info.exist) {
		let readSync = require("readline-sync")
		if (readSync.keyInYN('Create crawl-pet in '+outdir)) {
			let val = null
			let create_parser = false
			if ( !argv.get("--url") ){
				if(val = readSync.question("Crawl-pet target url: ")){
					info.set("url", val)
				}
			}
			if ( !argv.get("--save") ){
				if (val = readSync.question("Crawl-pet save rule [url/simple/group]: ", {limit: ['url', 'simple', "group"], defaultInput:"url"})) {
					info.set("save", val)
				}
			}
			if ( !argv.get("--parser") ){
				if (val = readSync.question("Crawl-pet rule parser (default): ")){
					let p = Path.join(outdir, val)
					if (!Crawler.file.isfile(p)){
						if (readSync.keyInYN('Crawl-pet will create '+p+' ')) {
							create_parser = p
							Crawler.file.write(p, PARSER_TMP)
						}
					}
					info.set("parser", val)
				}
			}
			if ( !argv.get("--types") ){
				if (val = readSync.question("Crawl-pet file type limit (all): ")){
					info.set("types", val.split(/ |,/))
				}
			}
			info.save()
			if (create_parser) {
				return `[Crawl-pet Create Parser] ${create_parser}`
			}
		}else{
			return "[Crawler exit]"
		}
	}

	if (argv.get("--create-parser")) {
		let readSync = require("readline-sync")
		let val = argv.get("--create-parser")
		if (typeof val === "string") {
			if (!/\.js$/i.test(val)) {
				val = Path.join(val, "parser.js")
			}
		}else{
			val = "parser.js"
		}
		val = Path.join(outdir, val)
		if (readSync.keyInYN('Create will create '+val+' ')) {
			Crawler.file.write(val, PARSER_TMP)		
		}
		return `[Crawl-pet Create Parser] ${val}`
	}

	if (!info.url) {
		return `Missing "url" parameter:\n${argv.help()}`
	}

	var crawler = Crawler.create(info.data)

	if (argv.get("--info")) {
		return info._data
	}

	if (argv.get("--list")) {
		let value = argv.get("--list")
		let type  = value[0] || "page"
		crawler.list(type, value[1] || 0, value[2] || -1, (res)=>{
			if (argv.get("--json")) {
				console.log(JSON.stringify(res))
				return
			}
			for (let i = 0; i < res.length; i++) {
				if (res[i].local) {
					console.log("Url:", res[i].url, "Local:", res[i].local)
				}else{
					console.log("Url:", res[i].url)
				}
			}
			Crawler.print("[Crawler list]", type+" count:", res.length, ", use time:", Date.now() - starttime + "ms")
		})
		return ""
	}

	if (argv.get("--find")) {
		crawler.find(argv.get("--find"), (res) => {
			if (argv.get("--json")) {
				console.log(JSON.stringify(res))
				return
			}
			for (let i = 0; i < res.length; i++) {
				console.log("Local:", res[i].key, ", Url:", res[i].url)
			}
			Crawler.print("[Crawler find]", "result:", res.length, ", use time:", Date.now() - starttime + "ms")
		})
		return ""
	}
	if (argv.get("--url")) {
		let url = argv.get("--url")
		if (!/^\w+:\/\//.test(url)){
			url = "http://" + url
		}
		crawler.addPage( url )
	}
	crawler.run(() => {
		Crawler.print("[Crawler Exit] Crawler!! over")
	})


})()

if (error_message){
	Crawler.print(error_message)
}

