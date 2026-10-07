/**
 * Cấu hình hằng số và API cho Galaxy Cinema Crawler
 * Tương thích với CineHub Schema v3
 */

module.exports = {
  CHAIN_CODE: 'GALAXY',
  CHAIN_NAME: 'Galaxy Cinema',
  CHAIN_LOGO_URL: 'https://cdn.galaxycine.vn/media/2023/11/17/galaxy-logo-mobile_1700208000000.png',
  CHAIN_WEBSITE_URL: 'https://www.galaxycine.vn',
  
  BASE_URL: 'https://www.galaxycine.vn/api/v2/mobile',
  CLIENT_ID: '3da4eba4-94dd-4e74-bc25-38e89a01fe07', // Galaxy Mobile API Client ID
  
  ENDPOINTS: {
    CINEMAS: '/cinemas',
    SESSIONS: '/sessions2?includeCinema=true&includeMovie=true',
    MOVIES_COMING: '/movies/comming',
    MOVIES_IMAX: '/movies/movie-imax',
    PROMOTIONS: '/promotions'
  },
  
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  
  // Buffer dọn rạp & quảng cáo trước/sau phim (phút)
  CLEANUP_BUFFER_MINUTES: 10,
  DEFAULT_MOVIE_DURATION_MINUTES: 120,
  
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  REFERER: 'https://www.galaxycine.vn/'
};
