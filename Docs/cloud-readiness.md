# Cloud readiness — Oracle Cloud และงานที่เหลือ

สถานะวันที่ 14 ตุลาคม 2026 (Asia/Bangkok): ผู้ใช้เลือก Oracle Cloud สำหรับลองทำ SaaS แบบฟรีและเข้าถึง Console เพื่อเตรียมสร้าง VM แล้ว การสร้าง A1.Flex ใน Singapore AD-1 ครั้งล่าสุดไม่สำเร็จเนื่องจากไม่มี Capacity; ยังไม่มีหลักฐาน VM Running, Public IP ที่จัดสรรแล้ว หรือ SSH สำเร็จ

## ความคืบหน้าที่มีหลักฐาน

สรุปจากแชต “สรุปความคืบหน้าและงานที่ค้าง” และภาพ Console ที่ผู้ใช้ส่งในวันที่ 14 ตุลาคม 2026 ไม่ใช่การตรวจ Console สดในรอบอัปเดตเอกสารนี้

| รายการ | สถานะล่าสุด |
| --- | --- |
| Provider / Region | เลือกลอง Oracle Cloud, Singapore, AD-1; ยังคงต้องการใช้แบบฟรี |
| Billing / สิทธิ์ฟรี | ยังต้องเก็บหลักฐาน Plan, Quota และค่าใช้จ่ายจากบัญชีจริง; ไม่ Upgrade เป็น Paid อัตโนมัติ |
| VM configuration | เตรียม Ubuntu 24.04, A1.Flex (ARM), 2 OCPU / RAM 12 GB, Boot volume 50 GB / VPU 10 |
| Network | มี VCN/Subnet ตามภาพและเลือก Public IPv4 = Yes; ยังไม่ได้ตรวจ Internet Gateway/Route หรือ IP ที่จัดสรรจริง |
| SSH key | มี Public key ใน Workspace และเลือก Key ใน Console; Private key/download และ SSH ใช้งานจริงยังต้องยืนยัน ไม่ใส่ Key ใน Git |
| Create VM | พบข้อผิดพลาด Capacity ของ A1.Flex ใน Singapore AD-1; ยังไม่สร้างสำเร็จ |
| ทางเลือกที่เสนอในแชต | ลอง 1 OCPU / RAM 6 GB หรือ Save as stack แล้วลองใหม่ภายหลัง; ยังไม่มีหลักฐานว่าลองขนาดนี้หรือบันทึก Stack แล้ว |
| HTTPS / Domain | ยังไม่มี SaaS URL หรือ Certificate; Public IP + Self-signed เป็นข้อเสนอเดิมที่ยังต้องยืนยัน |
| Local development | Backend Compose ผ่านบน linux/amd64 พร้อม PostgreSQL 17; ดู [Docker smoke test](docker-smoke-test.md) |

Compose ที่ผ่านบนเครื่องนี้ยังไม่พิสูจน์การ Build/Run บน Oracle ARM โดยเฉพาะ Native dependency เช่น Argon2 ต้องตรวจบน ARM เมื่อมี VM ขนาด 1 OCPU / 6 GB ที่เสนอให้ลองก็ยังไม่ได้พิสูจน์ว่ารองรับระบบเต็ม และ RAM ต่ำกว่า Appliance baseline 8 GB

## ขั้นตอนถัดไป

1. ลองจัดสรร A1.Flex ใหม่เมื่อมี Capacity และบันทึกขนาดที่สร้างได้จริง; หากใช้ Save as stack ให้ยืนยันว่าบันทึกแล้ว
2. เก็บหลักฐาน Billing mode, สิทธิ์ฟรี, Quota และ Estimate รวม Disk/IP/Network โดยไม่เปิดเผยข้อมูลส่วนตัว
3. เมื่อ VM Running ให้ตรวจ Public IP, Internet Gateway/Route, SSH และ Firewall ตามแผนด้านล่าง
4. ทดสอบ Docker/Compose บน ARM, Migration/Seed และทรัพยากรที่ใช้งานจริง
5. ยืนยัน HTTPS path แล้วทำ Deployment และตรวจจาก Network ภายนอกในงานวัน 8

ระหว่างรอ VM ให้เดินงาน Ingestion/Frontend ต่อบน Docker ในเครื่อง Cloud readiness ยังไม่ครบและ Acceptance A8 ยังเป็น NOT RUN

## ข้อเสนอเดิมก่อนเลือก Oracle (บันทึกอ้างอิง)

เดิมเสนอ **Google Cloud Free Trial** สำหรับช่วง Assignment/เดโมก่อนผู้ใช้เลือกลอง Oracle ข้อมูลเปรียบเทียบด้านล่างเป็นบันทึกการวิจัยวันที่ 14 ตุลาคม 2026 ไม่ใช่การยืนยันสิทธิ์บัญชีจริงหรือ Provider ที่กำลังใช้งาน ต้องตรวจเงื่อนไขใหม่หากเปลี่ยน Provider

