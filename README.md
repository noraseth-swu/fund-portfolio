# Fund Portfolio Management Web App

ระบบบริหารและติดตามพอร์ตการลงทุนกองทุนรวมไทยแบบรวมศูนย์ (**KBank, ttb, Dime!, SCB**) พัฒนาตามหลัก Best Practice ด้วยภาษา **Rust** (Backend ประสิทธิภาพสูงสุด กิน Memory ต่ำ) และ **React + Vite** (Frontend โมเดิร์น) รองรับการดึงราคา NAV อัตโนมัติจาก **SEC Open API (v2)** ของสำนักงาน ก.ล.ต.

---

## 🌟 ฟีเจอร์หลัก (Key Features)

1. **Centralized Portfolio Tracking:**
   * รวมพอร์ตจากทุกแอปไว้ที่เดียว (K-MyFunds/K PLUS, ttb touch/smart port, Dime!, SCB EASY/InnovestX)
   * คำนวณต้นทุนเฉลี่ย (Weighted Average Cost), มูลค่าตลาด (Market Value), Unrealized P/L (+%), และ Realized P/L อย่างแม่นยำด้วย `rust_decimal`
2. **Official SEC Open API (v2) Integration:**
   * เชื่อมต่อดึงรายชื่อ บลจ. (AMCs), กองทุนรวม (Fund Profiles) และราคา NAV รายวันโดยตรง
   * มี Throttler บังคับหน่วงเวลา $\ge 16\text{ ms}$ และระบบ Retry เมื่อติด Rate Limit 429
   * Background Auto-Sync ดึงราคา NAV อัตโนมัติทุก 4 ชั่วโมง
3. **Enterprise Authentication & Multi-User:**
   * รองรับหลายผู้ใช้งาน แยกข้อมูลพอร์ตของแต่ละคนอย่างเด็ดขาด (Data Isolation)
   * เข้าสู่ระบบด้วย **Google SSO**, **Email**, และ **Passkey (Touch ID / Face ID / Windows Hello)**
   * รองรับ **MFA / 2FA (TOTP)** ด้วย Authenticator App
4. **CSV & Excel Importer:**
   * นำเข้าประวัติการซื้อขายย้อนหลังด้วยไฟล์ CSV ในคลิกเดียว
   * มีปุ่มดาวน์โหลดไฟล์ตัวอย่าง และตารางตรวจสอบความถูกต้อง (Live Preview) ก่อนบันทึก
5. **Homelab Ready (Ultra-low Resource):**
   * กินแรมต่ำเพียง **~20 - 35 MB** และ CPU idle ~0%
   * Single-port & Single-container: เสิร์ฟทั้ง Frontend UI และ REST API จบในพอร์ตเดียว
   * จัดเก็บข้อมูลด้วย **SQLite (WAL Mode)** สำรองข้อมูลง่ายเพียงก๊อปปี้โฟลเดอร์ `data/`

---

## 🛠️ Tech Stack & Architecture

* **Backend Engine:** Rust (Edition 2024), Axum 0.8, Tokio, SQLx, Reqwest, Serde
* **Financial Precision:** `rust_decimal` (Fixed-point 4-16 decimal places)
* **Database:** SQLite 3 with Write-Ahead Logging (WAL)
* **Authentication:** Clerk SDK (`@clerk/react` v6) + JWT Extractor
* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts

---

## 🚀 วิธีการรันบนเครื่อง Local Development

### 1. รัน Backend (Rust):
```powershell
cd backend
cargo run
```
* Backend API จะรันบน: `http://localhost:8088`

### 2. รัน Frontend (Vite Dev Server):
```powershell
cd frontend
npm run dev
```
* หน้าเว็บ Frontend จะรันบน: `http://localhost:5173`

---

## 🐳 วิธีการ Deploy บน Homelab (Docker Compose)

1. ตั้งค่า `.env` ที่โฟลเดอร์หลัก:
```env
SEC_API_KEY=your_sec_subscription_key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

2. รันคำสั่ง Docker Compose:
```bash
docker compose up -d --build
```

3. เข้าใช้งานผ่านเบราว์เซอร์:
* `http://<homelab-ip>:8088`
