/**
 * mapper.js - Logic Chuẩn hoá Dữ liệu, Địa chỉ, Enum và DedupKey
 * Đảm bảo khớp 100% với CineHub Prisma Schema v3
 */

const crypto = require('crypto');
const slugify = require('slugify');
const moment = require('moment');
const { CHAIN_CODE, CLEANUP_BUFFER_MINUTES, DEFAULT_MOVIE_DURATION_MINUTES } = require('./config');

/**
 * Tạo slug chuẩn tiếng Việt
 */
const toSlug = (str) => {
  if (!str) return '';
  return slugify(String(str).trim(), {
    lower: true,
    locale: 'vi',
    strict: true,
    remove: /[*+~.()'"!:@]/g
  });
};

/**
 * Bỏ dấu tiếng Việt, chuyển chữ thường, làm sạch khoảng trắng
 * Dùng cho titleNormalized, nameNormalized để gộp và đối chiếu
 */
const normalizeText = (str) => {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Decode các HTML Entity tiếng Việt phổ biến sang ký tự Unicode chuẩn
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  const htmlEntityMap = {
    '&aacute;': 'á', '&agrave;': 'à', '&ả;': 'ả', '&atilde;': 'ã', '&ạ;': 'ạ',
    '&Aacute;': 'Á', '&Agrave;': 'À', '&Ả;': 'Ả', '&Atilde;': 'Ã', '&Ạ;': 'Ạ',
    '&acirc;': 'â', '&ấ;': 'ấ', '&ầ;': 'ầ', '&ẩ;': 'ẩ', '&ẫ;': 'ẫ', '&ậ;': 'ậ',
    '&Acirc;': 'Â', '&Ấ;': 'Ấ', '&Ầ;': 'Ầ', '&Ẩ;': 'Ẩ', '&Ẫ;': 'Ẫ', '&Ậ;': 'Ậ',
    '&ă;': 'ă', '&ắ;': 'ắ', '&ằ;': 'ằ', '&ẳ;': 'ẳ', '&ẵ;': 'ẵ', '&ặ;': 'ặ',
    '&Ă;': 'Ă', '&Ắ;': 'Ắ', '&Ằ;': 'Ằ', '&Ẳ;': 'Ẳ', '&Ẵ;': 'Ẵ', '&Ặ;': 'Ặ',
    '&eacute;': 'é', '&egrave;': 'è', '&ẻ;': 'ẻ', '&ẽ;': 'ẽ', '&ẹ;': 'ẹ',
    '&Eacute;': 'É', '&Egrave;': 'È', '&Ẻ;': 'Ẻ', '&Etilde;': 'Ẽ', '&Ẹ;': 'Ẹ',
    '&ecirc;': 'ê', '&ế;': 'ế', '&ề;': 'ề', '&ể;': 'ể', '&ễ;': 'ễ', '&ệ;': 'ệ',
    '&Ecirc;': 'Ê', '&Ế;': 'Ế', '&Ề;': 'Ề', '&Ể;': 'Ể', '&Ễ;': 'Ễ', '&Ệ;': 'Ệ',
    '&iacute;': 'í', '&igrave;': 'ì', '&ỉ;': 'ỉ', '&ĩ;': 'ĩ', '&ị;': 'ị',
    '&Iacute;': 'Í', '&Igrave;': 'Ì', '&Ỉ;': 'Ỉ', '&Itilde;': 'Ĩ', '&Ị;': 'Ị',
    '&oacute;': 'ó', '&ograve;': 'ò', '&ỏ;': 'ỏ', '&otilde;': 'õ', '&ọ;': 'ọ',
    '&Oacute;': 'Ó', '&Ograve;': 'Ò', '&Ỏ;': 'Ỏ', '&Otilde;': 'Õ', '&Ọ;': 'Ọ',
    '&ocirc;': 'ô', '&ố;': 'ố', '&ồ;': 'ồ', '&ổ;': 'ổ', '&ỗ;': 'ỗ', '&ộ;': 'ộ',
    '&Ocirc;': 'Ô', '&Ố;': 'Ố', '&Ồ;': 'Ồ', '&Ổ;': 'Ổ', '&Ỗ;': 'Ỗ', '&Ộ;': 'Ộ',
    '&ơ;': 'ơ', '&ớ;': 'ớ', '&ờ;': 'ờ', '&ở;': 'ở', '&ỡ;': 'ỡ', '&ợ;': 'ợ',
    '&Ocirc;': 'Ơ', '&Ớ;': 'Ớ', '&Ờ;': 'Ờ', '&Ở;': 'Ở', '&Ỡ;': 'Ỡ', '&Ợ;': 'Ợ',
    '&uacute;': 'ú', '&ugrave;': 'ù', '&ủ;': 'ủ', '&ũ;': 'ũ', '&ụ;': 'ụ',
    '&Uacute;': 'Ú', '&Ugrave;': 'Ù', '&Ủ;': 'Ủ', '&Utilde;': 'Ũ', '&Ụ;': 'Ụ',
    '&ư;': 'ư', '&ứ;': 'ứ', '&ừ;': 'ừ', '&ử;': 'ử', '&ữ;': 'ữ', '&ự;': 'ự',
    '&Uhorn;': 'Ư', '&Ứ;': 'Ứ', '&Ừ;': 'Ừ', '&Ử;': 'Ử', '&Ữ;': 'Ữ', '&Ự;': 'Ự',
    '&yacute;': 'ý', '&ygrave;': 'ỳ', '&ỷ;': 'ỷ', '&ỹ;': 'ỹ', '&ỵ;': 'ỵ',
    '&Yacute;': 'Ý', '&Ygrave;': 'Ỳ', '&Ỷ;': 'Ỷ', '&Ytilde;': 'Ỹ', '&Ỵ;': 'Ỵ',
    '&đ;': 'đ', '&Đ;': 'Đ', '&quot;': '"', '&ldquo;': '"', '&rdquo;': '"',
    '&lsquo;': "'", '&rsquo;': "'", '&ndash;': '-', '&mdash;': '-',
    '&hellip;': '...', '&amp;': '&', '&nbsp;': ' '
  };
  let res = str;
  for (const [k, v] of Object.entries(htmlEntityMap)) {
    res = res.replaceAll(k, v);
  }
  res = res.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(+code));
  res = res.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
  return res;
}

