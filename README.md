# Beautiful JWT

Chrome/Chromium extension Manifest V3 untuk menyimpan session token Better Auth secara lokal, meminta JWT dari endpoint pilihan, dan menyediakan JWT bersih untuk dicopy ke Swagger.

## Fitur

- Beberapa konfigurasi token dengan nama berbeda.
- Request menggunakan `Authorization: Bearer <session token>`.
- Mengharapkan respons JSON berbentuk `{"token":"JWT_HASIL"}`.
- Refresh saat konfigurasi disimpan, manual per token, manual semua token, dan otomatis sesuai interval.
- Copy JWT saja, tanpa `{}`, tanda kutip, atau key `token`.
- Edit konfigurasi dan hapus konfigurasi beserta JWT.
- Data disimpan di `chrome.storage.local`.
- Izin host diminta hanya untuk origin endpoint yang dikonfigurasi.

## Instalasi lokal

1. Ekstrak ZIP ke folder tetap, misalnya `~/Projects/beautiful-jwt`.
2. Buka `chrome://extensions`.
3. Aktifkan **Developer mode**.
4. Klik **Load unpacked** dan pilih folder `beautiful-jwt`.
5. Klik ikon extension, isi nama, session token, endpoint lengkap, dan interval (menit).
6. Klik **Simpan & refresh**. Browser akan meminta izin untuk mengakses origin endpoint tersebut.

## Contoh

- Nama: `Admin Service In`
- Session token: session token Better Auth
- Endpoint: `http://localhost:8000/api/token/jwt`
- Interval: `5`

Request yang dibuat:

```http
GET /api/token/jwt
Authorization: Bearer <SESSION_TOKEN>
Accept: application/json
```

Respons yang diharapkan:

```json
{"token":"eyJhbGciOi..."}
```

Hanya nilai `token` yang disimpan dan ditampilkan sebagai JWT.

## Catatan penting

- Endpoint harus berupa URL lengkap, bukan path relatif.
- Jika API memakai `POST`, body JSON, atau nama field respons berbeda, sesuaikan `background.js`.
- Chrome memelihara alarm di background, tetapi waktu alarm bukan penjadwal real-time; browser bisa menunda alarm saat perangkat tidur atau browser sedang sibuk.
- Interval minimum di UI adalah 1 menit. Perubahan waktu eksekusi tetap mengikuti kebijakan Chrome.
- Extension mengirim session token ke endpoint yang kamu masukkan. Pastikan endpoint tersebut tepercaya dan gunakan HTTPS jika endpoint diakses lewat jaringan.
- `chrome.storage.local` tidak terenkripsi sebagai password vault. Gunakan hanya pada profil browser yang aman dan jangan berbagi profil tersebut.
- Request `fetch` memakai `credentials: "omit"` dan tidak mengirim cookie browser.
- Untuk endpoint lintas origin, backend perlu mengizinkan origin extension pada konfigurasi CORS bila diperlukan. Host permission extension tidak menggantikan kebijakan CORS server.

- Vibe Code 100 %
- Bahasa Only
