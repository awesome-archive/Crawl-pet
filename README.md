# CRAWL-PET

Simplified crawler framework of Nodejs

## Installation

```shell
$ npm install crawl-pet -g
```

## Usage

####  Create a project

```shell
$ crawl-pet new [url]
```

Generate **crawler.js** file

```javascript
// crawler.js

module.exports = {
    projectDir: __dirname,
    url: "https://imgur.com",
    outdir: "/downloade/imgur.com",
    saveMode: "type",
    keepName: true,
    limits: 5,
    timeout: 60000,
    limitWidth: 700,
    limitHeight: 0,
    proxy: "http://127.0.0.1:1087",
    userAgent: "Mozilla/5.0 .... Chrome/62.0.3202.62 Safari/537.36",
    cookies: null,

    fileTypes: "png|gif|jpg|jpeg|mp4",
    sleep: 1000,
    crawl_data: {},
    
    // crawl_js: "parser.js"
  
  	/**
     * Parser part
     */
  
  	// init(queen) {},
    // prep(queen) {},
    // start(queen) {},
    // filter(url) {},
    // filterDownload(url) {},
    // willLoad(request) {},
    // loaded(body, links, files, crawler) {},

}

```

#### Crawler parser methods

* **init**(queen)                                                   爬虫初始化时被调用

* **prep**(queen)                                                第一次运行，或传入 `--restart` 参数时被调用

* **start**(queen)                                                开始爬取时被调用

* **filter**(url)                                                      筛选页面的 url，返回 true 时同过，返回 false 排除

* **filterDownload**(url)                                   筛选下地的 url

* **willLoad**(request)                                       每个网络请求前被调用

* **loaded**(body, links, files, crawler)             每个网络请求返回时被调用

  ​

### API

* **Queen**
  * Event:
    * start
    * loading
    * downloading
    * loaded
    * downloaded
    * appendPage
    * appendDownload
    * over
  * Queen.prototype.**runing**
  * Queen.prototype.**db**
  * Queen.prototype.**loader**
  * Queen.prototype.**head**
  * Queen.prototype.**agent**
  * Queen.prototype.**start**(restart)
  * Queen.prototype.**over**()
  * Queen.prototype.**appendPage**(url)
  * Queen.prototype.**appendDownload**(url)
  * Queen.prototype.**load**(url)
  * Queen.prototype.**loadPage**(url)
  * Queen.prototype.**download**(url, to)
  * Queen.prototype.**saveContent**(to, content)
  * Queen.prototype.**read**(name)
  * Queen.prototype.**save**(name, value)
* **Crawler**
  * Crawler.prototype.**queen**
  * Crawler.prototype.**appendPage**(url)
  * Crawler.prototype.**appendDownload**(url)
  * Crawler.prototype.**load**(url)
  * Crawler.prototype.**loadPage**(url)
  * Crawler.prototype.**download**(url, load)
  * Crawler.prototype.**saveContent**(to, content)
  * Crawler.prototype.**read**(name)
  * Crawler.prototype.**save**(name, value)


## Command help

```
Crawl Pet Help:
  Usage: crawl-pet [path]
  
  Options:
    +new            [url]                                     新建一个项目
    -r, --restart                                             从起始地址重新加载
    -c, --config    <name[=value]>...                         读写项目配置
    -i, --info                                                查看项目的信息
    -l, --list      <page|download|local>                     查看队列数据
    -f, --find      <type> <keyword>                          查找队列的数据
    -d, --delete                                              删除匹配的队列数据
    --json                                                    对的数据以json格式输出
    --proxy         <127.0.0.1:1087>                          临时改变项目的代理配置
    --parser        <path>                                    临时改变项目的解析器
    --debug                                                   启用调试
    -v, --version                                             查看软件版本
    -h, --help                                                查看帮助信息

More configuration in crawler.js file!
    
```








