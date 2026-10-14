# Log Management

ระบบ Demo Log Management สำหรับรวบรวม Log หลายแหล่ง แปลงเป็น Schema กลาง ค้นหา แสดง Dashboard และแจ้งเตือน โดยแยกข้อมูลตาม Tenant และวางแผนรองรับทั้ง Appliance และ SaaS

> **สถานะ 14 ตุลาคม 2026: มี Backend, Migration/Seed, Login/Session และ Tenant RBAC แล้ว — ยังไม่มี Frontend/Ingestion และยังไม่ได้ตรวจ Docker deployment**
>
> ยืนยันการออกแบบร่วมกับผู้ใช้ครบ 20 หัวข้อ วันที่ 13 ตุลาคม 2026 สำหรับงานเดี่ยวภายใน 10 วันหลังได้รับ Assignment วันที่จัดทำเอกสารไม่ใช่การยืนยันวันเริ่มนับกำหนดส่ง

## เอกสารออกแบบ

| เอกสาร | เนื้อหา |
| --- | --- |
| [Architecture](Docs/architecture.md) | ขอบเขต ระบบย่อย Data flow, Security, Deployment และเหตุผลการออกแบบ |
| [Schema และ Mapping](Docs/schema.md) | Common event schema, Source mapping, ตารางฐานข้อมูลและ Index |
| [Acceptance checklist](Docs/acceptance-checklist.md) | เกณฑ์ตรวจรับ วิธีทดสอบ หลักฐาน และรายการส่งมอบ |
| [Backend วันที่ 2](Docs/day2-backend.md) | วิธีรัน, API, Login flow และผลทดสอบวันที่ 2 |

เอกสารสรุปจาก Assignment ภาษาไทยและภาษาอังกฤษ หัวข้อ 2–8 โดยแยก **ข้อกำหนดโจทย์** ออกจาก **ข้อเสนอแนะการออกแบบ** เอกสารโจทย์ต้นฉบับเก็บอ้างอิงในเครื่องและไม่รวมในการเผยแพร่ Repository นี้

ใช้ชื่อโฟลเดอร์ `Docs/` ตาม Workspace เดิม ซึ่งเทียบกับ `/docs/` ในรายการส่งมอบ โปรดใช้ตัวพิมพ์ให้ตรงกันเมื่อทำงานบน Linux

## ข้อกำหนดหลัก

- มีอย่างน้อย 4 เส้นทางที่ส่งข้อมูลเข้าระบบจริง โดยใช้ Sample/Simulator ได้ตามโจทย์
- รองรับกลุ่ม Firewall/Network, API, CrowdStrike, AWS, Microsoft 365 และ AD/Windows Security
- รับ Syslog, HTTP JSON และ File batch ผ่านอย่างน้อย 2 โปรโตคอล
- Normalize ก่อนเก็บ พร้อมข้อมูลดิบสำหรับตรวจสอบย้อนหลัง
- Search และ Dashboard: Top IP/User/Event Type, Timeline และ Tenant/Source/Time filters
- สร้าง Alert rule อย่างน้อย 1 แบบและแสดงการแจ้งเตือน
- Login, Admin/Viewer และการบังคับ Tenant isolation ที่ Backend
- Appliance บนเครื่อง/VM เดียว และ SaaS บน Public cloud พร้อม HTTPS
- Retention อย่างน้อย 7 วัน พร้อม Tests ตัวอย่างอย่างน้อย 2–3 เคส

## Stack ที่ยืนยัน

| ส่วน | เทคโนโลยีที่วางแผนใช้ |
| --- | --- |
| Frontend | React, Vite, TypeScript, Recharts |
| Backend | Node.js, Express, TypeScript, Zod |
| Database | PostgreSQL, Typed columns, JSONB, B-tree และ GIN ตาม Query |
| Authentication | Server-side session ใน PostgreSQL + HttpOnly cookie; API key สำหรับ Ingestion |
| Ingestion | HTTP endpoint, Node UDP collector, JSON/NDJSON upload |
| Background jobs | Worker สำหรับ Alert และ Retention |
| Deployment | Docker Compose บนเครื่อง/VM เดียว; Nginx Serve React build และ Proxy API |

การตัดสินใจหลัก: HTTP/File ใช้ Partial success และตอบจำนวนที่บันทึกจริงหลัง Commit; Backend บังคับ Tenant scope บน Shared tables โดยยังไม่ใช้ RLS; Platform Admin เลือก Tenant ได้ ส่วน Viewer อยู่ Tenant เดียว ใช้ 8 ตารางรวม sessions ไม่มีตารางประวัติ Ingestion batch ใน MVP

Alert ใช้ Event time ตรวจทุก 10 วินาทีและ Cooldown 5 นาที; Retention นับจาก received_at อย่างน้อย 7 วัน ลบทุกชั่วโมงครั้งละประมาณ 1,000 Records; Search ใช้ Filters/Raw substring พร้อม Cursor pagination ค่าเริ่มต้น 50 สูงสุด 100 รายการต่อ Request

