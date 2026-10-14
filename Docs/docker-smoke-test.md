# Docker Compose smoke test

วันที่ 14 ตุลาคม 2026 (Asia/Bangkok), source baseline `7929006` พร้อมเอกสารที่ยังไม่ Commit ใน Workspace

## Environment

- Windows + Docker Desktop 4.95.0; Engine 29.8.2, Compose v5.6.0, linux/amd64
- PostgreSQL `17-bookworm`, Node `24-bookworm-slim`
- สร้าง `.env` ที่ Git ignore ด้วยรหัสผ่านสุ่มเฉพาะเครื่อง ไม่แสดง Secrets ในผลทดสอบ
- Docker bin ยังไม่อยู่ใน PATH ของ Shell: ใช้ `C:\Users\Aomsin\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe` และเพิ่มโฟลเดอร์เดียวกันใน PATH เฉพาะ Process เพื่อให้พบ credential helper

## ผลตรวจ

| การตรวจ | ผล |
| --- | --- |
| `docker compose config --quiet` | PASS |
| `docker compose up -d --build` จาก Volume ใหม่ | PASS |
| PostgreSQL / Backend healthcheck | Healthy ทั้งสอง Service |
| Migration / Seed | Exited (0) ทั้งสอง Service |
| Schema / Seed | 8 ตาราง, 2 Tenants, 3 Users, 0 Events |
| `/health`, `/ready` | HTTP 200 |
| ไม่ Login แล้วอ่าน Logs | HTTP 401 |
| Login Admin / Viewer A / Viewer B | PASS; Role และ Home tenant ถูกต้อง |
| Password ผิด / Login ไม่มี CSRF | HTTP 401 / 403 |
| Tenant list / Scoped logs / Rules | PASS; Admin เข้าถึง A/B, Viewer เข้าถึงเฉพาะ Tenant ตน; ขอ Tenant อื่นได้ 403 |
| Viewer สร้าง Rule | HTTP 403 |
| Logout ไม่มี CSRF / Cookie หลัง Logout | HTTP 403 / 401 |
| Restart PostgreSQL + Backend และ `compose up -d --wait` | PASS; Migration/Seed รันซ้ำได้และไม่เพิ่ม Tenant/User |
| Session Admin เดิมหลัง Restart | `/api/auth/me` HTTP 200; Logout HTTP 204; Session เดิมหลัง Logout HTTP 401 |
| Network bindings | Backend เฉพาะ 127.0.0.1:3000; DB ไม่มี Published host port |

สคริปต์ตรวจเฉพาะเครื่อง `tmp/docker-smoke.mjs` ผ่าน 39 HTTP status assertions ก่อน Restart และอีก 3 หลัง Restart พร้อมตรวจ Role/Tenant และรายการ Tenant; ไม่ใส่ Event จำลองลงฐานข้อมูล Script และ Session ชั่วคราวอยู่ในโฟลเดอร์ Git ignore

รอบแรกของสคริปต์ Resume ตรวจ HTTP ผ่าน แต่ Node บน Windows มี Assertion ระหว่าง `process.exit(0)` จึงแก้ให้จบตามปกติและตรวจใหม่

## สถานะหลังทดสอบและขอบเขต

เปิด PostgreSQL/Backend ค้างไว้บนเครื่องเพื่อพัฒนาต่อ; รหัสผ่านอยู่ใน `.env` เท่านั้น Backend API ที่ `http://localhost:3000` ยังไม่มี Frontend

ผลนี้พิสูจน์ Compose ของ Backend วันที่ 2 บน PostgreSQL container จริง ไม่ใช่ Acceptance A1/A7/A8 เต็มระบบ ยังต้องตรวจ Ingestion, UI, Dashboard, Alerts, Retention, Appliance บน Ubuntu และ SaaS HTTPS เมื่อ Implementation พร้อม
