# Northern Thailand PM2.5 Forecast

โฟลเดอร์นี้คือชุดไฟล์สำหรับอัปโหลดขึ้น GitHub Pages โดยตรง

## วิธีอัปโหลด

1. สร้าง repository ใหม่ใน GitHub
2. อัปโหลดไฟล์และโฟลเดอร์ทั้งหมดใน `github-upload/` ไปไว้ที่ root ของ repository
3. ไปที่ `Settings` > `Pages`
4. เลือก `Deploy from a branch`
5. เลือก branch `main` และ folder `/root`
6. กด `Save`

หลัง deploy สำเร็จ เว็บจะอยู่ที่:

```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY_NAME/
```

## โครงสร้างไฟล์

```text
index.html
styles.css
app.js
.nojekyll
data/
  forecast_index.json
  northern-thailand.geojson
  forecasts/
    2026-05.json
    ...
    2027-05.json
```

ไฟล์ในโฟลเดอร์นี้เป็น static site ทั้งหมด ไม่ต้องใช้ server, backend, API key หรือ build step
