
// Crawler-per parser template

// header method is optional
// exports.header = function(options, crawler_handle) {
// 	// The "options" is request option
// }

exports.body = function(url, body, response, crawler_handle) {
	const re = /\b(href|src)\s*=\s*["']([^'"#]+)/ig
	var m = null
	while (m = re.exec(body)){
		let href = m[2]
		if (/\.(css|js|json|svg)\b/i.test(href)){
			continue
		}
		if (/\.(png|gif|jpg|jpeg|mp4)\b/i.test(href)) {
			crawler_handle.addDown(href)
		}else if( !/^\w+:\/\/|^\/\//i.test(href) || href.indexOf(crawler_handle.info.domain) !== -1 ){
			crawler_handle.addPage(href)
		}
	}
	crawler_handle.over()
}
