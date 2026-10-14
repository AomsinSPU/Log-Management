# วันที่ 1 — Foundation และความพร้อมก่อนพัฒนา

ตรวจวันที่ 14 ตุลาคม 2026 (Asia/Bangkok) หลังผู้ใช้ขอให้ย้อนมาปิดงานวันที่ 1 ก่อน

ขอบเขตวันที่ 1 คือ Architecture/Schema, Repository, Compose skeleton และตรวจความพร้อม Cloud ไม่รวมการ Deploy เต็มระบบของวันที่ 8 ผลด้านล่างแยกการเตรียมแผนออกจากการทดสอบจริง

## Checklist และหลักฐาน

| ID | ผลลัพธ์วันที่ 1 | สถานะ | หลักฐาน/สิ่งที่เหลือ |
| --- | --- | --- | --- |
| D1-01 | ขอบเขต MVP และ Design baseline | PASS | architecture.md มีข้อตกลง 20 ข้อ, Data flow, Auth/Tenant, Ingestion contract, Alert/Retention และ Deployment |
| D1-02 | Common schema และ Source mapping | PASS | schema.md ครบ Fields, 7 Source identifiers, Timestamp/Severity policy, 8 Tables, Constraints และ Index strategy |
| D1-03 | เกณฑ์ตรวจรับและลำดับงาน | PASS | acceptance-checklist.md มี A1–A8, Scope/Security tests และ README มีแผน 10 วัน |
| D1-04 | Repository และ Backend build skeleton | PASS | Git repository มี origin, package-lock.json, TypeScript, Dockerfile และ Backend source; ไม่เปลี่ยน Migration ที่ Apply แล้ว |
| D1-05 | แยก Secrets/Generated files | PASS | .gitignore แยก .env, keys, node_modules และ dist; .env.example ไม่มี Seed passwords; รอบ Docker smoke test สร้าง .env แบบ Git ignore ด้วย Secrets สุ่มแล้ว |
| D1-06 | Compose skeleton และ Dependency order | PASS (ตรวจไฟล์) | compose.yaml มี postgres → migrate → seed → backend, DB healthcheck, Named volume, ไม่ Publish 5432 และ Backend ผูก localhost |
| D1-07 | Docker/Compose พร้อมใช้ใน Environment ที่จะตรวจ | PASS (Backend smoke test) | WSL2 docker-desktop Running, Docker Client/Engine 29.8.2, Compose v5.6.0; compose config --quiet ผ่านด้วยค่า Placeholder ชั่วคราว; Build/Start Backend Compose ผ่านแล้ว ดู docker-smoke-test.md |
| D1-08 | ตรวจทางเลือก Cloud แบบฟรี | PASS (วิจัย) | cloud-readiness.md เปรียบเทียบ Trial/Always Free จากแหล่งทางการตามคำขอผู้ใช้ |
| D1-09 | เลือก Cloud และยืนยัน Account/Quota/Region/HTTPS path | PENDING | เลือกลอง Oracle Cloud และเตรียม A1.Flex ใน Singapore AD-1 แล้ว; Create ครั้งล่าสุดติด Capacity จึงยังไม่มี VM/SSH/HTTPS; Billing/Quota/Estimate ยังต้องยืนยัน ดู cloud-readiness.md |

PASS ของเอกสารและ Skeleton ไม่ทำให้ A1/A8 ผ่าน และไม่ยืนยันว่าระบบ Deploy ได้แล้ว วันที่ 1 ยังเหลือ D1-09 ซึ่งต้องยืนยัน Cloud account/Quota/แนวทาง HTTPS

## Compose skeleton กับโครงสุดท้าย

| Service | ตอนนี้ | งานที่จะเติมตามแผน |
| --- | --- | --- |
| postgres | มี Image, Volume, Healthcheck | ผ่าน PostgreSQL 17 container และ Persistence หลัง Restart; ดู docker-smoke-test.md |
| migrate / seed | มี One-shot services | ผ่านการเริ่ม Backend Compose จาก Volume ใหม่; Ubuntu clean install เต็มระบบยังต้องตรวจ |
| backend | มี Dockerfile, Healthcheck, Auth/Scoped API | Ingest/Search/Dashboard/Alerts ตามวัน 3–6 |
| collector | ยังไม่มี Runtime | UDP listener + Shared parsers วัน 3–4 |
| worker | ยังไม่มี Runtime | Alert วัน 6 และ Retention วัน 7 |
| nginx | ยังไม่มี Runtime | Serve React build/Proxy/TLS วัน 8 |

ไม่เพิ่ม Service ที่เรียกไฟล์ Runtime ซึ่งยังไม่มีลงใน Compose ที่ใช้รันจริง Frontend build จะมาพร้อมงานวันที่ 5; โครงสุดท้ายยังคงเป็น 5 Continuous services และ 2 One-shot services ตามที่ยืนยัน

## Environment ที่ตรวจได้

- Windows Workspace: Node.js v24.19.0, npm 11.17.0; มี Git และ OpenSSH client ใน PATH
- ตรวจซ้ำหลังผู้ใช้ติดตั้ง: WSL default version 2 และ docker-desktop Running; Docker Desktop 4.95.0, Client/Engine 29.8.2, Compose v5.6.0, Server linux/amd64
- Docker CLI อยู่ที่ `C:\Users\Aomsin\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe` แต่ PATH ของ Shell ใน Chat นี้ยังไม่เห็น จึงตรวจด้วย Absolute path
- Preflight เดิมใช้ Placeholders เท่านั้น; รอบ Docker smoke test ใช้ .env จริงที่ Git ignore และ Build/Start สำเร็จแล้ว
- ไม่พบ AWS CLI, Azure CLI หรือ gcloud ใน PATH ตอนตรวจครั้งแรก ผลนี้เป็นการตรวจครั้งแรก; ปัจจุบันผู้ใช้เข้าถึง Oracle Console แล้วตามแชตล่าสุด
- มี node_modules; รอบ Docker smoke test สร้าง .env ด้วย Secrets สุ่มและ Seed บัญชี Local แล้ว; รายการ Cloud ให้เทียบแชตล่าสุด
- ผล Backend tests เดิมอยู่ใน day2-backend.md; รอบตรวจวันที่ 1 นี้ไม่ได้รันทดสอบ Backend ซ้ำ

## ขั้นตอนปิดรายการที่เหลือ

1. Docker Backend บนเครื่องผ่านแล้ว ดู [ผลตรวจ](docker-smoke-test.md); ไม่ต้องทำ Preflight เดิมซ้ำเพื่อปิดรายการนี้
2. รอหรือลองจัดสรร Oracle A1.Flex ใน Singapore AD-1 ใหม่ แล้วบันทึกขนาด VM ที่สร้างได้จริง
3. ยืนยัน Billing mode/สิทธิ์ฟรี/Quota/Estimate และ HTTPS path ตาม [Cloud readiness](cloud-readiness.md)
4. เมื่อ VM พร้อมให้ตรวจ SSH, Network/Firewall และ Docker บน ARM ก่อน Deployment วัน 8
5. บันทึกหลักฐานโดยไม่ใส่ Password, Private key, Token หรือข้อมูลส่วนตัวใน Repository

แหล่งติดตั้ง: [Docker Engine บน Ubuntu](https://docs.docker.com/engine/install/ubuntu/) และ [Docker Compose](https://docs.docker.com/compose/install/)