/**
 * Làm sạch mô tả phim từ HTML sang Text thuần tiếng Việt chuẩn
 */
const cleanSynopsis = (rawText) => {
  if (!rawText) return null;
  const decoded = decodeHtmlEntities(rawText);
  const stripped = String(decoded)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+\n/g, '\n\n')
    .trim();
  return stripped.length > 0 ? stripped : null;
};

/**
 * Bảng tra cứu Tỉnh / Thành phố chuẩn hoá cho CineHub Schema v3
 */
const PROVINCE_MAP = {
  'ho chi minh': { code: 'HCM', name: 'TP. Hồ Chí Minh', nameNormalized: 'ho chi minh' },
  'tp hcm': { code: 'HCM', name: 'TP. Hồ Chí Minh', nameNormalized: 'ho chi minh' },
  'tphcm': { code: 'HCM', name: 'TP. Hồ Chí Minh', nameNormalized: 'ho chi minh' },
  'tp ho chi minh': { code: 'HCM', name: 'TP. Hồ Chí Minh', nameNormalized: 'ho chi minh' },
  'thanh pho ho chi minh': { code: 'HCM', name: 'TP. Hồ Chí Minh', nameNormalized: 'ho chi minh' },
  'ha noi': { code: 'HN', name: 'Hà Nội', nameNormalized: 'ha noi' },
  'tp ha noi': { code: 'HN', name: 'Hà Nội', nameNormalized: 'ha noi' },
  'thanh pho ha noi': { code: 'HN', name: 'Hà Nội', nameNormalized: 'ha noi' },
  'da nang': { code: 'DN', name: 'Đà Nẵng', nameNormalized: 'da nang' },
  'tp da nang': { code: 'DN', name: 'Đà Nẵng', nameNormalized: 'da nang' },
  'hai phong': { code: 'HP', name: 'Hải Phòng', nameNormalized: 'hai phong' },
  'tp hai phong': { code: 'HP', name: 'Hải Phòng', nameNormalized: 'hai phong' },
  'can tho': { code: 'CT', name: 'Cần Thơ', nameNormalized: 'can tho' },
  'tp can tho': { code: 'CT', name: 'Cần Thơ', nameNormalized: 'can tho' },
  'khanh hoa': { code: 'KH', name: 'Khánh Hòa', nameNormalized: 'khanh hoa' },
  'tinh khanh hoa': { code: 'KH', name: 'Khánh Hòa', nameNormalized: 'khanh hoa' },
  'nghe an': { code: 'NA', name: 'Nghệ An', nameNormalized: 'nghe an' },
  'tinh nghe an': { code: 'NA', name: 'Nghệ An', nameNormalized: 'nghe an' },
  'an giang': { code: 'AG', name: 'An Giang', nameNormalized: 'an giang' },
  'tinh an giang': { code: 'AG', name: 'An Giang', nameNormalized: 'an giang' },
  'dak lak': { code: 'DL', name: 'Đắk Lắk', nameNormalized: 'dak lak' },
  'tinh dak lak': { code: 'DL', name: 'Đắk Lắk', nameNormalized: 'dak lak' },
  'ca mau': { code: 'CM', name: 'Cà Mau', nameNormalized: 'ca mau' },
  'tinh ca mau': { code: 'CM', name: 'Cà Mau', nameNormalized: 'ca mau' },
  'thua thien hue': { code: 'TTH', name: 'Thừa Thiên Huế', nameNormalized: 'thua thien hue' },
  'hue': { code: 'TTH', name: 'Thừa Thiên Huế', nameNormalized: 'thua thien hue' },
  'tp hue': { code: 'TTH', name: 'Thừa Thiên Huế', nameNormalized: 'thua thien hue' },
  'tinh thua thien hue': { code: 'TTH', name: 'Thừa Thiên Huế', nameNormalized: 'thua thien hue' },
  'vinh long': { code: 'VL', name: 'Vĩnh Long', nameNormalized: 'vinh long' },
  'tinh vinh long': { code: 'VL', name: 'Vĩnh Long', nameNormalized: 'vinh long' },
  'tay ninh': { code: 'TN', name: 'Tây Ninh', nameNormalized: 'tay ninh' },
  'tinh tay ninh': { code: 'TN', name: 'Tây Ninh', nameNormalized: 'tay ninh' },
  'long an': { code: 'LA', name: 'Long An', nameNormalized: 'long an' },
  'tinh long an': { code: 'LA', name: 'Long An', nameNormalized: 'long an' },
  'ben tre': { code: 'BT', name: 'Bến Tre', nameNormalized: 'ben tre' },
  'tinh ben tre': { code: 'BT', name: 'Bến Tre', nameNormalized: 'ben tre' },
  'ba ria vung tau': { code: 'BRVT', name: 'Bà Rịa - Vũng Tàu', nameNormalized: 'ba ria - vung tau' },
  'ba ria': { code: 'BRVT', name: 'Bà Rịa - Vũng Tàu', nameNormalized: 'ba ria - vung tau' },
  'vung tau': { code: 'BRVT', name: 'Bà Rịa - Vũng Tàu', nameNormalized: 'ba ria - vung tau' },
  'binh duong': { code: 'BD', name: 'Bình Dương', nameNormalized: 'binh duong' },
  'tinh binh duong': { code: 'BD', name: 'Bình Dương', nameNormalized: 'binh duong' },
  'dong nai': { code: 'DNA', name: 'Đồng Nai', nameNormalized: 'dong nai' },
  'quang ninh': { code: 'QN', name: 'Quảng Ninh', nameNormalized: 'quang ninh' },
  'binh dinh': { code: 'BDI', name: 'Bình Định', nameNormalized: 'binh dinh' },
  'quang ngai': { code: 'QNG', name: 'Quảng Ngãi', nameNormalized: 'quang ngai' }
};

