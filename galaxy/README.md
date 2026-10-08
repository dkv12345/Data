# CineHub Data - Galaxy Cinema Crawler & Database Normalizer (Prisma Schema v3)

Hệ thống thu thập dữ liệu tự động (ETL Crawler) và chuẩn hoá toàn diện từ **Galaxy Cinema API** & **Next.js Data Engine**, tương thích 100% với cấu trúc cơ sở dữ liệu **CineHub Prisma Schema v3** và **MySQL Migration**.

---

## Cấu trúc thư mục chuẩn hoá

```plaintext
galaxy/
├── config.js                 # Cấu hình hằng số, API Endpoints, Client ID, Timezone & Buffer
├── fetcher.js                # Module gọi API Galaxy (Auto Cookie Handshake, Next.js Build ID & Retry)
├── mapper.js                 # Chuẩn hoá dữ liệu (Enums, HTML Entities, Ward/Province, DedupKey)
├── index.js                  # Pipeline ETL chính (Thu thập -> Chuẩn hoá -> Xuất JSON)
├── seed.js                   # Script Seed toàn diện dữ liệu Master & Crawl vào DB qua Prisma Client
├── schema.prisma             # Định nghĩa Database Schema v3 hoàn chỉnh của CineHub (39 models, 27 enums)
├── migration.sql             # SQL Migration (Collation ascii_bin, utf8mb4 & 33 CHECK constraints)
├── package.json              # Khai báo dependencies (axios, moment, slugify) & npm scripts
├── .gitignore                # Bỏ qua node_modules, file log, .DS_Store
└── galaxy_normalized_v3.json # Dữ liệu chuẩn hoá đầu ra sẵn sàng seed vào Database
```

---

## Hướng dẫn cài đặt & Khởi chạy

### 1. Cài đặt thư viện phụ thuộc

```bash
cd galaxy
npm install
```

### 2. Thu thập & Chuẩn hoá dữ liệu (Crawl)

```bash
npm run crawl
# Hoặc: node index.js
```

> **Pipeline thực thi:**
> 1. Gọi song song các API: `/cinemas`, `/sessions2`, `/movies/comming`, `/movies/movie-imax`, `/promotions`.
> 2. Bóc tách `buildId` và cào chi tiết từng phim từ Next.js Data Route `/_next/data/{buildId}/vi/phim/{slug}.json`.
> 3. Chuẩn hoá dữ liệu, khử trùng lặp (DedupKey), decode Unicode tiếng Việt và ánh xạ đúng Enums.
> 4. Xuất file kết quả **`galaxy_normalized_v3.json`**.

### 3. Nạp dữ liệu vào Database (Seed)

```bash
npm run seed
# Hoặc: node seed.js
```

> **Script tự động thực hiện Upsert an toàn (Idempotent) theo đúng 17 bước quan hệ khóa ngoại:**
> 1. `CinemaChain` (GALAXY)
> 2. `SeatType` (STANDARD, VIP, SWEETBOX)
> 3. `TicketType` (ADULT, STUDENT, CHILD, MEMBER)
> 4. `PriceRule` (Ma trận bảng giá mặc định theo định dạng × hạng phòng × loại ghế × loại vé × loại ngày)
> 5. `Province` (12 tỉnh/thành phố chuẩn hoá `code` và `nameNormalized`)
> 6. `Ward` (27 phường/xã)
> 7. `Cinema` (31 cụm rạp toàn quốc)
> 8. `Auditorium` & Sơ đồ ghế mẫu `Seat` (`VIP_6x8`, `IMAX_12x18`, `STD_10x14`, `SMALL_8x10`)
> 9. `Genre` (14 thể loại phim)
> 10. `Person` (172 Đạo diễn & Diễn viên)
> 11. `Movie` (43 phim kèm tóm tắt nội dung, quốc gia, thời lượng, trailer, poster)
> 12. `MovieSource` (Điểm đánh giá nguồn 10 thang & link gốc)
> 13. `MovieGenre` (77 liên kết Phim - Thể loại)
> 14. `MovieCredit` (188 liên kết Phim - Đạo diễn / Diễn viên)
> 15. `Showtime` & `ShowtimePrice` (3,280+ suất chiếu kèm bảng giá tính sẵn)
> 16. `Concession` (Menu Combo bắp nước mẫu)
> 17. `Voucher` & `Promotion` (Mã giảm giá và banner khuyến mãi)

