const fs = require('fs');
const https = require('https');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const ENHANCED_FILE = path.join(__dirname, 'animelist-enhanced.json');

// --- Helper: HTTPS requests (with redirection support) ---
function fetchUrl(url, options = {}, redirectCount = 0) {
    if (redirectCount > 5) {
        return Promise.reject(new Error(`Too many redirects for ${url}`));
    }
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const requestOptions = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...options.headers
            }
        };

        const req = https.request(requestOptions, (res) => {
            // Check for redirect (3xx)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    // Resolve relative URL
                    redirectUrl = new URL(redirectUrl, url).href;
                }
                fetchUrl(redirectUrl, options, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`Status ${res.statusCode} for ${url}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        if (options.body) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
    });
}

// --- Ported Normalization Helpers from anime1.user.js ---
function normalizeAnimeNameForQuery(name) {
    let cleaned = String(name || '').trim();
    if (!cleaned) return '';

    const seasonInBracketsPattern = /[（(][^（）()]{0,24}(?:第\s*[0-9０-９一二三四五六七八九十百千兩两〇零]+\s*[季期篇部]|season\s*\d+|s\d+)[^（）()]{0,24}[)）]/gi;
    cleaned = cleaned.replace(seasonInBracketsPattern, ' ');

    const seasonPatterns = [
        /第\s*[0-9０-９一二三四五六七八九十百千兩两〇零]+\s*[季期篇部](?:\s*(?:完結篇|完结篇|完結|完结|最終章|最终章))?/gi,
        /\bseason\s*[0-9]+\b/gi,
        /\bs(?:eason)?\s*[0-9]+\b/gi,
        /\bpart\s*[0-9]+\b/gi,
        /\bpt\.?\s*[0-9]+\b/gi
    ];
    for (const pattern of seasonPatterns) {
        cleaned = cleaned.replace(pattern, ' ');
    }

    cleaned = cleaned
        .replace(/[-－–—_]+/g, ' ')
        .replace(/[：:|/\\-]\s*$/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return cleaned;
}

function normalizeAsciiDigits(text) {
    return String(text || '').replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xFEE0));
}

function parseEnglishOrdinal(raw) {
    const text = String(raw || '').toLowerCase().replace(/[\s_-]+/g, '');
    const map = {
        first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
        seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12
    };
    if (map[text]) return map[text];
    const ordinalMatch = text.match(/^(\d+)(?:st|nd|rd|th)$/);
    if (ordinalMatch) {
        const value = Number(ordinalMatch[1]);
        return Number.isFinite(value) && value > 0 ? value : null;
    }
    return null;
}

function parseSeasonNumber(raw) {
    const text = normalizeAsciiDigits(raw).trim();
    if (!text) return null;
    const englishOrdinal = parseEnglishOrdinal(text);
    if (Number.isFinite(englishOrdinal)) return englishOrdinal;
    if (/^\d+$/.test(text)) {
        const value = Number(text);
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    const digitMap = {
        '零': 0, '〇': 0,
        '一': 1, '二': 2, '兩': 2, '两': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9
    };
    const unitMap = { '十': 10, '百': 100, '千': 1000 };

    let section = 0;
    let number = 0;
    let seen = false;

    for (const ch of text) {
        if (Object.prototype.hasOwnProperty.call(digitMap, ch)) {
            number = digitMap[ch];
            seen = true;
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(unitMap, ch)) {
            seen = true;
            const unit = unitMap[ch];
            if (number === 0) number = 1;
            section += number * unit;
            number = 0;
            continue;
        }
        return null;
    }

    if (!seen) return null;
    const value = section + number;
    return Number.isFinite(value) && value > 0 ? value : null;
}

function extractTitleAndSeason(rawName) {
    const original = String(rawName || '').trim();
    let working = original;
    let seasonNumber = null;

    const trySetSeason = (rawSeason) => {
        if (Number.isFinite(seasonNumber)) return;
        const parsed = parseSeasonNumber(rawSeason);
        if (Number.isFinite(parsed) && parsed > 0) seasonNumber = parsed;
    };

    const trailingSeasonInBrackets = /(?:\s*[-_ ]*)[（(]\s*(?:(?:第\s*([0-9０-９一二三四五六七八九十百千兩两〇零]+)\s*(?:季|期|部|篇))|(?:(?:season|s|part|pt\.?)\s*([0-9０-９]+))|((?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth))\s+season)\s*[)）]\s*$/i;
    const trailingSeasonText = /(?:\s*[-_ ]*)?(?:第\s*([0-9０-９一二三四五六七八九十百千兩两〇零]+)\s*(?:季|期|部|篇)|(?:season|s|part|pt\.?)\s*([0-9０-９]+)|((?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth))\s+season)\s*(?:[-_ ]*)$/i;

    let changed = true;
    while (changed) {
        changed = false;
        const bracketMatch = working.match(trailingSeasonInBrackets);
        if (bracketMatch && typeof bracketMatch.index === 'number') {
            trySetSeason(bracketMatch[1] || bracketMatch[2] || bracketMatch[3]);
            working = working.slice(0, bracketMatch.index).trim();
            changed = true;
            continue;
        }
        const textMatch = working.match(trailingSeasonText);
        if (textMatch && typeof textMatch.index === 'number') {
            trySetSeason(textMatch[1] || textMatch[2] || textMatch[3]);
            working = working.slice(0, textMatch.index).trim();
            changed = true;
        }
    }

    if (Number.isFinite(seasonNumber)) {
        const trailingDigit = working.match(/(?:[\s\-_:：])([0-9０-９]+)\s*$/);
        if (trailingDigit && typeof trailingDigit.index === 'number') {
            const tailNum = parseSeasonNumber(trailingDigit[1]);
            if (tailNum === seasonNumber) {
                working = working.slice(0, trailingDigit.index).trim();
            }
        }
    }

    working = working
        .replace(/[：:|/\\-]+\s*$/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const baseName = normalizeAnimeNameForQuery(working) || normalizeAnimeNameForQuery(original) || original;
    return { baseName, seasonNumber };
}

function appendSeasonIfNeeded(nameZhHans, originalName, seasonNumber) {
    if (!seasonNumber || seasonNumber <= 1) return nameZhHans;

    // Check if nameZhHans already has some season indicators (prevent duplicate suffix)
    const hasSeason = /(?:第\s*[0-9一二三四五六七八九十]+\s*[季期部篇]|season\s*\d+|\bs\d+\b|\bpart\s*\d+)/i.test(nameZhHans);
    if (hasSeason) return nameZhHans;

    // Convert seasonNumber to Chinese characters (supports up to 10)
    const numWords = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    let seasonStr = '';
    if (seasonNumber <= 10) {
        seasonStr = `第${numWords[seasonNumber]}季`;
    } else {
        seasonStr = `第${seasonNumber}季`;
    }

    return `${nameZhHans} ${seasonStr}`;
}

// --- Third Party Integrations ---

// 1. Bangumi (BGM.tv) API V0 search
async function searchBangumi(query) {
    const url = 'https://api.bgm.tv/v0/search/subjects';
    const body = {
        keyword: query,
        filter: {
            type: [2], // 2 = Anime
            nsfw: false
        },
        limit: 3
    };
    try {
        const responseText = await fetchUrl(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Anime1Enhancer/3.0.0 (https://github.com)'
            },
            body: body
        });
        const data = JSON.parse(responseText);
        if (data.data && data.data.length > 0) {
            const match = data.data[0];
            return {
                nameZhHans: match.name_cn || match.name,
                score: match.rating ? match.rating.score : null,
                coverUrl: match.images ? match.images.large || match.images.common : null
            };
        }
    } catch (e) {
        console.error(`  [Bangumi Error] ${query}:`, e.message);
    }
    return null;
}

function buildQueryCandidates(name) {
    const candidates = [];
    const seen = new Set();
    const add = (value) => {
        const query = String(value || '')
            .replace(/[-－–—_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!query || seen.has(query)) return;
        seen.add(query);
        candidates.push(query);
    };
    const firstNChars = (text, n) => Array.from(String(text || '')).slice(0, n).join('');

    const normalized = normalizeAnimeNameForQuery(name);
    if (!normalized) return candidates;

    const isContinuousName = !/\s/.test(normalized);
    const longNameShort = (isContinuousName && Array.from(normalized).length > 10) ? firstNChars(normalized, 10) : '';
    if (longNameShort) add(longNameShort);
    add(normalized);

    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return candidates;

    for (let count = parts.length - 1; count >= 1; count -= 1) {
        add(parts.slice(0, count).join(' '));
    }
    return candidates;
}

// Helper to resolve poster paths for both zh-CN and zh-TW, and retrieve all posters for language priority checks
async function resolvePosters(type, id, seasonNumber, apiKey) {
    let posterCnPath = null;
    let posterTwPath = null;
    let postersList = [];
    let airDate = null;

    if (type === 'tv' && seasonNumber && seasonNumber > 0) {
        try {
            const cnUrl = `https://api.themoviedb.org/3/tv/${id}/season/${seasonNumber}?api_key=${apiKey}&language=zh-CN`;
            const twUrl = `https://api.themoviedb.org/3/tv/${id}/season/${seasonNumber}?api_key=${apiKey}&language=zh-TW`;
            const imgUrl = `https://api.themoviedb.org/3/tv/${id}/season/${seasonNumber}/images?api_key=${apiKey}&include_image_language=zh,ja,en,null`;

            const [cnText, twText, imgText] = await Promise.all([
                fetchUrl(cnUrl).catch(() => null),
                fetchUrl(twUrl).catch(() => null),
                fetchUrl(imgUrl).catch(() => null)
            ]);

            if (cnText) {
                const data = JSON.parse(cnText);
                posterCnPath = data.poster_path;
                airDate = data.air_date;
            }
            if (twText) {
                const data = JSON.parse(twText);
                posterTwPath = data.poster_path;
            }
            if (imgText) {
                const data = JSON.parse(imgText);
                postersList = data.posters || [];
            }
        } catch (e) {
            console.warn(`    [TMDB Season Error] Failed to fetch season ${seasonNumber} details/images:`, e.message);
        }
    }

    if (!posterCnPath && !posterTwPath) {
        try {
            const cnUrl = type === 'tv'
                ? `https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}&language=zh-CN`
                : `https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}&language=zh-CN`;
            const twUrl = type === 'tv'
                ? `https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}&language=zh-TW`
                : `https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}&language=zh-TW`;
            const imgUrl = type === 'tv'
                ? `https://api.themoviedb.org/3/tv/${id}/images?api_key=${apiKey}&include_image_language=zh,ja,en,null`
                : `https://api.themoviedb.org/3/movie/${id}/images?api_key=${apiKey}&include_image_language=zh,ja,en,null`;

            const [cnText, twText, imgText] = await Promise.all([
                fetchUrl(cnUrl).catch(() => null),
                fetchUrl(twUrl).catch(() => null),
                fetchUrl(imgUrl).catch(() => null)
            ]);

            if (cnText) {
                const data = JSON.parse(cnText);
                posterCnPath = data.poster_path;
                if (!airDate) {
                    airDate = data.first_air_date || data.release_date;
                }
            }
            if (twText) {
                const data = JSON.parse(twText);
                posterTwPath = data.poster_path;
            }
            if (imgText) {
                const data = JSON.parse(imgText);
                postersList = data.posters || [];
            }
        } catch (e) {
            console.warn(`    [TMDB Details Error] Failed to fetch details/images:`, e.message);
        }
    }

    return {
        posterCnPath,
        posterTwPath,
        postersList,
        airDate
    };
}

