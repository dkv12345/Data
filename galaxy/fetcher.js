/**
 * fetcher.js - Giao tiếp Galaxy Cinema API
 * Tự động quản lý Cookie session & Client ID để vượt qua cơ chế bảo vệ của Galaxy
 */

const axios = require('axios');
const { BASE_URL, CLIENT_ID, USER_AGENT, REFERER, ENDPOINTS } = require('./config');

let cookieCache = '';
let cookieInitialized = false;

// Khởi tạo instance axios cơ bản
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
  if (cookieInitialized && cookieCache) return;

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
    } else {
      console.warn('⚠️ Không lấy được set-cookie tự động, tiếp tục với clientid header mặc định.');
    }
  }
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
      console.error(`❌ [Attempt ${attempt}/${retries + 1}] Lỗi khi gọi ${endpoint}:`, error.message);
      if (attempt <= retries) {
        // Reset cookie và thử lại
        cookieInitialized = false;
        await ensureCookies();
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        return null;
      }
    }
  }
  return null;
}

/**
 * Lấy danh sách rạp Galaxy
 */
async function fetchCinemas() {
  const data = await fetchAPI(ENDPOINTS.CINEMAS);
  return data?.data?.result || [];
}

/**
 * Lấy danh sách toàn bộ suất chiếu kèm thông tin Rạp & Phim
 */
async function fetchSessions() {
  const data = await fetchAPI(ENDPOINTS.SESSIONS);
  return data?.data?.result || [];
}

/**
 * Lấy danh sách phim sắp chiếu
 */
async function fetchComingMovies() {
  const data = await fetchAPI(ENDPOINTS.MOVIES_COMING);
  return data?.data?.result || [];
}

/**
 * Lấy danh sách phim IMAX
 */
async function fetchImaxMovies() {
  const data = await fetchAPI(ENDPOINTS.MOVIES_IMAX);
  return data?.data?.result || [];
}

/**
 * Lấy danh sách khuyến mãi
 */
async function fetchPromotions() {
  const data = await fetchAPI(ENDPOINTS.PROMOTIONS);
  return data?.data?.result || [];
}

module.exports = {
  fetchAPI,
  fetchCinemas,
  fetchSessions,
  fetchComingMovies,
  fetchImaxMovies,
  fetchPromotions
};
