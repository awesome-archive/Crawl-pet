
const LevelUp = require("levelup")
const Queue   = require("./queue")
const print   = require("./print")

exports.create = function(crawler, limit, sleep, timeout){
	return new Listener(crawler, limit, sleep, timeout)
}

class Listener {

	constructor(crawler, limit, sleep, timeout){
		this.parent = crawler
		this.db     = crawler.queuedb
		this.limit  = limit
		this.page   = Queue.create(this.db, 'page', Math.max(limit * 0.25 >> 0, 1), this, sleep, timeout, false)
		this.down   = Queue.create(this.db, 'down', Math.max(limit * 0.75 >> 0, 1), this, sleep, timeout, false)
		
		this._unqi_list = []
		this._over_timer = null
		this._first_load  = true
	}

	run(callback) {
		this.page.ready(()=>{
			this.down.ready(()=>{
				this.page.run()
				this.down.run()
				if (callback) {
					callback()
				}
			})
		})
	}

	stop(){
		this.page.stop()
		this.down.stop()
	}

	unique( value ) {
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

	// listen part

	onNext(queue_handle){
		const crawler = this.parent
		if (this._first_load){
			print("[Crawler-pet Load]", queue_handle.value)
			this._first_load = false
		}
		if (this._over_timer){
			clearTimeout(this._over_timer)
			this._over_timer = null
		}

		if (queue_handle.parent.id === "down") {
			crawler.downFile(queue_handle)
		}else{
			crawler.loadPage( queue_handle )
		}
		this.allotLimit()
	}

	onOver(queue_handle){
		var id = queue_handle.parent.id
		var page_length = this.page.length
		var down_length = this.down.length
		if (down_length === 0 && page_length === 0){
			if (this.down.count === 0 && this.page.count == 0) {
				if (this._first_load){
					this._over_timer = setTimeout(()=>{
						this.parent.over()
					}, 1000);
				}else if (!this._over_timer){
					this.parent.over()
				}
				return
			}
		}
		this.allotLimit()
	}

	onTimeout(queue_handle){
		queue_handle.next()
	}

	allotLimit() {
		var page_length = this.page.length
		var down_length = this.down.length
		if (down_length > this.limit) {
			this.down.limit = this.limit
			this.page.limit = 0
			if (this.down.count < this.down.limit){
				this.down.next()
			}
		}else {
			this.page.limit = this.limit - down_length
			this.down.limit = down_length
			if (this.page.count < this.page.limit){
				this.page.next()
			}
		}
	}

}