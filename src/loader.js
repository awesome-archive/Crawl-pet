
const Path = require('path');
const File = require('hi-lib/file');

const TEMPLATE_NAME = "crawl.js";
const HEAD = {
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
    "runJs": false
};
const TEMPLATE = `
module.exports = {
    /****************
     * Info part
     ****************/
    projectDir: __dirname,
    %{config},
    fileTypes: "png|gif|jpg|jpeg|svg|xml|mp3|mp4|pdf|torrent|zip|rar",
    sleep: 1000,

    /****************
     * Parser part
     *****************/

    data : {},

    /*  */
    // parser : "./parser.js",

    /*  */
    // init(loader) {
    //
    // },

    // start(queen) {
    //
    // },

    // restart(queen) {
    //
    // },

    // filter(url) {
    //     return !/baidu\.com/.test(url);
    // },
    
    // filterDownload(url) {
    //     return /\.(jpg|gif|jpeg|png)/.test(url);
    // },
    
    // willLoad(request) {
    //     return request;
    // },

    // loaded(body, links, files, crawl) {
    //     // crawl.appendPage(url);
    //     // crawl.appendDownload(url);
    //     // crawl.loadPage(url);
    //     // crawl.download(url, [local]);
    //     // crawl.saveContent(local, content);
    // },

    // implant(crawl) {
    //
    // }
}`;

class Loader {

    constructor(project_dir) {
        this.projectDir = project_dir.replace(/\/+$/g, '');
        this.saveTo = Path.join(this.projectDir, TEMPLATE_NAME);
        this.isExist = false;
        this._temp_ = {};
        this._origin_ = {};
        if (File.isfile(this.saveTo)) {
            this.isExist = true;
            this._origin_ = require(this.saveTo);
            if (this._origin_.parser) {
                this.extends(this._origin_.parser);
            }
        } else {
            this._temp_.projectDir = this.projectDir;
        }
        this._temp_.outdir = this._origin_.outdir || this._origin_.projectDir || this.projectDir;
    }

    export() {
        if (Object.keys(this._temp_).length) {
            return Object.assign({}, this._origin_, this._temp_);
        }
        return this._origin_;
    }

    set(name, value) {
        if (name == 'outdir') {
            this._temp_.outdir = Path.resolve(value);
        } else {
            this._temp_[name] = value;
        }
    }

    get(name) {
        return this._temp_[name] || this._origin_[name] || HEAD[name];
    }

    extends(file) {
        let ref = require(Path.resolve(this.projectDir, file));
        Object.assign(this._origin_, ref);
    }

    save() {
        let Lexer = require('hi-lib/lexer');
        let text = '';
        if (this.isExist) {
            text = File.readFile(this.saveTo);
            for (let k in this._temp_) {
                let v = this._temp_[k];
                if (k in this._origin_) {
                    if (this._origin_[k] === v) {
                        continue;
                    }
                    let re = new RegExp(`("${k}"|'${k}'|\\b${k}\\b)`);
                    let m = text.match(re);
                    if (m) {
                        let end = Lexer.search(text, /,|\}/, m.index);
                        if (end >= 0) {
                            text = text.substr(0, m.index) + k + ' : ' + _stringify(v) + text.substr(end);
                            continue;
                        }
                    }
                } else {
                    text = text.replace(/((\n?[ \t]*)["']?\bprojectDir["']?\s*:\s*__dirname\s*,)/, "$1$2" + k + ' : ' + _stringify(v) + ',');
                }
                this._origin_[k] = v;
            }
        } else {
            // TEMPLATE.
            let ref = [];
            for (let k in HEAD) {
                ref.push(k + ' : ' + _stringify((k in this._temp_) ? this._temp_[k] : HEAD[k]));
            }
            text = TEMPLATE.replace('%{config}', ref.join(',\n    '));
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

function _stringify(obj) {
    if (typeof obj === 'function') {
        return obj.toString();
    }
    return JSON.stringify(obj);
}

module.exports = Loader;
