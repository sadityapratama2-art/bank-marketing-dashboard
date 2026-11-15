# Dashboard Risiko Kredit, Efisiensi Panggilan & Targeting Nasabah

Dashboard interaktif untuk menganalisis kampanye telemarketing
deposito berjangka sebuah bank (45.211 nasabah). Project ini dibuat
dengan bantuan **IBM Bob** sebagai AI agent, dengan prompt tiga
lapisan (Role & Context, Task & Requirements, Constraints & Output).

**Demo:** https://sadityapratama2-art.github.io/bank-marketing-dashboard/

## Latar belakang
Hanya sekitar 11,7% nasabah yang berlangganan deposito, dan
dibutuhkan rata-rata sekitar 23,6 panggilan untuk satu langganan.
Dashboard ini membantu melihat segmen mana yang layak dihubungi dan
di titik mana biaya panggilan tidak lagi sepadan.

## Pengguna sasaran
Kepala Retail Banking dan Kepala Operasi Pemasaran (pengambil
keputusan non-teknis).

## Fitur
- **Filter segmen:** pekerjaan, KPR, pinjaman pribadi, status gagal
  bayar, metode kontak, bulan, dan hasil kampanye sebelumnya
- **Indikator utama:** jumlah nasabah, tingkat konversi, total
  berlangganan, dan panggilan per konversi (mengikuti filter)
- **Grafik konversi** per bulan, jumlah kontak, pita saldo,
  pekerjaan, dan hasil kampanye sebelumnya
- **Simulasi trade-off:** slider biaya per panggilan, pendapatan per
  langganan, dan panggilan per nasabah menampilkan threshold optimal,
  precision, dan recall

## Teknologi
Python (pandas, scikit-learn), HTML, Tailwind CSS, JavaScript,
Chart.js

## Struktur file
| File | Fungsi |
|---|---|
| `index.html`, `style.css`, `script.js` | Tampilan dan logika dashboard |
| `bank_data.json` | Data yang dimuat dashboard |
| `prepare_data.py` | Membuat `bank_data.json` dari `train.csv` |
| `train.csv`, `test.csv` | Dataset asli |

## Cara menjalankan
1. Unduh repo ini (**Code > Download ZIP**) lalu ekstrak.
2. Buka folder di VS Code, klik kanan `index.html`, pilih
   **Open with Live Server**. Dashboard memuat data dengan `fetch()`,
   jadi tidak bisa dibuka dengan klik dua kali.
3. (Opsional) Untuk membuat ulang data, jalankan
   `python prepare_data.py`.

## Catatan penting
- **Sumber data:** dataset publik Bank Marketing (UCI Machine
  Learning Repository).
- Kolom `duration` tidak dipakai di model karena baru diketahui
  setelah telepon selesai (kebocoran data).
- `test.csv` tidak dipakai dalam analisis karena seluruh barisnya
  sudah ada di `train.csv`.
- Risiko kredit hanya dibaca lewat indikator pendekatan (gagal
  bayar, KPR, pinjaman, saldo). Data tidak memuat tunggakan atau
  label fraud.
- Biaya per panggilan dan pendapatan per langganan adalah **asumsi**,
  bukan data bank sebenarnya.
- Filter dengan jumlah nasabah kecil menghasilkan konversi yang
  kurang andal.