ดู [บันทึกการยืนยันทั้ง 20 หัวข้อ](Docs/architecture.md#confirmed-decisions) รายละเอียด Library เสริม เช่น Recharts/Zod ยังเป็นข้อเสนอการ Implementation

Backend dependencies ถูก Pin version ใน `package.json` และ `package-lock.json` แล้ว ใช้ Node.js 24; Frontend dependencies จะเลือกเมื่อเริ่ม Implementation ของ Frontend

## เส้นทางเดโมที่วางแผน

1. Firewall simulator → Syslog UDP → Collector
2. Application sender → HTTP POST `/ingest`
3. AWS CloudTrail sample → JSON file upload
4. AD simulator → HTTP POST → AD parser

เพิ่ม M365, AD และ CrowdStrike file samples รวมถึง Router Syslog ผ่าน Pipeline เดียวกัน การ Seed Event ลง DB โดยตรงไม่นับเป็นหลักฐาน Ingestion

## การติดตั้งและใช้งาน

Backend มี Source code, Compose, Migration และ Seed แล้ว ดู [คู่มือวันที่ 2](Docs/day2-backend.md) ตั้งค่า `.env` จาก `.env.example` และ Seed passwords ก่อนรัน `docker compose up -d --build` (ยังไม่ได้ทดสอบ Docker บนเครื่องนี้)

เป้าหมายเมื่อ Implementation พร้อม:

1. เตรียม Ubuntu 22.04+ ตาม Appliance baseline: 4 vCPU, RAM 8 GB, Disk 40 GB
2. ติดตั้ง Docker Engine/Compose และตั้งค่าจาก `.env.example`
3. เปิด Services ด้วย `docker compose up -d`
4. ตรวจ Readiness และ Login ด้วยบัญชี Seed ที่กำหนดผ่าน Environment

รายการ Appliance เต็มระบบข้างต้นยังเป็นแผน Compose ปัจจุบันมี PostgreSQL/Backend และ one-shot Migration/Seed; Nginx/Collector/Worker และคู่มือ `Docs/setup_appliance.md`, `Docs/setup_saas.md` จะเพิ่มในงานถัดไป

## แผนพัฒนา 10 วัน

| วัน | งานและผลลัพธ์เป้าหมาย |
| --- | --- |
| 1 | Architecture/Schema, Repository, Compose skeleton และตรวจความพร้อม Cloud |
| 2 | Migration, Seed Tenant A/B, Login, Backend RBAC และ Tenant tests |
| 3 | HTTP ingest และ Syslog → Normalize → Storage |
| 4 | File batch, Source parsers และ Simulator ให้ครบ |
| 5 | Search, Log detail, Dashboard และ Filters |
| 6 | สร้าง Rule, Alert worker, Dedup และ Alerts UI |
| 7 | Retention, Security review และ Negative tests |
| 8 | Appliance clean install และ SaaS HTTPS |
| 9 | Tests, คู่มือ, Acceptance review และซ้อมเดโม |
| 10 | Final QA, วิดีโอ 30 นาที และส่งมอบ |

ผู้สมัครต้องทำนัดสัมภาษณ์เดโมเองตามกำหนด Assignment

## การทดสอบ

รัน `npm run typecheck`, `npm test`, `npm run build` ได้แล้ว ผลวันที่ 2 ผ่าน 12/12 รายการบน PostgreSQL WASM ผ่าน `pg` driver ครอบคลุม Migration/Seed, Login/Session, CSRF, RBAC และ Tenant isolation ดู [รายละเอียดหลักฐาน](Docs/day2-backend.md#หลักฐานการตรวจ) Normalization/Ingestion, Dashboard, Alert และ Retention tests จะเพิ่มตาม Implementation

ตรวจรายละเอียดและสถานะได้ที่ [Acceptance checklist](Docs/acceptance-checklist.md) ทุกข้อยังเป็น `NOT RUN` จนกว่าจะมีหลักฐานจริง

## ขอบเขตและงานเสริม

MVP ใช้ PostgreSQL และ VM เดียว ไม่รับประกัน High availability หรือ Durable delivery ของ UDP รองรับรูปแบบ Sample ที่มี Fixture ไม่อ้างว่ารองรับทุก Vendor format

Syslog TCP, CSV, User CRUD UI, Webhook, Enrichment, CI/CD, IaC, แยก Table ต่อ Tenant และ Metrics/Traces พิจารณาหลัง Acceptance หลักผ่าน ไม่รวม Kubernetes, Billing, SSO หรือ Production cloud connectors ใน Critical path

## ข้อมูลก่อนส่งงาน

- SaaS URL: ยังไม่มี
- วิดีโอเดโม: ยังไม่มี
- คำสั่งรัน Tests: `npm test`
- Credentials: ส่งให้ผู้ตรวจผ่านช่องทางที่เหมาะสม ไม่ใส่ Password/Token/API key ใน Repository
