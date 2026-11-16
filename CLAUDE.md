# Project: Fund Portfolio Management Web App

ระบบบริหารและติดตามพอร์ตการลงทุนกองทุนรวมไทยแบบรวมศูนย์ (KBank, ttb, Dime!, SCB, KBank PVD) พัฒนาด้วย Rust (Backend), React 19 + TypeScript (Frontend), SQLite (WAL), และ Python Harvester.

---

## 🛠️ Tech Stack

- **Backend:** Rust (Edition 2024), Axum 0.8, Tokio, SQLx (SQLite WAL mode), Reqwest, Serde
- **Financial Precision:** `rust_decimal::Decimal` (ห้ามใช้ `f64`/`f32` สำหรับคำนวณเงินหรือหน่วยลงทุน)
- **Frontend:** React 19, TypeScript 5, Vite, Tailwind CSS v4, Lucide React, Recharts
- **Email & PDF Harvester:** Python 3.12, `pdfplumber`, `imaplib`, Gemini AI fallback
- **Authentication:** Clerk React SDK (`@clerk/react` v6) + Axum JWT Verification
- **External Data Source:** SEC Open API (v2) สำนักงาน ก.ล.ต. (Master AMCs, Fund Profiles, Historical NAV)

---

## 💻 Commands

### Backend (Rust):
```powershell
cd backend
cargo test                     # รัน Unit & Integration tests
cargo run                      # รัน Dev server (พอร์ต 8088)
cargo build --release          # บิลด์ไบนารีสำหรับ Production
```

### Frontend (React + Vite):
```powershell
cd frontend
npm test -- --run              # รัน Vitest unit tests (ห้ามลบ flag --run)
npm run build                  # รัน TypeScript check และ Vite bundle
npm run dev                    # รัน Vite Dev server (พอร์ต 5173)
```

### Python Harvester:
```powershell
cd backend/scripts
python test_harvester.py       # รัน Unit tests ของ Harvester (10 tests)
python reset_db.py             # รีเซ็ตตารางธุรกรรม (ล้าง pending & transactions เก็บ user_settings และ SEC funds)
python generate_aliases.py     # อัปเดต fund_aliases.json จากประกาศ ก.ล.ต.
```

---

## 📐 Architecture & Key Design Patterns

### 1. Staged Import (Review Before Commit)
- ห้าม insert ธุรกรรมจากอีเมลหรือไฟล์ PDF/CSV ลงในตาราง `transactions` โดยตรง
- ข้อมูลที่แยกได้ทั้งหมดต้องบันทึกลง `pending_transactions` ก่อน พร้อม `match_confidence` (`EXACT`, `FUZZY`, `NONE`)
- ผู้ใช้เป็นผู้ตรวจทาน, แก้ไขราคา NAV/วันที่, และกดยืนยัน (Commit) เฉพาะรายการหรือเฉพาะธนาคารที่ต้องการเข้าสู่พอร์ต

### 2. SEC API NAV Lookup & Trading Days
- ระบบค้นหา NAV จากตาราง `fund_nav_history` ใน SQLite ก่อน
- หากไม่พบข้อมูล ระบบจะ fallback ไปดึง SEC Open API (`/v2/fund/daily-info/nav`) แบบ On-demand อัตโนมัติและบันทึกลงฐานข้อมูล SQLite
- ปฏิทินเลือกวันทำรายการ (`NavDatePicker`) จะดึงวันที่กองทุนนั้นๆ มีการซื้อขายจริงในเดือนนั้น และแสดงจุดสีเขียว (Emerald) เพื่อให้คลิกเลือกแล้วดึงราคา NAV อัตโนมัติ

### 3. Financial Precision Standards
- ทุกการคำนวณใน Rust: ต้นทุนเฉลี่ย, Unrealized P/L, Realized P/L, ยอดซื้อรวม ต้องใช้ `rust_decimal::Decimal`
- หน่วยลงทุน (Units): ทศนิยม 4 ตำแหน่ง
- ราคาต่อหน่วย (NAV): ทศนิยม 4 ตำแหน่ง
- มูลค่าเงิน (Amount / Fee): ทศนิยม 2 ตำแหน่ง

### 4. UI / UX Conventions
- Responsive Widescreen First: Modal ตารางขนาดใหญ่ (เช่น `TransactionReviewModal`, `BatchTransactionTable`) ต้องขยายเต็มความกว้างหน้าจอ (`max-w-[96vw] 2xl:max-w-[1600px]`)
- Combobox ค้นหากองทุน: ความกว้าง dropdown อย่างน้อย `min-w-[480px] z-[110]` และคอนเทนเนอร์ตารางต้องมี padding ล่าง (`pb-32`) เพื่อป้องกันเมนูถูกตัดขอบ
- Dark / Light Mode Support: ทุกคอมโพเนนต์ต้องรองรับทั้งธีมสว่างและธีมมืดด้วย Tailwind classes
- Bilingual Support: ข้อความ UI ใหม่ต้องเพิ่มทั้งภาษาไทยและอังกฤษใน `frontend/src/lib/i18n.tsx`

---

## 🚫 Hard Boundaries & Quality Rules

1. **ห้ามละเมิดความปลอดภัยของข้อมูล:** ห้ามฮาร์ดโค้ด `SEC_API_KEY`, `CLERK_SECRET_KEY`, หรือรหัสผ่าน Gmail ลงในโค้ดหรือ Git
2. **ห้ามลดระดับคุณภาพของการทดสอบ:** ห้ามใช้ `// @ts-ignore`, `eslint-disable`, หรือลบ assertions เพื่อให้เทสผ่าน
3. **การทดสอบคู่เสมอ:** เมื่อมีการแก้โค้ด ต้องรันทั้ง `cargo test` และ `npm test -- --run` ก่อนจบงาน
4. **SEC Rate Limit Compliance:** ต้องเคารพขีดจำกัดการเรียก SEC API (เว้นระยะห่าง $\ge 16\text{ ms}$ ต่อคำขอ และดักจับ HTTP 429 อย่างรัดกุม)