| ทางเลือก | เงื่อนไขจากเอกสารทางการ | ความเหมาะสมกับงาน |
| --- | --- | --- |
| Google Cloud Free Trial | เครดิต $300 / 90 วันสำหรับผู้มีสิทธิ์; ต้องยืนยัน Payment method; ไม่เรียกเก็บเงินระหว่าง Trial; ไม่ Upgrade แล้วเครดิต/เวลาหมด Resources จะหยุด | ทางเลือกแรกสำหรับเดโมระยะสั้น; ตรวจ Quota และราคาจริงของ VM/Disk/IP/Network ก่อนสร้าง |
| AWS Free account plan | ลูกค้าใหม่ได้ $100 ตอนสมัคร และทำกิจกรรมเพื่อรับเพิ่มได้ถึง $100; สิ้นสุดเมื่อครบ 6 เดือนหรือเครดิตหมดก่อน; Free plan ไม่คิดค่าบริการจน Upgrade | ทางเลือกสำรอง; ต้องตรวจว่า Service/Instance ที่ต้องการเปิดใช้ได้ใน Free plan และ Region ที่เลือก |
| Oracle Always Free A1 | เอกสารปัจจุบันระบุ 1,500 OCPU-hours และ 9,000 GB-hours ต่อเดือน เทียบเท่า 2 OCPU/12 GB สำหรับ Always Free tenancy; ต้องสร้างใน Home region; อาจไม่มี Capacity | เหมาะพิจารณาถ้าต้องการใช้ฟรีต่อเนื่อง แต่ ARM build/native dependencies ต้องพิสูจน์ และ CPU ต่ำกว่า Baseline 4 vCPU ที่วางไว้ |
| Google Cloud Always Free | e2-micro ใน US regions ที่กำหนด, Standard persistent disk 30 GB-months | ไม่เลือกเป็น VM หลักของระบบนี้: Disk ต่ำกว่า Baseline 40 GB และต้องพิสูจน์ทรัพยากรสำหรับทั้ง Compose |

แหล่งอ้างอิง: [Google Cloud Trial/Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features), [AWS Free Tier FAQ](https://aws.amazon.com/free/free-tier-faqs/), [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

ไม่ใช้ข้อมูล Oracle รุ่นเก่า 4 OCPU/24 GB เป็นสัญญาว่า Account ใหม่จะได้ฟรีตามนั้น ให้ยึดสิทธิ์จริงใน Console และเอกสารปัจจุบัน

## Baseline เดิมสำหรับทางเลือก VM x86_64

- Ubuntu 24.04 LTS x86_64, 4 vCPU, RAM อย่างน้อย 8 GB, Disk อย่างน้อย 40 GB เพื่อใช้ Baseline เดียวกับ Appliance
- ใช้ VM เดียวและ Compose เดิม ไม่มี Managed database, Load balancer หรือ Kubernetes ในเส้นทางหลัก
- เดิมเสนอ Region ใกล้ไทย เช่น Singapore; ปัจจุบันเลือกลอง Singapore บน Oracle ตามสถานะด้านบน แต่ยังไม่มี VM
- ค่า VM/Disk/Public IP/Outbound รวมต้องอยู่ในเครดิตตลอดช่วงเดโม ตรวจด้วย Pricing calculator และ Console ก่อนสร้าง; ยังไม่มี Estimate ที่ยืนยันกับ Account จริง
- เก็บสถานะ Free Trial/Free plan; ไม่ Upgrade เป็น Paid เพื่อผ่าน Quota โดยอัตโนมัติ ตั้ง Budget notification และบันทึกวันหมดอายุเครดิต Budget notification ไม่ใช่ Hard spending cap

## HTTPS โดยยังไม่ซื้อโดเมน

Assignment ยอมรับ Self-signed certificate เมื่อมีคู่มือชัดเจน จึงเสนอใช้ Public IP + Self-signed ที่มี IP SAN ในรอบเดโมแรก ระบุวิธี Trust certificate และตรวจจาก Network ภายนอกในวัน 8

ถ้าภายหลังมี Domain/Subdomain ที่ควบคุม DNS ได้ ให้เลือก Certificate ที่ Browser เชื่อถือได้ เช่น Let's Encrypt; วิธี HTTP-01 ใช้ Port 80 ตาม [เอกสาร Challenge types](https://letsencrypt.org/docs/challenge-types/) ยังไม่ออก Certificate ในงานวันที่ 1

## Cloud preflight ที่ต้องมีหลักฐานก่อนปิดวันแรก

- [x] ผู้ใช้เลือกลอง Oracle Cloud และเข้าถึง Console เพื่อเตรียมสร้าง VM
- [x] เลือก Singapore AD-1 และ A1.Flex (ARM) สำหรับคำขอสร้างล่าสุด
- [ ] ยืนยัน Billing mode, สิทธิ์ฟรี และ Quota จากบัญชีจริง
- [ ] ตรวจ Estimate ทั้ง VM/Disk/IP/Network เทียบเครดิตและระยะเดโม
- [ ] เลือก HTTPS path: Public IP + Self-signed หรือ Domain + Trusted certificate
- [x] เตรียม Public key และเลือก Key ใน Console; เก็บไฟล์ในเครื่องโดย Git ignore
- [ ] ยืนยัน Private key ที่เก็บไว้และ SSH เข้า VM สำเร็จ
- [ ] วาง Firewall: Web TCP 80/443; SSH TCP 22 เฉพาะต้นทางที่ใช้; Syslog UDP 5514 เฉพาะ Sender; DB 5432/Backend 3000 ไม่เปิด Public
- [ ] ยืนยันว่า Console สามารถสร้าง VM เป้าหมายได้โดยไม่มีการ Upgrade เป็น Paid; ถ้ายังไม่มี VM ให้ระบุ Capacity ว่ายังไม่พิสูจน์
- [ ] บันทึก Plan/Region/Quota/Estimate/HTTPS decision และวันสิ้นสุด Trial โดย Redact ข้อมูลส่วนตัว

วันที่ 1 ต้องมีแผนและความพร้อมที่ตรวจได้ ส่วน SSH เข้าถึงจริง, Docker install, Clean deployment, HTTPS และ A8 external access เป็นหลักฐานวัน 8 หาก Provision ก่อนวันนั้นให้บันทึกแยก ไม่ทำเครื่องหมาย A8 ผ่านล่วงหน้า
