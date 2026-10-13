# Architecture — Demo Log Management

สถานะ: **ยืนยันการออกแบบร่วมกับผู้ใช้แล้ว ยังไม่ได้ Implement/Validate** | 2026-10-13

<a id="confirmed-decisions"></a>

## บันทึกการยืนยัน

ผู้ใช้ยืนยันทีละหัวข้อครบ 20 ข้อ การยืนยันนี้เป็น Design baseline ไม่ใช่ผลการทดสอบระบบ ค่าตั้งต้นทางเทคนิคที่ไม่ได้เลือกแยกให้ถือเป็นข้อเสนอ Implementation และปรับจากผลทดสอบได้

| ข้อ | ตัวเลือก | ข้อตกลง |
| --- | --- | --- |
| 1 | A | Modular monolith แยก API/Collector/Worker |
| 2 | A | Express + TypeScript |
| 3 | A | React + Vite + TypeScript |
| 4 | A | PostgreSQL อย่างเดียว |
| 5 | C | Typed columns + JSONB attributes + Raw text |
| 6 | A | Platform Admin เลือกทุก Tenant ได้; Viewer อยู่ Tenant เดียว |
| 7 | A | Shared tables + tenant_id + Backend authorization; ยังไม่มี RLS |
| 8 | A | HTTP/File บันทึกและ Commit ก่อนตอบสำเร็จ |
| 9 | B | Partial success รับรายการที่ถูกต้องและรายงานรายการที่ผิด |
| 10 | A | Syslog UDP สำหรับ MVP |
| 11 | B | Server-side session ใน DB + HttpOnly cookie |
| 12 | A | API key แยกตามผู้ส่ง ผูก Tenant และ Allowed sources |
| 13 | C | เก็บ event_timestamp และ received_at |
| 14 | A | Alert นับ Event time ใน Window ปัจจุบัน |
| 15 | A | Worker ตรวจทุก 10 วินาที; Cooldown 5 นาที |
| 16 | A | Retention ≥7 วันหลัง received_at |
| 17 | A | Cleanup ทุกชั่วโมง ลบ Batch ประมาณ 1,000 Records |
| 18 | A | 8 ตารางรวม sessions; ไม่เก็บประวัติ Ingestion batch ถาวร |
| 19 | A | Structured filters + Raw substring; Cursor 50/สูงสุด 100 |
| 20 | A | Compose บนเครื่อง/VM เดียว ทั้ง Appliance/SaaS; Nginx Serve React build |

อ้างอิง Assignment §2 Scope, §3 Schema, §5 Architecture, §6 Deliverables, §7 Acceptance และ §8 Scoring

## 1. เป้าหมายและขอบเขต

สร้างระบบเดโมที่รับ Log หลายแหล่ง แปลง Schema ก่อนจัดเก็บ แล้วให้ผู้ใช้ค้นหา ดูภาพรวม และรับ Alert โดยไม่อ่านข้อมูลข้าม Tenant โดยไม่ได้รับอนุญาต

ข้อกำหนดโจทย์: Syslog/HTTP JSON/File batch, อย่างน้อย 2 โปรโตคอล, 4 เส้นทางที่ส่งได้จริง, Source coverage ครบกลุ่มที่ระบุ, Dashboard/Search, Alert, Admin/Viewer, Tenant isolation, Retention ≥7 วัน, Appliance และ SaaS HTTPS

ข้อเสนอแนะ: ใช้ Modular monolith แบ่ง Module ชัด และแยก Process เฉพาะ API, Collector และ Worker แทนการกระจายเป็น Microservices หลายตัว

## 2. แผนภาพ

```mermaid
flowchart LR
    F[Firewall / Router sender] -->|Syslog UDP| C
    S[Application / AD simulator] -->|HTTPS JSON| N
    L[AWS / M365 / AD / CrowdStrike files] -->|HTTPS upload| N
    U[Admin / Viewer] -->|HTTPS| N

    subgraph VM[Appliance หรือ Public Ubuntu VM - Docker Compose]
        N[Nginx / TLS / React static build]
        API[Express API]
        AUTH[Authentication / RBAC / Tenant scope]
        ING[HTTP / File ingestion]
        C[Syslog collector]
        P[Source parsers]
        NOR[Normalizer / Validation]
        DB[(PostgreSQL)]
        W[Alert / Retention worker]

        N --> API
        API --> AUTH
        AUTH --> ING
        ING --> P
        C -->|Trusted listener tenant| P
        P --> NOR
        NOR -->|Event + Raw| DB
        AUTH -->|Scoped queries| DB
        DB --> W
        W -->|Alerts / Cleanup| DB
        API -->|Search / Dashboard / Alerts| N
    end
```

