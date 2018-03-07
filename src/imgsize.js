
const Fetch = require('hi-fetch');

exports.size = function (url, proxy) {
    var m = url.match(/\.(jpeg|jpg|bmp|gif|png)(?:\s*$|\?)/);
    if (m) {
        let ext = m[1].toLowerCase();
        let range = '';
        switch (ext) {
            case "png":
                range = '0-32';
                break;
            case "gif":
                range = '0-16';
                break;
            case "bmp":
                range = '0-32';
                break;
            case "jpg": case "jpeg":
                range = '0-1024';
                break;
            default:
                return Promise.resolve();
        }
        let client = proxy instanceof Fetch.Client ? proxy : new Fetch.Client({ proxy: proxy });
        return _requestImg(url, client, range).then((size) => {
            if (!size && (ext === 'jpg' || ext === 'jpeg')) {
                return _requestImg(url, client, '0-10240');
            }
            return size;
        });
    }
    return Promise.resolve();
};

async function _requestImg(url, client, bytes) {
    let options = {
        method: "GET",
        url: url,
        headers: {
            Range: "bytes=" + bytes
        }
    };
    try {
        let respones = await client.send(options);
        return _parseResSize(respones);
    } catch (e) {
        return;
    }
}

function _parseResSize(respones) {
    if (!respones.ok) {
        return;
    }
    let length = respones.headers.get("content-length");
    if (respones.headers.get("content-range")) {
        let m = respones.headers.get("content-range").match(/\/(\d+)$/);
        if (m) {
            length = m[1];
        }
    }
    let info = {};
    if (length) {
        info.length = length;
        info.kb = length / 1024;
    }
    return respones.buffer().then((buf) => {
        if (buf) {
            let size = exports.bufferSize(buf);
            if (size) {
                Object.assign(size, info);
                info = null;
                return size;
            }
        }
    });
}

exports.bufferSize = function (buffer, type) {
    type = type || _getType(buffer);
    switch (type) {
        case "png":
            return {
                "type": type,
                'width': buffer.readUInt32BE(16),
                'height': buffer.readUInt32BE(20)
            };
        case "gif":
            return {
                "type": type,
                'width': buffer.readUInt16LE(6),
                'height': buffer.readUInt16LE(8)
            };
        case "bmp":
            return {
                "type": type,
                'width': buffer.readUInt32LE(18),
                'height': buffer.readUInt32LE(22)
            };
        case "jpg": case "jpeg":
            return _jpgBufferSize(buffer);
    }
};

function _jpgBufferSize(buffer) {
    buffer = buffer.slice(4);
    var i, next;
    while (buffer.length) {
        // read length of the next block
        i = buffer.readUInt16BE(0);

        // ensure correct format
        if (i > buffer.length) {
            break;
        }
        // Every JPEG block must begin with a 0xFF
        if (buffer[i] !== 0xFF) {
            break;
        }
        // 0xFFC0 is baseline(SOF)
        // 0xFFC2 is progressive(SOF2)
        next = buffer[i + 1];
        if (next === 0xC0 || next === 0xC2) {
            return {
                'type': "jpg",
                'height': buffer.readUInt16BE(i + 5),
                'width': buffer.readUInt16BE(i + 7)
            };
        }
        // move to the next block
        buffer = buffer.slice(i + 2);
    }
}

function _getType(buffer) {
    if (_isJPG(buffer)) {
        return "jpg";
    }
    if (_isGIF(buffer)) {
        return "gif";
    }
    if (_isPNG(buffer)) {
        return "png";
    }
    if (_isBMP(buffer)) {
        return "bmp";
    }
}

function _isPNG(buffer) {
    if ('PNG\r\n\x1a\n' === buffer.toString('ascii', 1, 8)) {
        if ('IHDR' !== buffer.toString('ascii', 12, 16)) {
            return false;
        }
        return true;
    }
}

function _isGIF(buffer) {
    var signature = buffer.toString('ascii', 0, 6);
    return /^GIF8[7,9]a/.test(signature);
}

function _isBMP(buffer) {
    return 'BM' === buffer.toString('ascii', 0, 2);
}

function _isJPG(buffer) {
    var SOIMarker = buffer.toString('hex', 0, 2);
    return 'ffd8' === SOIMarker;
}

if (!module.parent) {
    let url = process.argv[2];
    if (url) {
        exports.size(url, process.argv[3]).then((size) => {
            console.log(JSON.stringify(size));
        });
    }
}
