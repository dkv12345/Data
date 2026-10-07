-- ═══════════════════════════════════════════════════════════════════════════
-- CineHub – migration thủ công v3: COLLATION + CHECK constraints
-- Đặt tại: prisma/migrations/<timestamp>_constraints_and_collation/migration.sql
-- Yêu cầu: MySQL 8.0.16+ (CHECK thực sự được thực thi), đã áp migration "init"
--
-- Cách dùng:
--   1) npx prisma migrate dev --name init                      (tạo bảng từ schema.prisma)
--   2) npx prisma migrate dev --create-only --name constraints_and_collation
--   3) dán nội dung file này vào migration vừa tạo, rồi: npx prisma migrate dev
-- Production: npx prisma migrate deploy (không sửa tay migration đã áp dụng)
--
-- Phần 1: collation – mọi cột ID/hash/mã kỹ thuật -> ascii_bin (so sánh nhanh,
--         phân biệt hoa/thường, index nhỏ). Văn bản tiếng Việt giữ utf8mb4_unicode_ci.
--         PK và FK phải ĐỒNG NHẤT charset/collation, nếu lệch MySQL báo lỗi 3780.
-- Phần 2: CHECK constraints.
-- Phần 3: truy vấn kiểm tra sau migration (chỉ đọc).
-- Phụ lục: SQL dọn dẹp / bảo trì (không chạy trong migration).
--
-- LƯU Ý: Prisma không theo dõi collation theo cột nên không báo drift. Nhưng
-- MỌI migration sau này thêm cột ID/FK mới PHẢI lặp lại MODIFY ... ascii_bin.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────── PHẦN 0: mặc định cho database (chạy 1 lần khi tạo DB) ─────────
-- CREATE DATABASE cinehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 0;

-- ───────────── PHẦN 1: COLLATION (39 bảng, 111 cột) ─────────────────────────
-- ascii_bin  : Char(36) ID/FK, Char(64) tokenHash, Char(40) dedupKey, mã đơn/voucher,
--              txnRef, eventKey, dedupeKey
-- utf8mb4_bin: externalId của nguồn crawl (phân biệt hoa/thường, có thể có ký tự lạ)

ALTER TABLE `users`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `cinemaId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `refresh_tokens`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `userId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `familyId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `tokenHash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `replacedById` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `password_reset_tokens`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `userId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `tokenHash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `email_verification_tokens`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `userId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `tokenHash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `cinema_chains`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `provinces`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `wards`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `provinceId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `cinemas`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `chainId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `externalId` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY `provinceId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `wardId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `auditoriums`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `cinemaId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `ticket_types`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `seat_types`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `seats`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `auditoriumId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `seatTypeId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `genres`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `movies`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `movie_genres`
  MODIFY `movieId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `genreId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `persons`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `movie_credits`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `movieId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `personId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `movie_sources`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `movieId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `chainId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `externalId` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE `showtimes`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `movieId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `auditoriumId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `cinemaId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `externalId` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  MODIFY `dedupKey` CHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `price_rules`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `chainId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `seatTypeId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `ticketTypeId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `showtime_prices`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `showtimeId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `seatTypeId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `ticketTypeId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `showtime_seats`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `showtimeId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `seatId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `heldByBookingId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `concessions`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `chainId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `cinemaId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `bookings`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `code` VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `userId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `showtimeId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `booking_seats`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `bookingId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `showtimeSeatId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `ticketTypeId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `activeLock` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `booking_concessions`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `bookingId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `concessionId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `tickets`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `bookingId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `bookingSeatId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `checkedInById` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `payments`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `bookingId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `txnRef` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `successLock` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `payment_webhook_events`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `eventKey` VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `txnRef` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `refunds`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `paymentId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `vouchers`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `code` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `voucher_redemptions`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `voucherId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `userId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `bookingId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `promotions`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `chainId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  MODIFY `dedupKey` CHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
  MODIFY `voucherId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE `favorites`
  MODIFY `userId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `movieId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `movie_subscriptions`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `userId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `movieId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `notification_logs`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `userId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  MODIFY `dedupeKey` VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `notifications`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `userId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `outbox_events`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `aggregateId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

ALTER TABLE `inbox_events`
  MODIFY `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  MODIFY `eventId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- ───────────── PHẦN 2: CHECK CONSTRAINTS ────────────────────────────────────