function selectPosters(resolved) {
    const zhPaths = new Set(resolved.postersList.filter(p => p.iso_639_1 === 'zh').map(p => p.file_path));
    const jaPaths = resolved.postersList.filter(p => p.iso_639_1 === 'ja').map(p => p.file_path);
    const enPaths = resolved.postersList.filter(p => p.iso_639_1 === 'en').map(p => p.file_path);

    let coverUrlPath = null;
    if (resolved.posterTwPath && zhPaths.has(resolved.posterTwPath)) {
        coverUrlPath = resolved.posterTwPath;
    } else if (jaPaths.length > 0) {
        coverUrlPath = jaPaths[0];
    } else if (enPaths.length > 0) {
        coverUrlPath = enPaths[0];
    } else {
        coverUrlPath = resolved.posterTwPath || resolved.posterCnPath;
    }

    let cnCoverUrlPath = null;
    if (resolved.posterCnPath && zhPaths.has(resolved.posterCnPath) && resolved.posterCnPath !== coverUrlPath) {
        cnCoverUrlPath = resolved.posterCnPath;
    }

    return {
        coverUrl: coverUrlPath ? `https://image.tmdb.org/t/p/w500${coverUrlPath}` : null,
        cnCoverUrl: cnCoverUrlPath ? `https://image.tmdb.org/t/p/w500${cnCoverUrlPath}` : null
    };
}

