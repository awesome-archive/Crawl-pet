
const Ipc = require('hi-lib/ipc');
const Fetch = require('hi-fetch');
const ImgSize = require('./imgsize');
const Util = require('./util');

const _config = process.argv[2] && JSON.parse(process.argv[2]) || {};
const _file_types = new Set((_config.fileTypes || "png|gif|jpg|jpeg|svg|xml|mp3|mp4|pdf|torrent|zip|rar").toLowerCase().split(/ *\| */));
const _page_types = new Set("html|htm|php|jsp|net|py".split('|'));
const _client = new Fetch.Client({
    "headers": {
        "user-agent": _config.userAgent
    },
    "proxy": _config.proxy,
    "cookies": _config.cookies,
    "timeout": _config.timeout
});

Ipc.exports = {

    async imgSize(url) {
        return await ImgSize.size(url, _client);
    },

    async load(params) {
        let req = new Fetch.Request(params);
        try {
            Ipc.call('emit', 'loading', req);
            let response = await _client.send(req);
            let res = copyResponse(response);
            if (response.ok) {
                res.body = await response.text();
            }
            return res;
        } catch (err) {
            return { ok: false, url: req.url, error: err.message };
        }
    },

    async loadPage(request) {
        let req = new Fetch.Request(request);
        let response;
        try {
            Ipc.call('emit', 'loading', req);
            response = await _client.send(req);
        } catch (err) {
            return { ok: false, url: req.url, error: err.message };
        }
        let res = copyResponse(response);
        if (response.ok) {
            res.body = await response.text();
            res.store = parsePageInfo(res);
        }
        return res;
    },

    async download(url, to) {
        let size;
        if (_config.limitWidth || _config.limitHeight) {
            size = await ImgSize.size(url, _client);
            if (size && (size.width < _config.limitWidth || size.height < _config.limitHeight)) {
                return { ok: false, url: url, error: `Size less than ${_config.limitWidth || 0} x ${_config.limitHeight || 0}` };
            }
        }
        let req = new Fetch.Request(url);
        let response;
        try {
            Ipc.call('emit', 'downloading', req);
            response = await _client.send(req);
        } catch (e) {
            return { ok: false, url: req.url, error: e.message };
        }
        let res = copyResponse(response);
        if (size) {
            res.message = size.width + ' x ' + size.height;
        }
        if (response.ok) {
            let stream;
            if (response.stream) {
                stream = response.stream();
            } else {
                stream = await response.text();
            }
            try {
                let local = await Util.saveFile(to, stream);
                if (local) {
                    res.saveTo = local;
                } else {
                    res.ok = false;
                }
            } catch (err) {
                res.ok = false;
                res.error = err.message;
            }
        }
        return res;
    }

};

function parsePageInfo(response) {
    let body = response.body;
    let info = {
        links: [],
        files: []
    };
    const match_attr = /=\s*"([^"#]+)|=\s*'([^'#]+)/ig;
    const match_url = /(?:https?:\/{2}|[\w\-]+\.[\w\-]+|\.{1,2}\/|[\w\-]+\/|\/)(?:[\w\/\-\.:]+|%\w*)*([?][^ (){}'"#]*)?/ig;
    var m = null;
    while (m = match_attr.exec(body)) {
        let value = m[1] || m[2];
        match_url.lastIndex = 0;
        while (m = match_url.exec(value)) {
            let href = m[0];
            let ext = Util.extname(href);
            if (ext) {
                if (_file_types.has(ext)) {
                    info.files.push(href);
                }
                if (_page_types.has(ext)) {
                    info.links.push(href);
                }
            } else {
                info.links.push(href);
            }
        }
    }
    return info;
}

function copyResponse(response) {
    let res = {
        url: response.url,
        ok: response.ok,
        message: response.statusText
        // headers: response.headers.raw()
    };
    return res;
}