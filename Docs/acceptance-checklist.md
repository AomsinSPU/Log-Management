# Acceptance Checklist และแผนหลักฐาน

สถานะ 2026-10-14: **มี Backend วันที่ 2 และ Integration tests ผ่าน 12/12 บน PostgreSQL WASM; Docker Compose/PostgreSQL 17 smoke test ผ่าน 42 HTTP status checks พร้อม Persistence หลัง Restart; ยังไม่ได้ตรวจ Acceptance เต็มระบบ** ดู [หลักฐาน Backend](day2-backend.md) และ [Docker smoke test](docker-smoke-test.md) ส่วน Oracle VM ยังติด Capacity ตาม [Cloud readiness](cloud-readiness.md)

อ้างอิง Assignment §2 Scope, §6 Deliverables, §7 Acceptance และ §8 Scoring คำว่า Target คือแผน ไม่ใช่ผลที่ยืนยันแล้ว

## 1. วิธีใช้

- สถานะ: NOT RUN / PASS / FAIL / BLOCKED
- เปลี่ยนเป็น PASS เมื่อทำตามขั้นตอนกับระบบจริงและมีหลักฐาน
- บันทึก Commit, Environment, เวลา, ผู้ทดสอบและหลักฐานทุกครั้งที่ตรวจรอบส่งมอบ
- ห้ามนำความสำเร็จของการอ่านเอกสารมาแทนการผ่าน System acceptance
- เอกสารและ Screenshots ต้องไม่แสดง Password, Token หรือ API key

## 2. Acceptance ตามโจทย์ทั้ง 8 ข้อ

| ID | เกณฑ์ / Preconditions / วิธีทดสอบ | ผลที่ต้องได้ | หลักฐานที่ต้องเก็บ | Target | Status |
| --- | --- | --- | --- | --- | --- |
| A1 | เครื่อง/VM สะอาดตามสเปก; ทำตาม setup_appliance และเปิด Compose | เปิดระบบได้ด้วยหนึ่งคำสั่งหรือไม่กี่ขั้น; Login ได้; ไม่อาศัย Dependency ที่คู่มือไม่บอก | Commands, Health, Spec, Commit | วัน 8 | NOT RUN |
| A2 | ระบบพร้อมและ UDP port เปิด; ส่ง Syslog ด้วย logger/nc หรือ Sender script แล้วค้นใน UI | เห็น Event ภายใน 60 วินาทีพร้อม Raw/Normalized | เวลาส่ง/เวลาแสดง, Event ID, Screenshot | วัน 3–5 | NOT RUN |
| A3 | API key ของ Tenant A; POST /ingest ด้วย JSON ตัวอย่างแล้วค้นหา | ตอบสำเร็จหลัง Commit; ค้น Record ถูก Tenant ได้ | Request ที่ Redact secret, Response, Search result | วัน 3–5 | NOT RUN |
| A4 | มี AWS/M365/AD fixtures; Upload แต่ละ Source ผ่านระบบ | ทั้ง 3 กลุ่ม Normalize ได้และ Raw ยังอยู่ ไม่ใช่ Seed SQL | Upload result และ Field mapping ของแต่ละ Source | วัน 4–5 | NOT RUN |
| A5 | Seed/Sender ทำข้อมูล A/B หลาย Source/เวลา; ใช้ Dashboard filters | Top IP/User/Event Type, Timeline และ Tenant/Source/Time เปลี่ยนตรงข้อมูลจริง | Expected counts เทียบ UI/API | วัน 5 | NOT RUN |
| A6 | Admin สร้าง Rule ผ่าน UI/API; ส่ง Failed login ถึง Threshold | เห็น Alert ใน UI ที่มี Rule/IP/Count/Window ถูกต้อง | Rule request, Sender result, Alert screenshot | วัน 6 | NOT RUN |
| A7 | Viewer A/B และ Logs แยก Tenant; Login A แล้วพยายามอ่าน B | A เห็นเฉพาะ A ทั้ง UI และ API ตรง | Negative tests และ Redacted API responses | วัน 2,7 | NOT RUN |
| A8 | SaaS บน Public cloud; เปิด URL จาก Network ภายนอก | HTTPS Login/Search ใช้งานได้; Self-signed ต้องมีคู่มือชัด | URL, Certificate info, Screenshot, เวลา | วัน 8 | NOT RUN |

## 3. Scope ที่ต้องตรวจเพิ่มจาก Acceptance