function stripImagePrefix(url) {
    if (!url) return null;
    if (url.startsWith('https://image.tmdb.org/t/p/w500')) {
        return url.replace('https://image.tmdb.org/t/p/w500', '');
    }
    if (url.startsWith('https://image.tmdb.org/t/p/w1280')) {
        return url.replace('https://image.tmdb.org/t/p/w1280', '');
    }
    return url;
}

function mapEnhancedItem(item) {
    if (!item) return null;
    if (item.catId) return item; // Already full-length format

    return {
        catId: item.id,
        name: item.n,
        nameZhHans: item.z || item.n,
        episodes: item.t || '',
        year: item.y || '',
        sub: '',
        score: (item.s !== undefined && item.s !== null) ? item.s : null,
        coverUrl: item.c ? (item.c.startsWith('/') ? 'https://image.tmdb.org/t/p/w500' + item.c : item.c) : null,
        "cn-coverURL": item.f ? (item.f.startsWith('/') ? 'https://image.tmdb.org/t/p/w500' + item.f : item.f) : null,
        backdropUrl: item.b ? (item.b.startsWith('/') ? 'https://image.tmdb.org/t/p/w1280' + item.b : item.b) : null,
        episodesList: typeof item.l === 'string' ? (item.l ? item.l.split(',').map(s => {
            const [p, e] = s.split(':');
            return {
                postId: p,
                epNum: e !== '' ? Number(e) : null
            };
        }) : []) : []
    };
}

