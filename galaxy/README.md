# 🎬 Galaxy Cinema API Crawler & Normalizer (CineHub Schema v3)

Hệ thống thu thập (Crawler) và chuẩn hoá dữ liệu lịch chiếu, rạp chiếu, phim và khuyến mãi từ **Galaxy Cinema API**, tương thích 100% với cấu trúc cơ sở dữ liệu **CineHub Prisma Schema v3** và **MySQL Migration**.

---

## 📁 Cấu trúc thư mục

```plaintext
galaxy/
├── config.js                 # Cấu hình hằng số, API Endpoints, Client ID & Timezone
├── fetcher.js                # Module gọi API Galaxy (Auto Cookie Handshake & Retry)
├── mapper.js                 # Chuẩn hoá dữ liệu (Enums, Ward/Province, DedupKey)
├── index.js                  # Pipeline Crawl chính & Xuất file JSON
├── seed.js                   # Script Seed dữ liệu đã chuẩn hoá vào DB qua Prisma Client
├── schema.prisma             # Định nghĩa Database Schema v3 của CineHub
├── migration.sql             # SQL Migration (COLLATION ascii_bin + CHECK constraints)
├── package.json              # Khai báo thư viện & npm scripts
└── galaxy_normalized_v3.json # Dữ liệu chuẩn hoá đầu ra sẵn sàng seed vào DB
```

---

## 🚀 Hướng dẫn cài đặt & sử dụng

### 1. Cài đặt thư viện phụ thuộc

```bash
npm install
```

### 2. Chạy Crawler thu thập & chuẩn hoá dữ liệu

```bash
npm run crawl
# Hoặc: node index.js
```

Sau khi chạy xong, kết quả làm sạch được lưu tại file **`galaxy_normalized_v3.json`** bao gồm:
- **Tỉnh / Thành (Provinces):** 12 tỉnh thành chuẩn hoá `code` và `nameNormalized`
- **Phường / Xã (Wards):** Tự động bóc tách từ chuỗi địa chỉ
- **Cụm rạp (Cinemas):** 31 rạp toàn quốc (tọa độ GPS, số điện thoại, banner, galleryUrls...)
- **Phòng chiếu (Auditoriums):** 179 phòng chiếu theo phân khúc (`VIP`, `KIDS`, `PREMIUM`, `STANDARD`)
- **Phim (Movies & MovieSources):** Phim đang chiếu, sắp chiếu và phim IMAX
- **Suất chiếu (Showtimes):** 3,300+ suất chiếu đã chuyển đổi giờ UTC và ánh xạ Enum
- **Khuyến mãi (Promotions):** Danh sách banner khuyến mãi hiện hành

### 3. Seed dữ liệu vào Database Prisma

```bash
npm run seed
# Hoặc: node seed.js
```

> **Lưu ý:** Script sử dụng `upsert` trên các khóa chính và ràng buộc Unique (`dedupKey`, `externalId`, `slug`) đảm bảo có thể chạy lặp lại định kỳ mà không lo trùng lặp dữ liệu (Idempotent).

---

## 🧩 Quy chuẩn ánh xạ dữ liệu (Mapping Rules)

| Thực thể | Nguồn Galaxy | Quy chuẩn CineHub Schema v3 |
| :--- | :--- | :--- |
| **Độ tuổi** | `movie.age` (`0`, `K`, `13`, `16`, `18`, `C`) | `AgeRating`: `P`, `K`, `T13`, `T16`, `T18`, `C` |
| **Định dạng màn hình** | `session.version`, `movieFormat` | `ScreenFormat`: `TWO_D`, `THREE_D`, `IMAX`, `FOUR_DX`, `SCREENX`, `DOLBY`, `LED` |
| **Phân khúc phòng** | `session.screenName`, `movieFormat` | `RoomTier`: `STANDARD`, `VIP` (Aqualis, Laurus...), `KIDS`, `PREMIUM` (IMAX, Dolby...) |
| **Hình thức chiếu** | `session.version` (`rebroadcast`, `live`) | `ShowtimeKind`: `REGULAR`, `ENCORE`, `LIVE` |
| **Ngôn ngữ / Phụ đề** | `session.caption` (`sub`, `voice`) | `CaptionMode`: `SUBTITLED`, `DUBBED` |
| **Showtime DedupKey** | `chain`, `cinemaCode`, `movieId`, `startTimeUTC`, `format` | `sha1(chain:cinemaCode:movieId:startTimeUTC:format)` |
| **Thời gian kết thúc** | `session.showTime` + `duration` | `startTimeUTC` + `durationMin` + `10 phút buffer` |

---

## 🛠️ Công nghệ sử dụng

- **Node.js** (v18+)
- **Axios** (kèm cơ chế Cookie Jar Handshake)
- **Moment.js** (xử lý múi giờ `Asia/Ho_Chi_Minh` sang `UTC`)
- **Slugify** (chuẩn hoá slug & text tiếng Việt)
- **Prisma ORM** (v3 Client & Schema)