/**
 * Trích xuất và chuẩn hoá Tỉnh/Thành phố từ địa chỉ
 */
const extractProvince = (address) => {
  if (!address) return { code: 'KHAC', name: 'Khác', nameNormalized: 'khac' };

  const cleanAddress = address.replace(/[\r\n]+/g, ', ');
  const parts = cleanAddress.split(',').map(p => p.trim()).filter(Boolean);
  const lastPart = parts[parts.length - 1] || '';
  const normLast = normalizeText(lastPart);

  if (PROVINCE_MAP[normLast]) {
    return PROVINCE_MAP[normLast];
  }

  for (const [key, val] of Object.entries(PROVINCE_MAP)) {
    if (normLast.includes(key) || normalizeText(cleanAddress).endsWith(key)) {
      return val;
    }
  }

  let cleanName = lastPart.replace(/^(TP\.?|Thành phố|Tỉnh)\s+/i, '').trim();
  if (!cleanName) cleanName = 'Khác';
  const normName = normalizeText(cleanName);
  const code = toSlug(normName).toUpperCase().replace(/-/g, '_') || 'KHAC';

  return {
    code: code.slice(0, 20),
    name: cleanName,
    nameNormalized: normName
  };
};

/**
 * Trích xuất Phường/Xã/Thị trấn từ chuỗi địa chỉ
 */
const extractWard = (address) => {
  if (!address) return null;
  const cleanAddress = address.replace(/[\r\n]+/g, ', ');
  const match = cleanAddress.match(/(Phường|Xã|Thị trấn)\s+[^,–\n\r-]+/i);
  if (!match) return null;
  let res = match[0].trim().replace(/\.+$/, '');
  res = res.replace(/^phường/i, 'Phường').replace(/^xã/i, 'Xã').replace(/^thị trấn/i, 'Thị trấn');
  return res;
};

/**
 * Map độ tuổi sang Enum AgeRating của CineHub:
 * P, K, T13, T16, T18, C
 */