-- 2.0 Identity (Google Auth) --------------------------------------------------
-- Mỗi tài khoản phải đăng nhập được: có mật khẩu hoặc có googleId.
ALTER TABLE `users`
  ADD CONSTRAINT chk_user_credential
  CHECK (passwordHash IS NOT NULL OR googleId IS NOT NULL);

-- 2.1 Tiền & số lượng ---------------------------------------------------------
ALTER TABLE `bookings`
  ADD CONSTRAINT chk_booking_amount
    CHECK (subtotalAmount >= 0 AND discountAmount >= 0 AND serviceFee >= 0
           AND totalAmount >= 0
           AND totalAmount = subtotalAmount + serviceFee - discountAmount),
  ADD CONSTRAINT chk_booking_discount_le_subtotal
    CHECK (discountAmount <= subtotalAmount),
  ADD CONSTRAINT chk_booking_version CHECK (version >= 0);

ALTER TABLE `booking_seats` ADD CONSTRAINT chk_bs_price CHECK (price >= 0);
ALTER TABLE `booking_concessions`
  ADD CONSTRAINT chk_bc_qty CHECK (quantity > 0 AND quantity <= 20),
  ADD CONSTRAINT chk_bc_price CHECK (unitPrice >= 0);
ALTER TABLE `concessions` ADD CONSTRAINT chk_concession_price CHECK (price >= 0);
ALTER TABLE `showtime_prices` ADD CONSTRAINT chk_price CHECK (price >= 0);
ALTER TABLE `price_rules` ADD CONSTRAINT chk_price_rule CHECK (price >= 0);
ALTER TABLE `payments` ADD CONSTRAINT chk_payment_amount CHECK (amount > 0);
ALTER TABLE `refunds` ADD CONSTRAINT chk_refund_amount CHECK (amount > 0);
-- refund.amount <= payment.amount: CHECK không tham chiếu được bảng khác ->
-- kiểm trong service (SUM(refunds) + amount <= payment.amount, trong transaction có khoá hàng payment).

-- 2.2 Thời gian ---------------------------------------------------------------
ALTER TABLE `showtimes` ADD CONSTRAINT chk_showtime_time CHECK (endTime > startTime);
ALTER TABLE `vouchers` ADD CONSTRAINT chk_voucher_period CHECK (endsAt > startsAt);
-- Promotion crawl từ Galaxy không có thời hạn -> startsAt/endsAt có thể NULL
ALTER TABLE `promotions`
  ADD CONSTRAINT chk_promo_period
  CHECK (startsAt IS NULL OR endsAt IS NULL OR endsAt > startsAt);

-- 2.3 Dữ liệu crawl (Galaxy) ---------------------------------------------------
ALTER TABLE `cinemas`
  ADD CONSTRAINT chk_cinema_geo
  CHECK ((latitude IS NULL OR latitude BETWEEN -90 AND 90)
     AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));
ALTER TABLE `movie_sources`
  ADD CONSTRAINT chk_ms_score
  CHECK (sourceScore IS NULL OR (sourceScoreScale > 0 AND sourceScore BETWEEN 0 AND sourceScoreScale));
ALTER TABLE `showtimes`
  ADD CONSTRAINT chk_showtime_provider_seats
  CHECK (providerTotalSeats IS NULL OR providerBookedSeats IS NULL
         OR providerBookedSeats <= providerTotalSeats);

-- 2.4 Ghế ---------------------------------------------------------------------
ALTER TABLE `seats`
  ADD CONSTRAINT chk_seat_col CHECK (colNumber > 0 AND colSpan IN (1, 2)),
  ADD CONSTRAINT chk_seat_pos CHECK (posX >= 0 AND posY >= 0);
ALTER TABLE `auditoriums`
  ADD CONSTRAINT chk_aud_seats CHECK (totalSeats >= 0 AND totalCapacity >= totalSeats);

-- HELD bắt buộc có heldUntil + heldByBookingId; ghế giả lập không thuộc đơn nào.
-- (dùng heldByBookingId nên relation đã đặt onDelete/onUpdate Restrict trong schema)
ALTER TABLE `showtime_seats`
  ADD CONSTRAINT chk_ss_held
    CHECK (status <> 'HELD' OR (heldUntil IS NOT NULL AND heldByBookingId IS NOT NULL)),
  ADD CONSTRAINT chk_ss_seeded
    CHECK (isSeeded = 0 OR heldByBookingId IS NULL),
  ADD CONSTRAINT chk_ss_version CHECK (version >= 0);