Parser/Normalizer เป็น Shared module ที่ใช้ใน API และ Collector ไม่ใช่ Network service เพิ่ม Alert engine ทำงานโดยไม่ต้องมีผู้ใช้เปิด Dashboard

## 3. Components และเหตุผล

| Component | หน้าที่ | เหตุผล/ข้อจำกัด |
| --- | --- | --- |
| React/Vite/TypeScript | Login, Explorer, Detail, Dashboard, Alerts, Rule form, Upload | UI ที่เน้นฟังก์ชัน; ไม่ทำ Design system เต็มรูปแบบ |
| Express/TypeScript | Auth, Query, Ingest, Rule management | ใช้ภาษาเดียวและแชร์ Validation |
| PostgreSQL | Users, Tenants, Events, Rules, Alerts | ลดจำนวน Services; ต้องกำหนด Index/Pagination |
| UDP collector | รับ Syslog บน 5514 ภายใน Container | ทำงานง่าย; UDP ไม่มีการรับประกัน Delivery |
| Worker | ประเมิน Alert และลบข้อมูลหมดอายุ | แยกงานจาก HTTP lifecycle |
| Nginx | Reverse proxy, TLS, Request size limit | เปิด Public entry point เดียวสำหรับ Web/API |

PostgreSQL ใช้ Typed columns สำหรับ Query หลัก และ JSONB สำหรับ Attributes ตาม [Schema](schema.md) OpenSearch/ClickHouse เหมาะหากปริมาณหรือรูปแบบ Query ต้องการ แต่ยังไม่จำเป็นสำหรับเดโม 10 วัน

<a id="ingestion-contract"></a>

## 4. Ingestion contract และ Data flow

### HTTP

1. รับ Object/Array ที่ `POST /ingest`; `/api/ingest` เป็น Alias ของ Handler เดียวกัน
2. ตรวจ API key ที่ผูก Tenant/Allowed sources และจำกัด Rate/ขนาด
3. หาก Tenant ใน Payload ขัดกับ Key ให้ 403; ไม่เลือก Tenant จาก Body อย่างเดียว
4. เลือก Parser จาก Source ที่อยู่ใน Allowlist แล้ว Normalize/Validate
5. ตรวจแต่ละ Record และแยกรายการที่ไม่ผ่านพร้อม record_number แบบเริ่มนับที่ 1 จากนั้นเขียนเฉพาะรายการที่ผ่านใน Transaction เดียว
6. ตอบหลัง Commit เท่านั้น: 201 เมื่อผ่านทั้งหมด; 200 เมื่อมีทั้งสำเร็จและผิด; 422 เมื่อไม่มี Record ผ่าน Validation; DB ไม่พร้อม/Transaction rollback ให้ 503 และไม่อ้าง Accepted count ว่าสำเร็จ

ข้อเสนอ Response contract: `accepted`, `rejected`, `results` โดยผลราย Record มี record_number, status และ event_id สำหรับรายการที่ Commit แล้ว หรือ errors สำหรับรายการที่ผิด ผู้ส่งส่งใหม่เฉพาะรายการที่ไม่ผ่าน ไม่ส่งทั้ง Batch ซ้ำโดยไม่ตรวจผล

ตัวอย่าง Partial success:

```json
{
  "accepted": 1,
  "rejected": 1,
  "results": [
    {"record_number": 1, "status": "accepted", "event_id": "11111111-1111-4111-8111-111111111111"},
    {"record_number": 2, "status": "rejected", "errors": [{"field": "src_ip", "code": "INVALID_IP"}]}
  ]
}
```

Invalid JSON envelope ให้ 400; ขนาดเกินให้ 413 โดยไม่มีการเขียน การตรวจ Authorization มาก่อน Validation: หาก Tenant/Allowed source ขัดกับ Key ให้ Reject Request ทั้งชุดด้วย 403 ก่อนเขียน; Credential ไม่ถูกต้องให้ 401 Partial success ใช้กับข้อผิดพลาดของข้อมูลภายใน Scope ที่อนุญาตแล้ว NDJSON ที่ Frame เป็นบรรทัดได้ให้รายงาน Invalid line เป็น Record error ส่วน JSON array ที่ Syntax เสียไม่สามารถแยก Record อย่างน่าเชื่อถือให้ Reject ทั้ง Request

Partial success ใน MVP ครอบคลุม Validation errors; หาก DB ล้มเหลวระหว่างเขียนชุดที่ผ่าน ให้ Rollback ชุดนั้นทั้งหมด ไม่รับประกัน Exactly once: ถ้า Commit สำเร็จแต่ Response หาย ผู้ส่งอาจส่งซ้ำและเกิด Event ซ้ำได้ ยังไม่มี Idempotency key/ประวัติ Batch ถาวร