- [ ] S1 — 4 เส้นทาง Ingest จริง: Firewall UDP, App HTTP, AWS file, AD simulator
- [ ] S2 — ครบ Source groups: Firewall/Network, API, CrowdStrike, AWS, M365, AD พร้อม Fixture
- [ ] S3 — อย่างน้อย 2 โปรโตคอล: Syslog/UDP และ HTTP/HTTPS; ไม่นับ File เป็นโปรโตคอลเพิ่ม
- [ ] S4 — Normalize ก่อน Storage; Query ครอบคลุม Fields หลักและ Raw
- [ ] S5 — Admin/Viewer ใช้งานได้และ Backend ตรวจ Write permission
- [ ] S6 — Retention ≥7 วันตาม received_at ที่ออกแบบ; มี Boundary test
- [ ] S7 — Appliance baseline Ubuntu 22.04+, 4 vCPU, RAM 8 GB, Disk 40 GB และพอร์ตจำเป็นในคู่มือ
- [ ] S8 — ข้อมูลคงอยู่หลัง Restart Compose; ไม่มี DB port เปิด Public

ทุกข้อในส่วนนี้ยัง NOT RUN Checkbox ที่ไม่ติ๊กไม่ได้หมายถึง FAIL แต่ยังไม่มีหลักฐาน

## 4. Security/Failure tests ที่เสนอ

ส่วนนี้เป็นวิธีพิสูจน์ข้อกำหนดและ Hardening ที่เสนอ ไม่ใช่ Acceptance เพิ่มจากโจทย์

| ID | กรณีทดสอบ | Expected |
| --- | --- | --- |
| T1 | Viewer A ส่ง tenant=B ผ่าน Query/Header/Body | 403 หรือ Input ถูกปฏิเสธตาม Contract; ไม่เห็น/ไม่เขียน B |
| T2 | Viewer A เปิด Event ID ของ B | 404; ไม่ส่ง Raw/Metadata ของ B |
| T3 | Viewer A เรียก Dashboard/Alerts/Rules ของ B | ไม่รั่วทั้งรายละเอียดและ Aggregate counts |
| T4 | Viewer เรียก Create/Patch rule หรือ File upload | 403 |
| T5 | API key A ส่ง Payload tenant=B หรือ Source ที่ไม่ได้รับอนุญาต รวม Mixed batch | 403 และไม่มี Event ใน Request ถูก Insert; ตรวจ Authorization ก่อน Partial validation |
| T6 | Session หมดอายุ, ไม่มี/ปลอม Cookie, Session ถูกลบหรือ User inactive | 401; ไม่คืนข้อมูลจาก Session ที่ไม่ถูกต้อง |
| T7 | Raw มี HTML/script และ Search มี SQL-like text | แสดง Text อย่างปลอดภัย; Query ไม่ถูกเปลี่ยนความหมาย |
| T8 | JSON envelope เสีย, Mixed valid/invalid batch, ไฟล์เกิน Limit | Envelope ผิด/เกิน Limit ไม่เขียน; Mixed batch บันทึก Valid records และคืน accepted/rejected/results ตรงกับ Record ต้นฉบับหลัง Commit |
| T9 | DB ไม่พร้อมระหว่าง HTTP ingest | ไม่ตอบ Accepted; 503 หรือ Error ที่ประกาศไว้ |
| T10 | Alert ต่ำกว่า Threshold/ครบ Threshold/คนละ Tenant/คนละ IP | นับถูก Scope และเงื่อนไข |
| T11 | Worker ประเมินซ้ำหรือ Restart ใน Cooldown | ไม่สร้าง Alert ซ้ำ |
| T12 | Event time ตรงขอบ Window, มาช้า, อยู่อนาคต | เป็นไปตามช่วง (evaluation-window,evaluation] |
| T13 | received_at อายุ <7 วัน, =7 วัน, >7 วัน | เก็บสองกรณีแรก ลบเฉพาะเกิน 7 วัน |
| T14 | Event เก่าปี 2025 แต่เพิ่งรับวันนี้ | ไม่ถูก Retention ลบทันที; ค้นด้วย Historical range ได้ |
| T15 | Login แล้ว Refresh หน้า จากนั้น Logout และใช้ Cookie เก่า | Refresh ยัง Login; Logout ลบ Session ฝั่ง DB; Cookie เก่าได้ 401 |
| T16 | Session-authenticated POST/PATCH/DELETE/Upload ไม่มีหรือปลอม CSRF token | 403; ไม่มีการเปลี่ยนข้อมูล; ทดสอบ Login CSRF และ Session ID rotation ด้วย |
| T17 | Partial success 99/100 แล้วส่งใหม่เฉพาะ Record ที่แก้ไข | รอบแรก Insert 99; รอบสอง Insert 1; Response ชี้ Record ที่ผิดได้; ไม่มีการส่ง 99 รายการแรกซ้ำ |
| T18 | Search ด้วย Filters, Cursor, Limit และ IP | Default 50, Maximum 100; เรียงเวลา/ID; ไม่มีการหลุด Tenant; Filters ใช้กติกาเดียวกับ Dashboard |
| T19 | สร้าง/เพิกถอน API key และใช้ Key หลังเพิกถอน | แสดง Key เต็มเฉพาะตอนสร้าง; Hash ใน DB; Key เพิกถอนส่งข้อมูลไม่ได้ |

