
const Path = require('path');
const File = require('hi-lib/file');

const TEMPLATE_NAME = "crawler.js";
const DEFAULT = {
    "url": null,
    "outdir": null,
    "saveMode": 'url', // type, group default
    "keepName": false,
    "limits": 5,
    "timeout": 60000 * 3,
    "limitWidth": 0,
    "limitHeight": 0,
    "proxy": false,
    'userAgent': null,
    "cookies": null,
    "fileTypes": "png|gif|jpg|jpeg|svg|xml|mp3|mp4|pdf|torrent|zip|rar",
    "sleep": 1000,
    "crawl_data": {}
};
const TEMPLATE = `
module.exports = {
    /****************
     * Info part
     ****************/
    projectDir: __dirname,
    %{config},

    // crawl_js : "./parser.js",

    /****************
     * Crawler part
     *****************/
    // init(queen) {},
    // prep(queen) {},
    // start(queen) {},
    // filter(url) {},
    // filterDownload(url) {},
    // willLoad(request) {},
    // loaded(body, links, files, crawler) {},
    // browser(crawler) {}
}`;

class Loader {

    constructor(project_dir) {
        this.projectDir = project_dir.replace(/\/+$/g, '');
        this.saveTo = Path.join(this.projectDir, TEMPLATE_NAME);
        this.isExist = false;
        this._temp_ = {};
        this._origin_ = {};
        this._changed_ = new Set();
        if (File.isfile(this.saveTo)) {
            this.isExist = true;
            this._origin_ = require(this.saveTo);
            if (this._origin_.crawl_js) {
                this.loadCrawl(this._origin_.crawl_js);
            }
        } else {
            this._temp_.projectDir = this.projectDir;
        }
        this._origin_.crawl_data = this._origin_.crawl_data || {};
        this._temp_.outdir = this._origin_.outdir || this._origin_.projectDir || this.projectDir;
    }

    loadCrawl(file) {
        let ref = require(Path.resolve(this.projectDir, file));
        Object.assign(this._origin_, ref);
    }

    get(name) {
        return this._temp_[name] || this._origin_[name] || DEFAULT[name];
    }

    set(name, value) {
        if (name == 'outdir') {
            this._temp_.outdir = Path.resolve(value);
        } else {
            this._temp_[name] = value;
        }
        this._changed_.add(name);
        _pushSave(this);
        return value;
    }

    getData(name) {
        return this._origin_.crawl_data[name];
    }

    setData(name, value) {
        this._origin_.crawl_data[name] = value;
        this._changed_.add('crawl_data');
        _pushSave(this);
        return value;
    }

    export() {
        if (Object.keys(this._temp_).length) {
            return Object.assign({}, this._origin_, this._temp_);
        }
        return this._origin_;
    }

    save() {
        _save_cache.delete(this);
        let text = '';
        if (this.isExist) {
            text = File.readFile(this.saveTo);
            for (let key of this._changed_) {
                let value = key in this._temp_ ? this._temp_[key] : this._origin_[key];
                text = _replaceCrawlVariable(text, this._origin_, key, value);
                this._origin_[key] = value;
            }
            this._changed_.clear();
        } else {
            text = _createCrawlTemplate( this._origin_, this._temp_);
        }
        File.writeFile(this.saveTo, text);
    }

    static isExist(dir) {
        return File.isfile(Path.join(dir, TEMPLATE_NAME));
    }

    static load(project_dir) {
        project_dir = Path.resolve(project_dir);
        if (Path.basename(project_dir) === TEMPLATE_NAME) {
            return new Loader(Path.dirname(project_dir));
        } else {
            project_dir = project_dir.replace(/\/+$/g, '');
            let t = 5;
            while (t-- > 0) {
                if (File.isfile(project_dir + '/' + TEMPLATE_NAME)) {
                    return new Loader(project_dir);
                }
                project_dir = Path.dirname(project_dir);
                if (project_dir.length <= 1) {
                    return;
                }
            }
        }
    }
}


const _save_cache = new Set();
var _save_timing = null;

process.on('error', _checkSave);

process.on('beforeExit', _checkSave);

function _checkSave() {
    if (_save_timing){
        clearTimeout(_save_timing);
    }
    _save_timing = null;
    for (let loader of _save_cache) {
        if (loader._changed_.size) {
            loader.save();
        }
        _save_cache.delete(loader);
    }
}

function _pushSave(loader) {
    _save_cache.add(loader);
    if (_save_timing === null) {
        _save_timing = setTimeout(_checkSave, 60000);
    }
}

function _stringify(obj) {
    if (typeof obj === 'function') {
        return obj.toString();
    }
    return JSON.stringify(obj);
}

function _createCrawlTemplate(origin, temp) {
    let ref = [];
    let data = Object.assign({}, DEFAULT, origin, temp);
    for (let k in data) {
        if (k === 'projectDir') {
            continue;
        }
        ref.push(k + ' : ' + _stringify(data[k]));
    }
    return TEMPLATE.replace('%{config}', ref.join(',\n    '));
}

function _replaceCrawlVariable(text, origin, key, value) {
    if (key === 'projectDir') {
        return text;
    }
    if (key in origin) {
        let re = new RegExp(`(\\[\\s*"${key}"\\s*\\]|\\[\\s*'${key}'\\s*\\]|"${key}"|'${key}'|\\b${key}\\b)([\\s\\n]*[:=][\\s\\n]*)`);
        let m = text.match(re);
        if (m) {
            const Lexer = require('hi-lib/lexer');
            let end = Lexer.search(text, /,|\}/, m.index);
            if (end >= 0) {
                return text.substr(0, m.index) + key + m[2] + _stringify(value) + text.substr(end);
            }
        }
    } else {
        let m = text.match(/\bexports\s*=\s*\{\s*?(\n\s*)?/);
        if (m) {
            return text.substr(0, m.index + m[0].length) + key + ': ' + _stringify(value) + ',' + (m[1]||'') + text.substr(m.index + m[0].length);
        }
        return text + `\nmodule.exports["${key}"] = ${_stringify(value)};`;
    }
}

module.exports = Loader;
