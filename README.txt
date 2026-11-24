# CARO LIVE ARENA V2 — hướng dẫn triển khai

## Cấu hình đã đặt
- Firebase project: caro-fight
- HOST_UID mới: FhBvb1ZyyeYBraKPJChgcpdoNHX2
- Bàn cờ 15x15, 5 quân liên tiếp thắng
- Giao diện Light
- TikTok LIVE đăng ký thủ công
- Dữ liệu mới đặt tại `arenaV2`; dữ liệu cũ không bị xóa.

## Các file
- `index.html`: giao diện và nạp Firebase SDK
- `style.css`: giao diện Light
- `app.js`: logic game và LIVE HOST
- `database.rules.json`: rules mẫu đầy đủ, cập nhật quyền HOST của node cũ sang UID mới

## Triển khai qua GitHub trên Android
1. Mở repository `https://github.com/vuduybiendhv-eng/caro-live-arena`
2. Tải xuống hoặc sao lưu các file hiện tại trước khi thay thế.
3. Vào từng file trên GitHub, bấm Edit (biểu tượng bút).
4. Thay toàn bộ nội dung `index.html`, `app.js`; tạo mới `style.css` nếu chưa có.
5. Commit changes.
6. Đợi GitHub Pages cập nhật rồi mở `https://vuduybiendhv-eng.github.io/caro-live-arena/?v=2`.

## Cập nhật Firebase Rules — CỰC KỲ QUAN TRỌNG
1. Mở Firebase Realtime Database > Rules.
2. Sao chép rules hiện tại ra nơi an toàn trước.
3. Dùng `database.rules.json` làm mẫu thay thế toàn bộ Rules.
4. Kiểm tra kỹ HOST UID mới trong 3 rule `arenaV2` (rooms cho host và queue read/write).
5. Bấm Publish.
6. Rules mẫu giữ nguyên dữ liệu các nhánh cũ `games`, `liveHost`, `liveQueue`, nhưng chuyển quyền HOST của `liveHost` và `liveQueue` sang UID mới. App V2 dùng `arenaV2/queue`.

## Kiểm thử
1. Đăng nhập ẩn danh trên thiết bị HOST. UID hiện trong thông tin tài khoản phải trùng `FhBvb1ZyyeYBraKPJChgcpdoNHX2`.
2. Nếu UID không trùng, tài khoản đó không phải HOST; không sửa UID trong code để ép quyền. Cần đăng nhập đúng tài khoản Firebase có UID này.
3. HOST bấm Tạo phòng. Mã 6 ký tự phải xuất hiện.
4. Thiết bị 2 nhập mã và bấm Tham gia phòng.
5. Hai thiết bị lần lượt đánh X/O; kiểm tra chat.
6. HOST thêm người chờ, danh sách phải hiển thị và có thể gọi người tiếp theo.

## Giới hạn hiện tại cần biết
- Firebase Anonymous Auth tạo UID mới theo thiết bị/trạng thái đăng nhập. UID `FhB...` phải thực sự là UID của phiên đăng nhập hiện tại; nếu không, HOST panel sẽ không hiện.
- Rules giới hạn ghi phòng cho HOST hoặc người chơi của phòng, nhưng client vẫn có thể sửa trạng thái phòng của chính mình; đây là bản nền tảng an toàn hơn mức mở toàn bộ database, chưa phải chống gian lận chuyên nghiệp.
- Queue là đăng ký thủ công; chưa đọc được comment/gift TikTok tự động.
- Timer 30 giây, ELO/leaderboard xếp hạng chính thức, và chống gian lận server-side chưa được triển khai trong gói nền tảng này. Không quảng bá các tính năng đó là đã hoạt động.
- Nút Chơi lại khởi tạo lại ván trong cùng phòng khi ván đã kết thúc.
- Mọi người chơi phải đăng nhập Firebase để đọc/ghi phòng.
