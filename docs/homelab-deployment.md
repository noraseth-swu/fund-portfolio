# คู่มือการติดตั้ง Fund Portfolio บน Private Homelab Server ด้วย Dockge & Cloudflare Zero Trust

เอกสารฉบับนี้อธิบายขั้นตอนการ Deploy ระบบ **Fund Portfolio Tracker** บนเครื่อง Homelab Server ส่วนตัว โดยใช้ **Dockge** จัดการ Container และเชื่อมต่อออกสู่ Custom Domain ภายนอกผ่าน **Cloudflare Tunnel (Zero Trust)** ร่วมกับเครือข่าย Container เดิมที่มีอยู่แล้วใน Homelab

---

## 🏛️ แผนภาพสถาปัตยกรรม (Architecture Topology)

```
[ GitHub Actions CI/CD ]
         │ (Build on Push to 'main')
         ▼
[ GitHub Container Registry (ghcr.io) ]
         │
         │ (Dockge Pulls Pre-built Images)
         ▼
┌── Homelab Server ─────────────────────────────────────────────────────────────┐
│                                                                               │
│  [ Dockge Stack: fund-portfolio ]                                             │
│                                                                               │
│  ┌─────────────────────────┐               ┌───────────────────────────────┐  │
│  │  fund-portfolio-backend │ ◄───────────► │      fund-portfolio-web       │  │
│  │   (Rust Actix Server)   │  internal-net │    (Nginx + React SPA PWA)    │  │
│  │       Port: 8088        │               │           Port: 80            │  │
│  └────────────┬────────────┘               └───────────────┬───────────────┘  │
│               │ (Mount Volume)                             │                  │
│               ▼                                            │                  │
│       ./data/portfolio.db                                  │                  │
│                                                            │ (Docker DNS)     │
│  ┌─────────────────────────────────────────────────────────┼───────────────┐  │
│  │  Existing Homelab Tunnel Network (e.g. homelab-network) │               │  │
│  │                                                         ▼               │  │
│  │                     [ Existing cloudflared Container ]                  │  │
│  └─────────────────────────────────────┬───────────────────────────────────┘  │
└────────────────────────────────────────┼──────────────────────────────────────┘
                                         │ (Outbound Encrypted Tunnel)
                                         ▼
                   [ Cloudflare Edge / Zero Trust Access ]
                         • Custom Domain (e.g. portfolio.yourdomain.com)
                         • One-Time PIN (OTP) Email Authentication
                         • Zero Port Forwarding / Zero Open Inbound Ports
                                         │
                                         ▼
                           [ User Web & Mobile PWA App ]
```

---

## 📋 สิ่งที่ต้องเตรียมก่อนเริ่มต้น (Prerequisites)

1. **เครื่อง Homelab Server** ที่ติดตั้ง **Docker** และ **Dockge** พร้อมใช้งาน
2. **Container `cloudflared`** ที่รันอยู่แล้วใน Homelab และเชื่อมต่ออยู่กับ Docker Network (เช่น `homelab-network`)
3. **Custom Domain** ที่จัดการ DNS อยู่บน Cloudflare และเปิดใช้งาน Cloudflare Zero Trust Dashboard

---

## 🚀 ขั้นตอนการติดตั้ง (Step-by-Step Installation)

### ขั้นตอนที่ 1: ตรวจสอบชื่อ Docker Network ของ Cloudflare Tunnel
เปิด Terminal บนเครื่อง Homelab แล้วรันคำสั่ง:
```bash
docker network ls
```
ค้นหาชื่อ Network ที่ Container `cloudflared` ของคุณใช้อยู่ (เช่น `homelab-network`, `cloudflared-net`, หรือ `bridge`) เพื่อนำชื่อไปใส่ในไฟล์คอนฟิก

---

### ขั้นตอนที่ 2: ตั้งค่า Package บน GitHub Container Registry (GHCR)
เมื่อทำการ Push โค้ดขึ้นสู่ GitHub ระบบ GitHub Actions จะคอมไพล์และส่ง Image ไปยัง GitHub Packages อัตโนมัติ:
* ตรวจสอบหน้า GitHub Repo $\rightarrow$ **Packages** จะพบ 2 packages:
  * `fund-portfolio-backend`
  * `fund-portfolio-web`
