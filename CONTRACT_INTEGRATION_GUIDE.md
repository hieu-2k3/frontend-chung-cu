# Hướng dẫn tích hợp tính năng Hợp đồng thuê

## ✅ Đã hoàn thành

### Backend (100%)
- ✅ Model Contract trong server.js
- ✅ 6 API endpoints đầy đủ
- ✅ Tích hợp vào System Reset

### Frontend (90%)
- ✅ Modal HTML (contracts_modal.html)
- ✅ JavaScript logic (contracts.js)
- ✅ Nút trên Dashboard

## 📝 Cần làm để hoàn thiện

### Bước 1: Thêm Modal vào index.html

Mở file `index.html`, tìm dòng:
```html
<!-- Logout Confirmation Modal -->
```

**Ngay trước dòng đó**, thêm nội dung từ file `contracts_modal.html`

### Bước 2: Thêm JavaScript vào index.html

Trong phần `<script>` của index.html, **trước thẻ đóng `</script>`**, thêm:
```html
<script src="contracts.js"></script>
```

Hoặc copy toàn bộ nội dung file `contracts.js` vào cuối phần script hiện tại.

### Bước 3: Thêm CSS cho form (nếu chưa có)

Thêm vào `style.css`:
```css
.form-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
}

.premium-form .form-group {
    margin-bottom: 1rem;
}

.premium-form label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-secondary);
    font-weight: 500;
}

.premium-form input,
.premium-form select,
.premium-form textarea {
    width: 100%;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: rgba(0,0,0,0.2);
    color: white;
    border: 1px solid rgba(255,255,255,0.1);
    transition: var(--transition);
}

.premium-form input:focus,
.premium-form select:focus,
.premium-form textarea:focus {
    outline: none;
    border-color: var(--accent-blue);
    background: rgba(0,0,0,0.3);
}
```

### Bước 4: Cập nhật loadData() trong script.js

Thêm vào cuối hàm `loadData()`:
```javascript
// Load contracts count
loadContracts();
```

## 🎯 Cách sử dụng

### Cho Admin:
1. Click vào thẻ "Hợp đồng" trên Dashboard
2. Click "Tạo Hợp Đồng Mới"
3. Điền thông tin:
   - Chọn phòng
   - Thông tin khách thuê
   - Tiền thuê, tiền cọc
   - Ngày bắt đầu và thời hạn (ngày kết thúc tự động tính)
   - Thêm điều khoản (tùy chọn)
4. Click "Lưu Hợp Đồng"

### Tính năng:
- ✅ Xem danh sách hợp đồng
- ✅ Lọc theo trạng thái (Tất cả, Đang hoạt động, Sắp hết hạn, Đã hết hạn)
- ✅ Xem chi tiết hợp đồng
- ✅ Sửa hợp đồng
- ✅ Kết thúc hợp đồng
- ✅ Cảnh báo hợp đồng sắp hết hạn (< 30 ngày)
- ✅ Tự động tính ngày kết thúc
- ✅ Quản lý điều khoản đặc biệt

## 🚀 Mở rộng trong tương lai

1. **Upload file PDF hợp đồng**
2. **Gửi email nhắc nhở tự động**
3. **Lịch sử gia hạn hợp đồng**
4. **Báo cáo thống kê hợp đồng**
5. **Tích hợp với Invoice (tự động tạo hóa đơn theo hợp đồng)**

## 📞 Hỗ trợ

Nếu gặp lỗi, kiểm tra:
1. Console log có lỗi không
2. API_URL đã đúng chưa
3. Token đã được lưu chưa
4. Backend đã deploy chưa