สถานะ T1–T19: NOT RUN; เพิ่มไฟล์ Tests/ผลรันเมื่อ Implementation พร้อม การยืนยัน Design ไม่เปลี่ยนสถานะเป็น PASS

## 5. Deliverables

- [ ] Git repository พร้อม Source ใน backend/frontend/ingest และ README ของแต่ละส่วน
- [ ] Architecture diagram, Data flow และ Tenant model ที่ตรงกับระบบจริง
- [ ] Docs/setup_appliance.md ผ่าน Clean install
- [ ] Docs/setup_saas.md ผ่าน Deploy/HTTPS ภายนอก
- [ ] docker-compose.yml และ Initialization/Seed scripts
- [ ] .env.example ไม่มี Secret จริง และ Makefile หรือ run.sh
- [ ] samples/ พร้อมไฟล์ตัวอย่างและ Sender scripts
- [ ] tests/ อย่างน้อย 2–3 เคสพร้อมวิธีรัน
- [ ] วิดีโอเดโม 30 นาที
- [ ] SaaS URL และวิธี Spin-up Appliance; OVA เป็นทางเลือก
- [ ] Postman/Insomnia Collection ถ้ามี (Optional)
- [ ] นัดหมายส่งงาน/สัมภาษณ์ภายใน 10 วันหลังเห็น Assignment

README/Architecture/Schema/Checklist ใน Commit เอกสารร่างไม่เท่ากับ Deliverables ทั้งหมดเสร็จ

## 6. คะแนนและหลักฐาน

| หมวด | คะแนนตามโจทย์ | หลักฐานเป้าหมาย |
| --- | --- | --- |
| Architecture & Documentation | 15 | Diagram, Rationale, Data flow, คู่มือ |
| Ingestion | 20 | 4 เส้นทางสด, หลาย Format/Protocol, Sender scripts |
| Normalization/Schema | 10 | Mapping และ Fixtures ทุก Source |
| Storage & Query | 10 | Query ถูกต้อง, Pagination, Index/Query plan |
| Dashboard/UI | 10 | Top N, Timeline, Filters |
| Alerting | 10 | Create rule และ Alert จริง |
| Security | 10 | RBAC/Tenant tests และ TLS |
| Deployment | 10 | Appliance + SaaS ใช้งานจริง |
| Tests & DX | 5 | Tests, Scripts, Env example |
| รวม | 100 | ยังไม่ได้ประเมินคะแนนจริง |

ผ่านขั้นต่ำ 60; Strong Hire ≥85 พร้อมอธิบาย Design rationale Bonus สูงสุด +10: แยก Index/Table ต่อ Tenant, Enrichment, CI/CD, IaC, Observability, Hardening ไม่ควรแลก Acceptance หลักกับ Bonus

## 7. เดโม 30 นาทีที่เสนอ

| นาที | เนื้อหา |
| --- | --- |
| 0–3 | Architecture และขอบเขต |
| 3–6 | Appliance startup, Health, Login |
| 6–9 | Syslog เข้า UI ภายใน 1 นาที |
| 9–11 | POST /ingest และ Search |
| 11–15 | AWS/M365/AD upload และ Source อื่น |
| 15–18 | Raw/Normalized, Search/Detail |
| 18–21 | Dashboard และ Filters |
| 21–24 | Create rule, AD simulator, Alert |
| 24–27 | Viewer/Tenant negative tests |
| 27–29 | SaaS HTTPS จากภายนอก |
| 29–30 | Tests, Retention, ข้อจำกัด |

## 8. แบบบันทึกผลรอบส่งมอบ

| รายการ | ค่า |
| --- | --- |
| Commit SHA | ยังไม่มีผลทดสอบระบบ |
| Environment / Machine spec | ยังไม่ระบุ |
| วันที่/ผู้ทดสอบ | ยังไม่ระบุ |
| Acceptance ที่ PASS | ไม่มีการทดสอบ |
| Acceptance ที่ FAIL/BLOCKED | ยังไม่ประเมิน |
| Tests command / Result | `npm test`: 12/12 PASS เฉพาะ Backend วันที่ 2; ไม่ใช่ผลตรวจรับเต็มระบบ |
| Demo URL / Video URL | ยังไม่มี |
| หลักฐานและข้อจำกัดคงเหลือ | เติมเมื่อทดสอบจริง |
