
"use strict"

exports.create = function(db, id, limit = 5, listener, sleep = 0, timeout = 60000, protect = true){
	if (!listener) {
		throw "[Crawl-pet Queue Create Error] New Queue object need listener parameter!"
	}
	if (typeof listener.onNext !== "function" || typeof listener.onOver !== "function") {
		throw "[Crawl-pet Queue Create Error] listener must has onNext and onOver method!"
	}
	return new Queue(db, id, limit, listener, sleep, timeout, protect)
}

class Queue {

	constructor(db, id, limit, listener, sleep, timeout, protect){
		this.db       = db
		this.id       = id
		this.status   = "stop"
		this.limit    = limit
		this.count    = 0
		this.sleep    = sleep
		this.listener = listener
		this.timeout  = timeout

		this._length_key    = this.id + ".length"
		this._index_key     = this.id + ".index"
		this._length        = undefined
		this._index         = undefined
		this._temp          = undefined
		this._unqi_list     = protect ? [] : null
		this._timeout_timer = null
	}

	ready(callback){
		if (this._length >= 0) {
			if (typeof callback === "function") {
				callback(this)
			}
			return this
		}
		this.db.get(this._index_key, (err, value)=>{
			this._index = value && parseInt(value) || 0
			this.db.get(this._length_key, (err, value)=>{
				this._length = value && parseInt(value) || 0
				if (typeof callback === "function") {
					callback(this)
				}
			})
		})
		if (this.timeout && !this._timeout_timer) {
			Queue.checkTimeout(this)
		}
		return this
	}

	get length(){
		return this._length - this._index + (this._temp ? this._temp.length : 0)
	}

	append( value ) {
		if (this._length === undefined || this.status === "stop") {
			if (arguments.length) {
				if (!this._temp) {
					this._temp = []
				}
				this._temp.push.apply(this._temp, arguments)
			}
			return
		}

		if (this._temp){
			let temp = this._temp
			delete this._temp
			for (let i=0; i<temp.length; i++) {
				this.append( temp[i] )
			}
		}
		if (!value) {
			return
		}
		if ( this.protect(value) ) {
			value = typeof value === "object" ? "\xc4" + JSON.stringify(value) : value
			var uniq_key = this.id + '.' + value
			this.db.get(uniq_key, (err, index) => {
				if (index && index <= this._index ){
					return
				}
				index = this._length ++
				this.db.batch([
					{type:'put', key: this._length_key, value: this._length},
					{type:'put', key: this.id + '.' +index, value: value},
					{type:'put', key: uniq_key , value: index}
				], ()=>{
					this.next()
				})
			})
		}
		for (let i=1; i<arguments.length; i++) {
			this.append(arguments[i])
		}
	}

	protect( value ){
		if (!this._unqi_list){
			return true
		}
		if ( this._unqi_list.indexOf(value) === -1 ){
			if (this._unqi_list.length > 500){
				this._unqi_list = []
			}
			this._unqi_list.push( value )
			return true
		}
		return false
	}

	run(){
		this.status = "runing"
		this.ready(()=>{ this.next() })
	}

	stop(){
		clearInterval(this._timeout_timer);
		this.status = "stop"
	}

	next(){
		if (this._temp){
			this.append()
			return
		}
		if (this.status === "stop"){
			return
		}
		if (this._index >= this._length) {
			clearInterval(this._timeout_timer);
			if (this.count <= 0 && this.status === "runing") {
				this.status = "waiting"
				this.listener.onOver( new QueueHandle(this) )
			}
			return
		}
		if (this.count < this.limit) {
			this.count += 1
			let index = this._index++
			this.db.get(this.id + '.' +index, (err, value)=>{
				if (value){
					this.status = "runing"
					if (value[0] === "\xc4"){
						value = JSON.parse( value.substr(1) )
					}
					this.listener.onNext( new QueueHandle(this, index, value) ) 
					if (this.count < this.limit) {
						this.next()
					}
				}else{
					this.count -= 1
					this.next()
				}
			})
		}
	}

	static checkTimeout(queue) {
		var last_index = queue._index
		queue._timeout_timer = setInterval(() => {
			if (last_index != queue._index || queue.status === "stop" || (queue._index >= queue._length && queue.count == 0) ) {
				last_index = queue._index
				return
			}
			if (typeof queue.listener.onTimeout === "function") {
				queue.listener.onTimeout( new QueueHandle(queue) )
			}else{
				throw "[Crawl-pet Queue TimeOut] id: \""+queue.id+"\", length: "+queue._length+", index: "+queue._index
			}
		}, queue.timeout);
	}
}

class QueueHandle {

	constructor(queue, index, value) {
		this.parent = queue
		this.index = index
		this.value = value
		this.timestamp = Date.now()
	}

	get length() {
		return this.parent.length
	}

	next(){
		const queue = this.parent

		if (this.index >= 0){
			queue.db.batch([
				{type:"del", key: this.parent.id+'.'+this.index},
				{type:"del", key: this.parent.id+'.'+this.value}
			])
		}

		queue.db.get( queue._index_key, (err, index)=>{
			if (!index || parseInt(index) < this.index) {
				queue.db.put( queue._index_key, this.index)
			}
			if (queue.sleep) {
				setTimeout(()=>{
					queue.count -= 1
					queue.next()
				}, queue.sleep);
			}else{
				queue.count -= 1
				queue.next()
			}
		})
	}
}
