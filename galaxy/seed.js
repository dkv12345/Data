/**
 * seed.js - Seed dữ liệu hoàn chỉnh cho CineHub Database (Prisma Schema v3)
 * Bao gồm:
 * 1. Dữ liệu Crawl từ Galaxy: Chain, Tỉnh/Thành, Phường/Xã, Rạp, Phòng chiếu, Thể loại, Diễn viên, Đạo diễn, Phim, Suất chiếu, Khuyến mãi
 * 2. Dữ liệu Master & Mock theo thiết kế CineHub: SeatType, TicketType, PriceRule, Concessions (Bắp nước), Vouchers, Mẫu sơ đồ ghế (Seat) & Giá suất chiếu (ShowtimePrice)
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
  console.log('🚀 Bắt đầu Seed dữ liệu TOÀN DIỆN vào CineHub Database (Schema v3)');
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

  // 2. Upsert SeatTypes (Chuẩn CineHub: STANDARD, VIP, SWEETBOX)
  console.log('2️⃣  Upsert SeatTypes (STANDARD, VIP, SWEETBOX)...');
  const seatTypeDefinitions = [
    { code: 'STANDARD', name: 'Ghế tiêu chuẩn', colorHex: '#3B82F6', capacity: 1 },
    { code: 'VIP', name: 'Ghế VIP', colorHex: '#EF4444', capacity: 1 },
    { code: 'SWEETBOX', name: 'Ghế đôi Sweetbox', colorHex: '#EC4899', capacity: 2 }
  ];
  const seatTypeMap = new Map();
  for (const st of seatTypeDefinitions) {
    const s = await prisma.seatType.upsert({
      where: { code: st.code },
      update: { name: st.name, colorHex: st.colorHex, capacity: st.capacity },
      create: { code: st.code, name: st.name, colorHex: st.colorHex, capacity: st.capacity }
    });
    seatTypeMap.set(st.code, s.id);
  }

  // 3. Upsert TicketTypes (Chuẩn CineHub: ADULT, STUDENT, CHILD, MEMBER)
  console.log('3️⃣  Upsert TicketTypes (ADULT, STUDENT, CHILD, MEMBER)...');
  const ticketTypeDefinitions = [
    { code: 'ADULT', name: 'Người lớn', sortOrder: 1 },
    { code: 'STUDENT', name: 'Học sinh - Sinh viên', sortOrder: 2 },
    { code: 'CHILD', name: 'Trẻ em', sortOrder: 3 },
    { code: 'MEMBER', name: 'Thành viên', sortOrder: 4 }
  ];
  const ticketTypeMap = new Map();
  for (const tt of ticketTypeDefinitions) {
    const t = await prisma.ticketType.upsert({
      where: { code: tt.code },
      update: { name: tt.name, sortOrder: tt.sortOrder },
      create: { code: tt.code, name: tt.name, sortOrder: tt.sortOrder }
    });
    ticketTypeMap.set(tt.code, t.id);
  }

  // 4. Upsert PriceRules (Bảng giá mặc định theo cụm rạp, định dạng, hạng phòng, loại ghế & ngày)
  console.log('4️⃣  Upsert PriceRules mặc định cho Galaxy Cinema...');
  const defaultFormats = ['TWO_D', 'THREE_D', 'IMAX', 'DOLBY', 'LED', 'FOUR_DX', 'SCREENX'];
  const defaultTiers = ['STANDARD', 'VIP', 'KIDS', 'PREMIUM'];
  const dayTypes = ['WEEKDAY', 'WEEKEND'];

  for (const fmt of defaultFormats) {
    for (const tier of defaultTiers) {
      for (const [stCode, stId] of seatTypeMap.entries()) {
        for (const [ttCode, ttId] of ticketTypeMap.entries()) {
          for (const dt of dayTypes) {
            let basePrice = 85000;
            if (fmt === 'THREE_D') basePrice = 110000;
            if (fmt === 'IMAX') basePrice = 160000;
            if (fmt === 'DOLBY' || fmt === 'LED') basePrice = 135000;
            if (fmt === 'FOUR_DX' || fmt === 'SCREENX') basePrice = 140000;

            if (tier === 'VIP') basePrice += 40000;
            if (tier === 'PREMIUM') basePrice += 20000;

            if (stCode === 'VIP') basePrice += 15000;
            if (stCode === 'SWEETBOX') basePrice = basePrice * 2 + 10000;

            if (ttCode === 'STUDENT' || ttCode === 'CHILD') basePrice = Math.round(basePrice * 0.8);
            if (ttCode === 'MEMBER') basePrice = Math.round(basePrice * 0.95);
            if (dt === 'WEEKEND') basePrice += 10000;

            await prisma.priceRule.upsert({
              where: {
                chainId_format_roomTier_seatTypeId_ticketTypeId_dayType: {
                  chainId: chain.id,
                  format: fmt,
                  roomTier: tier,
                  seatTypeId: stId,
                  ticketTypeId: ttId,
                  dayType: dt
                }
              },
              update: { price: basePrice, isActive: true },
              create: {
                chainId: chain.id,
                format: fmt,
                roomTier: tier,
                seatTypeId: stId,
                ticketTypeId: ttId,
                dayType: dt,
                price: basePrice,
                isActive: true
              }
            });
          }
        }
      }
    }
  }

  // 5. Upsert Provinces
  console.log(`5️⃣  Upsert ${data.provinces.length} Provinces...`);
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

  // 6. Upsert Wards
  console.log(`6️⃣  Upsert ${data.wards.length} Wards...`);
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

  // 7. Upsert Cinemas
  console.log(`7️⃣  Upsert ${data.cinemas.length} Cinemas...`);
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

  // 8. Upsert Auditoriums & Sinh Sơ Đồ Ghế Mẫu (Seat Mocking)
  console.log(`8️⃣  Upsert ${data.auditoriums.length} Auditoriums & Sơ đồ ghế mẫu...`);
  const auditoriumMap = new Map();
  for (const aud of data.auditoriums) {
    const cinemaId = cinemaMap.get(aud.cinemaExternalId);
    if (!cinemaId) continue;

    let layoutCode = 'STD_10x14';
    let totalSeats = 133;
    let totalCapacity = 140;

    if (aud.tier === 'VIP') {
      layoutCode = 'VIP_6x8';
      totalSeats = 48;
      totalCapacity = 48;
    } else if (aud.defaultFormat === 'IMAX') {
      layoutCode = 'IMAX_12x18';
      totalSeats = 207;
      totalCapacity = 216;
    } else if (aud.tier === 'KIDS') {
      layoutCode = 'SMALL_8x10';
      totalSeats = 75;
      totalCapacity = 80;
    }

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
        layoutCode: layoutCode,
        totalSeats: totalSeats,
        totalCapacity: totalCapacity,
        isLayoutMock: true,
        isActive: aud.isActive
      },
      create: {
        cinemaId: cinemaId,
        name: aud.name,
        tier: aud.tier,
        defaultFormat: aud.defaultFormat,
        layoutCode: layoutCode,
        totalSeats: totalSeats,
        totalCapacity: totalCapacity,
        isLayoutMock: true,
        isActive: aud.isActive
      }
    });
    auditoriumMap.set(`${aud.cinemaExternalId}_${aud.name}`, a.id);

    // Sinh ghế mẫu cho phòng chiếu nếu chưa có
    const existingSeatsCount = await prisma.seat.count({ where: { auditoriumId: a.id } });
    if (existingSeatsCount === 0) {
      const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const maxRow = aud.tier === 'VIP' ? 6 : (aud.defaultFormat === 'IMAX' ? 12 : 10);
      const maxCol = aud.tier === 'VIP' ? 8 : (aud.defaultFormat === 'IMAX' ? 18 : 14);

      const seatInserts = [];
      for (let r = 0; r < Math.min(maxRow, rows.length); r++) {
        const rowLabel = rows[r];
        for (let col = 1; col <= maxCol; col++) {
          let seatCode = 'STANDARD';
          if (aud.tier === 'VIP' || r >= 3) seatCode = 'VIP';
          if (r === maxRow - 1 && col % 2 === 1) seatCode = 'SWEETBOX';

          const seatTypeId = seatTypeMap.get(seatCode) || seatTypeMap.get('STANDARD');
          seatInserts.push({
            auditoriumId: a.id,
            seatTypeId: seatTypeId,
            rowLabel: rowLabel,
            colNumber: col,
            label: `${rowLabel}${col}`,
            posX: col * 40,
            posY: (r + 1) * 40,
            colSpan: seatCode === 'SWEETBOX' ? 2 : 1,
            isActive: true
          });
        }
      }
      await prisma.seat.createMany({ data: seatInserts, skipDuplicates: true });
    }
  }

  // 9. Upsert Genres (Thể loại phim)
  console.log(`9️⃣  Upsert ${data.genres?.length || 0} Genres...`);
  const genreMap = new Map();
  if (data.genres) {
    for (const g of data.genres) {
      const genre = await prisma.genre.upsert({
        where: { slug: g.slug },
        update: { name: g.name },
        create: { slug: g.slug, name: g.name }
      });
      genreMap.set(g.slug, genre.id);
    }
  }

  // 🔟 Upsert Persons (Diễn viên & Đạo diễn)
  console.log(`🔟 Upsert ${data.persons?.length || 0} Persons (Diễn viên & Đạo diễn)...`);
  const personMap = new Map();
  if (data.persons) {
    for (const p of data.persons) {
      const person = await prisma.person.upsert({
        where: { nameNormalized: p.nameNormalized },
        update: {
          fullName: p.fullName,
          photoUrl: p.photoUrl
        },
        create: {
          fullName: p.fullName,
          nameNormalized: p.nameNormalized,
          photoUrl: p.photoUrl
        }
      });
      personMap.set(p.nameNormalized, person.id);
    }
  }

  // 1️⃣1️⃣ Upsert Movies & MovieSources
  console.log(`1️⃣1️⃣ Upsert ${data.movies.length} Movies & Sources...`);
  const movieMap = new Map();
  for (const movie of data.movies) {
    const m = await prisma.movie.upsert({
      where: { slug: movie.slug },
      update: {
        title: movie.title,
        titleNormalized: movie.titleNormalized,
        synopsis: movie.synopsis,
        durationMin: movie.durationMin,
        releaseDate: movie.releaseDate ? new Date(movie.releaseDate) : null,
        endDate: movie.endDate ? new Date(movie.endDate) : null,
        releaseYear: movie.releaseYear,
        ageRating: movie.ageRating,
        status: movie.status,
        posterUrl: movie.posterUrl,
        backdropUrl: movie.backdropUrl,
        trailerUrl: movie.trailerUrl,
        language: movie.language,
        country: movie.country
      },
      create: {
        slug: movie.slug,
        title: movie.title,
        titleNormalized: movie.titleNormalized,
        synopsis: movie.synopsis,
        durationMin: movie.durationMin,
        releaseDate: movie.releaseDate ? new Date(movie.releaseDate) : null,
        endDate: movie.endDate ? new Date(movie.endDate) : null,
        releaseYear: movie.releaseYear,
        ageRating: movie.ageRating,
        status: movie.status,
        posterUrl: movie.posterUrl,
        backdropUrl: movie.backdropUrl,
        trailerUrl: movie.trailerUrl,
        language: movie.language,
        country: movie.country
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

  // 1️⃣2️⃣ Upsert MovieGenres (Phim - Thể loại)
  console.log(`1️⃣2️⃣ Upsert ${data.movieGenres?.length || 0} Movie-Genre relations...`);
  if (data.movieGenres) {
    for (const mg of data.movieGenres) {
      const movieId = movieMap.get(mg.movieExternalId);
      const genreId = genreMap.get(mg.genreSlug);
      if (!movieId || !genreId) continue;

      await prisma.movieGenre.upsert({
        where: {
          movieId_genreId: {
            movieId: movieId,
            genreId: genreId
          }
        },
        update: {},
        create: {
          movieId: movieId,
          genreId: genreId
        }
      });
    }
  }

  // 1️⃣3️⃣ Upsert MovieCredits (Đạo diễn / Diễn viên)
  console.log(`1️⃣3️⃣ Upsert ${data.movieCredits?.length || 0} Movie-Credit relations...`);
  if (data.movieCredits) {
    for (const mc of data.movieCredits) {
      const movieId = movieMap.get(mc.movieExternalId);
      const personId = personMap.get(mc.personNameNormalized);
      if (!movieId || !personId) continue;

      await prisma.movieCredit.upsert({
        where: {
          movieId_personId_role: {
            movieId: movieId,
            personId: personId,
            role: mc.role
          }
        },
        update: {
          billingOrder: mc.billingOrder,
          characterName: mc.characterName
        },
        create: {
          movieId: movieId,
          personId: personId,
          role: mc.role,
          billingOrder: mc.billingOrder,
          characterName: mc.characterName
        }
      });
    }
  }

  // 1️⃣4️⃣ Upsert Showtimes & ShowtimePrices
  console.log(`1️⃣4️⃣ Upsert ${data.showtimes.length} Showtimes & Bảng giá suất chiếu...`);
  let showtimeSuccessCount = 0;
  for (const st of data.showtimes) {
    const cinemaId = cinemaMap.get(st.cinemaExternalId);
    const auditoriumId = auditoriumMap.get(`${st.cinemaExternalId}_${st.auditoriumName}`);
    const movieId = movieMap.get(st.movieExternalId);

    if (!cinemaId || !auditoriumId || !movieId) continue;

    const showtime = await prisma.showtime.upsert({
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

    // Tạo giá vé mặc định cho từng cặp (loại ghế, loại vé) của suất chiếu
    for (const [stCode, stId] of seatTypeMap.entries()) {
      for (const [ttCode, ttId] of ticketTypeMap.entries()) {
        let price = 85000;
        if (st.format === 'IMAX') price = 160000;
        if (stCode === 'VIP') price += 15000;
        if (stCode === 'SWEETBOX') price = price * 2;
        if (ttCode === 'STUDENT') price = Math.round(price * 0.85);

        await prisma.showtimePrice.upsert({
          where: {
            showtimeId_seatTypeId_ticketTypeId: {
              showtimeId: showtime.id,
              seatTypeId: stId,
              ticketTypeId: ttId
            }
          },
          update: { price: price },
          create: {
            showtimeId: showtime.id,
            seatTypeId: stId,
            ticketTypeId: ttId,
            price: price,
            source: 'DEFAULT'
          }
        });
      }
    }

    showtimeSuccessCount++;
  }

  // 1️⃣5️⃣ Upsert Concessions (Bắp nước mẫu)
  console.log('1️⃣5️⃣ Upsert Concessions (Combo bắp nước)...');
  const concessionDefinitions = [
    { name: 'Combo Solo 1 Bắp + 1 Nước', description: '1 Bắp ngọt 60oz + 1 Nước ngọt 32oz', category: 'COMBO', price: 79000, imageUrl: 'https://cdn.galaxycine.vn/media/2024/2/1/combo-solo.jpg' },
    { name: 'Combo Couple 1 Bắp + 2 Nước', description: '1 Bắp ngọt 60oz + 2 Nước ngọt 32oz', category: 'COMBO', price: 99000, imageUrl: 'https://cdn.galaxycine.vn/media/2024/2/1/combo-couple.jpg' },
    { name: 'Bắp Phô Mai Thượng Hạng', description: 'Bắp rang vị Phô Mai đậm đà 60oz', category: 'POPCORN', price: 59000, imageUrl: 'https://cdn.galaxycine.vn/media/2024/2/1/popcorn-cheese.jpg' },
    { name: 'Coca-Cola Zero Can 330ml', description: 'Nước ngọt Coca-Cola không calo', category: 'DRINK', price: 32000, imageUrl: 'https://cdn.galaxycine.vn/media/2024/2/1/coca-zero.jpg' }
  ];
  for (const conc of concessionDefinitions) {
    const existing = await prisma.concession.findFirst({
      where: { chainId: chain.id, name: conc.name }
    });
    if (!existing) {
      await prisma.concession.create({
        data: {
          chainId: chain.id,
          name: conc.name,
          description: conc.description,
          category: conc.category,
          price: conc.price,
          imageUrl: conc.imageUrl,
          isActive: true
        }
      });
    }
  }

  // 1️⃣6️⃣ Upsert Vouchers (Mã khuyến mãi mẫu)
  console.log('1️⃣6️⃣ Upsert Vouchers mẫu...');
  const voucherDefinitions = [
    { code: 'CHCHAOBAN', description: 'Giảm 20% cho đơn hàng đầu tiên', type: 'PERCENT', value: 20, maxDiscount: 50000, minOrderAmount: 100000, startsAt: new Date(), endsAt: new Date(Date.now() + 90 * 86400000) },
    { code: 'CHVIP50K', description: 'Giảm thẳng 50.000đ khi đặt phòng VIP', type: 'FIXED', value: 50000, minOrderAmount: 150000, startsAt: new Date(), endsAt: new Date(Date.now() + 90 * 86400000) }
  ];
  for (const v of voucherDefinitions) {
    await prisma.voucher.upsert({
      where: { code: v.code },
      update: { description: v.description, value: v.value },
      create: {
        code: v.code,
        description: v.description,
        type: v.type,
        value: v.value,
        maxDiscount: v.maxDiscount,
        minOrderAmount: v.minOrderAmount,
        startsAt: v.startsAt,
        endsAt: v.endsAt,
        isActive: true
      }
    });
  }

  // 1️⃣7️⃣ Upsert Promotions (Banner khuyến mãi)
  console.log(`1️⃣7️⃣ Upsert ${data.promotions.length} Promotions...`);
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
  console.log('🎉 TOÀN BỘ CƠ SỞ DỮ LIỆU ĐÃ ĐƯỢC SEED HOÀN TẤT & ĐẦY ĐỦ 100%!');
  console.log(`   - Rạp (Cinemas):              ${cinemaMap.size}`);
  console.log(`   - Phòng chiếu (Auditoriums):  ${auditoriumMap.size}`);
  console.log(`   - Thể loại (Genres):          ${genreMap.size}`);
  console.log(`   - Nhân vật (Persons):         ${personMap.size}`);
  console.log(`   - Phim (Movies):              ${movieMap.size}`);
  console.log(`   - Suất chiếu (Showtimes):     ${showtimeSuccessCount}`);
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
