const Request = require('request');

exports.urlSize = function(url, callback) {
	var options = {
		method: "GET",
		url: url,
		headers: {}
	}
	var m = url.match(/\.(jpeg|jpg|bmp|gif|png)(?:\s*$|\?)/)
	if (m) {
		let ext = m[1].toLowerCase()
		switch (ext) {
			case "png":
				options.headers.Range = "bytes=0-32"
				break;
			case "gif":
				options.headers.Range = "bytes=0-16"
				break;
			case "bmp":
				options.headers.Range = "bytes=0-32"
				break;
			case "jpg": case "jpeg":
				options.headers.Range = "bytes=0-512"
				break;
		}
		var chunks = []
		Request.get(options).on('data', function (chunk) {
		  chunks.push(chunk);
		}).on('end', function(err) {
			let buf = Buffer.concat(chunks)
			let size = exports.bufferSize(buf, ext)
			if (size){
				let header = this.response.headers
				let length = header["content-length"]
				if (header["content-range"]) {
					let m = header["content-range"].match(/\/(\d+)$/)
					if (m){
						length = m[1]
					}
				}
				if (length) {
					size.length = length
					size.kb = length/1024
				}
			}
			callback( size )
		})
		return true
	}
	callback()
	return false
}

exports.bufferSize = function(buffer, type) {
	type = type || getType(buffer)
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
			return jpgSize(buffer)
	}
}

function getType(bufer) {
	if (isJPG(buffer)) {
		return "jpg"
	}
	if (isGIF(buffer)) {
		return "gif"
	}
	if (isPNG(buffer)) {
		return "png"
	}
	if (isBMP(buffer)) {
		return "bmp"
	}
}

function isPNG(buffer) {
	if ('PNG\r\n\x1a\n' === buffer.toString('ascii', 1, 8)) {
		if ('IHDR' !== buffer.toString('ascii', 12, 16)) {
			return false
		}
		return true;
	}
}

function isGIF(buffer) {
	var signature = buffer.toString('ascii', 0, 6);
	return (/^GIF8[7,9]a/.test(signature));
}

function isBMP(buffer) {
	return ('BM' === buffer.toString('ascii', 0, 2));
}

function isJPG(buffer) {
	var SOIMarker = buffer.toString('hex', 0, 2);
	return ('ffd8' === SOIMarker);
}

function jpgSize(buffer) {
	buffer = buffer.slice(4);
	var i, next;
	while (buffer.length) {
		// read length of the next block
		i = buffer.readUInt16BE(0);

		// ensure correct format
		if (i > buffer.length) {
			break
		}
		// Every JPEG block must begin with a 0xFF
		if (buffer[i] !== 0xFF) {
			break
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