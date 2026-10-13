# Schema และ Source Mapping

สถานะ: **ยืนยัน Schema baseline แล้ว ยังไม่มี Database migration ที่รันแล้ว** | 2026-10-13

อิง [การตัดสินใจที่ยืนยันทั้ง 20 ข้อ](architecture.md#confirmed-decisions): 8 ตารางรวม sessions, Partial success, Columns + JSONB + Raw และ Backend tenant scope โดยยังไม่มี RLS

อ้างอิง Assignment §3 Recommended common schema และ §4 Sample logs Schema ในโจทย์ปรับได้ Field/Mapping/Default ด้านล่างเป็นข้อเสนอเพื่อให้ค้นหาร่วมกันได้

## 1. หลักการ

- แยก Event time (`@timestamp`) จาก Server receive time (`received_at`)
- Tenant มาจาก Trusted auth/Collector context ไม่ได้ยึดค่าใน Raw เป็นสิทธิ์
- Typed columns สำหรับ Search/Aggregation; JSONB สำหรับ Source-specific attributes
- Field ที่ไม่มีข้อมูลเป็น Null ไม่สร้าง IP/User/Cloud identity สมมติ
- เก็บ Raw record ก่อน Normalize และไม่ Render เป็น HTML
- Preserve Source event name ไว้ใน `attributes.original_event_type`

## 2. Event contract

| JSON field | DB column/type | Required หลัง Normalize | ความหมาย/Validation |
| --- | --- | --- | --- |
| id | id UUID | ใช่ | Server-generated PK |
| @timestamp | event_timestamp TIMESTAMPTZ | ใช่ | RFC3339 เป็น UTC; นโยบาย Fallback อยู่ข้อ 3 |
| received_at | received_at TIMESTAMPTZ | ใช่ | Server-generated; Client override ไม่ได้ |
| tenant | tenant_id UUID FK | ใช่ | API แสดง Tenant slug; DB อ้าง ID |
| source | source TEXT | ใช่ | firewall, network, api, crowdstrike, aws, m365, ad |
| vendor | vendor TEXT | ไม่ | ผู้ผลิต; ไม่รู้ให้ Null |
| product | product TEXT | ไม่ | ผลิตภัณฑ์; ไม่รู้ให้ Null |
| event_type | event_type TEXT | ใช่ | Canonical category |
| event_subtype | event_subtype TEXT | ไม่ | เช่น login_failed, link_down, CreateUser |
| severity | severity SMALLINT | ใช่ | Integer 0–10; ยิ่งมากยิ่งรุนแรง |
| action | action TEXT | ไม่ | allow/deny/create/delete/login/logout/alert/quarantine และค่าที่ประกาศรองรับ |
| outcome | outcome TEXT | ไม่ | เพิ่มเพื่อกฎ: success/failure/unknown |
| src_ip | src_ip INET | ไม่ | IPv4/IPv6; Unknown เป็น Null |
| src_port | src_port INTEGER | ไม่ | 0–65535 |
| dst_ip | dst_ip INET | ไม่ | IPv4/IPv6 |
| dst_port | dst_port INTEGER | ไม่ | 0–65535 |
| protocol | protocol TEXT | ไม่ | lowercase เช่น tcp/udp |
| user | user_name TEXT | ไม่ | รักษา Domain/email ตามต้นทาง |
| host | host TEXT | ไม่ | ชื่อ Host |
| process | process TEXT | ไม่ | Process name/path |
| url | url TEXT | ไม่ | เก็บเป็นข้อมูล; ไม่ Fetch |
| http_method | http_method TEXT | ไม่ | uppercase หากมี |
| status_code | status_code INTEGER | ไม่ | HTTP 100–599 เมื่อเป็น HTTP status |
| rule_name | rule_name TEXT | ไม่ | ชื่อ Rule ต้นทาง |
| rule_id | source_rule_id TEXT | ไม่ | Rule ต้นทาง ไม่ใช่ FK ของ Alert engine |
| cloud.account_id | cloud_account_id TEXT | ไม่ | เก็บเป็น String |
| cloud.region | cloud_region TEXT | ไม่ | Cloud region |
| cloud.service | cloud_service TEXT | ไม่ | Cloud service |
| raw | raw TEXT | ใช่ | ข้อความ Raw record ก่อน Normalize |
| _tags | tags TEXT[] | ใช่ | Default [] |
| attributes | attributes JSONB | ใช่ | Default {}; Source-specific fields |
| parser_version | parser_version TEXT | ใช่ | เช่น api-v1; ช่วยตรวจ Mapping |

Fields เพิ่มจากโจทย์: id, received_at, outcome, attributes และ parser_version เป็นข้อเสนอ มิใช่ข้อบังคับเดิม การรับ Ingest ต้องปฏิเสธหรือ Ignore Server-owned fields โดยมีสัญญาชัดเจน; ข้อเสนอนี้ให้ Reject `id`/`received_at` ที่ Client พยายามกำหนด

## 3. Timestamp, Severity และ Errors

### Timestamp

- JSON มี RFC3339 ที่ถูกต้อง: รักษาเวลานั้น ไม่เปลี่ยน Historical event เป็นเวลาปัจจุบัน
- ไม่มี Timestamp: ใช้ received_at พร้อม Tag `timestamp_inferred`
- มี Timestamp แต่ Format ผิด: Reject 422 ไม่เงียบแทนด้วยเวลาปัจจุบัน
- Syslog ไม่มีปี/Timezone: ใช้ Source timezone ที่ตั้งไว้ และเลือกปีที่ใกล้ received_at จากปีก่อน/ปัจจุบัน/ถัดไป พร้อม Tag `timestamp_inferred`; เก็บ Timestamp ต้นฉบับใน Raw
- เวลาอนาคต: เก็บถ้ารูปแบบถูกต้องพร้อม Tag `timestamp_future` เมื่อเกิน 5 นาที; Alert ไม่รวม Event ที่มากกว่า Evaluation time
- Live sender ต้องขอใช้เวลาปัจจุบันอย่าง Explicit และเก็บ Sample ต้นฉบับปี 2025 ไว้

### Severity

สำหรับ Source ที่มี 0–10 อยู่แล้ว ให้ Validate แล้วรักษาค่า ค่าเริ่มต้นเมื่อไม่มีคือ 3 พร้อม `severity_defaulted` ห้ามอ้างว่า Default นี้เป็นมาตรฐาน Vendor

Syslog PRI แยก `facility = floor(PRI / 8)` และ `syslog_severity = PRI % 8`; PRI ต้องอยู่ 0–191 Mapping ที่เสนอ:

| Syslog level | 0 emergency | 1 alert | 2 critical | 3 error | 4 warning | 5 notice | 6 info | 7 debug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Common severity | 10 | 9 | 8 | 7 | 5 | 3 | 1 | 0 |

ตัวอย่าง `<134>` มี Facility 16 และ Syslog severity 6 → Common severity 1 เก็บค่าเดิมใน Attributes ไม่ยกระดับเป็น High เพียงเพราะ action=deny

### Validation

Reject Unknown source, Invalid IP/Port, Severity นอกช่วง, Invalid explicit timestamp และ Raw เกิน Limit ค่า Placeholder ที่ประกาศไว้ เช่น `-` แปลงเป็น Null พร้อม Tag; ไม่แปลงข้อความผิดรูปแบบทุกชนิดเป็น Null เงียบ ๆ

HTTP/File batch ใช้ Partial success: หลังผ่าน Authorization แล้ว Validate ทุก Record เก็บรายการที่ผ่านและคืน record_number แบบ 1-based พร้อม Error ของรายการที่ไม่ผ่าน เฉพาะ Valid records เขียนใน Transaction เดียวและรายงาน Accepted หลัง Commit; หาก Transaction ล้มเหลวให้ Rollback ชุด Valid records ไม่รายงานว่ารับสำเร็จ ตาม [HTTP contract](architecture.md#ingestion-contract) ไม่มีตาราง Ingestion batch/history ใน MVP Syslog ที่ Parse ไม่ได้บันทึก Error/Counter แต่ไม่ Insert Event ที่ Normalize ไม่สำเร็จ

## 4. Source mapping

| Source / input | Common mapping | Attributes / ขอบเขต |
| --- | --- | --- |
| Firewall Syslog Key-value | src/dst→IPs, spt/dpt→Ports, proto→protocol, policy→rule_name; event_type=network_connection; action เดิม | facility, syslog_severity, msg; ต้องรักษา Value ที่มีช่องว่าง |
| Router Syslog | host จาก Header; event_type=network_device; event→event_subtype | interface, mac, reason |
| API app_login_failed JSON | event_type=authentication; subtype=login_failed; action=login; outcome=failure; ip→src_ip | reason, original_event_type |
| CrowdStrike sample JSON | event_type=malware_detection; subtype=malware_detected; host/process/severity/action เดิม | sha256; JSON เป็น MVP, CSV เป็น Phase 2 |
| AWS sample แบบย่อ | CreateUser→identity_change; subtype=CreateUser; action=create; cloud.* และ user เดิม | เก็บ nested raw ใน Raw ทั้ง Record; ถ้าไม่มีผลลัพธ์ไม่เดาว่าสำเร็จ |
| AWS CloudTrail Records[] subset | eventTime→timestamp, eventName→subtype, awsRegion→region, recipientAccountId→account, eventSource→service, sourceIPAddress→src_ip เมื่อเป็น IP | userIdentity.arn/userName, errorCode; sourceIPAddress ที่เป็น Service name เก็บ Attributes และ Null IP |
| M365 sample | UserLoggedIn→authentication/login_success; action=login; status Success→outcome success; ip→src_ip; user→user | workload, original_event_type; รูปแบบอื่นเพิ่มเมื่อมี Fixture |
| AD 4625 sample | authentication/login_failed; action=login; outcome=failure; ip/user/host เดิม | event_id, logon_type |
| AD 4624 sample | authentication/login_success; action=login; outcome=success | event_id, logon_type |

API event_type อื่นที่ผ่าน Contract เก็บเป็น `application` และย้ายชื่อเดิมไป event_subtype/attributes.original_event_type สำหรับ Source adapter ที่ไม่รู้จัก Event name ให้ใช้หมวดทั่วไปของ Source พร้อม Preserve original ไม่แต่ง Action/Outcome

AWS ไม่ได้อ้างว่ารองรับ ALB/NLB ทั้งหมด; AD ไม่ได้อ่าน EVTX; M365/CrowdStrike ไม่ได้ต่อ Production API ขอบเขตคือ Assignment samples และ Fixtures ที่จะเพิ่มพร้อม Tests

## 5. ตัวอย่าง Normalized event

ตัวอย่างด้านล่างเป็นข้อมูลสังเคราะห์และ UUID ตัวอย่าง ไม่ใช่ข้อมูลที่ Ingest แล้ว:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "@timestamp": "2025-08-20T11:11:11Z",
  "received_at": "2026-10-13T03:00:00Z",
  "tenant": "demoA",
  "source": "ad",
  "vendor": "Microsoft",
  "product": "Windows Security",
  "event_type": "authentication",
  "event_subtype": "login_failed",
  "severity": 3,
  "action": "login",
  "outcome": "failure",
  "src_ip": "203.0.113.77",
  "user": "demo\\eve",
  "host": "DC01",
  "raw": "{\"source\":\"ad\",\"event_id\":4625,\"event_type\":\"LogonFailed\",\"user\":\"demo\\\\eve\",\"host\":\"DC01\",\"ip\":\"203.0.113.77\",\"logon_type\":3,\"@timestamp\":\"2025-08-20T11:11:11Z\"}",
  "_tags": ["severity_defaulted"],
  "attributes": {
    "event_id": 4625,
    "logon_type": 3,
    "original_event_type": "LogonFailed"
  },
  "parser_version": "ad-v1"
}
```

Tenant และ received_at มาจาก Server context Raw จึงไม่จำเป็นต้องมี Field เหล่านี้ ตัวอย่างใช้ Historical timestamp เพื่อแสดงว่า Normalizer ไม่แก้เวลาโดยพลการ

Raw สำหรับ Syslog คือข้อความที่รับ; JSON/NDJSON เก็บ Record text ก่อน Mapping หาก JSON array parser ไม่รักษา Byte/Whitespace เดิม ให้ระบุว่าเป็น JSON serialization ของ Original record ไม่ใช่สำเนา Byte-for-byte ของไฟล์ ห้ามอ้าง Full-fidelity file archival โดยไม่มีการเก็บไฟล์เดิม

## 6. ตารางฐานข้อมูล

| Table | Columns สำคัญ | Keys / Constraints |
| --- | --- | --- |
| tenants | id UUID, slug TEXT, name TEXT, retention_days INTEGER, created_at TIMESTAMPTZ | PK id; Unique slug; retention_days≥7 |
| users | id UUID, tenant_id UUID, email TEXT, password_hash TEXT, role TEXT, is_active BOOLEAN, created_at TIMESTAMPTZ | PK; FK tenant; Unique normalized email; role admin/viewer |
| sessions | sid TEXT, user_id UUID NULL, data JSONB, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ | PK sid; FK user ON DELETE CASCADE; Index expires_at และ user_id; Null user เฉพาะ Pre-auth CSRF session |
| events | Fields ตามข้อ 2 | PK id; FK tenant; CHECK source/severity/ports; Unique (tenant_id,id) |
| api_keys | id UUID, tenant_id UUID, name TEXT, key_prefix TEXT, key_hash TEXT, allowed_sources TEXT[], revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ | PK; FK tenant; Unique key_hash |
| alert_rules | id UUID, tenant_id UUID, name TEXT, rule_type TEXT, threshold INTEGER, window_seconds INTEGER, enabled BOOLEAN, created_by UUID, created_at TIMESTAMPTZ | PK; FK tenant/user; Unique (tenant_id,id); threshold/window>0 |
| alerts | id UUID, tenant_id UUID, rule_id UUID, group_key TEXT, observed_count INTEGER, window_start/end TIMESTAMPTZ, first_seen/last_seen TIMESTAMPTZ, status TEXT, details JSONB | PK; FK tenant; Composite FK (tenant_id,rule_id)→alert_rules; Unique (tenant_id,id) |
| alert_state | tenant_id UUID, rule_id UUID, group_key TEXT, last_triggered_at TIMESTAMPTZ, active_alert_id UUID | Composite PK (tenant_id,rule_id,group_key); Composite FKs Rule/Alert ใน Tenant เดียว |

sessions เป็น Server-side session store; sid เป็น Opaque random ID ที่สร้างด้วย Session library เก็บใน HttpOnly cookie ไม่ใช่ Password หรือ JWT; data เก็บเฉพาะข้อมูล Session/CSRF ที่จำเป็น ไม่คัดลอก Password/API key ค่า Role/Tenant ที่ใช้อนุญาตต้องอ่านจาก User ปัจจุบัน ไม่เชื่อค่าที่ค้างใน Session การปรับ Columns ให้เข้ากับ PostgreSQL session adapter ทำได้โดยต้องรักษาพฤติกรรม Expiration/Rotation/Logout และจำนวนตารางที่ตกลงไว้

Admin มี Home tenant ใน users แต่การเลือก Tenant อื่นผ่าน Platform-admin authorization ไม่ได้เปลี่ยน Home tenant API keys ไม่ได้รับสิทธิ์ข้าม Tenant แม้ Admin เป็นผู้สร้าง

ไม่ Hard-delete Rules ที่มี Alerts อ้างอยู่ใน MVP ใช้ enabled=false; รายการ Event ID ใน Alert details เป็น Snapshot reference ที่อาจหมดอายุตาม Retention

## 7. Index strategy

| Table / Index | ใช้กับ |
| --- | --- |
| events (tenant_id, event_timestamp DESC, id DESC) | Search, Cursor, Time filter |
| events (tenant_id, source, event_timestamp DESC) | Source filter |
| events (tenant_id, src_ip, event_timestamp DESC) | IP search และ Failed-login window |
| events (tenant_id, user_name, event_timestamp DESC) | User search เมื่อมี Query ใช้จริง |
| events (received_at) | Retention cleanup |
| events GIN(attributes) | Optional เมื่อมี JSON containment query ไม่สร้างเพียงเพื่อให้มี GIN |
| alert_rules (tenant_id, enabled) | Worker โหลดกฎ |
| alerts (tenant_id, last_seen DESC) | Alerts page |

ใช้ Parameterized SQL ทุก Query และตรวจ EXPLAIN กับข้อมูลสังเคราะห์ก่อนเพิ่ม Index ไม่ทำ Partition ใน MVP และไม่รับรอง Performance ที่ยังไม่ได้วัด

## 8. Tests ที่ต้องเพิ่ม

- Fixtures ครบ 7 Source identifiers และแปลง Failed login จาก API/AD เป็นหมวดเดียวกัน
- Syslog PRI 134, Value มีช่องว่าง, Timestamp ข้ามปี/Timezone
- IPv4/IPv6, Invalid IP, Port 65535, Severity boundaries และ Unknown source
- Historical timestamp ไม่ถูกเปลี่ยน; Missing timestamp มี Tag; Invalid timestamp Reject
- Raw ยังตรวจเหตุการณ์ต้นทางได้; JSON ตัวอย่างและ Escaping ถูกต้อง
- Payload Tenant ขัดกับ Auth context ไม่ Insert; Composite FK ป้องกัน Rule/Alert ต่าง Tenant
- Retention ใช้ received_at ไม่ใช่ event_timestamp
- Partial success: จำนวน accepted/rejected รวมเท่ากับจำนวน Records ที่ประมวลผลและเชื่อม record_number กับต้นฉบับได้; บันทึกเฉพาะ Valid records; Retry เฉพาะ Invalid records ไม่ทำรายการที่รับแล้วซ้ำ
- Session อยู่หลัง Refresh; Expire/Logout/Inactive user ใช้ต่อไม่ได้; CSRF ปฏิเสธการเปลี่ยนข้อมูล; Login เปลี่ยน Session ID