### Syslog

1. รับ Datagram ที่ Listener; Tenant ผูกกับ Config ของ Listener
2. แยก Header/PRI และ Key-value; ระวัง Value ที่มีช่องว่าง
3. Normalize และเขียนผ่าน Storage module
4. บันทึก Parse/Write failures และ Drop count; ไม่ถือว่า UDP sender ได้รับ Commit acknowledgment
5. UI Poll 5–10 วินาที เป้าหมายให้เห็น Log ภายใน 1 นาทีตาม Acceptance

MVP ใช้ Listener สำหรับ Tenant เดโมที่กำหนดไว้ หากมีหลาย Tenant ต้องแยก Listener/Port ที่ผูก Tenant หรือใช้ Forwarder ที่ยืนยันตัวตน ห้ามใช้ Tenant text ใน Syslog เป็นหลักฐานสิทธิ์

### File

รับ Multipart upload โดย Admin หรือ API key ที่มีสิทธิ์ Parse JSON Object/Array หรือ NDJSON ใช้ Pipeline เดียวกับ HTTP ไม่รับ Arbitrary server path/Remote URL และไม่ Execute ไฟล์

ค่าเริ่มต้นที่เสนอ: HTTP body 1 MiB; Upload 5 MiB; Batch สูงสุด 1,000 Records ต้องปรับจากผลทดสอบและตั้ง Nginx/Application ให้สอดคล้องกัน ตรวจจำนวน Records ก่อน Transaction; Unsupported content ให้ Error ชัดเจน

Sample ทุก Source ต้องผ่าน Ingest จริง ไม่ Insert SQL เพื่ออ้างว่าเชื่อม Source สำเร็จ

## 5. Tenant และ Role model

**ข้อเสนอการออกแบบ:** Viewer ผูก Tenant เดียว; Admin เป็น Platform Admin ที่มีสิทธิ์เลือก Tenant ที่มีอยู่จริง หากอนาคตมี Tenant Admin ต้องสร้าง Permission model เพิ่ม ไม่ถือว่า Admin ของลูกค้ามีสิทธิ์ทั่วระบบ

| Identity | Read | Write |
| --- | --- | --- |
| Viewer | Logs/Dashboard/Alerts/Rules ของ Tenant ตน | ไม่สร้าง Rule, Upload หรือจัดการผู้ใช้ |
| Platform Admin | Tenant ที่เลือกอย่างชัดเจน | สร้าง/แก้ Rule และ Upload ใน Tenant ที่เลือก |
| Ingest API key | ไม่มีสิทธิ์อ่าน Logs | เขียนเฉพาะ Tenant/Source ที่ผูกไว้ |
| Collector | ไม่มี User UI | เขียน Tenant จาก Trusted config |
| Worker | Internal job context แยก Tenant | Alert/Retention ตาม Tenant |

Backend สร้าง Scope กลางก่อน Query ทุกครั้ง Viewer ระบุ Tenant อื่นให้ 403; การเปิด Resource ID ต่าง Tenant ให้ 404; Admin ไม่ระบุ Tenant ใน Scoped endpoint ให้ 400 ไม่คืนทุก Tenant โดยปริยาย

ทุก Query รวม Search, Detail, Counts, Top N, Timeline, Alert และ Rule ต้องบังคับ Scope รวมถึง Cursor และ Cache ถ้ามี Foreign key ของ Alert ต้องตรวจ Tenant ให้ตรง Rule

MVP ใช้ Application-level scoping และ Negative integration tests; PostgreSQL RLS เป็นชั้นป้องกันเพิ่มเติมหากมีเวลา ต้องใช้ Non-owner role ที่ไม่ BYPASSRLS และ Transaction-local context เมื่อใช้ Connection pool RLS ไม่เท่ากับ Bonus แยก Table/Index

## 6. Authentication และ Security