function toShortened(item) {
    return {
        id: item.catId,
        n: item.name,
        z: item.nameZhHans !== undefined && item.nameZhHans !== null ? item.nameZhHans : null,
        t: item.episodes || '',
        y: item.year || '',
        s: (item.score !== null && item.score !== undefined) ? item.score : null,
        c: stripImagePrefix(item.coverUrl),
        f: stripImagePrefix(item['cn-coverURL']),
        b: stripImagePrefix(item.backdropUrl),
        l: Array.isArray(item.episodesList) ? item.episodesList.map(ep => {
            const p = String(ep.postId);
            const e = (ep.epNum !== null && ep.epNum !== undefined) ? ep.epNum : '';
            return `${p}:${e}`;
        }).join(',') : ''
    };
}

function normalizeCachedItem(cached) {
    if (!cached) return null;
    const full = cached.catId ? cached : mapEnhancedItem(cached);
    return toShortened(full);
}

// 2. TMDB API Search
async function searchTmdb(query, apiKey, seasonNumber = null) {
    if (!apiKey) return null;
    const candidates = buildQueryCandidates(query);

    // 1. Search TV shows using candidates
    for (const q of candidates) {
        const url = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(q)}&language=zh-CN`;
        try {
            const responseText = await fetchUrl(url);
            const data = JSON.parse(responseText);
            if (data.results && data.results.length > 0) {
                const animeResults = data.results.filter(item => Array.isArray(item?.genre_ids) && item.genre_ids.includes(16));
                const best = animeResults.length > 0 ? animeResults[0] : data.results[0];

                const resolved = await resolvePosters('tv', best.id, seasonNumber, apiKey);
                const posters = selectPosters(resolved);

                let yearVal = null;
                if (resolved.airDate && typeof resolved.airDate === 'string') {
                    const match = resolved.airDate.match(/^(\d{4})/);
                    if (match) yearVal = match[1];
                }

                return {
                    nameZhHans: best.name || best.original_name,
                    coverUrl: posters.coverUrl,
                    cnCoverUrl: posters.cnCoverUrl,
                    backdropUrl: best.backdrop_path ? `https://image.tmdb.org/t/p/w1280${best.backdrop_path}` : null,
                    year: yearVal
                };
            }
        } catch (e) {
            console.error(`  [TMDB TV Error] ${q}:`, e.message);
        }
    }

    // 2. Fallback to Movie search using candidates
    for (const q of candidates) {
        const movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(q)}&language=zh-CN`;
        try {
            const movieResText = await fetchUrl(movieUrl);
            const movieRes = JSON.parse(movieResText);
            if (movieRes.results && movieRes.results.length > 0) {
                const animeResults = movieRes.results.filter(item => Array.isArray(item?.genre_ids) && item.genre_ids.includes(16));
                const best = animeResults.length > 0 ? animeResults[0] : movieRes.results[0];

                const resolved = await resolvePosters('movie', best.id, null, apiKey);
                const posters = selectPosters(resolved);

                let movieYear = null;
                if (resolved.airDate && typeof resolved.airDate === 'string') {
                    const match = resolved.airDate.match(/^(\d{4})/);
                    if (match) movieYear = match[1];
                }

                return {
                    nameZhHans: best.title || best.original_title,
                    coverUrl: posters.coverUrl,
                    cnCoverUrl: posters.cnCoverUrl,
                    backdropUrl: best.backdrop_path ? `https://image.tmdb.org/t/p/w1280${best.backdrop_path}` : null,
                    year: movieYear
                };
            }
        } catch (e) {
            console.error(`  [TMDB Movie Error] ${q}:`, e.message);
        }
    }

    return null;
}

