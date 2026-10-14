# วันที่ 2 — Database, Login และ Tenant isolation

สถานะ 14 ตุลาคม 2026: Backend implementation พร้อม; Typecheck, Build และ Integration tests ผ่าน 12/12 รายการ (รวม Parent test) บน Windows / Node.js 24.19.0 โดยใช้ PGlite PostgreSQL WASM ผ่าน TCP และ `pg` driver จริง ทดสอบ Docker Compose/PostgreSQL 17 container ผ่านแล้ว ดู [Docker smoke test](docker-smoke-test.md); ยังไม่มี Login UI

## รันด้วย Docker Compose

ต้องมี Docker Engine/Desktop และ Compose v2 ก่อน ใช้คำสั่งจาก Repository root:

```powershell
Copy-Item .env.example .env
# แก้ .env ตามรายการด้านล่างก่อนรัน
docker compose up -d --build
docker compose ps -a
curl.exe http://localhost:3000/ready
```

ตั้ง `POSTGRES_PASSWORD` เป็น Secret ใหม่ (สำหรับ Compose URL ปัจจุบันใช้ตัวอักษรอังกฤษ ตัวเลข ขีดกลาง หรือ underscore เพื่อหลีกเลี่ยง URL reserved characters) ตั้ง `SEED_ADMIN_PASSWORD`, `SEED_VIEWER_A_PASSWORD`, `SEED_VIEWER_B_PASSWORD` ให้ยาว 12–256 ตัวอักษร ห้าม Commit `.env`

Compose รันตามลำดับ PostgreSQL healthy → Migration → Seed → Backend พอร์ต Web ผูก localhost:3000; ไม่ Publish Database port ข้อมูล PostgreSQL อยู่ Named volume; `docker compose down` ปกติเก็บข้อมูลไว้ อย่าใช้ `down -v` หากต้องการเก็บข้อมูล

Environment `DATABASE_URL` ใน `.env` ใช้เมื่อรัน Backend บน Host; Compose จะใช้ชื่อ Host `postgres` เอง Backend ไม่ได้รับ Seed passwords

บัญชี Seed:

| Email | Role | Home tenant |
| --- | --- | --- |
| admin@example.test | Platform Admin | demoA |
| viewer.a@example.test | Viewer | demoA |
| viewer.b@example.test | Viewer | demoB |

Seed ซ้ำไม่เพิ่ม Tenant/User และไม่ Reset password ของบัญชีที่มีอยู่ ไม่มี Seed events เพื่ออ้างหลักฐาน Ingestion

โหมด HTTP นี้สำหรับ Local development/Appliance development เท่านั้น เมื่อทำ SaaS ต้องตั้ง `APP_ORIGIN=https://ชื่อโดเมน`, `COOKIE_SECURE=true`, `REQUIRE_HTTPS=true` และให้ Nginx จัดการ HTTPS/Proxy ในงาน Deployment ที่ตามมา

## รันกับ PostgreSQL ที่ติดตั้งไว้แล้ว

ต้องมี Node.js 24 และ PostgreSQL ตั้ง `DATABASE_URL` ใน `.env` ให้ตรงกับฐานข้อมูลที่สร้างไว้:

```powershell
npm ci
npm run migrate
npm run seed
npm run dev
```

Migration ครั้งแรกสร้าง 8 ตารางใน Transaction ใช้ Advisory lock และบันทึก Version/checksum ที่ Comment ของ `tenants` เพื่อไม่เพิ่มตารางที่ 9 เมื่อมี Schema แล้วจะตรวจ Checksum ก่อนข้าม Migration ห้ามแก้ Migration ที่ Apply แล้ว; การเปลี่ยน Schema ครั้งถัดไปต้องเพิ่ม Migration runner/version ใหม่ ทำงานจาก Repository root เสมอ

## Login ผ่าน API

Flow: GET CSRF พร้อม Cookie → POST Login พร้อม Cookie, Origin และ Token → เก็บ Cookie/Token ชุดใหม่ → GET me; Logout ต้องส่ง Origin/Token ชุดหลัง Login

