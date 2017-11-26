const Url = require('url');
const Util = require('./util');

class Crawl {

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

    loadPage(opt) {
        if (typeof opt === 'string') {
            opt = { url: opt };
        }
        opt.url = Util.resolveUrl(this.uri, opt.url);
        return this.queen.loadPage(opt);
    }

    download(url, local) {
        return this.queen.download(Util.resolveUrl(this.uri, url), local);
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

module.exports = Crawl;