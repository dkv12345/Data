/**
 * seed.js - Seed dữ liệu Galaxy Cinema đã chuẩn hoá vào DB Prisma (Schema v3)
 * Chạy lệnh: node seed.js (hoặc npx prisma db seed)
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const jsonPath = path.join(__dirname, 'galaxy_normalized_v3.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ Không tìm thấy file galaxy_normalized_v3.json. Vui lòng chạy `node index.js` trước!');
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(rawData);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 Bắt đầu Seed dữ liệu Galaxy Cinema vào CineHub Database');
  console.log('═══════════════════════════════════════════════════════════════');

  // 1. Upsert CinemaChain
  console.log('1️⃣  Upsert CinemaChain: GALAXY...');
  const chain = await prisma.cinemaChain.upsert({
    where: { code: data.chain.code },
    update: {
      name: data.chain.name,
      logoUrl: data.chain.logoUrl,
      websiteUrl: data.chain.websiteUrl,
      isActive: data.chain.isActive
    },
    create: {
      code: data.chain.code,
      name: data.chain.name,
      logoUrl: data.chain.logoUrl,
      websiteUrl: data.chain.websiteUrl,
      isActive: data.chain.isActive
    }
  });

  // 2. Upsert Provinces
  console.log(`2️⃣  Upsert ${data.provinces.length} Provinces...`);
  const provinceMap = new Map();
  for (const prov of data.provinces) {
    const p = await prisma.province.upsert({
      where: { code: prov.code },
      update: {
        name: prov.name,
        nameNormalized: prov.nameNormalized
      },
      create: {
        code: prov.code,
        name: prov.name,
        nameNormalized: prov.nameNormalized
      }
    });
    provinceMap.set(prov.code, p.id);
  }

  // 3. Upsert Wards
  console.log(`3️⃣  Upsert ${data.wards.length} Wards...`);
  const wardMap = new Map();
  for (const ward of data.wards) {
    const provinceId = provinceMap.get(ward.provinceCode);
    if (!provinceId) continue;

    const w = await prisma.ward.upsert({
      where: {
        provinceId_name: {
          provinceId: provinceId,
          name: ward.name
        }
      },
      update: {},
      create: {
        provinceId: provinceId,
        name: ward.name
      }
    });
    wardMap.set(`${ward.provinceCode}_${ward.name}`, w.id);
  }

  // 4. Upsert Cinemas
  console.log(`4️⃣  Upsert ${data.cinemas.length} Cinemas...`);
  const cinemaMap = new Map();
  for (const cinema of data.cinemas) {
    const provinceId = provinceMap.get(cinema.provinceCode);
    const wardId = cinema.wardName ? wardMap.get(`${cinema.provinceCode}_${cinema.wardName}`) : null;
    if (!provinceId) continue;

    const c = await prisma.cinema.upsert({
      where: {
        chainId_externalId: {
          chainId: chain.id,
          externalId: cinema.externalId
        }
      },
      update: {
        slug: cinema.slug,
        name: cinema.name,
        address: cinema.address,
        provinceId: provinceId,
        wardId: wardId,
        latitude: cinema.latitude,
        longitude: cinema.longitude,
        phone: cinema.phone,
        timezone: cinema.timezone || 'Asia/Ho_Chi_Minh',
        sourceCityId: cinema.sourceCityId,
        sourceUrl: cinema.sourceUrl,
        imageUrl: cinema.imageUrl,
        thumbnailUrl: cinema.thumbnailUrl,
        galleryUrls: cinema.galleryUrls,
        sortOrder: cinema.sortOrder,
        isActive: cinema.isActive,
        lastSyncedAt: cinema.lastSyncedAt ? new Date(cinema.lastSyncedAt) : new Date()
      },
      create: {
        chainId: chain.id,
        externalId: cinema.externalId,
        slug: cinema.slug,
        name: cinema.name,
        address: cinema.address,
        provinceId: provinceId,
        wardId: wardId,
        latitude: cinema.latitude,
        longitude: cinema.longitude,
        phone: cinema.phone,
        timezone: cinema.timezone || 'Asia/Ho_Chi_Minh',
        sourceCityId: cinema.sourceCityId,
        sourceUrl: cinema.sourceUrl,
        imageUrl: cinema.imageUrl,
        thumbnailUrl: cinema.thumbnailUrl,
        galleryUrls: cinema.galleryUrls,
        sortOrder: cinema.sortOrder,
        isActive: cinema.isActive,
        lastSyncedAt: cinema.lastSyncedAt ? new Date(cinema.lastSyncedAt) : new Date()
      }
    });
    cinemaMap.set(cinema.externalId, c.id);
  }

  // 5. Upsert Auditoriums
  console.log(`5️⃣  Upsert ${data.auditoriums.length} Auditoriums...`);
  const auditoriumMap = new Map();
  for (const aud of data.auditoriums) {
    const cinemaId = cinemaMap.get(aud.cinemaExternalId);
    if (!cinemaId) continue;

    const a = await prisma.auditorium.upsert({
      where: {
        cinemaId_name: {
          cinemaId: cinemaId,
          name: aud.name
        }
      },
      update: {
        tier: aud.tier,
        defaultFormat: aud.defaultFormat,
        isLayoutMock: aud.isLayoutMock,
        isActive: aud.isActive
      },
      create: {
        cinemaId: cinemaId,
        name: aud.name,
        tier: aud.tier,
        defaultFormat: aud.defaultFormat,
        isLayoutMock: aud.isLayoutMock,
        isActive: aud.isActive
      }
    });
    auditoriumMap.set(`${aud.cinemaExternalId}_${aud.name}`, a.id);
  }

  // 6. Upsert Movies & MovieSources
  console.log(`6️⃣  Upsert ${data.movies.length} Movies & Sources...`);
  const movieMap = new Map();
  for (const movie of data.movies) {
    const m = await prisma.movie.upsert({
      where: { slug: movie.slug },
      update: {
        title: movie.title,
        titleNormalized: movie.titleNormalized,
        durationMin: movie.durationMin,
        releaseDate: movie.releaseDate ? new Date(movie.releaseDate) : null,
        endDate: movie.endDate ? new Date(movie.endDate) : null,
        releaseYear: movie.releaseYear,
        ageRating: movie.ageRating,
        status: movie.status,
        posterUrl: movie.posterUrl,
        backdropUrl: movie.backdropUrl,
        trailerUrl: movie.trailerUrl,
        language: movie.language
      },
      create: {
        slug: movie.slug,
        title: movie.title,
        titleNormalized: movie.titleNormalized,
        durationMin: movie.durationMin,
        releaseDate: movie.releaseDate ? new Date(movie.releaseDate) : null,
        endDate: movie.endDate ? new Date(movie.endDate) : null,
        releaseYear: movie.releaseYear,
        ageRating: movie.ageRating,
        status: movie.status,
        posterUrl: movie.posterUrl,
        backdropUrl: movie.backdropUrl,
        trailerUrl: movie.trailerUrl,
        language: movie.language
      }
    });
    movieMap.set(movie.externalId, m.id);
  }

  for (const src of data.movieSources) {
    const movieId = movieMap.get(src.movieExternalId);
    if (!movieId) continue;

    await prisma.movieSource.upsert({
      where: {
        chainId_externalId: {
          chainId: chain.id,
          externalId: src.externalId
        }
      },
      update: {
        movieId: movieId,
        sourceSlug: src.sourceSlug,
        url: src.url,
        sourceScore: src.sourceScore,
        sourceScoreScale: src.sourceScoreScale,
        sourceVotes: src.sourceVotes,
        lastSyncedAt: src.lastSyncedAt ? new Date(src.lastSyncedAt) : new Date(),
        lastSeenAt: src.lastSeenAt ? new Date(src.lastSeenAt) : new Date()
      },
      create: {
        chainId: chain.id,
        movieId: movieId,
        externalId: src.externalId,
        sourceSlug: src.sourceSlug,
        url: src.url,
        sourceScore: src.sourceScore,
        sourceScoreScale: src.sourceScoreScale,
        sourceVotes: src.sourceVotes,
        lastSyncedAt: src.lastSyncedAt ? new Date(src.lastSyncedAt) : new Date(),
        lastSeenAt: src.lastSeenAt ? new Date(src.lastSeenAt) : new Date()
      }
    });
  }

  // 7. Upsert Showtimes
  console.log(`7️⃣  Upsert ${data.showtimes.length} Showtimes...`);
  let showtimeSuccessCount = 0;
  for (const st of data.showtimes) {
    const cinemaId = cinemaMap.get(st.cinemaExternalId);
    const auditoriumId = auditoriumMap.get(`${st.cinemaExternalId}_${st.auditoriumName}`);
    const movieId = movieMap.get(st.movieExternalId);

    if (!cinemaId || !auditoriumId || !movieId) continue;

    await prisma.showtime.upsert({
      where: { dedupKey: st.dedupKey },
      update: {
        startTime: new Date(st.startTime),
        endTime: new Date(st.endTime),
        localDate: new Date(st.localDate),
        format: st.format,
        formatRaw: st.formatRaw,
        versionCode: st.versionCode,
        kind: st.kind,
        captionMode: st.captionMode,
        status: st.status,
        providerTotalSeats: st.providerTotalSeats,
        providerBookedSeats: st.providerBookedSeats,
        lastSyncedAt: st.lastSyncedAt ? new Date(st.lastSyncedAt) : new Date(),
        lastSeenAt: st.lastSeenAt ? new Date(st.lastSeenAt) : new Date()
      },
      create: {
        movieId: movieId,
        auditoriumId: auditoriumId,
        cinemaId: cinemaId,
        externalId: st.externalId,
        dedupKey: st.dedupKey,
        startTime: new Date(st.startTime),
        endTime: new Date(st.endTime),
        localDate: new Date(st.localDate),
        format: st.format,
        formatRaw: st.formatRaw,
        versionCode: st.versionCode,
        kind: st.kind,
        captionMode: st.captionMode,
        status: st.status,
        seatSource: st.seatSource || 'MOCK',
        providerTotalSeats: st.providerTotalSeats,
        providerBookedSeats: st.providerBookedSeats,
        lastSyncedAt: st.lastSyncedAt ? new Date(st.lastSyncedAt) : new Date(),
        lastSeenAt: st.lastSeenAt ? new Date(st.lastSeenAt) : new Date()
      }
    });
    showtimeSuccessCount++;
  }

  // 8. Upsert Promotions
  console.log(`8️⃣  Upsert ${data.promotions.length} Promotions...`);
  for (const promo of data.promotions) {
    await prisma.promotion.upsert({
      where: { dedupKey: promo.dedupKey },
      update: {
        title: promo.title,
        imageUrl: promo.imageUrl,
        linkUrl: promo.linkUrl,
        sortOrder: promo.sortOrder,
        isActive: promo.isActive
      },
      create: {
        chainId: chain.id,
        dedupKey: promo.dedupKey,
        title: promo.title,
        imageUrl: promo.imageUrl,
        linkUrl: promo.linkUrl,
        sortOrder: promo.sortOrder,
        isActive: promo.isActive
      }
    });
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🎉 SEED DỮ LIỆU HOÀN TẤT THÀNH CÔNG!');
  console.log(`   - Rạp: ${cinemaMap.size}`);
  console.log(`   - Phòng chiếu: ${auditoriumMap.size}`);
  console.log(`   - Phim: ${movieMap.size}`);
  console.log(`   - Suất chiếu: ${showtimeSuccessCount}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('❌ Lỗi khi seed DB:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seedData: main };
