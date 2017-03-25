#!/usr/bin/env node
const Path = require("path");
const Argv = require("nodejs-argv");
const Crawler = require("./pet");
const Info = require("./info");

var error_message = (function(){
	const starttime = Date.now()

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
	try {
		var argv = Argv.new([
			["-u", "--url",      "str",         "Destination address"],
			["-o", "--outdir",   "str",         "Save the directory, Default use pwd"],
			["-r", "--restart",                 "Reload all page"],
			["--clear",                         "Clear queue"],
			["--save",           "str",         "Save file rules following options\n"+
												"= url: Save the path consistent with url\n"+
												// "= page: Save file in the page url path\n"+
												"= simple: Save file in the project path\n"+
												"= group: Save 500 files in one folder"],
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
			["--create-parser",    "str",       "Create a parser.js template"]
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

	var outdir = Path.resolve(argv.get("--outdir") || "")
	var info   = Info.parse(outdir, argv)

	if (argv.get("--create-parser")) {
		let RLS = require("readline-sync")
		let create_parser = argv.get("--create-parser")
		if (typeof create_parser === "string") {
			if (!/\.js$/i.test(create_parser)) {
				create_parser = Path.join(create_parser, "parser.js")
			}
		}else{
			create_parser = "parser.js"
		}
		create_parser = Path.join(outdir, create_parser)
		if (RLS.keyInYN('\033[91mCreate parser module "'+create_parser+'"\033[0m')) {
			Crawler.file.write(create_parser, PARSER_TMP)
			return `[Crawl-pet Create Parser] ${create_parser}`	
		}
		return `[Crawl-pet Create Parser Faile]`
	}

	if (!info.exist) {
		// Create ask
		let RLS = require("readline-sync")
		function askArgv(name, opt, list) {
			var val  = argv.get(name)
			var tip  = null
			if ( !val ) {
				if (tip = list[0]) {
					if (val = RLS.question( '\033[92m'+ tip +'\033[0m: ', opt)) {
						argv.parse([name, val])
						return val
					}
					if (list[2]) {
						val = list[2]
					}
				}
			}
			if (val && (tip = list[1])) {
				console.log('\033[91m'+ tip +'\033[0m: ', val)
			}
		}

		if ( askArgv('--outdir', {}, ["Set project dir"]) ) {
			outdir = Path.resolve( argv.get("--outdir") )
		}
		if (! RLS.keyInYN('\033[91mCreate crawl-pet in '+outdir+'\033[0m')) {
			return "[Crawl-pet exit] r<not project dir>"
		}
		askArgv("--url", {}, ["Set target url", "The target url"])
		askArgv("--save", {limit: ['url', 'simple', "group"]}, ["Set save rule [url/simple/group]", "The rule"])
		askArgv("--types", {}, ["Set file type limit", "The limit", "not limit"])
		let create_parser = askArgv("--parser", {}, ["Set parser rule module", "The module", "use default Crawl-pet.parser"])

		info   = Info.parse(outdir, argv)
		info.save()
		if (create_parser) {
			if (!/\.js$/i.test( create_parser )) {
				create_parser += '.js'
			}
			create_parser = Path.join(outdir, create_parser)
			if ( !Crawler.file.isfile(create_parser) && RLS.keyInYN('\033[91mCreate parser module "'+create_parser+'"\033[0m') ){
				Crawler.file.write(create_parser, PARSER_TMP)
				return `[Crawl-pet Create Parser] ${create_parser}`
			}
		}
		// Create end
	}

	if (argv.get("--info")) {
		return info._data
	}

	if (!info.url) {
		return `Missing "url" parameter:\n${argv.help()}`
	}

	var crawler = Crawler.create(info.data)

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
		Crawler.print("[Crawler Exit] g<Crawler!! over>")
	})

})()

if (error_message){
	Crawler.print(error_message)
}

