
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
	
		File.mkdir( this.info.dbdir )
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
		this.listener = Listener.create(this, info.limit || 5)

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
	
	loadPage(queue_handle){
		const url    = queue_handle.value
		const handle = new CrawlerHandle(this, "page", url , queue_handle)


		if (!handle.uri.protocol || !handle.uri.host) {
			queue_handle.next()
			return
		}

		if (this.parser.header) {
			if (this.parser.header(handle.options, handle) === false){
				queue_handle.next()
				return
			}
		}

		try {
			Request(handle.options, (err, response, body)=>{
				this.tempdb.put(url, "loaded")
				this.datadb.put("page."+url, "page")

				if (err) {
					queue_handle.next()
					print("[Crawl-pet LoadPage Error]", url, err && err.message)
					return
				}
			
				if (response.statusCode == 200) {
					print("[Crawl-pet. LoadPage]", url, response.statusCode, Date.now()-queue_handle.timestamp + "ms")
					this.parser.body( url, body, response, handle)
				} else {
					queue_handle.next()
					print("[Crawl-pet. LoadPage Failed]", url, response.statusCode, Date.now()-queue_handle.timestamp + "ms")
				}
				if (this._cookie_jar) {
					this.tempdb.put("cookie", this._cookie_jar.getCookieString(this.info.url))
				}
			})
		}catch (e){
			queue_handle.next()
			print("[Crawl-pet Request Error]", url, err && err.message)
			return
		}
	}

	downFile(queue_handle, no_size){
		const url  = queue_handle.value
		const info = this.info

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
		const handle = new CrawlerHandle(this, "down", url , queue_handle)
		if (!handle.save_path) {
			queue_handle.next()
			return
		}
		const out_path = Path.join(info.outdir, handle.save_path)
		File.mkdir( Path.dirname(out_path) )
	
		if (this.parser.header) {
			if (this.parser.header(handle.options, handle) === false){
				queue_handle.next()
				return
			}
		}

		Request(handle.options)
		.on("error", (err)=>{
			queue_handle.next()
			print("[Crawl-pet Download Error]", url, Date.now()-queue_handle.timestamp+"ms")
		})
		.on("end", (err)=>{
			print("[Crawl-pet Download]", url, "-->", handle.save_path, Date.now()-queue_handle.timestamp+"ms")
			this.datadb.batch([
				{type: "put", key: url, value: handle.save_path},
				{type: "put", key: "local."+handle.save_path, value: url}
			], (err)=>{
				handle.over()
			})
		})
		.pipe( Fs.createWriteStream(out_path))
	}

}

class CrawlerHandle {

	constructor(crawler, type, url, queue_handle) {
		this.parent       = crawler
		this.type         = type
		this.info         = crawler.info
		this.uri          = URL.parse(url)
		this.queue_handle = queue_handle
		var m = this.uri.pathname.match(/\/([^\/]*?)\.(\w+)$|\/$/)
		if (m) {
			this.uri.dirname  = this.uri.pathname.substr(0, m.index)
			this.uri.basename = m[1]
			this.uri.ext      = m[2]
		}else{
			this.uri.dirname = this.uri.pathname
		}

		this.options = { url: url, uri: this.uri }
		if (type === "page" ) {
			this.options.method = this.info.method || "GET"
			if (this.info.headers) {
				this.options.headers = this.info.headers
			}
			if (crawler._cookie_jar){
				this.options.jar = crawler._cookie_jar
			}
			if (this.info.timeout){
				this.options.timeout = this.info.timeout
			}
		}else{
			this.options.method = "GET"
			this.save_path = this.resolveSave(url)
		}
		if (this.info.proxy) {
			this.options.proxy = this.info.proxy
		}
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

	resolveSave( url, ext){
		const crawler = this.parent
		switch (crawler.info.save) {
			case "url": default:
				let uri = URL.parse(url)
				return Path.join(uri.host || "", uri.pathname).replace(/[\*\s]+/i, "_")
			
			// case "page":
			// 	return this.uri.dirname + "/" + fileNameMD5(url, ext)

			case "simple":
				return fileNameMD5(url, ext)
			
			case "group":
				if ( crawler._save_group_name === undefined ){
					let dirs = File.lsdir( crawler.info.outdir, true )
					crawler._save_group_name = 0
					crawler._save_group_count = 0
					if (dirs.length) {
						for (let i=0; i<dirs.length; i++){
							if (/^\d+$/.test(dirs[i])){
								dirs[i] = parseInt(dirs[i])
								if (dirs[i] > crawler._save_group_name) {
									crawler._save_group_name = dirs[i]
								}
							}
						}
					}
					crawler._save_group_count = File.lsfile(crawler.info.outdir + "/"+crawler._save_group_name, true).length
				}
				if (crawler._save_group_count >= 500){
					crawler._save_group_name += 500
					crawler._save_group_count = 0
				}
				crawler._save_group_count += 1
				return crawler._save_group_name+"/"+fileNameMD5(url, ext)
		}
	}

	addPage( url ){
		this.parent.addPage( this.resolveUrl(url.trim()) )
	}

	addDown( url ){
		this.parent.addDown( this.resolveUrl(url.trim()) )
	}

	save(content, ext) {
		var save_path = this.parent.resolveSave(this.uri.href, ext)
		if (save_path) {
			var local_path = Path.join(this.info.outdir, save_path)
			return File.write(local_path, content)
		}
		return false
	}

	over(){
		if (this.queue_handle) {
			if (this.info.sleep > 0){
				setTimeout(()=>{
					this.queue_handle.next()
				}, this.info.sleep);
			}else{
				this.queue_handle.next()
			}
		}
	}
	
	stop(){
		this.parent.stop()
	}
}

function fileNameMD5( url, ext ) {
	var m = url.match(/(\.\w+)(?:$|\?)/)
	ext = m && m[1] || ext || ""
	return Crypto.createHash('md5').update(url).digest('hex') + ext
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
			print('[Crawl-pet Load Parser]', tests[i])
			return parser
		}
	}
	throw `[Crawl-pet Error] Cant load "${file}" parser!`
}