#!/usr/bin/env node

const ___print = require("hi-lib/print");
const Path = require('path');
const Argv = require("hi-lib/argv");
const File = require("hi-lib/file");
const Queen = require("./src/queen");
const Loader = require("./src/loader");
const Util = require('./src/util');
const ChildProcess = require('child_process');

const argv = Argv.new(`
Crawl Pet Help:
  Usage: #c{crawl-pet [path]}
  
  Options:
    #c{+new}            [url]                                     #d{新建一个项目}
    #c{-r, --restart}                                             #d{从起始地址重新加载}
    #c{-c, --config}    <name[=value]>...                         #d{读写项目配置}
    #c{-i, --info}                                                #d{查看项目的信息}
    #c{-l, --list}      <page|download|local>                     #d{查看队列数据}
    #c{-f, --find}      <type> <keyword>                          #d{查找队列的数据}
    #c{-d, --delete}                                              #d{删除匹配的队列数据}
    #c{--json}                                                    #d{对的数据以json格式输出}
    #c{--proxy}         <127.0.0.1:1087>                          #d{临时改变项目的代理配置}
    #c{--parser}        <path>                                    #d{临时改变项目的解析器}
    #c{--debug}                                                   #d{启用调试}
    #c{-v, --version}                                             #d{查看软件版本}
    #c{-h, --help}                                                #d{查看帮助信息}

#r{More configuration in crawler.js file!}
`);

try {
	argv.parse();
} catch (e) {
	___print(`Crawl-pet options error:\n  #r{${e}}\n${argv.help()}`);
	process.exit(1);
}
if (argv.get("--version")) {
	___print(`Crawl-pet version: #g{${argv.version()}}`);
	process.exit();
}
if (argv.get("--help")) {
	___print(argv.help());
	process.exit();
}

_step1();

function _step1() {
	let ref;
	if (ref = argv.get('new')) {
		let Creater = require('./creater');
		Creater.config(typeof ref === 'string' ? ref : '').then((loader) => {
			___print.read.anykey({
				prompt: '#g{✔︎} #y{创建项目完成, 按 Enter 继续} : ',
				keys: ['enter', 'return']
			}).then(() => {
				_step2(loader);
				___print.line('#d{-}');
			});
		});
	} else {
		let loader = Loader.load(argv._[0] || './');
		if (!loader) {
			___print(`#r{!} 没有找到爬虫 (#c{${Path.join(argv._[0] || './', 'crawler.js')}}). `);
			process.exit(1);
		}
		_step2(loader);
	}
}

function _step2(loader) {
	let ref;
	if (ref = argv.get('config')) {
		_checkConfig(loader, ref);
	}
	if (ref = argv.get('parser')) {
		if (!File.isfile(ref)) {
			___print(`! #r{没有找到文件 #g{${ref}}}`);
			process.exit(1);
		}
		loader.loadCrawl(Path.resolve(ref));
	}
	if (argv.get('list')) {
		_listCommand(loader);
	}
	if (argv.get('find')) {
		_findCommand(loader);
	}
	if (loader.get('runJs') || loader.get('browser')) {

		// "electron": "^1.7.9",
		// console.log((__dirname + '/node_modules/electron'))
		// if (!File.isdir(__dirname + '/node_modules/electron')) {
		// 	___print('#r{!} 安装 electron 插件 ...');

		// 	let ref = ChildProcess.execSync('npm install electron', { cwd: __dirname });
		// 	console.log(ref);

		// }
		// console.log(module.paths);
		process.exit();
	}
	_runCrawler(loader);
}

function _checkConfig(loader, value) {
	if (value.length) {
		let text = [];
		for (let item of value) {
			let kv = item.split('=', 2);
			if (kv.length === 2) {
				let v = kv[1].replace(/^['"]|['"]$/g, '');
				loader.set(kv[0], /^\d+$/.test(v) ? parseInt(v) : v);
			}
			text.push(`${kv[0]}:${JSON.stringify(loader.get(kv[0]))}`);
		}
		___print.column(text.join('\n'), ':');
		loader.save();
	}
	process.exit();
}

function _listCommand(loader) {
	let crawler = new Queen(loader, argv);
	_forEach(crawler, argv.get('list'));
	process.exit();
}

function _findCommand(loader) {
	let queen = new Queen(loader, argv);
	let type = argv.get('find')[0];
	let find = argv.get('find')[1];
	let del = argv.get('delete');
	find = /^\/(.*)\/(i?)$/.test(find) ? new RegExp(RegExp.$1, RegExp.$2) : File.wildcardToRegExp(find, true);
	_forEach(queen, type, (key, value) => {
		if (type === 'local') {
			if (!(find.test(value.local) || find.test(value.url))) {
				return;
			}
		} else if (!find.test(value)) {
			return;
		}
		if (del) {
			queen.db.delete(type, key);
			___print.write('#r{[delete]} ');
		}
		return value;
	});
	process.exit();
}

function _forEach(crawler, type, callback) {
	let count = 0;
	let json = argv.get('json');
	if (json) {
		___print('[');
	}
	crawler.forEach(type, (key, value) => {
		let ref = callback ? callback(key, value) : value;
		if (ref) {
			count += 1;
			if (json) {
				let text = JSON.stringify(value);
				___print(text.replace(/^/g, '  ') + ',');
			} else {
				if (type === 'local') {
					___print(value.url, '#g{>>}', value.local);
				} else {
					___print(value);
				}
			}
		}
	});
	if (json) {
		___print(']');
	} else {
		___print(`#y{[Total]} #r{${count}}`);
	}
}

function _runCrawler(loader) {
	let print_stack = ___print.stack();
	print_stack.debug = !!argv.get('debug');

	let print = function (prefix, url, ok, msg, err, final) {
		let text = url;
		if (url.length > 50) {
			text = url.substr(0, 20) + '...' + url.substr(url.length-27);
		} else {
			text += ' '.repeat(Math.max(0, 50 - url.length));
		}
		if (arguments.length === 2) {
			print_stack.update(url, prefix + ' #d{' + text + '}');
		} else {
			text += ok ? ' | #g{✔︎}' : ' | #r{✘}';
			if (msg) {
				text += ' | #d{' + msg + '}';
			}
			if (err) {
				text += ' | #R{' + err + '}';
			}
			print_stack.final(url, prefix + ' ' + text);
		}
	};

	print_stack.update('---->', '#y{正在加载队列....}');
	let startTime = Date.now();
	let crawl_queen = new Queen(loader, argv);
	crawl_queen.on('start', () => {
		startTime = Date.now();
	});
	crawl_queen.on('over', () => {
		print_stack.push(`\n#g{[Over]} run time: #y{${Util.countTime(Date.now() - startTime)}}`);
	});
	crawl_queen.on('loading', (request) => {
		print('#y{[+]}', request.url);
	});
	crawl_queen.on('loaded', (request, response) => {
		response = response || {};
		print('#y{[+]}', request.url, response.ok, response.message, response.error);
	});
	crawl_queen.on('downloading', (request) => {
		print('#g{[⇣]}', request.url);
	});
	crawl_queen.on('downloaded', (request, response) => {
		response = response || {};
		print('#g{[⇣]}', request.url, response.ok, response.message, response.error);
	});
	crawl_queen.start(argv.get('restart'));
	print_stack.final('---->', '#g{开始爬取}');
}