// 3. Scraping Episodes from Anime1.me
async function fetchCategoryEpisodes(catId) {
    const episodes = [];
    let pageUrl = `https://anime1.me/?cat=${catId}`;
    const maxPages = 15; // Safe limit

    for (let i = 0; i < maxPages; i++) {
        try {
            const html = await fetchUrl(pageUrl);

            const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
            const linkRegex = /<h2 class="entry-title"><a href="https:\/\/anime1\.me\/(\d+)"[^>]*>([\s\S]*?)<\/a><\/h2>/i;

            let match;
            let pageEps = [];
            while ((match = articleRegex.exec(html)) !== null) {
                const articleContent = match[1];
                const linkMatch = articleContent.match(linkRegex);
                if (linkMatch) {
                    const postId = linkMatch[1];
                    let title = linkMatch[2].replace(/&#8211;/g, '–').trim();
                    title = title.replace(/<[^>]*>/g, '').trim(); // Strip inner tags
                    const epMatch = title.match(/\[(\d+)\]/);
                    const epNum = epMatch ? parseInt(epMatch[1], 10) : null;
                    pageEps.push({
                        postId: postId,
                        epNum: epNum
                    });
                }
            }
            episodes.push(...pageEps);

            // Check for next page
            const nextLinkRegex = /<div class="nav-previous"><a href="([^"]+)"[^>]*>上一頁/i;
            const nextMatch = html.match(nextLinkRegex);
            if (nextMatch) {
                pageUrl = nextMatch[1].replace(/&#038;/g, '&');
            } else {
                break;
            }
        } catch (e) {
            console.error(`  [Scraper Error] Failed catId ${catId}:`, e.message);
            break;
        }
    }

    // Default epNums for episodes without [xx] in their titles
    episodes.forEach((ep, idx) => {
        if (ep.epNum === null) {
            ep.epNum = episodes.length - idx;
        }
    });

    // Sort in chronological order (oldest post first, which corresponds to EP 01)
    episodes.reverse();
    return episodes;
}

