// Clean Links plugin for Schrodinger
//
// Pastes links without the baggage: tracking parameters are removed and
// redirect wrappers (Google, Facebook, Outlook Safe Links, ...) are unwrapped
// to the address they point at. Works on a bare link or on every link inside
// a longer piece of text. Everything happens locally; no link is ever fetched.

// Parameters that only identify the campaign, the click, or the person who
// shared the link. Removing them never changes which page loads.
const TRACKING_PARAMS = new Set([
    'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid',
    'msclkid', 'yclid', 'twclid', 'ttclid', 'li_fat_id', 'rdt_cid', 'epik', 'srsltid',
    'mc_cid', 'mc_eid', 'mkt_tok', '_hsenc', '_hsmi', '__hssc', '__hstc', '__hsfp', 'hsctatracking',
    'vero_id', 'vero_conv', 'oly_enc_id', 'oly_anon_id', '_openstat', 'wickedid', 'rb_clickid',
    's_cid', 's_kwcid', 'ef_id', 'igshid', 'igsh', '_ga', '_gl', 'ref_src', 'ref_url',
    'cmpid', 'trk', 'trkcampaign', 'sc_campaign', 'sc_channel', 'sc_content', 'sc_medium', 'sc_outcome', 'sc_geo', 'sc_country',
    'spm', 'scm', 'share_id', 'share_source', 'share_medium', 'smid', 'smtyp',
]);
const TRACKING_PREFIXES = ['utm_', 'pk_', 'piwik_', 'mtm_', 'hsa_', 'stm_'];

// Parameters that are tracking only on particular sites (elsewhere `si`, `t`
// or `s` may well be meaningful).
const SITE_PARAMS = [
    [/(^|\.)youtube\.com$|^youtu\.be$/, ['si', 'feature', 'pp']],
    [/(^|\.)spotify\.com$/, ['si', 'nd', 'context']],
    [/(^|\.)(twitter|x)\.com$/, ['s', 't', 'ref_src']],
    [/(^|\.)(instagram|threads)\.(com|net)$/, ['igshid', 'igsh', 'img_index']],
    [/(^|\.)tiktok\.com$/, ['_r', '_t', 'is_from_webapp', 'sender_device', 'is_copy_url']],
    [/(^|\.)linkedin\.com$/, ['trackingid', 'refid', 'lipi', 'midtoken', 'midsig', 'trkemail', 'eid', 'otptoken']],
    [/(^|\.)reddit\.com$/, ['share_id', 'ref', 'ref_source', 'rdt', 'context']],
    [/(^|\.)medium\.com$/, ['source', 'sk']],
    [/(^|\.)wikipedia\.org$/, ['wprov']],
    [/(^|\.)ebay\.[a-z.]+$/, ['mkevt', 'mkcid', 'mkrid', 'campid', 'toolid', 'customid', '_trkparms', '_trksid', 'hash', 'amdata']],
    [/(^|\.)aliexpress\.[a-z.]+$/, ['aff_fcid', 'aff_fsk', 'aff_platform', 'aff_trace_key', 'sk', 'terminal_id', 'afsmartredirect']],
    [/(^|\.)google\.[a-z.]+$/, ['ei', 'ved', 'sxsrf', 'uact', 'gs_lcp', 'gs_lp', 'sclient', 'sca_esv', 'sca_upv', 'iflsig', 'source', 'sourceid', 'aqs', 'oq', 'biw', 'bih', 'dpr']],
];

// Redirectors: the real destination is carried in a query parameter.
const REDIRECTORS = [
    [/^(www\.)?google\.[a-z.]+$/, /^\/url$/, ['q', 'url']],
    [/^l\.(facebook|instagram|messenger)\.com$/, /^\/(l\.php)?$/, ['u']],
    [/^(lm|l)\.facebook\.com$/, /^\/l\.php$/, ['u']],
    [/safelinks\.protection\.outlook\.com$/, /./, ['url']],
    [/^slack-redir\.net$/, /^\/link$/, ['url']],
    [/^(www\.)?youtube\.com$/, /^\/redirect$/, ['q']],
    [/^out\.reddit\.com$/, /./, ['url']],
    [/^steamcommunity\.com$/, /^\/linkfilter\/?$/, ['u', 'url']],
    [/^href\.li$/, /./, null], // href.li/?https://example.com
    [/^(www\.)?linkedin\.com$/, /^\/(redir\/redirect|safety\/go)$/, ['url']],
    [/^t\.umblr\.com$/, /^\/redirect$/, ['z']],
    [/^(click\.)?linksynergy\.com$|^go\.redirectingat\.com$|^go\.skimresources\.com$/, /./, ['murl', 'url']],
];