-- activeLock chỉ được bằng đúng showtimeSeatId của chính dòng đó
ALTER TABLE `booking_seats`
  ADD CONSTRAINT chk_active_lock
  CHECK (activeLock IS NULL OR activeLock = showtimeSeatId);

-- 2.5 Thanh toán: tối đa 1 payment thành công / đơn --------------------------
-- successLock = bookingId khi SUCCESS hoặc REFUNDED, NULL ở các trạng thái khác
ALTER TABLE `payments`
  ADD CONSTRAINT chk_payment_success_lock
  CHECK ( (successLock IS NULL AND status NOT IN ('SUCCESS','REFUNDED'))
       OR (successLock = bookingId AND status IN ('SUCCESS','REFUNDED')) );

-- 2.6 Voucher -----------------------------------------------------------------
ALTER TABLE `vouchers`
  ADD CONSTRAINT chk_voucher_value
    CHECK (value > 0 AND (type <> 'PERCENT' OR value BETWEEN 1 AND 100)),
  ADD CONSTRAINT chk_voucher_limits
    CHECK (usedCount >= 0 AND perUserLimit >= 1 AND minOrderAmount >= 0
           AND (usageLimit IS NULL OR usedCount <= usageLimit)
           AND (maxDiscount IS NULL OR maxDiscount >= 0));
ALTER TABLE `voucher_redemptions` ADD CONSTRAINT chk_redemption_amount CHECK (discountAmount >= 0);

-- 2.7 Phim --------------------------------------------------------------------
-- durationMin NULL được phép (phim sắp chiếu chưa công bố thời lượng)
ALTER TABLE `movies`
  ADD CONSTRAINT chk_movie_duration CHECK (durationMin IS NULL OR durationMin > 0),
  ADD CONSTRAINT chk_movie_period CHECK (endDate IS NULL OR releaseDate IS NULL OR endDate >= releaseDate),
  ADD CONSTRAINT chk_movie_rating CHECK (ratingAvg BETWEEN 0 AND 5 AND ratingCount >= 0);

-- 2.8 Outbox ------------------------------------------------------------------
ALTER TABLE `outbox_events` ADD CONSTRAINT chk_outbox_attempts CHECK (attempts >= 0);

-- 2.9 (TUỲ CHỌN) updatedAt tự cập nhật cả với raw SQL --------------------------
-- Prisma @updatedAt do Client gán. Nếu muốn raw SQL ($executeRaw) cũng tự cập
-- nhật, bỏ comment dưới đây. Cảnh báo: `prisma migrate dev` có thể coi default
-- này là drift và sinh lệnh gỡ; cách an toàn hơn là tự SET updatedAt = NOW(3) trong raw SQL.
-- ALTER TABLE `showtime_seats` MODIFY `updatedAt` DATETIME(3) NOT NULL
--   DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
-- ALTER TABLE `bookings` MODIFY `updatedAt` DATETIME(3) NOT NULL
--   DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

-- Nếu MySQL báo lỗi 3823 (CHECK trên cột dùng cho FK action CASCADE/SET NULL):
-- kiểm tra relation tương ứng trong schema.prisma đã đặt onUpdate: Restrict chưa
-- (BookingSeat.showtimeSeat, Payment.booking, ShowtimeSeat.heldByBooking).

-- ───────────── PHẦN 3: KIỂM TRA SAU MIGRATION (chỉ đọc) ──────────────────────
-- 3.1 Cột Char(36)/(64)/(40) còn sót collation khác ascii_bin -> kỳ vọng 0 dòng
SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_TYPE IN ('char(36)', 'char(64)', 'char(40)')
  AND COLLATION_NAME <> 'ascii_bin';