- Password hash ด้วย Argon2id; ไม่มี Plaintext password ใน DB หรือ Repository
- Server-side session ใน PostgreSQL; Browser เก็บเฉพาะ Opaque session ID ใน HttpOnly cookie ไม่เก็บ Role/Tenant เป็นสิทธิ์ที่ Client แก้ได้
- Cookie ใช้ Secure บน HTTPS, SameSite=Lax, Path=/ และไม่กำหนด Domain โดยไม่จำเป็น; Appliance HTTP development อนุญาตปิด Secure ผ่าน Config เฉพาะโหมดนั้น
- ตรวจ Session expiration และ Active user/Role/Tenant ปัจจุบันจาก DB ทุก Request; ค่าเริ่มต้นที่เสนอคืออายุสูงสุด 8 ชั่วโมงโดยไม่มี Auto-renewal และลบ Session หมดอายุเป็นรอบ
- Rotate session ID หลัง Login เพื่อป้องกัน Session fixation; Refresh หน้าแล้วยังใช้งานได้; Logout ลบ Session ฝั่ง Server และล้าง Cookie การใช้ Cookie เดิมหลัง Logout ต้องได้ 401
- State-changing routes ที่ใช้ Session รวม Upload/Rule/Logout ต้องตรวจ CSRF token ที่ผูกกับ Session และ Origin; Login ใช้ Pre-auth CSRF session/token; SameSite เป็นชั้นเสริม ไม่ใช่การป้องกันเพียงอย่างเดียว
- API key เก็บ Hash และ Prefix ใน DB; แสดง Key เต็มเฉพาะตอนสร้าง; มีการเพิกถอน; ไม่ใช้ Viewer session แทน Ingestion credential
- API-key ingestion ไม่ใช้ Cookie เป็นการยืนยันตัวตนโดยปริยาย; Endpoint ที่รับทั้ง Admin session/Key ต้องเลือก Auth mode ชัดและตรวจ CSRF เมื่อใช้ Session
- SQL parameters สำหรับ Values; Allowlist สำหรับ Sort/Bucket/Column
- Render Raw เป็น Text; ไม่ใช้ Raw HTML; ใช้ CSP และ Same-origin frontend/API
- จำกัด Login/Ingest rate, Payload size, Query time range และ Pagination
- ไม่ Log Authorization header, Password, Token หรือ API key
- จำกัดเครือข่าย Syslog; ไม่เปิด Database ออก Internet

## 7. Query และ Dashboard

Endpoint ที่วางแผน: `/api/logs`, `/api/logs/:id`, `/api/dashboard/summary`, `/timeline`, `/top-ips`, `/top-users`, `/top-event-types` ภายใต้ Dashboard prefix

ทุก Dashboard endpoint ใช้ Tenant/Source/Time filters แบบเดียวกัน: ช่วง `[from,to)` โดยเก็บ UTC และแสดง Timezone ชัด Pagination ใช้ `(event_timestamp,id)` เป็น Cursor และตรวจ Scope ใหม่ทุก Request เรียงใหม่ไปเก่า ค่าเริ่มต้น 50 สูงสุด 100 รายการต่อ Request; Filters รองรับ Source, เวลา, IP แบบตรงค่า, User, Event type และ Severity เปลี่ยน Filter แล้วเริ่ม Cursor ใหม่

Raw substring search จำกัด Tenant/Time และจำนวนผลลัพธ์; ไม่อ้างว่า JSONB GIN เร่ง Raw text search ได้ หลีกเลี่ยงสร้าง Index ทุก Field โดยไม่มี Query รองรับ

## 8. Alert

โจทย์ต้องการกฎอย่างน้อยหนึ่งแบบและสร้างกฎตัวอย่างได้ ข้อเสนอ: Failed login ≥5 ครั้งจาก IP เดิมใน Tenant เดียวภายใน 300 วินาที

- Admin สร้าง Rule ผ่าน UI/API; ไม่ Hard-code กฎอย่างเดียว
- Worker ประเมินทุก 10 วินาทีด้วย Evaluation time ค่าเดียวต่อรอบ
- Match: event_type=authentication, outcome=failure, src_ip ไม่ Null และ `evaluation_time - window < event_timestamp <= evaluation_time`
- Group ด้วย Tenant และ IP; ไม่รวม Count ข้าม Tenant
- บันทึก Alert พร้อม Rule, IP, Count, Window, First/Last seen และ Sample event IDs
- Persistent `alert_state` และ Transaction ป้องกันแจ้งซ้ำใน Cooldown 300 วินาที; Restart ไม่ล้าง State
- UI Poll และแสดง Alert; Email/Webhook เป็น Optional

ข้อจำกัด: Polling มีความละเอียด 10 วินาที; ไม่ Backfill ทุก Historical window; Log ที่มาช้าจนพ้น Window/เวลาอนาคตไม่ Trigger ใช้ Fixture เวลาปัจจุบันสำหรับ Live demo โดยเก็บ Sample ต้นฉบับไว้

## 9. Retention

โจทย์กำหนดอย่างน้อย 7 วัน ข้อเสนอคือนับจาก `received_at` เพื่อเก็บ Sample เก่าที่เพิ่งรับไว้ครบ 7 วัน ส่วน Timeline ใช้ `event_timestamp`

