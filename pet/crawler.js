
"use strict"

const Fs      = require("fs")
const Path    = require('path')
const URL     = require('url')
const LevelUp = require("levelup")
const Request = require('request')
const Crypto = require('crypto');

const ImgSize = require("./imgsize")
const File     = require("./file")
const Listener = require("./listener")
const print    = require("./print")

exports.create = function(info, parser) {
	return new Crawler(info, parser)
}

class Crawler {

	constructor(info, parser) {
		this.info             = info
		if (!/\w+\:\/\//.test(info.url)){
			info.url = "http://" + info.url
		}
		this.info.uri         = info.url && URL.parse( info.url )
		this.info.domain      = info.uri.host.replace(/^[\w\-]+\.([\w\-]+\..+)/i, "$1")
		this.info.dbdir       = Path.join(info.outdir, "/db/")
		this.info.maindbpath  = Path.join(info.dbdir, "data")
		this.info.tempdbpath  = Path.join(info.dbdir, "temp")
		this.info.queuedbpath = Path.join(info.dbdir, "queue")
	
		if (!File.isdir( info.dbdir )) {
			File.mkdir( this.info.dbdir )
		}
		
		if ( info["--restart"] ) {
			print("[Crawl-pet Restart]")
			File.del( info.tempdbpath )
		}
		if (info["--clear"]) {
			print("[Crawl-pet Clear Queue]")
			File.del( info.queuedbpath )
		}
		this.datadb   = LevelUp(info.maindbpath )
		this.tempdb   = LevelUp(info.tempdbpath)
		this.queuedb  = LevelUp(info.queuedbpath)
		this.listener = Listener.create(this, info.limit || 5, info.sleep, info.timeout)

		this.parser   = parser
		this.fileFilter = null
		var types = (info.types || []).join("|")
		if (types && types !== "*") {
			this.fileFilter = new RegExp("\.(" + types + ")", "i")
		}

		this._cookie_jar = null
		this._run_callback = null

		if (info.url){
			this.addPage( info.url )
		}
	}

	run(callback) {
		const info = this.info
		if (!this.parser) {
			this.parser = requireParser( info.parser, info.rootdir || info.outdir )
		}
		this._run_callback = callback
		if (info.cookie) {
			this.tempdb.get("cookie", (err, text)=>{
				if (!text) {
					text = ""
					if (typeof info.cookie == "object") {
						for (let k in info.cookie){
							text += k + "="+ info.cookie[k]+";"
						}
					}else{
						text = info.cookie
					}
				}
				text = Request.cookie(text)
				this._cookie_jar = Request.jar();
				this._cookie_jar.setCookie(text, "."+info.url);
				this.listener.run()

				print("[Crawl-pet Load Cookie]", this._cookie_jar.getCookieString(info.url))
			})
		}else {
			this.listener.run()
		}
	}

	addPage(url) {
		if ( this.listener.unique(url) ) {
			this.tempdb.get(url, (err, statur) => {
				if (!statur) {
					this.tempdb.put(url, "queue")
					this.listener.page.append( url )
				}
			})
		}
		if (arguments.length > 1) {
			for (let i=1; i<arguments.length; i++){
				this.addPage(arguments[i])
			}
		}
	}

	addDown(url) {
		if ( this.listener.unique(url) ) {
			if (!this.fileFilter || this.fileFilter.test(url)) {
				this.datadb.get( url, (err, local) => {
					if (!local) {
						this.datadb.put(url, "queue")
						this.listener.down.append(url)
					}
				})
			}
		}
		if (arguments.length > 1) {
			for (let i=1; i<arguments.length; i++){
				this.addDown(arguments[i])
			}
		}
	}

	//

	find( files, callback){
		var keys = []
		for (let i=0; i<files.length; i++){
			keys.push( "local."+Path.relative(this.info.outdir, files[i]) )
		}
		var res = []
		this.datadb.createReadStream()
		.on('data', function (data) {
			if (keys.indexOf(data.key)!==-1){
				res.push( {key: data.key.substr(6), url: data.value} )
			}
		})
		.on('close', function () {
			callback(res)
		})
	}

