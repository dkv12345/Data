/**
 * index.js - Pipeline Crawler & Chuẩn hoá Dữ liệu Galaxy Cinema (Bao gồm Diễn viên, Đạo diễn, Thể loại)
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
  fetchPromotions,
  fetchMovieDetail,
  getBuildId
} = require('./fetcher');

const { 
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
    promotionsData,
    buildId
  ] = await Promise.all([
    fetchCinemas(),
    fetchSessions(),
    fetchComingMovies(),
    fetchImaxMovies(),
    fetchPromotions(),
    getBuildId()
  ]);

  console.log(`✅ Đã nhận:`);
  console.log(`   - Rạp (Cinemas API):          ${cinemasData.length} rạp`);
  console.log(`   - Suất chiếu (Sessions API):  ${sessionsData.length} suất`);
  console.log(`   - Phim sắp chiếu (Coming):    ${comingMoviesData.length} phim`);
  console.log(`   - Phim IMAX:                  ${imaxMoviesData.length} phim`);
  console.log(`   - Khuyến mãi (Promotions):     ${promotionsData.length} banner`);
  console.log(`   - Next.js Build ID:           ${buildId}`);

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
    Genres: new Map(),
    Persons: new Map(),
    Movies: new Map(),
    MovieGenres: [],
    MovieCredits: [],
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

  // 3. Xử lý danh sách Rạp từ API Cinemas
  cinemasData.forEach(rawCinema => {
    const cinemaCode = String(rawCinema.code || rawCinema.siteId || rawCinema.id);
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

  // 4. Gom danh sách phim & suất chiếu
  console.log(`🔄 Đang chuẩn hoá ${sessionsData.length} suất chiếu và phòng chiếu...`);
  const auditoriumScheduleTrack = new Set();
  const rawMovieMap = new Map();

  sessionsData.forEach(session => {
    const rawCinema = session.cinema || {};
    const rawMovie = session.movie || {};
    const cinemaCode = String(rawCinema.code || rawCinema.id);

    if (!cinemaCode || !rawMovie.id) return;

    // Lưu raw movie để fetch detail sau
    if (!rawMovieMap.has(String(rawMovie.id))) {
      rawMovieMap.set(String(rawMovie.id), { ...rawMovie, isNowShowing: true });
    }

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

    // --- SUẤT CHIẾU (Showtime) ---
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
        movieExternalId: String(rawMovie.id),
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

  // Gom thêm phim sắp chiếu & IMAX
  [...comingMoviesData, ...imaxMoviesData].forEach(rawMovie => {
    if (!rawMovie || !rawMovie.id) return;
    const key = String(rawMovie.id);
    if (!rawMovieMap.has(key)) {
      rawMovieMap.set(key, { ...rawMovie, isNowShowing: false });
    }
  });

  // 5. Cào Chi Tiết Phim: Đạo diễn, Diễn viên, Thể loại, Quốc gia, Tóm tắt
  console.log(`🎬 Đang tải chi tiết cho ${rawMovieMap.size} bộ phim từ Galaxy Next.js data...`);
  const movieCreditTrack = new Set();
  const movieGenreTrack = new Set();

  for (const [movieKey, rawMovie] of rawMovieMap.entries()) {
    const movieSlug = rawMovie.slug || toSlug(rawMovie.name);
    
    // Tải chi tiết từ Next.js data route
    const detail = movieSlug ? await fetchMovieDetail(movieSlug, buildId) : null;

    const title = detail?.name || rawMovie.name;
    const synopsis = cleanSynopsis(detail?.description) || null;
    const country = detail?.country || null;
    const trailerUrl = detail?.trailer || rawMovie.trailer || null;
    const posterUrl = detail?.imagePortrait || rawMovie.imagePortrait || rawMovie.imageLandscape || null;
    const backdropUrl = detail?.imageLandscape || rawMovie.imageLandscape || null;
    const durationMin = (detail?.duration || rawMovie.duration) ? parseInt(detail?.duration || rawMovie.duration, 10) : null;
    const releaseDate = (detail?.startDate || rawMovie.startDate) ? moment(detail?.startDate || rawMovie.startDate).format('YYYY-MM-DD') : null;
    const endDate = (detail?.endDate || rawMovie.endDate) ? moment(detail?.endDate || rawMovie.endDate).format('YYYY-MM-DD') : null;
    const releaseYear = releaseDate ? moment(releaseDate).year() : null;
    const ageRating = mapAgeRating(detail?.age || rawMovie.age);

    const isComing = releaseDate && moment(releaseDate).isAfter(moment());
    const movieStatus = rawMovie.isNowShowing ? 'NOW_SHOWING' : (isComing ? 'COMING_SOON' : 'NOW_SHOWING');

    // Lưu Movie
    DB.Movies.set(movieKey, {
      externalId: movieKey,
      slug: movieSlug,
      title: title,
      titleNormalized: normalizeText(title),
      originalTitle: null,
      synopsis: synopsis,
      durationMin: durationMin,
      releaseDate: releaseDate,
      endDate: endDate,
      releaseYear: releaseYear,
      ageRating: ageRating,
      status: movieStatus,
      posterUrl: posterUrl,
      backdropUrl: backdropUrl,
      trailerUrl: trailerUrl,
      language: 'Tiếng Việt',
      country: country,
      ratingAvg: 0,
      ratingCount: 0,
      mongoMetaId: null
    });

    // Lưu MovieSource
    DB.MovieSources.set(movieKey, {
      movieExternalId: movieKey,
      chainCode: CHAIN_CODE,
      externalId: movieKey,
      sourceSlug: movieSlug,
      url: movieSlug ? `https://www.galaxycine.vn/dat-ve/${movieSlug}` : null,
      sourceScore: typeof rawMovie.rate === 'number' ? rawMovie.rate : (rawMovie.rate ? parseFloat(rawMovie.rate) : (detail?.rate || null)),
      sourceScoreScale: 10,
      sourceVotes: rawMovie.totalVotes || detail?.totalVotes || 0,
      lastSyncedAt: syncTimestamp,
      lastSeenAt: syncTimestamp
    });

    // Xử lý Thể loại (Genre & MovieGenre)
    if (detail?.categories && Array.isArray(detail.categories)) {
      detail.categories.forEach(cat => {
        if (!cat || !cat.name) return;
        const genreSlug = cat.slug || toSlug(cat.name);
        if (!DB.Genres.has(genreSlug)) {
          DB.Genres.set(genreSlug, {
            slug: genreSlug,
            name: cat.name.trim()
          });
        }

        const mgKey = `${movieKey}_${genreSlug}`;
        if (!movieGenreTrack.has(mgKey)) {
          movieGenreTrack.add(mgKey);
          DB.MovieGenres.push({
            movieExternalId: movieKey,
            genreSlug: genreSlug
          });
        }
      });
    }

    // Xử lý Đạo diễn (Person & MovieCredit - DIRECTOR)
    if (detail?.directors && Array.isArray(detail.directors)) {
      detail.directors.forEach((dir, idx) => {
        if (!dir || !dir.name || dir.name.trim() === 'Đang cập nhật') return;
        const dirName = dir.name.trim();
        const normName = normalizeText(dirName);
        if (!normName) return;

        if (!DB.Persons.has(normName)) {
          DB.Persons.set(normName, {
            fullName: dirName,
            nameNormalized: normName,
            photoUrl: dir.imagePortrait || dir.imageLandscape || null
          });
        }

        const creditKey = `${movieKey}_${normName}_DIRECTOR`;
        if (!movieCreditTrack.has(creditKey)) {
          movieCreditTrack.add(creditKey);
          DB.MovieCredits.push({
            movieExternalId: movieKey,
            personNameNormalized: normName,
            role: 'DIRECTOR',
            billingOrder: idx,
            characterName: null
          });
        }
      });
    }

    // Xử lý Diễn viên (Person & MovieCredit - ACTOR)
    if (detail?.actors && Array.isArray(detail.actors)) {
      detail.actors.forEach((act, idx) => {
        if (!act || !act.name || act.name.trim() === 'Đang cập nhật') return;
        const actName = act.name.trim();
        const normName = normalizeText(actName);
        if (!normName) return;

        if (!DB.Persons.has(normName)) {
          DB.Persons.set(normName, {
            fullName: actName,
            nameNormalized: normName,
            photoUrl: act.imagePortrait || act.imageLandscape || null
          });
        }

        const creditKey = `${movieKey}_${normName}_ACTOR`;
        if (!movieCreditTrack.has(creditKey)) {
          movieCreditTrack.add(creditKey);
          DB.MovieCredits.push({
            movieExternalId: movieKey,
            personNameNormalized: normName,
            role: 'ACTOR',
            billingOrder: idx,
            characterName: null
          });
        }
      });
    }
  }

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

  // 7. Tạo Payload JSON hoàn chỉnh theo đúng Prisma Schema v3
  const outputData = {
    meta: {
      generatedAt: syncTimestamp,
      chain: CHAIN_CODE,
      source: 'Galaxy Cinema API v2 Mobile + Next.js Data',
      executionTimeMs: Date.now() - startTime,
      counts: {
        provinces: DB.Provinces.size,
        wards: DB.Wards.size,
        cinemas: DB.Cinemas.size,
        auditoriums: DB.Auditoriums.size,
        genres: DB.Genres.size,
        persons: DB.Persons.size,
        movies: DB.Movies.size,
        movieGenres: DB.MovieGenres.length,
        movieCredits: DB.MovieCredits.length,
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
    genres: Array.from(DB.Genres.values()),
    persons: Array.from(DB.Persons.values()),
    movies: Array.from(DB.Movies.values()),
    movieGenres: DB.MovieGenres,
    movieCredits: DB.MovieCredits,
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
  console.log(`   - Thể loại (Genres):          ${outputData.meta.counts.genres}`);
  console.log(`   - Đạo diễn / Diễn viên:       ${outputData.meta.counts.persons}`);
  console.log(`   - Phim (Movies):              ${outputData.meta.counts.movies}`);
  console.log(`   - Phim - Thể loại quan hệ:    ${outputData.meta.counts.movieGenres}`);
  console.log(`   - Phim - Nhân vật quan hệ:    ${outputData.meta.counts.movieCredits}`);
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
