# ⛔ PENTING: JANGAN PERNAH "GIT PULL" DARI MAIN ⛔

## Penjelasan Sistem
Repositori ini menggunakan sistem **Dual-Branch Automated Encryption**:
- **Branch `dev-clean` (Di Laptop Anda)**: Berisi source code asli yang **bersih & mudah dibaca/diedit**.
- **Branch `main` (Di GitHub)**: Berisi kode yang **sudah diobfuskasi / dienkripsi otomatis oleh GitHub Actions**.

---

## ⚠️ Aturan Keselamatan
Jika Anda melakukan `git pull origin main` atau sync branch main ke laptop:
**KODE BERSIH DI LAPTOP ANDA AKAN TERTIMPA DENGAN KODE ENKRIPSI DAN RUSAK.**

---

## ✅ Prosedur Kerja yang Benar
1. **Coding & Edit** di laptop pada branch `dev-clean`.
2. **Commit & Push** selalu ke branch `dev-clean`:
   ```bash
   git add .
   git commit -m "Update fitur terbaru"
   git push origin dev-clean
   ```
3. **GitHub Actions** akan secara otomatis membaca branch `dev-clean`, mengenkripsi file JS, dan men-deploy ke branch `main`.
4. **JANGAN PERNAH** men-download / menarik (pull) branch `main` kembali ke laptop.