function isTracking(name, host) {
    const key = name.toLowerCase();
    if (TRACKING_PARAMS.has(key)) return true;
    if (TRACKING_PREFIXES.some(p => key.startsWith(p))) return true;
    return SITE_PARAMS.some(([hostPattern, names]) => hostPattern.test(host) && names.includes(key));
}

function unwrapRedirect(url) {
    for (const [hostPattern, pathPattern, params] of REDIRECTORS) {
        if (!hostPattern.test(url.hostname) || !pathPattern.test(url.pathname)) continue;
        const candidates = params
            ? params.map(p => url.searchParams.get(p))
            : [decodeURIComponent(url.search.slice(1))];
        for (const target of candidates) {
            if (target && /^https?:\/\//i.test(target)) {
                try { return new URL(target); } catch { /* not a URL after all */ }
            }
        }
    }
    return null;
}

function cleanUrl(raw) {
    let url;
    try { url = new URL(raw); } catch { return raw; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw;

    // Unwrap nested redirectors, but never loop forever on a crafted link.
    for (let depth = 0; depth < 5; depth++) {
        const inner = unwrapRedirect(url);
        if (!inner) break;
        url = inner;
    }

    const host = url.hostname.toLowerCase();

    // Amazon product links: everything but the product id is session noise.
    if (/(^|\.)amazon\.[a-z.]+$/.test(host)) {
        const product = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/);
        if (product) return `${url.origin}/dp/${product[1]}`;
    }

    // Rebuild the query by hand so untouched parameters keep their exact
    // original encoding (URLSearchParams would re-encode them).
    const kept = url.search.slice(1).split('&').filter(pair => {
        if (!pair) return false;
        let name = pair.split('=')[0];
        try { name = decodeURIComponent(name.replace(/\+/g, ' ')); } catch { /* keep raw */ }
        return !isTracking(name, host);
    });
    url.search = kept.length ? '?' + kept.join('&') : '';

    // Text-fragment and tracking-only hashes.
    if (/^#(:~:|xtor=|at_medium=)/i.test(url.hash)) url.hash = '';

    let out = url.toString();
    // new URL() adds a trailing slash to bare origins; don't invent one the
    // original didn't have.
    if (url.pathname === '/' && !url.search && !url.hash && !/\/$/.test(raw.split(/[?#]/)[0])) {
        out = out.replace(/\/$/, '');
    }
    return out;
}

// A link inside prose: stop at whitespace and at brackets/quotes that wrap it,
// and leave sentence punctuation that follows it alone.
const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/gi;

function cleanText(text) {
    return text.replace(URL_IN_TEXT, match => {
        let trailing = '';
        let url = match;
        for (;;) {
            const last = url[url.length - 1];
            const unbalancedParen = last === ')' && url.split('(').length <= url.split(')').length - 1;
            if (/[.,;:!?\]}]/.test(last) || unbalancedParen) {
                trailing = last + trailing;
                url = url.slice(0, -1);
            } else {
                break;
            }
        }
        return cleanUrl(url) + trailing;
    });
}

const MAX_BYTES = 500000;
let cache = { changeCount: null, text: null };

async function clipText(entry) {
    if (cache.changeCount === entry.changeCount) return cache.text;
    const format = entry.formats.find(f => f.format === schrodinger.textFormat());
    let text = null;
    if (format && format.size <= MAX_BYTES) {
        text = schrodinger.decode(await schrodinger.readFormat(entry, format.format));
    }
    cache = { changeCount: entry.changeCount, text };
    return text;
}

export default {
    id: "clean-links",
    label: "Clean Links",
    // Only offered when cleaning would actually change something.
    async appliesTo(entry) {
        const text = await clipText(entry);
        return text !== null && cleanText(text) !== text;
    },
    async apply(entry) {
        const text = await clipText(entry);
        return [{ format: schrodinger.textFormat(), data: schrodinger.encode(cleanText(text ?? '')) }];
    }
};
