
const Url = require('url');
const Fs = require('fs');
const Path = require('path');
const Stream = require('stream');
const File = require('hi-lib/file');

const _test_url = /^(https?|^ftp):\/\/[\w\-]+(\.[\w\-]+)?/i;
const _check_url = /^(http:\/\/|https:\/\/|\/\/|\.\.|\.|\/|.)/i;
const _match_ext = /\.(\w+)([#?]|$)/i;

exports.countTime = function (ms) {
    let s = ms / 1000 >> 0;
    if (s < 100) {
        return s + 's';
    }
    let m = s / 60 >> 0;
    s = s % 60;
    if (m < 60) {
        return m + 'm' + s + 's';
    }
    let h = m / 60 >> 0;
    m = m % 60;
    return h + 'h' + m + 'm' + s + 's';
};

exports.extname = function (url) {
    let m = url.match(_match_ext);
    if (m) {
        return m[1].toLowerCase();
    }
};

exports.testUrl = function (url) {
    return url && _test_url.test(url);
};

exports.resolveUrl = function (from, to) {
    if (typeof from === 'string') {
        from = Url.parse(from);
    }
    let m = to.match(_check_url);
    let res = to;
    switch (m[1]) {
        case "http://": case "https://":
            res = to;
            break;
        case "//":
            res = from.protocol + to;
            break;
        case "/":
            res = from.protocol + "//" + from.host + to;
            break;
        default:
            res = from.protocol + "//" + from.host + from.dirname + "/" + to;
            break;
    }
    return res;
};

exports.parseUrl = function (url) {
    let info = {};
    let uri = Url.parse(url);

    info.host = uri.host;
    info.port = uri.port;
    info.query = uri.query;
    info.path = uri.pathname;

    let path = Path.parse(info.path);
    info.dirname = path.dir;
    info.basename = path.base;
    info.filename = path.name;
    info.extname = path.ext.replace(/^./, '');
    return info;
};

exports.clearUrl = function (url) {
    return url.replace(/#.*/g, '').replace(/([^:])\/{2,}/g, '$1/');
};

exports.prepFile = function (file) {
    if (File.isfile(file)) {
        let p = Path.parse(file);
        let i = 1;
        while (File.isfile(p.dir + '/' + p.name + '(' + i + ').' + p.ext)) {
            i++;
        }
        return p.dir + '/' + p.name + '(' + i + ').' + p.ext;
    }
    if (!File.isdir(Path.dirname(file))) {
        File.mkdirs(Path.dirname(file));
    }
    return file;
};

exports.saveFile = function(file, content) {
    let to = exports.prepFile(file);
    if (content instanceof Stream) {
        return new Promise((resolve, reject) => {
            content.on('end', () => {
                resolve(to);
            });
            content.on('error', (error) => {
                File.del(to);
                reject(error);
            });
            content.pipe(Fs.createWriteStream(to));
        });
    } else {
        File.writeFile(to, content);
        return Promise.resolve(to);
    }
};