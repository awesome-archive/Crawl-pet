
var color_map = {
	"r": '\033[91m',
	"b": '\033[96m',
	"g": '\033[92m',
	"c": '\033[36m',
	"d": '\033[90m',
	"w": '\033[37m'
};

module.exports = function() {
	var args = []
	for (let i=0; i< arguments.length; i++){
		let value = arguments[i]
		switch (typeof arguments[i]) {
			case "number":
				args.push( '\033[92m' + value +'\033[0m')
			break
			case "boolean":
				args.push((value ? '\033[92m' : '\033[91m') + value +'\033[0m')
			break
			case "string":
				if (value[0] === "[" && i === 0) {
					var color = '\033[96m'
					if (/error/i.test(value)){
						color = '\033[91m'
					}else if (/page/i.test(value)){
						color = '\033[92m'
					}
					args.push( '\033[96m' + value + '\033[0m' + ' '.repeat( Math.max(15-value.length, 1)))
				}else{
					args.push(
						value.replace(/(\b\d+ms\b|-->)/g, "\033[91m$1\033[0m")
						.replace(/([rgbcdw])<([^>]+)>/g, ($0, $1, $2)=>{ return color_map[$1]+$2+'\033[0m'})
					)
				}
			break
			default:
				args.push(value)
			break
		}
	}
	console.log.apply( console, args )
}