# CARO LIVE ARENA

Bản thử nghiệm game Caro online 15x15, dùng Firebase Authentication (Anonymous) và Realtime Database.

## 1. Cấu hình Firebase
1. Mở Firebase Console > Project settings > General > Your apps.
2. Chọn ứng dụng Web CARO LIVE ARENA, sao chép đối tượng `firebaseConfig`.
3. Mở `firebase-config.js` và thay `apiKey` cùng `appId` bằng giá trị chính xác từ Firebase. Kiểm tra `databaseURL` đúng với Realtime Database của dự án.
4. Firebase Console > Authentication > Sign-in method: bật Anonymous.
5. Realtime Database > Rules: dùng nội dung trong `database.rules.json` để thử nghiệm.

**Cảnh báo:** Rules mẫu chỉ phù hợp thử nghiệm. Bất kỳ tài khoản đăng nhập nào cũng có thể đọc/ghi dữ liệu trong một phòng. Không dùng cho phát hành công khai hoặc có giải thưởng/tiền/quà thật. Cần thiết kế rules và xác thực lượt đánh ở phía máy chủ trước khi mở rộng.

## 2. Chạy thử
Có thể mở `index.html` qua một máy chủ web tĩnh. Không nên mở trực tiếp bằng `file://` vì trình duyệt có thể hạn chế một số tính năng.

## 3. Đưa lên GitHub Pages
1. Upload các file trong thư mục này vào thư mục gốc repository `caro-live-arena`.
2. Mở repository > Settings > Pages.
3. Trong Build and deployment, chọn Deploy from a branch.
4. Chọn branch `main`, folder `/ (root)`, nhấn Save.
5. Đợi GitHub tạo website, thường có địa chỉ dạng `https://vuduybiendhv-eng.github.io/caro-live-arena/`.

## Tính năng bản thử nghiệm
- Tạo phòng bằng mã 6 ký tự.
- Tham gia phòng bằng mã.
- Hai người chơi X/O đồng bộ bàn cờ 15x15 qua Realtime Database.
- Kiểm tra 5 quân liên tiếp theo hàng, cột hoặc đường chéo.
- Chơi ván mới (chủ phòng khởi tạo).

## Giới hạn hiện tại
- Chưa có chat, bảng xếp hạng, ghép trận, quản trị giải đấu hoặc tích hợp TikTok Live.
- Chưa có cơ chế chống gian lận phía máy chủ.
- Nút rời phòng chỉ rời giao diện, không xóa phòng.