Worker รันทุกชั่วโมง ลบ Batch ครั้งละประมาณ 1,000 Records ที่ `received_at < now - retention_days`; Configuration ต้อง ≥7; บันทึกจำนวนที่ลบและผลรัน ไม่ลบ Users/Rules การลบ Events ไม่ควร Cascade ลบ Alert ทั้งหมดโดยไม่ได้กำหนดนโยบาย ข้อมูลหลักฐานใน Alert อาจมี Event ID ที่หมดอายุและ UI ต้องแจ้งได้ ให้แบ่ง Transaction และ Yield ระหว่าง Cleanup batches เพื่อไม่ขวางรอบ Alert

เริ่มด้วย Scheduled delete และ Autovacuum ไม่ทำ Partition จนกว่าจะมีผลทดสอบรองรับความจำเป็น

## 10. Deployment

### Appliance

Ubuntu 22.04+, 4 vCPU, RAM 8 GB, Disk 40 GB ตามโจทย์ ยืนยัน 5 Services ต่อเนื่อง: nginx, backend, collector, worker, postgres และ one-shot migrate/seed

Frontend เป็น React static build ที่ Nginx Serve ใน Production ไม่มี Frontend runtime container แยก; Development ใช้ Vite ได้ตามปกติ Source frontend/README ยังแยกตาม Deliverables ทั้งสองโหมดใช้ Compose ชุดเดียวพร้อม Environment/Production override

- เปิด Web ผ่าน Nginx 80/443; UDP Host 514 → Container 5514 หรือ Host 5514 หากติดข้อจำกัด
- PostgreSQL ใช้ Named volume; ไม่ Publish 5432
- DB healthy → Migration/Seed สำเร็จ → Backend/Worker พร้อมรับงาน
- `/health` ตรวจ Liveness; `/ready` ตรวจ DB/Migration readiness โดยไม่เปิดเผย Secrets
- เป้าหมาย `docker compose up -d` หลังตั้ง Environment; ยังไม่ได้สร้าง Compose

### SaaS

ใช้ Compose เดียวบน Public Ubuntu VM พร้อม Production override, HTTPS และ Persistent volume เปิด 443 และ 80 เท่าที่ต้องใช้ Redirect/Certificate challenge จำกัด SSH/Syslog ตามต้นทาง

Certificate ที่เชื่อถือได้เป็นตัวเลือกแนะนำ; Self-signed ยอมรับได้ตามโจทย์เมื่อมีคู่มือชัดเจน ทดสอบ URL จากภายนอกเครื่องจริง ไม่ถือว่า localhost ผ่าน SaaS acceptance

## 11. Tests, Observability และความเสี่ยง

Tests ขั้นต่ำ: Parameterized normalization; Ingest/Search/Tenant isolation; Alert threshold/window/dedup เพิ่ม Retention boundary และ Health smoke

Operational logs ที่เสนอ: Request ID, Source, Tenant ID ที่ไม่เป็น Secret, จำนวน Accepted/Rejected, Parse failure, Worker failure และ Cleanup count ไม่บันทึก Raw sensitive payload ซ้ำโดยไม่จำเป็น

| ความเสี่ยง | วิธีจัดการ |
| --- | --- |
| UDP loss / DB down | Bounded queue, Failure/drop counter, ส่งใหม่ในเดโม; ไม่รับประกัน Exactly once |
| Timestamp ไม่มีปี/Timezone | Source configuration, Tag เมื่ออนุมาน, Fixture ข้ามปี |
| Tenant leakage | Scope กลาง, Composite FK และ Negative tests ทุกเส้นทาง |
| Alert timing / Historical sample | UTC, Fixed-clock tests, Current-time sender แบบ Explicit |
| Query/Upload ใหญ่ | Limits, Index, Pagination และ Transaction สั้น |
| HTTPS/Firewall ล่าช้า | ตรวจ Cloud ตั้งแต่ต้น; ทดสอบภายนอกก่อนวันส่ง |

## 12. สิ่งที่ยังต้องตัดสินใจ/พิสูจน์

- Cloud provider/Region, URL และ Certificate strategy
- Dependency versions และสเปก VM ที่ผ่านการทดสอบจริง
- Source timezone และขอบเขต Parser fixtures
- Limits/Performance จากข้อมูลสังเคราะห์ที่กำหนดจำนวนชัดเจน

เอกสารนี้ไม่ใช่หลักฐานว่าระบบผ่านเกณฑ์แล้ว ติดตามที่ [Acceptance checklist](acceptance-checklist.md)
