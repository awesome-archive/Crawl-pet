# Crawl-pet

Nodejs crawler framework, Support queue

## Installation

```shell
$ npm install crawl-pet -g
```

## Usage

#### STEP 1: Create a project

```shell
$ crawl-pet -u xxxx.com -o ./localdir
```

After creating the project, will generate `info.json` file in the project directory, The `info.json` contains more Settings

```json
// info.json


		// "cheerio": "^0.22.0",
		// "nodejs-argv": "^1.0.0",
		// "readline-sync": "^1.4.7",
		// "request": "^2.81.0"

{
    "url"      : "xxxx.com",
    "outdir"   : ".",
    "save"     : "url",
    "types"    : "",
    "limit"    : "5",
    "parser"   : "",
    "sleep"    : 200,
    "timeout"  : 180000,
  	"cookie"   : "",
    "headers"  : {},
    "proxy"    : "",
    "maxsize"  : 0,
    "minwidth" : 0,
    "minheight": 0
}
```

#### STEP 2: Create a parser.js

In the project directory create a `parser.js` file, If load failure,  Then modify `info.json` `parser` value

```javascript
// parser.js

// header method is optional
exports.header = function(options, crawler_handle) {
	// The "options" is request option
}

exports.body = function(url, body, response, crawler_handle) {
	const re = /\b(href|src)\s*=\s*["']([^'"#]+)/ig
	var m = null
	while (m = re.exec(body)){
		let href = m[2]
		if (/\.(png|gif|jpg|jpeg|mp4)\b/i.test(href)) {
			crawler_handle.addDown(href)
		}else if(!/\.(css|js|json|xml|svg)/.test(href)){
			crawler_handle.addPage(href)
		}
	}
	crawler_handle.over()
}
```

* **header(options, crawler_handle) **  

When before the request call,  Modifying the `options` to edit the request information，If return false, then cancel the request. Detailed settings: https://github.com/request/request

* **body(url, body, response, crawler_handle)** 

Used to analyze the page，Results use the `crawler_handle.addPage(url)`  and `crawler_handle.addDown(url)`  add to crawler queue. Call `crawler-handle.over()` to the end

----

## CrawlerHandle Object

**info**：                             Project configuration information

**uri**：                               Current uri                               

**addPage(url)**:               Add a page into the queue

**addDown(url)**:              Add a download into the queue

**save(content, ext)**:      Save the content to a file, path assigned by the program, you can set the file suffix

**over()**:                             Page parsing is complete, the queue to get to the next

**stop()**：                          Stop all the queue



# Crawler Module

- **Crawler.create(info, parser)**: 

  return crawler object.

> **parameters**:
>
> ​     **info**  with the following options:
> ​         `url`   `outdir`   `limit`   `sleep`   `timeout`   `types`   `save`  `maxsize`   `minwidth`   `minheight`
>
> ​         `headers` : Set up request header information
>
> ​        `proxy` : Set up http proxy
>
> ​    **parser** (optional) is a module consists of the following two methods:
>
> ​       `hearder(options, info)` 
>
> ​      `body(url, body, response, crawler_hendle)`

- **run(callback) **:                                    Began to run, to invoke a callback when the queue is empty

- **find(files, callback)**:                          Find the local files corresponding url link

- **list(type, start, limit, callback)**:    View queue

- **stop()**:                                                  Stop all the queue



## Command help

```
    -u, --url       string              Destination address
    
    -o, --outdir    string              Save the directory, Default use pwd
    
    -r, --restart                       Reload all page
    
    --clear                             Clear queue
    
    --save          string              Save file rules has [url/simple/group]
                                        = url: Save the path consistent with url
                                        = simple: Save file in the project path
                                        = group: Save 500 files in one folder
                                        
    --types         array               Limit download file type
    
    --limit         number=5            Concurrency limit
    
    --sleep         number=200          Concurrent interval
    
    --timeout       number=180000       Queue timeout
    
    --proxy         string              Set up proxy
    
    --parser        string              Set crawl rule, it's a js file path!
                                        The default load the parser.js file in the 
                                        project path
                                        
    --maxsize       number              Limit the maximum size of the download file
    
    --minwidth      number              Limit the minimum width of the download file
    
    --minheight     number              Limit the minimum height of the download file
    
    -i, --info                          View the configuration file
    
    -l, --list      array               View the queue data 
                                        e.g. [page/down/queue],0,-1
    
    -f, --find      array               Find the download URL of the local file
    
    --json                              Print result to json format
    
    -v, --version                       View version
    
    -h, --help                          View help
    
    --create-parser string             Create a parser.js file
    
```