-- 3.2 CHECK đã tạo
SELECT TABLE_NAME, CONSTRAINT_NAME
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- 3.3 FK lệch collation giữa cột con và cột cha -> kỳ vọng 0 dòng
SELECT k.TABLE_NAME, k.COLUMN_NAME, c1.COLLATION_NAME AS child_coll, c2.COLLATION_NAME AS parent_coll
FROM information_schema.KEY_COLUMN_USAGE k
JOIN information_schema.COLUMNS c1 ON c1.TABLE_SCHEMA = k.TABLE_SCHEMA AND c1.TABLE_NAME = k.TABLE_NAME AND c1.COLUMN_NAME = k.COLUMN_NAME
JOIN information_schema.COLUMNS c2 ON c2.TABLE_SCHEMA = k.REFERENCED_TABLE_SCHEMA AND c2.TABLE_NAME = k.REFERENCED_TABLE_NAME AND c2.COLUMN_NAME = k.REFERENCED_COLUMN_NAME
WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL
  AND c1.COLLATION_NAME <> c2.COLLATION_NAME;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHỤ LỤC: SQL BẢO TRÌ (chạy bằng job/cron, KHÔNG nằm trong migration)
-- ═══════════════════════════════════════════════════════════════════════════
-- A1. Dọn showtime_seats của suất đã chiếu > 30 ngày – chỉ xoá ghế chưa từng gắn đơn
-- (giữ lại ghế đã có BookingSeat vì FK Restrict). Chạy theo batch để tránh khoá lâu.
-- DELETE ss FROM showtime_seats ss
-- JOIN showtimes s ON s.id = ss.showtimeId
-- LEFT JOIN booking_seats bs ON bs.showtimeSeatId = ss.id
-- WHERE s.status = 'FINISHED'
--   AND s.endTime < NOW(3) - INTERVAL 30 DAY
--   AND bs.id IS NULL
-- LIMIT 5000;   -- lặp cho đến khi ROW_COUNT() = 0

-- A4. Đối soát lệch trạng thái ghế <-> activeLock (kỳ vọng 0 dòng cả hai truy vấn)
-- (a) ghế do đơn thật đang HELD/SOLD nhưng không có BookingSeat.activeLock
-- SELECT ss.id FROM showtime_seats ss
-- LEFT JOIN booking_seats bs ON bs.activeLock = ss.id
-- WHERE ss.isSeeded = 0 AND ss.status IN ('HELD','SOLD') AND bs.id IS NULL;
-- (b) activeLock còn hiệu lực nhưng ghế đã AVAILABLE
-- SELECT bs.id FROM booking_seats bs
-- JOIN showtime_seats ss ON ss.id = bs.showtimeSeatId
-- WHERE bs.activeLock IS NOT NULL AND ss.status = 'AVAILABLE';

-- A4. Nhả ghế hết hạn (NÊN gọi qua hàm releaseSeats() trong service; đây là bản tham khảo)
-- Dùng giờ DB (NOW(3)), không dùng giờ ứng dụng.
-- UPDATE booking_seats bs
-- JOIN bookings b ON b.id = bs.bookingId
-- SET bs.activeLock = NULL
-- WHERE b.status = 'PENDING' AND b.expiresAt < NOW(3);

-- B5. Dọn outbox / inbox đã xử lý
-- DELETE FROM outbox_events WHERE status = 'PROCESSED' AND processedAt < NOW(3) - INTERVAL 7 DAY LIMIT 5000;
-- DELETE FROM inbox_events WHERE processedAt < NOW(3) - INTERVAL 14 DAY LIMIT 5000;

-- B5. Relay lấy batch không đạp nhau giữa nhiều worker
-- SELECT id FROM outbox_events
-- WHERE status = 'PENDING' AND nextAttemptAt <= NOW(3)
-- ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED;

-- A6. Chiếm lượt voucher có điều kiện (affectedRows = 0 -> hết lượt)
-- UPDATE vouchers SET usedCount = usedCount + 1
-- WHERE id = ? AND isActive = 1 AND NOW(3) BETWEEN startsAt AND endsAt
--   AND (usageLimit IS NULL OR usedCount < usageLimit);

-- A5. Quét QR: đánh dấu vé đã dùng (affectedRows = 0 -> vé đã dùng/không hợp lệ)
-- UPDATE tickets SET status = 'USED', usedAt = NOW(3), checkedInById = ?
-- WHERE id = ? AND status = 'VALID';

-- G4. Suất Galaxy biến mất khỏi lần crawl mới (lastSeenAt cũ) – chưa có đơn thì huỷ
-- UPDATE showtimes st SET st.status = 'CANCELLED'
-- WHERE st.cinemaId = ? AND st.lastSeenAt < ? AND st.startTime > NOW(3)
--   AND st.status IN ('SCHEDULED','OPEN')
--   AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.showtimeId = st.id);
