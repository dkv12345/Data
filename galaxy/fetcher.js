/**
 * fetcher.js - Giao tiếp Galaxy Cinema API & Next.js Data Endpoints
 * Tự động quản lý Cookie session, Client ID và Next.js Build ID
 */

const axios = require('axios');
const { execSync } = require('child_process');
const { BASE_URL, CLIENT_ID, USER_AGENT, REFERER, ENDPOINTS } = require('./config');

let cookieCache = '';
let cookieInitialized = false;
let cachedBuildId = null;

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/plain, */*',
    'Referer': REFERER,
    'clientid': CLIENT_ID
  }
});

/**
 * Khởi tạo Cookie từ Galaxy Nginx/Cloudflare gateway
 */
async function ensureCookies() {
  if (cookieInitialized && cookieCache) return cookieCache;

  try {
    const handshakeClient = axios.create({
      baseURL: BASE_URL,
      timeout: 15000,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Referer': REFERER,
        'clientid': CLIENT_ID
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const res = await handshakeClient.get(ENDPOINTS.CINEMAS);
    if (res.headers['set-cookie']) {
      cookieCache = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
      cookieInitialized = true;
    }
  } catch (error) {
    if (error.response && error.response.headers['set-cookie']) {
      cookieCache = error.response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
      cookieInitialized = true;
    }
  }
  return cookieCache;
}

/**
 * Lấy Next.js Build ID của Galaxy website
 */
async function getBuildId() {
  if (cachedBuildId) return cachedBuildId;
  try {
    const cmd = `curl -s -L -c /tmp/glx_cookie.txt -b /tmp/glx_cookie.txt -H "User-Agent: ${USER_AGENT}" "https://www.galaxycine.vn/"`;
    const html = execSync(cmd, { maxBuffer: 10 * 1024 * 1024 }).toString();
    const match = html.match(/"buildId":"([^"]+)"/);
    cachedBuildId = match ? match[1] : 'jlFhZubH0FvJHtiAI8tby';
  } catch (e) {
    cachedBuildId = 'jlFhZubH0FvJHtiAI8tby';
  }
  return cachedBuildId;
}

/**
 * Gọi API chung với quản lý cookie & retry
 */
async function fetchAPI(endpoint, retries = 2) {
  await ensureCookies();

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Referer': REFERER,
        'clientid': CLIENT_ID
      };

      if (cookieCache) {
        headers['Cookie'] = cookieCache;
      }

      const response = await apiClient.get(endpoint, { headers });
      return response.data;
    } catch (error) {
      if (attempt <= retries) {
        cookieInitialized = false;
        await ensureCookies();
        await new Promise(r => setTimeout(r, 800 * attempt));
      } else {
        console.error(`❌ Lỗi khi gọi ${endpoint}:`, error.message);
        return null;
      }
    }
  }
  return null;
}

/**
 * Lấy chi tiết phim (Đạo diễn, Diễn viên, Thể loại, Quốc gia, Tóm tắt nội dung...)
 */
async function fetchMovieDetail(slug, buildId) {
  const bId = buildId || await getBuildId();
  try {
    const cmd = `curl --compressed -s -L -c /tmp/glx_cookie.txt -b /tmp/glx_cookie.txt -H "User-Agent: ${USER_AGENT}" -H "Referer: ${REFERER}" "https://www.galaxycine.vn/_next/data/${bId}/vi/phim/${slug}.json"`;
    const stdout = execSync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 10000 }).toString();
    const json = JSON.parse(stdout);
    return json.pageProps?.movieDetail || null;
  } catch (error) {
    return null;
  }
}

module.exports = {
  fetchAPI,
  getBuildId,
  fetchMovieDetail,
  fetchCinemas: async () => (await fetchAPI(ENDPOINTS.CINEMAS))?.data?.result || [],
  fetchSessions: async () => (await fetchAPI(ENDPOINTS.SESSIONS))?.data?.result || [],
  fetchComingMovies: async () => (await fetchAPI(ENDPOINTS.MOVIES_COMING))?.data?.result || [],
  fetchImaxMovies: async () => (await fetchAPI(ENDPOINTS.MOVIES_IMAX))?.data?.result || [],
  fetchPromotions: async () => (await fetchAPI(ENDPOINTS.PROMOTIONS))?.data?.result || []
};
