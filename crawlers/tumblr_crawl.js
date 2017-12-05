
module.exports = {

    prep(queen) {
        let url = queen.head.url;
        if (/^(?:https?:\/\/)?([\w\-]+\.tumblr\.com)\/?$/.test(url)) {
            queen.head.url = "https://" + RegExp.$1 + '/api/read/json?start=0&num=10';
        }
        queen.save('post_offset', 10);
    },

    loaded(body, links, files, crawler) {
        try {
            let blog = JSON.parse(body.replace(/^\s*var\s*\w+\s*=\s*|;\s*$/g, ''));
            let posts = blog.posts;
            if (posts.length === 0) {
                return;
            }
            let down_count = 0;
            for (let post of posts) {
                if (post['video-player']) {
                    let m = post['video-player'].match(/\btumblr_[a-zA-Z0-9]+\b/);
                    if (m) {
                        if (crawler.appendDownload('https://vt.tumblr.com/' + m[0] + '.mp4')){
                            down_count += 1;
                        }
                    }
                }
                if (post['photo-url-1280']) {
                    if (crawler.appendDownload(post['photo-url-1280'])){
                        down_count += 1;
                    }
                }
                if (post['photos']) {
                    for (let p of post['photos']) {
                        if (p['photo-url-1280']) {
                            if (crawler.appendDownload(p['photo-url-1280'])){
                                down_count += 1;
                            }
                        }
                    }
                }
            }
            if (down_count) {
                let host = crawler.uri.host;
                let total = blog['posts-total'];
                let offset = crawler.read('post_offset') || 0;
                let limit = 5;
                while (offset < total && limit-- > 0) {
                    crawler.queen.appendPage('https://' + host + '/api/read/json?start=' + offset + '&num=20');
                    offset += 20;
                }
                crawler.save('post_offset', offset + 20);
            }
        } catch (err) {
            // PASS
        }
    }
};