	list(target, start, limit, callback){
		if (typeof start === "function"){
			callback = start, start = 0, limit = -1
		}else{
			start = parseInt(start), limit = parseInt(limit)
		}
		var res = []
		var index = 0
		var stream = null

		switch (target) {
			case "down":
				stream = this.datadb.createReadStream()
				stream.on('data', function (data) {
					if (data.key[0] === "l" && data.key.substr(0, 6) === "local."){
						if (index >= start) {
							res.push( {url: data.value, local: data.key.substr(6)} )
							if (limit !== -1 && res.length >= limit) {
								this.destroy()
							}
						}
						index += 1
					}
				})
			break
			case "page":
				stream = this.datadb.createReadStream()
				stream.on('data', function (data) {
					if (data.key[0] === "p" && data.key.substr(0, 5) === "page."){
						if (index >= start) {
							res.push( {url: data.key.substr(5)} )
							if (limit !== -1 && res.length >= limit) {
								this.destroy()
							}
						}
						index += 1
					}
				})
			break
			case "queue":
				stream = this.listener.db.createReadStream()
				stream.on('data', function (data) { 
					if (/^\w+\.\d+$/.test(data.key)){
						if (index >= start) {
							res.push( {url: data.value} )
							if (limit !== -1 && res.length >= limit) {
								this.destroy()
							}
						}
						index += 1
					}
				})
			break
		}
		if (stream){
			stream.on('close', function(){callback(res)})
		}
	}

	stop() {
		this.listener.stop()
	}

	over(){
		if (typeof this._run_callback === "function") {
			this._run_callback()
		}
	}

	// 

	resolvePath( url, ext ) {
		switch (this.info.save) {
			case "simple":
				return Crawler.createFileName(url, ext)
			
			case "group":
				if ( this._save_group_name === undefined ){
					let dirs = File.lsdir( this.info.outdir, true )
					this._save_group_name = 0
					this._save_group_count = 0
					if (dirs.length) {
						for (let i=0; i<dirs.length; i++){
							if (/^\d+$/.test(dirs[i])){
								dirs[i] = parseInt(dirs[i])
								if (dirs[i] > this._save_group_name) {
									this._save_group_name = dirs[i]
								}
							}
						}
					}
					this._save_group_count = File.lsfile(this.info.outdir + "/"+this._save_group_name, true).length
				}
				if (this._save_group_count >= 500){
					this._save_group_name += 500
					this._save_group_count = 0
				}
				this._save_group_count += 1
				return this._save_group_name+"/"+Crawler.createFileName(url, ext)
			
			case "url": default:
				return url.replace(/^(\w+\:\/\/|\/\/|\/|\.\.|\.)|\?.*/i, "")
						  .replace(/[*\s]+/i, "_")
						  .replace(/\?.+$/, "")
		}
	}

	loadPage(queue_handle){
		const url    = queue_handle.value
		const uri    = URL.parse(url)
		if (!uri.protocol || !uri.host) {
			queue_handle.next()
			return
		}

		const handle = new CrawlerHandle(this, uri, queue_handle)

		var options = {method: "GET", url: url, uri: uri }
		if (this.info.headers) {
			options.headers = this.info.headers
		}
		if (this.info.proxy) {
			options.proxy = this.info.proxy
		}
		if (this._cookie_jar){
			options.jar = this._cookie_jar
		}
		if (this.parser.header) {
			if (this.parser.header(options, handle) === false){
				queue_handle.next()
				return
			}
		}

		try {
			Request(options, (err, response, body)=>{
				this.tempdb.put(url, "loaded")
				this.datadb.put("page."+url, "page")
				if (err) {
					print("[Crawl-pet LoadPage Error]", url, err && err.message)
					queue_handle.next()
					return
				}
			
				if (response.statusCode == 200) {
					print("[Crawl-pet. LoadPage]", url, response.statusCode, Date.now()-queue_handle.timestamp + "ms")
					this.parser.body( url, body, response, handle)
				} else {
					print("[Crawl-pet. LoadPage Failed]", url, response.statusCode, Date.now()-queue_handle.timestamp + "ms")
					queue_handle.next()
				}
				if (this._cookie_jar) {
					this.tempdb.put("cookie", this._cookie_jar.getCookieString(this.info.url))
				}
			})
		}catch (e){
			print("[Crawl-pet Request Error]", url, err && err.message)
			queue_handle.next()
			return
		}
	}

