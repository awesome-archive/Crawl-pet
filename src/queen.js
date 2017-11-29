
const ___print = require('hi-lib/print');

const EventEmitter = require('events').EventEmitter;
const Url = require('url');
const Path = require('path');
const File = require('hi-lib/file');
const Later = require('hi-lib/later');
const Ipc = require('hi-lib/ipc');
const DB = require('./db');
const Util = require('./util');
const Crawler = require('./crawler');

const laterCheckPageQueue = new Later(_checkPageQueue);
const laterCheckDownloadQueue = new Later(_checkDownloadQueue);

class Queen extends EventEmitter {

    constructor(loader, argv) {
        super();
        this.runing = false;
        this.argv = argv || { get() { }, set() { } };
        this.loader = loader;
        this.head = loader.export();
        this.db = new DB(loader.projectDir);
        let limit = this.head.limits || 5;
        this.pageLimit = Math.max(1, limit / 30 >> 0);
        this.downLimit = limit;
        this.pageStack = new Set();
        this.downStack = new Set();
        this.connectLimit = 5;
        if (this.head.init) {
            this.head.init(this);
        }
    }

    async start(restart) {
        if (this.runing) {
            return;
        }
        if (restart) {
            this.db.clear();
        }
        this.runing = true;
        if (restart || !this.db.isExist(this.head.url)) {
            if (this.head.prep) {
                await this.head.prep(this);
            }
            let url = this.head.url;
            if (!/^http/.test(url)) {
                url = "http://" + url;
            }
            this.db.appendPage(url);
        }
        this.emit('start');
        if (this.head.start) {
            await this.head.start(this);
        }
        _checkPageQueue(this);
        _checkDownloadQueue(this);
        return this;
    }

    over(fored) {
        if (fored) {
            if (this.downStack.size !== 0 || this.pageStack.size !== 0) {
                return;
            }
            this.runing = false;
            if (this._agent_ipc_) {
                this._agent_ipc_.close();
            }
            this.emit('over', { type: 'over' });
            process.exit();
        } else {
            clearTimeout(this._over_timing_);
            this._over_timing_ = setTimeout(() => {
                this.over(true);
            }, 2000);
        }
    }

    get agent() {
        if (!this._agent_ipc_ || !this._agent_ipc_.isLive) {
            this.connectLimit--;
            let config = {};
            for (let k in this.head) {
                if (typeof this.head[k] !== 'function') {
                    config[k] = this.head[k];
                }
            }
            if (this.argv.get('proxy')) {
                config.proxy = this.argv.get('proxy');
            }
            this._agent_ipc_ = Ipc.import(__dirname + '/agent.js', [JSON.stringify(config)], {}, this);
        }
        return this._agent_ipc_;
    }

    /////////////////////////////////////////////// 

    appendPage(url) {
        if (this.head.filter && this.head.filter(url) === false) {
            return false;
        }
        if (this.db.appendPage(url)) {
            this.emit('appendPage', url);
            laterCheckPageQueue.callOnce(this);
            return true;
        }
        return false;
    }

    appendDownload(url) {
        if (this.head.filterDownload && this.head.filterDownload(url) === false) {
            return false;
        }
        if (this.db.appendDownload(url)) {
            this.emit('appendDownload', url);
            laterCheckDownloadQueue.callOnce(this);
            return true;
        }
        return false;
    }

    async load(req) {
        if (typeof req === 'string') {
            req = { url: req };
        } try {
            let res = await this.agent.load(req);
            this.emit('loaded', req, res);
            return res;
        } catch (err) {
            _printError(err);
        }
    }

    async loadPage(req) {
        if (typeof req === 'string') {
            req = { url: req };
        }
        if (this.head.willLoad) {
            await this.head.willLoad(req);
        }
        try {
            let res = await this.agent.loadPage(req);
            if (res && res.ok) {
                let store = res.store;
                if (this.head.loaded) {
                    let crawler = new Crawler(this, res);
                    await this.head.loaded(res.body, store && store.links || [], store && store.links, crawler);

                } else if (store) {
                    let from = Url.parse(res.url || req.url);
                    if (store.links) {
                        for (let link of store.links) {
                            this.appendPage(Util.resolveUrl(from, link));
                        }
                    }
                    if (store.files) {
                        for (let file of store.files) {
                            this.appendDownload(Util.resolveUrl(from, file));
                        }
                    }
                }
            }
            this.emit('loaded', req, res);
        } catch (err) {
            _printError(err);
            if (_checkAgentInterrupt(this, err)) {
                await _wait(500);
                await this.loadPage(req);
                return;
            }
            process.exit();
        }
    }

