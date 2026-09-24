# ก่อนสอบ — Data Analytics and Data Mining

เว็บทบทวนบทเรียนและทำแบบทดสอบ สร้างด้วย HTML, CSS และ JavaScript แบบ static ไม่มีขั้นตอน build หรือ package install

## GitHub Pages

เว็บไซต์เผยแพร่จากไฟล์ใน root ของ branch `master` โดยตรง เมื่อกำหนด Pages source เป็น `master` และ `/` ใน repository settings การ push ไปยัง branch นี้จะเผยแพร่เว็บโดยไม่ต้อง build หรือใช้ GitHub Actions

หน้าเว็บใช้ relative asset paths และ hash-based navigation จึงทำงานได้ใต้ project URL ของ GitHub Pages โดยไม่ต้องตั้งค่า rewrite สำหรับ routes

ไฟล์ PDF, ภาพที่แปลงไว้ชั่วคราว, OCR scripts และไฟล์ตั้งค่าเฉพาะเครื่องถูกละไว้จาก repository
