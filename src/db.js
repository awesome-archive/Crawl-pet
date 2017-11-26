
const LevelDb = require('leveldb-addon');
const File = require('hi-lib/file');
const Hash = require('hi-lib/hash');
const EventEmitter = require('events').EventEmitter;
const Util = require('./util');

class DB extends EventEmitter {

    constructor(project_dir) {
        super();
        this.dir = project_dir + '/.db';
        if (!File.isdir(this.dir)) {
            File.mkdirs(this.dir);
        }
        process.on('SIGINT', () => {
            this.close();
            process.exit();
        });
        process.on('exit', () => {
            this.close();
            process.exit();
        });
        this.load();
    }

    close(){
        if (this.localDb) {
            this.localDb.close();
            this.localDb = null;
        }
        if (this.queueDb) {
            if (this.queueDb.pageIter) {
                this.queueDb.pageIter.break();
            }
            if (this.queueDb.downIter) {
                this.queueDb.downIter.break();
            }
            this.queueDb.close();
            this.queueDb = null;
        }
    }

    load() {
        if (!this.localDb || !this.localDb.isOpen) {
            this.localDb = new LevelDb({ location: this.dir + '/local.db' }).open();
            this.localCount = this.localDb.get('~count~') || 0;
        }
        if (!this.queueDb || !this.queueDb.isOpen) {
            this.queueDb = new LevelDb({ location: this.dir + '/queue.db' }).open();
            let d = this.queueDb.match('p.', -1);
            this.queueDb.pageLast = d && _int36To(d.key) || 0;
            d = this.queueDb.match('d.', -1);
            this.queueDb.downLast = d && _int36To(d.key) || 0;
        }
        return this;
    }

    release() {
        if (this.queueDb) {
            if (this.queueDb.pageIter) {
                this.queueDb.pageIter.break();
                this.queueDb.pageIter = null;
            }
            if (this.queueDb.downIter) {
                this.queueDb.downIter.break();
                this.queueDb.downIter = null;
            }
            this.queueDb.close();
            this.queueDb = null;
        }
        return this;
    }

    clear() {
        this.release();
        if (LevelDb.isExist(this.dir + '/queue.db')) {
            LevelDb.destroy(this.dir + '/queue.db');
        }
        this.load();
        return this;
    }

    ///////////////////////////////////////////////

    appendPage(url, force) {
        if (!Util.testUrl(url)) {
            return false;
        }
        url = Util.clearUrl(url);
        let key = Hash.md5(url);
        if (!force && this.queueDb.get(key)) {
            return false;
        }
        let batch = {};
        batch[key] = 1;
        batch['p.' + _toInt36(this.queueDb.pageLast++)] = url;
        this.queueDb.put(batch);
        return true;
    }

    appendDownload(url, force) {
        if (!Util.testUrl(url)) {
            return false;
        }
        url = Util.clearUrl(url);
        let key = Hash.md5(url);
        if (!force && this.localDb.get(key)) {
            return false;
        }
        this.queueDb.put('d.' + _toInt36(this.queueDb.downLast++), url);
        this.localDb.put(key, 1);
        return true;
    }

    ///////////////////////////////////////////////

    readPage() {
        let ref;
        if (!this.queueDb.pageIter) {
            this.queueDb.pageIter = this.queueDb.getIterator({ prefix: 'p.', snapshot: false });
        }
        if (this.queueDb.pageIter.read()) {
            ref = { key: this.queueDb.pageIter.key, value: this.queueDb.pageIter.value };
        } else {
            this.queueDb.pageIter.break();
            this.queueDb.pageIter = this.queueDb.getIterator({ prefix: 'p.', snapshot: false });
            if (this.queueDb.pageIter.read()) {
                ref = { key: this.queueDb.pageIter.key, value: this.queueDb.pageIter.value };
            }
        }
        if (ref) {
            this.queueDb.del(ref.key);
        }
        return ref;
    }

    readDownload() {
        let ref;
        if (!this.queueDb.downIter) {
            this.queueDb.downIter = this.queueDb.getIterator({ prefix: 'd.', snapshot: false });
        }
        if (this.queueDb.downIter.read()) {
            ref = { key: this.queueDb.downIter.key, value: this.queueDb.downIter.value };
        } else {
            this.queueDb.downIter.break();
            this.queueDb.downIter = this.queueDb.getIterator({ prefix: 'd.', snapshot: false });
            if (this.queueDb.downIter.read()) {
                ref = { key: this.queueDb.downIter.key, value: this.queueDb.downIter.value };
            }
        }
        if (ref) {
            this.queueDb.del(ref.key);
        }
        return ref;
    }

    ///////////////////////////////////////////////

    saveLocal(url, local) {
        url = Util.clearUrl(url);
        let key = Hash.md5(url);
        let batch = {};
        batch[key] = { url: url, local: local };
        batch['~count~'] = ++this.localCount;
        this.localDb.put(batch);
    }

    saveFailed(url) {
        url = Util.clearUrl(url);
        let key = Hash.md5(url);
        this.localDb.put(key, { url: url });
    }

    ///////////////////////////////////////////////

    isExist(url) {
        let key = Hash.md5(Util.clearUrl(url));
        return !!this.localDb.get(key) || this.queueDb.get(key);
    }

    ///////////////////////////////////////////////
    getIterator(type, snapshot = false) {
        if (type === 'page') {
            return this.queueDb.getIterator({ prefix: 'p.', snapshot: snapshot });
        } else if (type === 'download') {
            return this.queueDb.getIterator({ prefix: 'd.', snapshot: snapshot });
        } else if (type === 'local') {
            return this.localDb.getIterator({ snapshot: snapshot });
        }
    }

    delete(type, key) {
        if (type === 'local') {
            this.localDb.del(key);
        } else {
            this.queueDb.del(key);
        }
    }
}

module.exports = DB;

///////////////////////////////////////////////

function _toInt36(num) {
    let s = num.toString(36);
    if (s.length < 10) {
        return '0'.repeat(10 - s.length) + s;
    }
    return false;
}

function _int36To(str) {
    return parseInt(str.replace(/^[a-z]*\./, ''), 36);
}