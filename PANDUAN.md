# Panduan — Device Health Monitor

Dasbor pemantauan kesehatan perangkat **real-time** yang sepenuhnya jujur:
semua angka diukur langsung di browser (atau dibaca dari agent OS opsional).
Nilai yang tidak bisa diukur ditampilkan **N/A** beserta alasannya — tidak
pernah angka simulasi.

> Catatan: seluruh cara menjalankan ada di **file ini (folder)**, tidak
> ditampilkan di dalam halaman web.

---

## Isi proyek

```
device-health-monitor/
├── agent/                 → agent Python (metrik OS asli: CPU/RAM/disk/baterai)
├── frontend/              → dasbor web (Vite)
│   ├── src/               → kode sumber
│   ├── dist/index.html    → build siap pakai (satu file, bisa dibuka langsung)
│   ├── index.html         → entry Vite
│   └── inline.mjs         → script bantu meng-inline JS/CSS jadi satu file
├── PANDUAN.md             → file ini
├── JALANKAN_WEB.bat       → menjalankan dasbor web (Windows)
└── JALANKAN_AGENT.bat     → menjalankan agent OS (Windows)
```

---

## A. Menjalankan dasbor WEB

Web berdiri sendiri dan **tetap jalan tanpa agent** (mode browser-only).
Tiga cara, pilih salah satu:

### 1) Paling cepat — buka file langsung (offline)
Buka file berikut dengan klik dua kali di browser apa pun:
```
frontend/dist/index.html
```
(Sudah berupa satu file mandiri; mendukung HP, laptop, semua browser.)

### 2) Sajikan lewat server lokal (untuk akses dari HP di Wi-Fi yang sama)
```
cd frontend
npm run preview
```
Lalu buka `http://localhost:4173` di laptop, atau
`http://<IP-laptop>:4173` dari HP (contoh: `http://192.168.18.9:4173`).

> Windows: bisa juga klik ganda `JALANKAN_WEB.bat`.

### 3) Host publik (Netlify / Vercel / GitHub Pages)
Jalankan `npm run build` lalu unggah isi folder `frontend/dist/`.
Karena aset memakai path relatif, bisa ditaruh di sub-folder mana pun.

### Jika mengubah kode sumber
```
cd frontend
npm run build      # menghasilkan dist/index.html (satu file, sudah di-inline)
```

---

## B. Menjalankan agent OS (opsional, untuk data CPU/RAM/disk asli)

Agent memberi tambahan metrik **asli dari sistem** (psutil): utilisasi CPU,
RAM, partisi disk, uptime, baterai, suhu.

### 1) Pasang dependensi (sekali saja)
```
pip install -r agent/requirements.txt
```

### 2) Jalankan agent
Dari folder `device-health-monitor`:
```
python -m agent.main
```
> Windows: bisa juga klik ganda `JALANKAN_AGENT.bat`.

Agent akan mendengarkan di `http://127.0.0.1:8000`. Uji cepat:
- `http://127.0.0.1:8000/health`  → status sehat
- `http://127.0.0.1:8000/snapshot` → metrik OS lengkap

### Konfigurasi (opsional)
Salin `agent/config.example.json` menjadi `agent/config.json` lalu atur
mis. `device_id`, `port`, `bind_host`. Ubah token relay sebelum dipakai.

---

## C. Cara web & agent saling terhubung

- **Otomatis:** saat dasbor dibuka, ia mencoba mendeteksi agent di
  `http://127.0.0.1:8000`. Kalau ada → skor kesehatan otomatis menambah
  sinyal `CPU (OS)` dan `RAM (OS)`, dan latency diukur sungguhan ke agent.
- **Tanpa agent:** kalau agent tidak ada (atau dibuka di HP), dasbor tetap
  berjalan penuh memakai metrik browser (FPS, lag, heap, baterai, storage,
  GPU, dsb). Cukup abaikan kolom agent.
- **Manual:** ketik URL agent di sidebar (kolom “Agent OS (opsional)”)
  lalu klik **Sambung**. Klik **Browser saja** untuk kembali mode murni.

> Jadi: agent TIDAK pernah wajib. Web selalu bisa dibuka di device mana pun.

---

## D. Fitur singkat

- **Per-page**: tiap fitur punya halaman sendiri (Overview, Vitals,
  Performance, Storage & Battery, Network, Device Profile, Diagnostics,
  Alerts) dengan animasi transisi + layar mulai (splash) keren.
- **Real-time**: FPS, frame-time, event-loop lag, JS heap, baterai,
  storage, latency — disegarkan tiap 1s (bisa 2s/5s).
- **Jujur**: setiap nilai punya status. Tidak didukung → N/A + alasan.
- **Skor transparan**: rata-rata hanya dari sinyal yang ada, dengan %
  cakupan yang ditampilkan.
- **Ekspor laporan** JSON, **notifikasi** & **suara** peringatan,
  **dark/light**, **self-test** kemampuan browser.

---

## E. Pemecahan masalah

- **Port8000 sudah dipakai** → berarti agent sudah berjalan; abaikan pesan
  “address in use” dari instance kedua.
- **Agent tak terjangkau** → pastikan `python -m agent.main` hidup; dasbor
  otomatis fallback ke browser-only.
- **Buka dari HP tapi kosong** → pastikan HP dan laptop satu Wi-Fi, dan
  buka `http://<IP-laptop>:4173` (bukan `localhost`).
- **FPS/heap N/A di sebagian browser** → normal. Beberapa API (mis. heap,
  baterai) hanya ada di Chromium; Firefox/Safari menampilkan N/A jujur.