* **การเปิดสิทธิ์เข้าถึง (Package Visibility):**
  * เข้าไปที่หน้า Package $\rightarrow$ **Package Settings** $\rightarrow$ เลือก **Change visibility** เป็น **Public** เพื่อให้ Dockge สามารถดึง Image ได้ทันทีโดยไม่ต้องใส่ Password
  * *(หรือหากต้องการคงเป็น Private ให้สร้าง GitHub Personal Access Token (PAT) ที่มีสิทธิ์ `read:packages` แล้วรัน `docker login ghcr.io` บน Homelab)*

---

### ขั้นตอนที่ 3: สร้าง Stack ใหม่บน Dockge
1. เปิดหน้าเว็บ **Dockge** บน Homelab (เช่น `http://192.168.1.xxx:5001`)
2. กดปุ่ม **`+ Compose`** มุมบนซ้าย
3. ตั้งชื่อ Stack Name: `fund-portfolio`
4. คัดลอกเนื้อหาจากไฟล์ [`deploy/dockge/compose.yaml`](file:///d:/git/fund-portfolio/deploy/dockge/compose.yaml) ไปวางในช่อง **Compose.yaml** ทางซ้าย
5. ในช่อง **.env** ทางขวา คัดลอกเทมเพลตจาก [`deploy/dockge/.env.example`](file:///d:/git/fund-portfolio/deploy/dockge/.env.example) ไปใส่และปรับแต่งค่า:
   ```env
   # ชื่อ Network ของ Cloudflare Tunnel เดิมใน Homelab
   HOMELAB_TUNNEL_NETWORK=homelab-network

   # API Keys ที่จำเป็น
   SEC_API_KEY=your_sec_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here

   # Sentry (Optional)
   SENTRY_DSN=
   SENTRY_ENVIRONMENT=production

   # Daily NAV Scheduler (ดึง NAV อัตโนมัติทุกวันเวลา 20:30 น.)
   DAILY_NAV_SYNC_ENABLED=true
   DAILY_NAV_SYNC_HOUR=20
   DAILY_NAV_SYNC_MINUTE=30
   ```
6. กดปุ่ม **Deploy** ใน Dockge!
   * Dockge จะดาวน์โหลด Image จาก GHCR
   * สร้าง Container `fund-portfolio-backend` และ `fund-portfolio-web`
   * สร้างโฟลเดอร์ `./data` ภายในโฟลเดอร์ของ Stack สำหรับเก็บฐานข้อมูล `portfolio.db`

---

### ขั้นตอนที่ 4: ตั้งค่า Public Hostname บน Cloudflare Zero Trust
1. เปิด [Cloudflare One / Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. ไปที่ **Networks** $\rightarrow$ **Tunnels** $\rightarrow$ เลือก Tunnel ของ Homelab คุณแล้วกด **Configure**
3. ไปที่แท็บ **Public Hostname** $\rightarrow$ กดปุ่ม **Add a public hostname**
4. ตั้งค่าดังนี้:
   * **Subdomain:** `portfolio` (หรือชื่อตามต้องการ)
   * **Domain:** เลือก Custom Domain ของคุณ (เช่น `yourdomain.com`)
   * **Service Type:** `HTTP`
   * **URL:** `fund-portfolio-web:80`
5. ในส่วน **Additional application settings**:
   * ไปที่ **HTTP Settings** $\rightarrow$ เปิด **HTTP2 to Origin: ON**
6. กด **Save hostname**

> [!TIP]
> เนื่องจาก `fund-portfolio-web` ถูกผูกเข้ากับ `HOMELAB_TUNNEL_NETWORK` เดียวกันกับ `cloudflared` แล้ว Container ของ Cloudflare จึงสามารถชี้ไปที่ `http://fund-portfolio-web:80` ได้โดยตรงผ่าน Docker DNS โดยไม่ต้องผ่าน IP ภายนอก

---

### ขั้นตอนที่ 5: ตั้งค่านโยบายความปลอดภัย Cloudflare Zero Trust Access (OTP Policy)
เพื่อป้องกันไม่ให้คนอื่นเข้าถึงข้อมูลพอร์ตโฟลิโอของคุณได้:
1. ใน Cloudflare Zero Trust Dashboard ไปที่ **Access** $\rightarrow$ **Applications**
2. กด **Add an application** $\rightarrow$ เลือก **Self-hosted**
3. ตั้งชื่อ: `Fund Portfolio`
4. กำหนด Domain ให้ตรงกับ Public Hostname ที่ตั้งไว้ (เช่น `portfolio.yourdomain.com`)
5. ในหัวข้อ **Policies**:
   * **Policy name:** `Authorized Users Only`
   * **Action:** `Allow`
   * **Configure rules:**
     * Include: **Emails** หรือ **Emails ending in** $\rightarrow$ ใส่อีเมลของคุณ (เช่น `your-email@gmail.com`)
6. กด **Next** จนจบการตั้งค่า

*ผลลัพธ์:* เมื่อเปิดเข้าเว็บ `portfolio.yourdomain.com` ระบบ Cloudflare จะแสดงหน้าจอป้อนอีเมลเพื่อรับรหัสผ่าน 6 หลัก (One-Time PIN) ทางอีเมลก่อนเข้าสู่พอร์ตโฟลิโอของคุณเสมอ

---

### ขั้นตอนที่ 6: ตั้งเวลาสำรองฐานข้อมูลอัตโนมัติ (Automated Database Backup)
เพื่อป้องกันข้อมูลการเงินสูญหาย ให้เพิ่ม Crontab บนเครื่อง Homelab เพื่อแบ็กอัป `portfolio.db` ก่อนรอบการซิงค์ NAV ประจำวัน:
1. บน Homelab Server รันคำสั่ง:
   ```bash
   crontab -e
   ```
2. เพิ่มบรรทัดนี้ลงไป (รันทุกวันเวลา 20:15 น. ก่อนรอบดึง NAV เวลา 20:30 น.):
   ```bash
   15 20 * * * /opt/stacks/fund-portfolio/deploy/scripts/backup-db.sh /opt/stacks/fund-portfolio/data/portfolio.db /opt/stacks/fund-portfolio/data/backups 30 >> /var/log/fund_portfolio_backup.log 2>&1
   ```
   *(หมายเหตุ: ปรับ path `/opt/stacks/fund-portfolio` ให้ตรงกับโฟลเดอร์ Stack ใน Dockge ของคุณ โดยปกติ Dockge เก็บไว้ที่ `/opt/stacks/`)*

---

## 🔄 การอัปเดตเวอร์ชันใหม่ในอนาคต (1-Click Update)

เมื่อมีการพัฒนาฟีเจอร์ใหม่และ Push ขึ้นสู่ GitHub:
1. GitHub Actions จะสร้าง Image ใหม่ขึ้น GHCR อัตโนมัติ (~2-3 นาที)
2. บนหน้าเว็บ **Dockge** เลือก Stack `fund-portfolio`
3. กดปุ่ม **`Update`** (หรือกด `Pull` แล้วกด `Deploy`)
4. ระบบจะทำการดึง Image ล่าสุดและรันระบบใหม่ต่อเนื่อง โดยข้อมูลฐานข้อมูล `portfolio.db` ยังคงปลอดภัย 100%

---

## 🛠️ การแก้ไขปัญหาที่พบบ่อย (Troubleshooting)

| ปัญหา | สาเหตุ | วิธีแก้ไข |
| :--- | :--- | :--- |
| **Cloudflare ขึ้น Error 502 Bad Gateway** | `cloudflared` ไม่สามารถเข้าถึง Container `fund-portfolio-web` ได้ | ตรวจสอบว่าในไฟล์ `.env` ของ Dockge ระบุ `HOMELAB_TUNNEL_NETWORK` ตรงกับ Network ของ Cloudflare หรือไม่ |
| **Dockge ดึง Image ไม่สำเร็จ (Unauthorized)** | Package บน GHCR ยังเป็นสถานะ Private | ไปที่ GitHub Package Settings และเปลี่ยน Visibility เป็น **Public** หรือรัน `docker login ghcr.io` บน Homelab |
| **Live Log การซิงค์อีเมลไม่แสดงผลแบบ Real-time** | Nginx หรือ Reverse Proxy มีการ Buffer ข้อมูล SSE | ตรวจสอบว่าใน `frontend/nginx.conf` มีคำสั่ง `proxy_buffering off;` (ระบบตั้งค่าไว้เป็นค่าเริ่มต้นแล้ว) |