```powershell
$base = 'http://localhost:3000'
$csrf = Invoke-RestMethod "$base/api/auth/csrf" -SessionVariable browser
$credential = Get-Credential -UserName 'viewer.a@example.test' -Message 'ใส่รหัสผ่านที่ตั้งไว้ใน .env'
$payload = @{ email = $credential.UserName; password = $credential.GetNetworkCredential().Password } | ConvertTo-Json
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post -WebSession $browser -ContentType 'application/json' -Headers @{ Origin = $base; 'x-csrf-token' = $csrf.csrfToken } -Body $payload
Invoke-RestMethod "$base/api/auth/me" -WebSession $browser
Invoke-RestMethod "$base/api/logs" -WebSession $browser
Invoke-RestMethod "$base/api/auth/logout" -Method Post -WebSession $browser -Headers @{ Origin = $base; 'x-csrf-token' = $login.csrfToken }
```

Sessions เก็บใน PostgreSQL, ID สุ่ม 256 บิตด้วย Node crypto, Password hash Argon2id Cookie เป็น HttpOnly/SameSite=Lax และใช้ `__Host-`/Secure เมื่อเปิด HTTPS Pre-auth อายุ 15 นาที; หลัง Login อายุสูงสุด 8 ชั่วโมง ไม่ต่ออายุอัตโนมัติ และเปลี่ยน Session ID/CSRF token Backend อ่าน Active state, Role และ Tenant ปัจจุบันจาก User ทุก Request; Logout ลบ Session และ Cookie; Server ลบ Session หมดอายุทุกนาที

## API ที่มีแล้ว

| Route | พฤติกรรม |
| --- | --- |
| GET /health | Process liveness |
| GET /ready | ตรวจการเชื่อมต่อและตารางหลัก; 503 เมื่อไม่พร้อม |
| GET /api/auth/csrf | สร้าง/คืน CSRF token พร้อม Pre-auth session |
| POST /api/auth/login | ตรวจ Origin/CSRF, Password และ Active user; เปลี่ยน Session |
| GET /api/auth/me | Current user; 401 ถ้า Session ใช้ไม่ได้ |
| POST /api/auth/logout | ตรวจ Origin/CSRF แล้วลบ Session |
| GET /api/tenants | Admin เห็นทุก Tenant; Viewer เห็นเฉพาะ Tenant ตน |
| GET /api/logs | Read ขั้นต้น: 50 รายการล่าสุด; Search/filter/cursor รอวันที่ 5 |
| GET /api/logs/:id | Detail; Resource ต่าง Tenant ตอบ 404 |
| GET /api/rules | Rules ของ Tenant ที่อนุญาต |
| POST /api/rules | Admin + Origin/CSRF; สร้าง Failed-login rule; Worker รอวันที่ 6 |

Scoped routes รับ `?tenant=demoA` หรือ `demoB` เท่านั้น Admin ต้องเลือก Tenant; Viewer ละได้และจะใช้ Tenant ตน ส่ง Tenant อื่นได้ 403 Alternative selector ใน Header/Body/`tenant_id` ถูกปฏิเสธด้วย 400 Rules payload คือ `{ "name": "Failed login", "threshold": 5, "window_seconds": 300 }`

ยังไม่มี HTTP/Syslog ingest, File upload, API-key authentication, Dashboard, Alert worker, Retention worker หรือ Frontend

## หลักฐานการตรวจ

```powershell
npm run typecheck
npm test
npm run build
```

Integration tests ใช้ PostgreSQL WASM แบบชั่วคราว เปิด TCP/HTTP localhost พอร์ตสุ่ม ใช้ Production database adapter และตรวจ Transaction rollback, Migration/Seed ซ้ำ, 8 ตาราง, Login/Session rotation, CSRF/Origin, A/B list/detail isolation, Admin scope, Viewer write denial, Composite FK, Current role/active state, Expiry/Logout และ Failure responses

ไม่ต้องมี Docker สำหรับ Tests; ต้องอนุญาต Local network sockets Environment ของ Test แยกจาก `.env` และไม่มีการแก้ Database จริง รหัสผ่านใน Test เป็น Fixture สังเคราะห์ ไม่ใช่ Credentials ของระบบ

Backend Compose บน PostgreSQL 17 จริงผ่านแล้ว รวม 42 HTTP status checks และ Session หลัง Restart ดู [Docker smoke test](docker-smoke-test.md) ผลนี้ยังไม่ใช่ Acceptance A1/A7/A8 ครบถ้วน ต้องตรวจ UI, Dashboard, Alerts, Appliance บน Ubuntu และ SaaS ในวันถัดไป Dependencies ถูก Pin ด้วย package-lock.json; ตอนติดตั้ง npm audit รายงาน 0 vulnerabilities