// --- Main Runner ---
async function run() {
    console.log('[Anime1 Catalog Updater] Starting...');

    // 1. Load official animelist.json
    console.log('[1/4] Fetching official animelist.json from anime1.me...');
    let rawList;
    try {
        const rawJsonText = await fetchUrl('https://anime1.me/animelist.json');
        rawList = JSON.parse(rawJsonText);
    } catch (e) {
        console.error('CRITICAL: Failed to download official animelist.json:', e.message);
        process.exit(1);
    }

    // 2. Load existing enhanced file for caching
    console.log('[2/4] Loading existing enhanced catalog (cache) if exists...');
    const cacheMap = new Map();
    if (fs.existsSync(ENHANCED_FILE)) {
        try {
            const oldData = JSON.parse(fs.readFileSync(ENHANCED_FILE, 'utf8'));
            oldData.forEach(item => {
                const id = item.id || item.catId;
                if (id) cacheMap.set(id, item);
            });
            console.log(`Loaded ${cacheMap.size} cached items.`);
        } catch (e) {
            console.warn('Could not parse existing enhanced catalog, starting fresh:', e.message);
        }
    }

    // 3. Process each item (Incremental updates)
    console.log('[3/4] Processing items and calling APIs...');
    const enhancedList = [];
    let apiCallCount = 0;
    const validItems = rawList.filter(rawItem => Array.isArray(rawItem) && rawItem.length >= 2);
    const totalItems = validItems.length;
    let currentIndex = 0;

    for (const rawItem of validItems) {
        currentIndex++;
        let catId = parseInt(rawItem[0], 10);
        let rawNameHtml = String(rawItem[1] || '');
        let episodes = rawItem[2] || '';
        let year = String(rawItem[3] || '');
        let season = String(rawItem[4] || '');
        let sub = rawItem[5] || '';
        let externalUrl = rawItem[6] || '';

        // Normalize pure name (strip tags/🔞)
        let name = rawNameHtml;
        let isR18 = rawNameHtml.includes('🔞') || rawNameHtml.includes('(18禁)');
        const nameMatch = rawNameHtml.match(/<a[^>]*>([^<]+)<\/a>/);
        if (nameMatch) {
            name = nameMatch[1];
        } else {
            name = name.replace(/<[^>]*>/g, '').replace('🔞', '').replace('(18禁)', '').trim();
        }

        if (catId === 0 || !externalUrl) {
            const urlMatch = rawNameHtml.match(/href="([^"]+)"/);
            if (urlMatch) {
                externalUrl = urlMatch[1];
                if (externalUrl.startsWith('//')) externalUrl = 'https:' + externalUrl;
            }
        }
        if (catId === 0 && externalUrl) {
            const idMatch = externalUrl.match(/[\?&]cat=(\d+)/);
            if (idMatch) catId = parseInt(idMatch[1], 10);
        }

        // 1. Skip R18 anime as requested
        if (isR18 || (externalUrl && externalUrl.includes('anime1.pw'))) {
            continue;
        }

        if (!name || catId === 0) continue;

        // Check cache
        const cachedRaw = cacheMap.get(catId);
        const cachedItem = normalizeCachedItem(cachedRaw);
        const hasAiredCountUnchanged = cachedItem && cachedItem.t === episodes;

        // Condition for reusing cache:
        if (cachedItem && hasAiredCountUnchanged && (cachedItem.c !== undefined) && (cachedItem.l !== undefined && cachedItem.l !== null)) {
            // Reuse cache, updating t and year, and ensuring no s is written
            enhancedList.push({
                ...cachedItem,
                t: episodes, // Keep updated count
                y: cachedItem.y || year
            });
            continue;
        }

        console.log(`[${currentIndex}/${totalItems}] Processing [cat:${catId}] ${name} (episodes: ${episodes})...`);

        // Perform name analysis for query candidates
        const parsed = extractTitleAndSeason(name);
        const query = parsed.baseName;

        let nameZhHans = name;
        let score = null;
        let coverUrl = null;
        let cnCoverUrl = null;
        let backdropUrl = null;

        // Call APIs with rate limiting delays
        // Initialize Bangumi search query with season name to get the correct season's score
        let searchNameForBangumi = appendSeasonIfNeeded(query, name, parsed.seasonNumber);
        let resolvedYear = year; // Fallback to parsed year from official JSON

        // A. Query TMDB first (if key exists) to resolve the Simplified Chinese name, season-specific poster, and season release year
        if (TMDB_API_KEY) {
            await new Promise(r => setTimeout(r, 400));
            const tmdbData = await searchTmdb(query, TMDB_API_KEY, parsed.seasonNumber);
            if (tmdbData) {
                if (tmdbData.nameZhHans) {
                    nameZhHans = tmdbData.nameZhHans;
                    // Append season to the resolved TMDB name for a highly precise Bangumi query
                    searchNameForBangumi = appendSeasonIfNeeded(tmdbData.nameZhHans, name, parsed.seasonNumber);
                }
                if (tmdbData.coverUrl) coverUrl = tmdbData.coverUrl;
                cnCoverUrl = tmdbData.cnCoverUrl || null;
                backdropUrl = tmdbData.backdropUrl;
                if (tmdbData.year) resolvedYear = tmdbData.year; // Overwrite year with TMDB data
            }
        }

        // B. Query Bangumi using the resolved Simplified name for higher match rate
        await new Promise(r => setTimeout(r, 400));
        const bgmData = await searchBangumi(searchNameForBangumi);
        if (bgmData) {
            // If TMDB didn't return a name, use Bangumi name
            if (!TMDB_API_KEY || nameZhHans === name) {
                nameZhHans = bgmData.nameZhHans;
            }
            score = bgmData.score;
            // Fallback cover if TMDB has none
            if (!coverUrl) coverUrl = bgmData.coverUrl;
        }

        // Auto append season description if missing in Simplified Chinese name
        nameZhHans = appendSeasonIfNeeded(nameZhHans, name, parsed.seasonNumber);

        // C. Scrape Episode list from Anime1.me
        console.log(`  Scraping episodes for ${name}...`);
        await new Promise(r => setTimeout(r, 400));
        const episodesList = await fetchCategoryEpisodes(catId);

        enhancedList.push(toShortened({
            catId: catId,
            name: name,
            nameZhHans: nameZhHans,
            episodes: episodes,
            year: resolvedYear,
            sub: sub,
            score: score,
            coverUrl: coverUrl,
            "cn-coverURL": cnCoverUrl || null,
            backdropUrl: backdropUrl,
            episodesList: episodesList
        }));

        // Write incrementally to support checkpoints / resuming on interruption
        try {
            fs.writeFileSync(ENHANCED_FILE, JSON.stringify(enhancedList, null, 2), 'utf8');
        } catch (writeErr) {
            console.error(`  [Write Error] Failed to write checkpoint:`, writeErr.message);
        }

        apiCallCount++;
        // Print progress
        if (apiCallCount % 5 === 0) {
            const percent = ((currentIndex / totalItems) * 100).toFixed(1);
            console.log(`Progress: ${currentIndex}/${totalItems} items processed (${percent}% done, apiCalls: ${apiCallCount})...`);
        }
    }

    console.log(`Successfully completed processing ${enhancedList.length} items.`);

    // Write the final database to disk
    try {
        fs.writeFileSync(ENHANCED_FILE, JSON.stringify(enhancedList, null, 2), 'utf8');
        console.log(`Successfully saved final catalog to ${ENHANCED_FILE}`);
    } catch (writeErr) {
        console.error(`[Write Error] Failed to write final catalog:`, writeErr.message);
    }
}

run().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
