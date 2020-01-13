const Url = require('url');
const Util = require('./util');

class Crawler {

    constructor(queen, response) {
        this.queen = queen;
        this.url = response.url;
        this.uri = Url.parse(response.url);
        this.response = response;
    }

    appendPage(url) {
        return this.queen.appendPage(Util.resolveUrl(this.uri, url));
    }

    appendDownload(url) {
        return this.queen.appendDownload(Util.resolveUrl(this.uri, url));
    }

    load(req) {
        return this.queen.load(req);
    }

    loadPage(req) {
        if (typeof req === 'string') {
            req = { url: req };
        }
        req.url = Util.resolveUrl(this.uri, req.url);
        return this.queen.loadPage(req);
    }

    download(url, to) {
        return this.queen.download(Util.resolveUrl(this.uri, url), to);
    }

    saveContent(local, content) {
        return this.queen.saveContent(local, content);
    }

    read(name) {
        return this.queen.read(name);
    }

    save(name, value) {
        return this.queen.save(name, value);
    }

}

module.exports = Crawler;