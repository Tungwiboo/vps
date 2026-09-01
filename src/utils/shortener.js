const https = require('https');
const http = require('http');
const { URL } = require('url');

function fetchGet(rawUrl, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) return reject(new Error('Quá số lần chuyển hướng (Redirect Loop)'));

        try {
            const parsedUrl = new URL(rawUrl);
            const client = parsedUrl.protocol === 'https:' ? https : http;

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                },
                timeout: 10000
            };

            const req = client.request(options, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const redirectUrl = new URL(res.headers.location, rawUrl).toString();
                    return resolve(fetchGet(redirectUrl, redirectCount + 1));
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data.trim()));
            });

            req.on('error', err => reject(err));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Hết thời gian chờ kết nối (Timeout 10s)'));
            });
            req.end();
        } catch (err) {
            reject(err);
        }
    });
}

// 1. API Link4M
async function shortenLink4m(destinationUrl) {
    const token = process.env.LINK4M_TOKEN || '698769a285ca6714d44ad001';
    const encodedUrl = encodeURIComponent(destinationUrl);
    const apiUrl = `https://link4m.co/api-shorten/v2?api=${token}&url=${encodedUrl}`;
    
    const resText = await fetchGet(apiUrl);
    if (!resText) throw new Error('Phản hồi trống từ Link4M');

    let json;
    try { 
        json = JSON.parse(resText); 
    } catch (e) {
        throw new Error(`Phản hồi không phải JSON: ${resText.slice(0, 80)}`);
    }

    if (json.status === 'success' && json.shortenedUrl) {
        return json.shortenedUrl;
    }
    const errMsg = Array.isArray(json.message) ? json.message.join(', ') : (json.message || JSON.stringify(json));
    throw new Error(errMsg);
}

// 2. API YeuMoney
async function shortenYeuMoney(destinationUrl) {
    const token = process.env.YEUMONEY_TOKEN || '503573af6e985fd81c2f5e7804ed1acd8febc08f75c8bd78b29fcac71470e804';
    const encodedUrl = encodeURIComponent(destinationUrl);
    const apiUrl = `https://yeumoney.com/QL_api.php?token=${token}&format=json&url=${encodedUrl}`;
    
    const resText = await fetchGet(apiUrl);
    if (!resText) throw new Error('Phản hồi trống từ YeuMoney');

    let json;
    try { 
        json = JSON.parse(resText); 
    } catch (e) {
        throw new Error(`Phản hồi không phải JSON: ${resText.slice(0, 80)}`);
    }

    if (json.status === 'success' && json.shortenedUrl) {
        return json.shortenedUrl.replace(/^"+|"+$/g, '');
    }
    throw new Error(json.status || JSON.stringify(json));
}

// 3. API AnonLink
async function shortenAnonLink(destinationUrl) {
    const token = process.env.ANONLINK_TOKEN || '6f7e62d1e242ba4d2b81c9e5f5fdf59e189245d5';
    const encodedUrl = encodeURIComponent(destinationUrl);
    const apiUrl = `https://anonlink.io/api?api=${token}&url=${encodedUrl}`;
    
    const resText = await fetchGet(apiUrl);
    if (!resText) throw new Error('Phản hồi trống từ AnonLink');

    let json;
    try { 
        json = JSON.parse(resText); 
    } catch (e) {
        throw new Error(`Phản hồi không phải JSON: ${resText.slice(0, 80)}`);
    }

    if (json.status === 'success' && json.shortenedUrl) {
        return json.shortenedUrl.replace(/^"+|"+$/g, '');
    }
    const errMsg = Array.isArray(json.message) ? json.message.join(', ') : (json.message || JSON.stringify(json));
    throw new Error(errMsg);
}

// Phân phối và xoay vòng link
async function generateShortLink(destinationUrl, excludedProviders = []) {
    const allProviders = [
        { name: 'Link4M', fn: shortenLink4m },
        { name: 'YeuMoney', fn: shortenYeuMoney },
        { name: 'AnonLink', fn: shortenAnonLink }
    ];

    const available = allProviders.filter(p => !excludedProviders.includes(p.name));
    if (available.length === 0) return null;

    const shuffled = available.sort(() => 0.5 - Math.random());

    for (const provider of shuffled) {
        try {
            const shortUrl = await provider.fn(destinationUrl);
            if (shortUrl) {
                return {
                    provider: provider.name,
                    shortUrl: shortUrl
                };
            }
        } catch (err) {
            console.error(`⚠️ Lỗi rút gọn qua ${provider.name}:`, err.message);
        }
    }

    // Trả về null nếu toàn bộ các cổng đều lỗi (tuyệt đối không trả về link Direct)
    return null;
}

module.exports = { generateShortLink };