---

## Quy chuẩn ánh xạ dữ liệu (Data Mapping Specification)

| Thực thể trong Schema v3 | Nguồn thu thập / Quy tắc ánh xạ | Kết quả trong Database |
| :--- | :--- | :--- |
| **`CinemaChain`** | Cấu hình chuỗi rạp CineHub | `code`: `GALAXY`, `name`: `Galaxy Cinema` |
| **`Province`** | Tách từ địa chỉ, map bảng tra cứu tỉnh/thành | `code` (`HCM`, `HN`, `DN`...), `nameNormalized` (`ho chi minh`, `ha noi`...) |
| **`Ward`** | Regex `/(Phường\|Xã\|Thị trấn)\s+[^,–\n\r-]+/i` | `@unique([provinceId, name])` |
| **`Auditorium.tier`** | Suy luận từ `screenName` và `movieFormat` | `VIP` (Laurus, Aqualis...), `KIDS`, `PREMIUM` (IMAX, Dolby...), `STANDARD` |
| **`Movie.ageRating`** | Map từ `movie.age` (`0`, `K`, `13`, `16`, `18`, `C`) | `AgeRating`: `P`, `K`, `T13`, `T16`, `T18`, `C` |
| **`Movie.country`** | Next.js data `movieDetail.country` | `Việt Nam`, `Mỹ`, `Hàn Quốc`, `Nhật Bản`... |
| **`Movie.synopsis`** | Next.js data `movieDetail.description` | Text tiếng Việt đã decode HTML Entities & làm sạch thẻ |
| **`Genre`** | Next.js data `movieDetail.categories` | `Hành động`, `Tâm lý`, `Lãng mạn`, `Hài`, `Kinh dị`... |
| **`Person` & `MovieCredit`** | Next.js data `directors` & `actors` | Role `DIRECTOR` / `ACTOR`, `billingOrder`, `nameNormalized` |
| **`Showtime.format`** | `session.version` + `movieFormat` | `TWO_D`, `THREE_D`, `IMAX`, `FOUR_DX`, `SCREENX`, `DOLBY`, `LED` |
| **`Showtime.kind`** | `session.version` (`rebroadcast`, `live`) | `REGULAR`, `ENCORE`, `LIVE` |
| **`Showtime.captionMode`**| `session.caption` (`sub`, `voice`) | `SUBTITLED` (Phụ đề), `DUBBED` (Lồng tiếng) |
| **`Showtime.dedupKey`** | `sha1(chain:cinemaCode:movieId:startTimeUTC:format)` | Khóa Unique 40 ký tự SHA-1 (theo schema dòng 561-562) |
| **`Showtime.endTime`** | `startTimeUTC` + `durationMin` + `10 min buffer` | Giờ kết thúc suất chiếu theo chuẩn UTC |

---

## Thống kê dữ liệu thực tế (Normalized Dataset)

- **Provinces (Tỉnh / Thành):** 12
- **Wards (Phường / Xã):** 27
- **Cinemas (Cụm rạp):** 31 rạp toàn quốc
- **Auditoriums (Phòng chiếu):** 179 phòng
- **Genres (Thể loại phim):** 14
- **Persons (Đạo diễn & Diễn viên):** 172
- **Movies (Phim):** 43
- **MovieGenres (Quan hệ Phim - Thể loại):** 77
- **MovieCredits (Quan hệ Phim - Phân vai):** 188
- **Showtimes (Suất chiếu):** 3,280+
- **Promotions (Khuyến mãi):** 10

---

## Công nghệ sử dụng

- **Runtime:** Node.js (v18+)
- **HTTP Engine:** Axios (hỗ trợ Nginx Session Cookie Handshake)
- **Timezone Management:** Moment.js (`Asia/Ho_Chi_Minh` ➔ `UTC`)
- **String Processing:** Slugify & Custom HTML Entities Decoder
- **ORM & Database:** Prisma v5/v6, MySQL 8.0+