const mapAgeRating = (ageStr) => {
  if (ageStr === null || ageStr === undefined || ageStr === '') return null;
  const str = String(ageStr).trim().toUpperCase();
  const map = {
    '0': 'P',
    'P': 'P',
    'K': 'K',
    '13': 'T13',
    'T13': 'T13',
    '16': 'T16',
    'T16': 'T16',
    '18': 'T18',
    'T18': 'T18',
    'C': 'C'
  };
  return map[str] || null;
};

/**
 * Map định dạng màn hình sang Enum ScreenFormat:
 * TWO_D, THREE_D, IMAX, FOUR_DX, SCREENX, DOLBY, LED
 */
const mapScreenFormat = (version, movieFormat) => {
  const v = String(version || '').toLowerCase();
  const f = String(movieFormat || '').toUpperCase();
  const combined = `${v} ${f}`;

  if (combined.includes('imax')) return 'IMAX';
  if (combined.includes('dolby') || combined.includes('atmos')) return 'DOLBY';
  if (combined.includes('onyx') || combined.includes('led')) return 'LED';
  if (combined.includes('4dx')) return 'FOUR_DX';
  if (combined.includes('screenx')) return 'SCREENX';
  if (combined.includes('3d')) return 'THREE_D';
  return 'TWO_D';
};

/**
 * Map phân khúc phòng chiếu sang Enum RoomTier:
 * STANDARD, VIP, KIDS, PREMIUM
 */
const mapRoomTier = (screenName, movieFormat) => {
  const str = `${screenName || ''} ${movieFormat || ''}`.toUpperCase();
  
  if (
    str.includes('VIP') ||
    str.includes('LAURUS') ||
    str.includes('LAGOM') ||
    str.includes('ROMANTICO') ||
    str.includes('HARBOR') ||
    str.includes('AQUALIS') ||
    str.includes('SUITE')
  ) {
    return 'VIP';
  }
  
  if (str.includes('KIDS') || str.includes('CINE DE KIDS')) {
    return 'KIDS';
  }
  
  if (
    str.includes('IMAX') ||
    str.includes('DOLBY') ||
    str.includes('ONYX') ||
    str.includes('INFINITY') ||
    str.includes('LASER') ||
    str.includes('4DX') ||
    str.includes('SCREENX')
  ) {
    return 'PREMIUM';
  }
  
  return 'STANDARD';
};

/**
 * Map loại suất chiếu sang Enum ShowtimeKind:
 * REGULAR, ENCORE, LIVE
 */
const mapShowtimeKind = (version) => {
  const v = String(version || '').toLowerCase();
  if (v.includes('rebroadcast') || v.includes('encore')) return 'ENCORE';
  if (v.includes('live')) return 'LIVE';
  return 'REGULAR';
};

/**
 * Map phụ đề / lồng tiếng sang Enum CaptionMode:
 * SUBTITLED, DUBBED
 */
const mapCaptionMode = (caption) => {
  const c = String(caption || '').toLowerCase();
  if (c === 'voice' || c.includes('lồng tiếng') || c.includes('long tieng')) {
    return 'DUBBED';
  }
  return 'SUBTITLED';
};

/**
 * Tính toán endTime UTC = startTimeUTC + durationMin + buffer quảng cáo/dọn rạp
 */
const calculateEndTime = (startUtc, durationMin) => {
  const duration = (durationMin && durationMin > 0) ? durationMin : DEFAULT_MOVIE_DURATION_MINUTES;
  return moment(startUtc).add(duration + CLEANUP_BUFFER_MINUTES, 'minutes').toISOString();
};

/**
 * Sinh DedupKey cho Showtime:
 * sha1(chain:cinemaCode:movieId:startTimeUTC:format) – KHÔNG chứa auditorium
 */
const generateShowtimeDedupKey = (chain, cinemaCode, movieId, startTimeUTC, format) => {
  const rawString = `${chain || CHAIN_CODE}:${cinemaCode}:${movieId}:${startTimeUTC}:${format}`;
  return crypto.createHash('sha1').update(rawString).digest('hex');
};

/**
 * Sinh DedupKey cho Promotion:
 * sha1(chain:linkUrl_hoặc_slug)
 */
const generatePromotionDedupKey = (chain, identifier) => {
  const rawString = `${chain || CHAIN_CODE}:${identifier || 'general'}`;
  return crypto.createHash('sha1').update(rawString).digest('hex');
};

module.exports = {
  toSlug,
  normalizeText,
  cleanSynopsis,
  extractProvince,
  extractWard,
  mapAgeRating,
  mapScreenFormat,
  mapRoomTier,
  mapShowtimeKind,
  mapCaptionMode,
  calculateEndTime,
  generateShowtimeDedupKey,
  generatePromotionDedupKey
};