	downFile(queue_handle, no_size){
		const url     = queue_handle.value
		const info    = this.info

		if (!no_size && (info.maxsize || info.minwidth || info.minheight)) {
			ImgSize.urlSize( url, (size)=>{
				if (size){
					if ((info.maxsize && size.kb>info.maxsize) || (info.minwidth && size.width<info.minwidth) || (info.minheight && size.height<info.minheight)) {
						queue_handle.next()
						return
					}
				}
				this.downFile(queue_handle, true)
			})
			return
		}

		const save_path = this.resolvePath(url)
		if (!save_path) {
			queue_handle.next()
			return
		}
		const out_path = Path.join(info.outdir, save_path)
		const out_dir  = Path.dirname(out_path)

		var options = { method: "GET", url: url }
		if (!File.isdir(out_dir)) {
			File.mkdir(out_dir)
		}
		if (info.proxy) {
			options.proxy = info.proxy
		}
		Request(options)
		.on("error", (err)=>{
			print("[Crawl-pet Download Error]", url, Date.now()-queue_handle.timestamp+"ms")		
			queue_handle.next()
		})
		.on("end", (err)=>{
			print("[Crawl-pet Download]", url, "-->", save_path, Date.now()-queue_handle.timestamp+"ms")
			this.datadb.batch([
				{type: "put", key: url, value: save_path},
				{type: "put", key: "local."+save_path, value: url}
			], (err)=>{
				queue_handle.next()
			})
		})
		.pipe( Fs.createWriteStream(out_path))
	}

	static createFileName( url, ext ) {
		var m = url.match(/(\.\w+)(?:$|\?)/)
		ext = m && m[1] || ext || ""
		return Crypto.createHash('md5').update(url).digest('hex') + ext
	}

}

class CrawlerHandle {

	constructor(crawler, uri, queue_handle) {
		this.parent       = crawler
		this.info         = crawler.info
		this.queue_handle = queue_handle
		this.uri          = uri
		this.uri.dirname  = (/\.\w+$/.test(uri.pathname) ? Path.dirname(uri.pathname) : uri.pathname)
	}

	resolveUrl( url ){
		var m = url.match(/^(http:\/\/|https:\/\/|\/\/|\.\.|\.|\/|.)/i)
		switch (m[1]) {
			case "http://": case "https://":
				return url
			case "//":
				return this.uri.protocol + url
			case "/":
				return this.uri.protocol + "//" + this.uri.host + "/" + url
			default:
				return this.uri.protocol + "//" + this.uri.host + this.uri.dirname + "/" + url
		}
	}

	addPage( url ){
		this.parent.addPage( this.resolveUrl(url.trim()) )
	}

	addDown( url ){
		this.parent.addDown( this.resolveUrl(url.trim()) )
	}

	save(content, ext) {
		var save_path = this.parent.resolvePath(this.uri.href, ext)
		if (save_path) {
			var local_path = Path.join(this.info.outdir, save_path)
			return File.write(local_path, content)
		}
		return false
	}

	over(){
		if (this.queue_handle) {
			this.queue_handle.next()
			this.queue_handle = null
		}
	}

	stop(){
		this.parent.stop()
	}

}

function requireParser( file, dir ){
	if (!file) {
		if (File.isfile(dir+"/parser.js")) {
			return require(dir+"/parser.js")
		}
		return require("../parser")
	}
	if (/\(/.test(file)) {
		return eval(`\(${file}\)`)
	}
	if (!/\.js$/i.test(file)){
		file += ".js"
	}
	var tests = [
		Path.resolve(dir, file),
		Path.resolve(file),
		Path.resolve(Path.dirname(module.parent.parent.filename) , file)
	]
	for(let i=0; i<tests.length; i++){
		if (File.isfile(tests[i])) {
			print("[Crawl-pet Parser]", tests[i])
			let parser = require(tests[i])
			if (typeof parser.body !== "function") {
				if (typeof parser !== "function") {
					throw `[Crawl-pet Error] "${tests[i]}", Parser module nead "body" method!`
				}
				parser = {body: parser}
			}
			return parser
		}
	}
	throw `[Crawl-pet Error] Cant load "${file}" parser!`
}