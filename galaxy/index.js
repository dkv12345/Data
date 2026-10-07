/**
 * index.js - Pipeline Crawler & Chuẩn hoá Dữ liệu Galaxy Cinema
 * Xuất dữ liệu tương thích 100% với CineHub Prisma Schema v3
 */

const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { 
  CHAIN_CODE, 
  CHAIN_NAME, 
  CHAIN_LOGO_URL, 
  CHAIN_WEBSITE_URL 
} = require('./config');

const { 
  fetchCinemas, 
  fetchSessions, 
  fetchComingMovies, 
  fetchImaxMovies, 
  fetchPromotions 
} = require('./fetcher');

const { 
  toSlug, 
  normalizeText, 
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
} = require('./mapper');

async function crawlAndNormalize() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 Bắt đầu thu thập & chuẩn hoá dữ liệu từ Galaxy Cinema API');
  console.log('═══════════════════════════════════════════════════════════════');

  const startTime = Date.now();

  // 1. Gọi song song các API chính của Galaxy Cinema
  console.log('📡 Đang gọi các endpoint Galaxy Cinema API...');
  const [
    cinemasData,
    sessionsData,
    comingMoviesData,
    imaxMoviesData,
    promotionsData
  ] = await Promise.all([
    fetchCinemas(),
    fetchSessions(),
    fetchComingMovies(),
    fetchImaxMovies(),
    fetchPromotions()
  ]);

  console.log(`✅ Đã nhận:`);
  console.log(`   - Rạp (Cinemas API): ${cinemasData.length} rạp`);
  console.log(`   - Suất chiếu (Sessions API): ${sessionsData.length} suất`);
  console.log(`   - Phim sắp chiếu (Coming Soon): ${comingMoviesData.length} phim`);
  console.log(`   - Phim IMAX: ${imaxMoviesData.length} phim`);
  console.log(`   - Khuyến mãi (Promotions): ${promotionsData.length} banner`);

  // 2. Khởi tạo cấu trúc dữ liệu theo Schema v3
  const DB = {
    CinemaChain: {
      code: CHAIN_CODE,
      name: CHAIN_NAME,
      logoUrl: CHAIN_LOGO_URL,
      websiteUrl: CHAIN_WEBSITE_URL,
      isActive: true
    },
    Provinces: new Map(),
    Wards: new Map(),
    Cinemas: new Map(),
    Auditoriums: new Map(),
    Movies: new Map(),
    MovieSources: new Map(),
    Showtimes: new Map(),
    Promotions: new Map()
  };

  const syncTimestamp = new Date().toISOString();

  // Map tra cứu phụ trợ cho Rạp từ API Cinemas (thông tin chi tiết hơn)
  const cinemaDetailMap = new Map();
  cinemasData.forEach(c => {
    const code = c.code || c.siteId || c.id;
    if (code) cinemaDetailMap.set(String(code), c);
    if (c.slug) cinemaDetailMap.set(c.slug, c);
  });

  // 3. Xử lý danh sách Rạp từ API Cinemas trước
  cinemasData.forEach(rawCinema => {
    const cinemaCode = String(rawCinema.code || rawCinema.siteId || rawCinema.id);
    const provInfo = extractProvince(rawCinema.address);
    const wardName = extractWard(rawCinema.address);

    // Chuẩn hoá Tỉnh/Thành
    if (!DB.Provinces.has(provInfo.code)) {
      DB.Provinces.set(provInfo.code, {
        code: provInfo.code,
        name: provInfo.name,
        nameNormalized: provInfo.nameNormalized
      });
    }

    // Chuẩn hoá Phường/Xã
    if (wardName) {
      const wardKey = `${provInfo.code}_${wardName}`;
      if (!DB.Wards.has(wardKey)) {
        DB.Wards.set(wardKey, {
          provinceCode: provInfo.code,
          name: wardName
        });
      }
    }

    const cinemaSlug = rawCinema.slug || toSlug(rawCinema.name);

    if (!DB.Cinemas.has(cinemaCode)) {
      DB.Cinemas.set(cinemaCode, {
        chainCode: CHAIN_CODE,
        externalId: cinemaCode,
        slug: cinemaSlug,
        name: rawCinema.name,
        address: rawCinema.address,
        provinceCode: provInfo.code,
        wardName: wardName,
        latitude: rawCinema.latitude ? parseFloat(rawCinema.latitude) : null,
        longitude: rawCinema.longitude ? parseFloat(rawCinema.longitude) : null,
        phone: rawCinema.phone ? rawCinema.phone.replace(/\s+/g, '') : null,
        timezone: 'Asia/Ho_Chi_Minh',
        sourceCityId: rawCinema.cityId || null,
        sourceUrl: cinemaSlug ? `https://www.galaxycine.vn/rap-gia-ve/${cinemaSlug}` : null,
        imageUrl: rawCinema.imageLandscape || null,
        thumbnailUrl: rawCinema.imagePortrait || null,
        galleryUrls: Array.isArray(rawCinema.imageUrls) ? rawCinema.imageUrls : [],
        sortOrder: typeof rawCinema.order === 'number' ? rawCinema.order : 99,
        isActive: true,
        lastSyncedAt: syncTimestamp
      });
    }
  });

  // 4. Duyệt qua các suất chiếu để chuẩn hoá Rạp, Phòng chiếu, Phim, Suất chiếu
  console.log(`🔄 Đang chuẩn hoá ${sessionsData.length} suất chiếu và phòng chiếu...`);

  // Track trùng giờ chiếu trên cùng 1 phòng chiếu để tránh xung đột @@unique([auditoriumId, startTime])
  const auditoriumScheduleTrack = new Set();

  sessionsData.forEach(session => {
    const rawCinema = session.cinema || {};
    const rawMovie = session.movie || {};
    const cinemaCode = String(rawCinema.code || rawCinema.id);

    if (!cinemaCode || !rawMovie.id) return;

    // --- RẠP ---
    const provInfo = extractProvince(rawCinema.address);
    const wardName = extractWard(rawCinema.address);

    if (!DB.Provinces.has(provInfo.code)) {
      DB.Provinces.set(provInfo.code, {
        code: provInfo.code,
        name: provInfo.name,
        nameNormalized: provInfo.nameNormalized
      });
    }

    if (wardName) {
      const wardKey = `${provInfo.code}_${wardName}`;
      if (!DB.Wards.has(wardKey)) {
        DB.Wards.set(wardKey, {
          provinceCode: provInfo.code,
          name: wardName
        });
      }
    }

    if (!DB.Cinemas.has(cinemaCode)) {
      const detail = cinemaDetailMap.get(cinemaCode) || {};
      const cinemaSlug = rawCinema.slug || detail.slug || toSlug(rawCinema.name);

      DB.Cinemas.set(cinemaCode, {
        chainCode: CHAIN_CODE,
        externalId: cinemaCode,
        slug: cinemaSlug,
        name: rawCinema.name,
        address: rawCinema.address,
        provinceCode: provInfo.code,
        wardName: wardName,
        latitude: rawCinema.latitude ? parseFloat(rawCinema.latitude) : null,
        longitude: rawCinema.longitude ? parseFloat(rawCinema.longitude) : null,
        phone: (rawCinema.phone || detail.phone) ? (rawCinema.phone || detail.phone).replace(/\s+/g, '') : null,
        timezone: 'Asia/Ho_Chi_Minh',
        sourceCityId: rawCinema.cityId || detail.cityId || null,
        sourceUrl: cinemaSlug ? `https://www.galaxycine.vn/rap-gia-ve/${cinemaSlug}` : null,
        imageUrl: rawCinema.imageLandscape || detail.imageLandscape || null,
        thumbnailUrl: rawCinema.imagePortrait || detail.imagePortrait || null,
        galleryUrls: Array.isArray(rawCinema.imageUrls) ? rawCinema.imageUrls : (detail.imageUrls || []),
        sortOrder: typeof rawCinema.order === 'number' ? rawCinema.order : (detail.order || 99),
        isActive: true,
        lastSyncedAt: syncTimestamp
      });
    }

    // --- PHÒNG CHIẾU (Auditorium) ---
    const roomTier = mapRoomTier(session.screenName, session.movieFormat);
    const screenFormat = mapScreenFormat(session.version, session.movieFormat);
    const screenName = session.screenName || 'Standard';
    const audKey = `${cinemaCode}_${screenName}`;

    if (!DB.Auditoriums.has(audKey)) {
      DB.Auditoriums.set(audKey, {
        cinemaExternalId: cinemaCode,
        name: screenName,
        tier: roomTier,
        defaultFormat: screenFormat,
        totalSeats: 0,
        totalCapacity: 0,
        layoutCode: null,
        isLayoutMock: true,
        isActive: true
      });
    }

    // --- PHIM (Movie & MovieSource) ---
    const movieKey = String(rawMovie.id);
    const movieSlug = rawMovie.slug || toSlug(rawMovie.name);

    if (!DB.Movies.has(movieKey)) {
      DB.Movies.set(movieKey, {
        externalId: movieKey,
        slug: movieSlug,
        title: rawMovie.name,
        titleNormalized: normalizeText(rawMovie.name),
        originalTitle: null,
        synopsis: null,
        durationMin: rawMovie.duration ? parseInt(rawMovie.duration, 10) : null,
        releaseDate: rawMovie.startDate ? moment(rawMovie.startDate).format('YYYY-MM-DD') : null,
        endDate: rawMovie.endDate ? moment(rawMovie.endDate).format('YYYY-MM-DD') : null,
        releaseYear: rawMovie.startDate ? moment(rawMovie.startDate).year() : null,
        ageRating: mapAgeRating(rawMovie.age),
        status: 'NOW_SHOWING',
        posterUrl: rawMovie.imagePortrait || rawMovie.imageLandscape || null,
        backdropUrl: rawMovie.imageLandscape || null,
        trailerUrl: rawMovie.trailer || null,
        language: 'Tiếng Việt',
        country: null,
        ratingAvg: 0,
        ratingCount: 0,
        mongoMetaId: null
      });

      DB.MovieSources.set(movieKey, {
        movieExternalId: movieKey,
        chainCode: CHAIN_CODE,
        externalId: movieKey,
        sourceSlug: rawMovie.slug,
        url: movieSlug ? `https://www.galaxycine.vn/dat-ve/${movieSlug}` : null,
        sourceScore: typeof rawMovie.rate === 'number' ? rawMovie.rate : (rawMovie.rate ? parseFloat(rawMovie.rate) : null),
        sourceScoreScale: 10,
        sourceVotes: rawMovie.totalVotes || 0,
        lastSyncedAt: syncTimestamp,
        lastSeenAt: syncTimestamp
      });
    }

    // --- SUẤT CHIẾU (Showtime) ---
    // Galaxy API trả ngày showDate (YYYY-MM-DD) và giờ showTime (HH:mm) theo GMT+7
    const localStartStr = `${session.showDate}T${session.showTime}:00+07:00`;
    const startMoment = moment(localStartStr);
    const startTimeUTC = startMoment.utc().toISOString();
    const endTimeUTC = calculateEndTime(startTimeUTC, rawMovie.duration);
    const dedupKey = generateShowtimeDedupKey(CHAIN_CODE, cinemaCode, rawMovie.id, startTimeUTC, screenFormat);

    const audStartTimeSlot = `${audKey}_${startTimeUTC}`;

    if (!DB.Showtimes.has(dedupKey) && !auditoriumScheduleTrack.has(audStartTimeSlot)) {
      auditoriumScheduleTrack.add(audStartTimeSlot);

      DB.Showtimes.set(dedupKey, {
        externalId: session.id ? String(session.id) : null,
        cinemaExternalId: cinemaCode,
        movieExternalId: movieKey,
        auditoriumName: screenName,
        dedupKey: dedupKey,
        startTime: startTimeUTC,
        endTime: endTimeUTC,
        localDate: session.showDate,
        format: screenFormat,
        formatRaw: session.movieFormat || null,
        versionCode: session.version || null,
        kind: mapShowtimeKind(session.version),
        captionMode: mapCaptionMode(session.caption),
        audioLanguage: null,
        subtitleLanguage: 'vi',
        status: 'SCHEDULED',
        seatSource: 'MOCK',
        providerTotalSeats: session.totalSeat || 0,
        providerBookedSeats: session.bookedSeat || 0,
        lastSyncedAt: syncTimestamp,
        lastSeenAt: syncTimestamp
      });
    }
  });

  // 5. Bổ sung phim Sắp Chiếu (Coming Soon) & IMAX Movies
  console.log('🔄 Đang bổ sung phim sắp chiếu & phim IMAX...');
  const additionalMovies = [...comingMoviesData, ...imaxMoviesData];

  additionalMovies.forEach(rawMovie => {
    if (!rawMovie || !rawMovie.id) return;
    const movieKey = String(rawMovie.id);
    const movieSlug = rawMovie.slug || toSlug(rawMovie.name);

    if (!DB.Movies.has(movieKey)) {
      const isComing = rawMovie.startDate && moment(rawMovie.startDate).isAfter(moment());

      DB.Movies.set(movieKey, {
        externalId: movieKey,
        slug: movieSlug,
        title: rawMovie.name,
        titleNormalized: normalizeText(rawMovie.name),
        originalTitle: null,
        synopsis: null,
        durationMin: rawMovie.duration ? parseInt(rawMovie.duration, 10) : null,
        releaseDate: rawMovie.startDate ? moment(rawMovie.startDate).format('YYYY-MM-DD') : null,
        endDate: rawMovie.endDate ? moment(rawMovie.endDate).format('YYYY-MM-DD') : null,
        releaseYear: rawMovie.startDate ? moment(rawMovie.startDate).year() : null,
        ageRating: mapAgeRating(rawMovie.age),
        status: isComing ? 'COMING_SOON' : 'NOW_SHOWING',
        posterUrl: rawMovie.imagePortrait || rawMovie.imageLandscape || null,
        backdropUrl: rawMovie.imageLandscape || null,
        trailerUrl: rawMovie.trailer || null,
        language: 'Tiếng Việt',
        country: null,
        ratingAvg: 0,
        ratingCount: 0,
        mongoMetaId: null
      });

      DB.MovieSources.set(movieKey, {
        movieExternalId: movieKey,
        chainCode: CHAIN_CODE,
        externalId: movieKey,
        sourceSlug: rawMovie.slug,
        url: movieSlug ? `https://www.galaxycine.vn/dat-ve/${movieSlug}` : null,
        sourceScore: typeof rawMovie.rate === 'number' ? rawMovie.rate : (rawMovie.rate ? parseFloat(rawMovie.rate) : null),
        sourceScoreScale: 10,
        sourceVotes: rawMovie.totalVotes || 0,
        lastSyncedAt: syncTimestamp,
        lastSeenAt: syncTimestamp
      });
    }
  });

  // 6. Xử lý Khuyến mãi (Promotions)
  console.log('🔄 Đang chuẩn hoá chương trình khuyến mãi...');
  promotionsData.forEach(promo => {
    if (!promo || !promo.name) return;
    const identifier = promo.actionLink || promo.slug || promo.id;
    const dedupKey = generatePromotionDedupKey(CHAIN_CODE, identifier);

    if (!DB.Promotions.has(dedupKey)) {
      DB.Promotions.set(dedupKey, {
        chainCode: CHAIN_CODE,
        dedupKey: dedupKey,
        title: promo.name,
        imageUrl: promo.imageLandscape || promo.imagePortrait || '',
        linkUrl: promo.actionLink || (promo.slug ? `https://www.galaxycine.vn/khuyen-mai/${promo.slug}` : null),
        startsAt: null,
        endsAt: null,
        sortOrder: typeof promo.order === 'number' ? promo.order : 0,
        isActive: true
      });
    }
  });

  // 7. Tạo Payload JSON hoàn chỉnh
  const outputData = {
    meta: {
      generatedAt: syncTimestamp,
      chain: CHAIN_CODE,
      source: 'Galaxy Cinema API v2 Mobile',
      executionTimeMs: Date.now() - startTime,
      counts: {
        provinces: DB.Provinces.size,
        wards: DB.Wards.size,
        cinemas: DB.Cinemas.size,
        auditoriums: DB.Auditoriums.size,
        movies: DB.Movies.size,
        movieSources: DB.MovieSources.size,
        showtimes: DB.Showtimes.size,
        promotions: DB.Promotions.size
      }
    },
    chain: DB.CinemaChain,
    provinces: Array.from(DB.Provinces.values()),
    wards: Array.from(DB.Wards.values()),
    cinemas: Array.from(DB.Cinemas.values()),
    auditoriums: Array.from(DB.Auditoriums.values()),
    movies: Array.from(DB.Movies.values()),
    movieSources: Array.from(DB.MovieSources.values()),
    showtimes: Array.from(DB.Showtimes.values()),
    promotions: Array.from(DB.Promotions.values())
  };

  const outputPath = path.join(__dirname, 'galaxy_normalized_v3.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`🎉 CRAWL & CHUẨN HOÁ THÀNH CÔNG trong ${Date.now() - startTime}ms!`);
  console.log(`📁 File kết quả: ${outputPath}`);
  console.log(`📊 Tổng kết dữ liệu chuẩn hoá:`);
  console.log(`   - Tỉnh / Thành (Provinces):   ${outputData.meta.counts.provinces}`);
  console.log(`   - Phường / Xã (Wards):        ${outputData.meta.counts.wards}`);
  console.log(`   - Rạp (Cinemas):              ${outputData.meta.counts.cinemas}`);
  console.log(`   - Phòng chiếu (Auditoriums):  ${outputData.meta.counts.auditoriums}`);
  console.log(`   - Phim (Movies):              ${outputData.meta.counts.movies}`);
  console.log(`   - Nguồn phim (MovieSources):  ${outputData.meta.counts.movieSources}`);
  console.log(`   - Suất chiếu (Showtimes):     ${outputData.meta.counts.showtimes}`);
  console.log(`   - Khuyến mãi (Promotions):    ${outputData.meta.counts.promotions}`);
  console.log('═══════════════════════════════════════════════════════════════');

  return outputData;
}

if (require.main === module) {
  crawlAndNormalize().catch(err => {
    console.error('❌ Lỗi khi chạy crawler:', err);
    process.exit(1);
  });
}

module.exports = { crawlAndNormalize };
