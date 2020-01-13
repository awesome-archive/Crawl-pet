

const Url = require('url');
const Path = require('path');
const File = require('hi-lib/file');
const Loader = require("./src/loader");

const ___print = require('hi-lib/print');
const ___read = ___print.read;

exports.config = _createConfig;

async function _createConfig(url) {

    let uri = await askUrl(url);
    let project = await askProject(uri.host);
    let outdir = await askOutDir(project);
    let save_mode = await askSaveMode();
    let keep_name = await askSaveKeepName();
    let limit = await askLimits();
    let timeout = await askTimeout();
    let size = await askLimitSize();
    let proxy = await askProxy();
    let user_agent = await askUserAgent();

    let loader = new Loader(project);

    loader.set('url', uri.href);
    loader.set('outdir', outdir);
    loader.set('saveMode', save_mode || 'url');
    loader.set('keepName', keep_name || false);
    loader.set('limits', limit || 0);
    loader.set('timeout', timeout || 0);
    if (size) {
        loader.set('limitWidth', size.width || 0);
        loader.set('limitHeight', size.height || 0);
    }
    if (proxy) {
        loader.set('proxy', proxy);
    }
    if (user_agent) {
        loader.set('userAgent', user_agent);
    }
    loader.save();
    return loader;
}

async function askUrl(def) {
    let host_re = /^(?:https?:\/\/)?([\w-]+(?:\.[\w-]+)+)/i;
    let res = await ___read.input({
        prompt: '#g{#} 输入 URL : ',
        default: def || '',
        validate(value) {
            return host_re.test(value) || '请输入有效网址';
        }
    });
    if (!/^http/.test(res)) {
        res = "https://" + res;
    }
    return Url.parse(res);
}

async function askProject(host) {
    let dir = await ___read.input({
        prompt: `#g{#} 项目目录 : `,
        default: './' + host,
        validate(value) {
            if (!value) {
                return '请输入有效文件夹路径';
            }
            let target = Path.resolve(value);
            if (Loader.isExist(target)) {
                return '目录下以存在爬虫';
            }
            return true;
        }
    });
    if (!File.isdir(dir)) {
        if (!await askCreateDir(dir)) {
            ___print('#r{!} 新建失败.');
            process.exit();
        }
    }
    return dir;
}

async function askOutDir(def) {
    let outdir = await ___read.input({
        prompt: '#g{#} 下载目录 : ',
        default: def,
        validate(value) {
            if (!value) {
                return '请输入有效文件夹路径';
            }
            return true;
        }
    });
    if (!File.isdir(outdir)) {
        if (!await askCreateDir(outdir)) {
            ___print('\n#r{!} 程序已退出.');
            process.exit();
        }
    }
    return outdir;
}

async function askSaveMode() {
    let res = await ___read.select({
        prompt: '#g{#} 选择保存文件模式 : ',
        options: ['按照链接地址', '按照文件类型', '将文件分组', '同一文件夹下']
    });
    switch (res.key) {
        case '0':
            return 'url';
        case '1':
            return 'type';
        case '2':
            return 'group';
        case '3': default:
            return 'default';
    }
}

async function askSaveKeepName() {
    let res = await ___read.confirm({
        prompt: '#g{#} 是否保留原文件名 : '
    });
    return res;
}

async function askLimits() {
    let res = await ___read.input({
        prompt: '#g{#} 最大链接数 : ',
        default: 5,
        filter(value) {
            let n = parseInt(value);
            if (isNaN(n)) {
                throw '请输数字';
            }
            return n;
        }
    });
    return res;
}

async function askTimeout() {
    let res = await ___read.input({
        prompt: '#g{#} 设置下载超时 : ',
        default: '1m',
        validate(val) {
            if (val && !/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.test(val)) {
                return '请输入时间格式: e.g. 1s, 1000ms';
            }
            return true;
        }
    });
    if (!res) {
        return 0;
    }
    let m = res.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
    let n = parseFloat(m[1]);
    switch (m[2]) {
        case 's':
            n *= 1000;
            break;
        case 'm':
            n *= 1000 * 60;
            break;
        case 'h':
            n *= 1000 * 60 * 60;
            break;
    }
    return n;
}

async function askLimitSize() {
    let res = await ___read.input({
        prompt: '#g{#} 设置图片的最小尺寸 : ',
        validate(val) { return !val || /^(\d+)(?:(?: +| *x? *)(\d+))?$/.test(val) || '请输入有效格式 width x height'; }
    });
    if (res) {
        let m = res.match(/^(\d+)(?:(?: +| *x? *)(\d+))?$/);
        if (m) {
            return { width: parseInt(m[1]), height: m[2] && parseInt(m[2]) || 0 };
        }
    }
    return;
}

async function askProxy() {
    let res = await ___read.input({
        prompt: '#g{#} 设置代理 : ',
        filter(value) {
            if (value) {
                let m = value.match(/^(https?:\/\/)?(\d+(?:\.\d+){3})?(\:\d+)$/i);
                if (!m) {
                    throw '请输入有效格式';
                }
                return (m[1] || 'http://') + (m[2] || '127.0.0.1') + m[3];
            }
            return '';
        }
    });
    return res;
}

async function askUserAgent() {
    let res = await ___read.select({
        prompt: '#g{#} 选择浏览器代理 : ',
        options: ['None', 'Chrome', 'Safari', 'Iphone', 'Ipad', 'Android']
    });
    switch (res.value) {
        case 'Chrome':
            return 'userAgent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.62 Safari/537.36';
        case 'Safair':
            return 'userAgent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Safari/604.1.38';
        case 'Iphone':
            return 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Version/10.3 Mobile/14E277 Safari/603.1.30';
        case 'Ipad':
            return 'userAgent', 'User-Agent: Mozilla/5.0 (iPad; CPU OS 10_3 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Version/10.3 Mobile/14E277 Safari/603.1.30';
        case 'Android':
            return 'userAgent', 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.62 Mobile Safari/537.36';
    }
}

async function askCreateDir(dir) {
    let res = await ___read.confirm({
        prompt: '#g{#} 是否创建目录 : '
    });
    if (res) {
        File.mkdirs(dir);
        return true;
    }
    return false;
}








