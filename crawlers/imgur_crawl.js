
module.exports = {

    prep(queen) {
        let url = queen.head.url;
        let m = url.match(/^(https?:\/\/)?(([\w\-]\.)?imgur.com)\/*/i);
        if (m) {
            url = (!m[1] ? 'https://' : '') + url.replace(/\/page(\/\d+(\/hit\.json)?)?$|\/+$/i, '');
            if (!/\/(new|top|hot)$/i.test(url)) {
                url += '/new';
            }
            queen.head.url = url + '/page/0/hit.json';
            queen.save('api_url', url);
            queen.save('page_offset', 0);
        }
    },

    loaded(body, links, files, crawler) {
        if (!/hit\.json/i.test(crawler.url)) {
            return;
        }
        try {
            let json = JSON.parse(body);
            let data = json.data;
            if (!data || data.length === 0) {
                return;
            }
            let add_down = 0;
            for (let pic of data) {
                if (crawler.queen.appendDownload('https://i.imgur.com/' + pic.hash + pic.ext)) {
                    add_down += 1;
                }
            }
            if (add_down) {
                let api_url = crawler.read('api_url');
                let offset = crawler.read('page_offset');
                let add = 5;
                while (add-- > 0) {
                    offset++;
                    crawler.queen.appendPage(api_url + '/page/' + offset + '/hit.json');
                }
                crawler.queen.save('page_offset', offset);
            }
        } catch (err) {
            // PASS
        }
    }

};