    async download(url, to) {
        try {
            let local = Path.resolve(this.head.outdir, to || _makeLocalPath(this, url));
            let res = await this.agent.download(url, local);
            if (res.ok) {
                this.db.saveLocal(url, res.ok ? res.saveTo : 'failed');
            } else {
                this.db.saveFailed(url);
            }
            this.emit('downloaded', { url: url }, res);
        } catch (err) {
            _printError(err);
            if (_checkAgentInterrupt(this, err)) {
                await _wait(500);
                await this.download(url, to);
                return;
            }
            process.exit();
        }
    }

    async saveContent(to, content) {
        try {
            let local = Path.resolve(this.head.outdir, to);
            return await Util.saveFile(local, content);
        } catch (err) {
            _printError(err);
            process.exit();
        }
    }

    //////////////////////////////////////////////////////

    read(name) {
        return this.loader.getData(name);
    }

    save(name, value) {
        this.loader.setData(name, value);
        return value;
    }

    //////////////////////////////////////////////////////

    forEach(type, callback) {
        let iter = this.db.getIterator(type);
        if (iter) {
            while (iter.read()) {
                let key = iter.key;
                if (key[0] === '~') {
                    continue;
                }
                let value = iter.value;
                if (type === 'local') {
                    if (value === 1) {
                        continue;
                    }
                }
                callback(key, value);
            }
        }
    }

}



module.exports = Queen;

///////////////////////////////////////////////

function _checkQueue(queen) {
    if (queen.downStack.size < queen.downLimit) {
        _checkDownloadQueue(queen);
        if (queen.downStack.size < queen.downLimit * 0.2) {
            if (queen.head.sleep) {
                setTimeout(() => {
                    _checkPageQueue(queen);
                }, queen.head.sleep || 1000);
            } else {
                _checkPageQueue(queen);
            }
        }
    }
}

///////////////////////////////////////////////

function _checkPageQueue(queen) {
    if (!queen.runing) {
        return;
    }
    while (queen.pageStack.size < queen.pageLimit) {
        let data = queen.db.readPage();
        if (data) {
            let key = data.key;
            let url = data.value;
            if (queen.head.filter && queen.head.filter(url) === false) {
                continue;
            }
            _loadPage(queen, key, url);
        } else {
            queen.over();
            break;
        }
    }
}

function _loadPage(queen, key, url) {
    queen.pageStack.add(key);
    let next = () => {
        queen.pageStack.delete(key);
        _checkQueue(queen);
    };
    queen.loadPage(url).then(next).catch(next);
    return key;
}

///////////////////////////////////////////////

function _checkDownloadQueue(queen) {
    if (!queen.runing) {
        return;
    }
    while (queen.downStack.size < queen.downLimit) {
        let data = queen.db.readDownload();
        if (data) {
            let key = data.key;
            let url = data.value;
            if (queen.head.filterDownload && queen.head.filterDownload(url) === false) {
                continue;
            }
            _downloadFile(queen, key, url);
        } else {
            _checkPageQueue(queen);
            break;
        }
    }
}

function _downloadFile(queen, key, url) {
    queen.downStack.add(key);
    let next = () => {
        queen.downStack.delete(key);
        _checkQueue(queen);
    };
    queen.download(url).then(next).catch(next);
}

function _makeLocalPath(queen, url) {
    var i = Util.parseUrl(url);
    let basename = i.basename;
    if (!queen.head.keepName) {
        basename = (Date.now() + '' + Math.random() * 100 >> 0).substr(5) + '.' + i.extname;
    }
    switch (queen.head.saveMode) {
        case 'url':
            return i.host + '/' + i.dirname + '/' + basename;

        case 'type':
            return i.extname + '/' + basename;

        case 'group':
            if (queen._group_name_ === undefined) {
                let dirs = File.ls(queen.head.outdir);
                queen._group_name_ = 0;
                queen._group_count = 0;
                if (dirs.length) {
                    for (let name of dirs) {
                        if (/^\d+$/.test(name)) {
                            let n = parseInt(name);
                            if (n > queen._group_name_) {
                                queen._group_name_ = n;
                            }
                        }
                    }
                }
                if (File.isdir(queen.head.outdir + "/" + queen._group_name_)) {
                    queen._group_count = File.ls(queen.head.outdir + "/" + queen._group_name_).length;
                } else {
                    queen._group_count = 0;
                }
            }
            if (queen._group_count >= 500) {
                queen._group_name_ += 1;
                queen._group_count = 0;
            }
            queen._group_count += 1;
            return queen._group_name_ + "/" + basename;

        case 'default': default:
            return basename;
    }
}

function _wait(time) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, time);
    });
}

function _checkAgentInterrupt(queen, error) {
    if (queen.connectLimit > 0) {
        if (error.name === 'IpcError' && error.message == 'Unexpected interrupt!') {
            return true;
        }
    }
    return false;
}

function _printError(error) {
    if (error.stack) {
        ___print('\n#R{[Error]}');
        ___print(error.stack);
    } else {
        ___print(' #R{[Error]}', error.toString());
    }
}