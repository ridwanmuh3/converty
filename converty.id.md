# Converty — Engine Konversi Berkas Sisi Klien

15 Okt 2026[Lihat proyek](https://github.com/ridwanmuh3/converty)

Fitur alat konversi berkas yang berjalan 100% di dalam peramban: tanpa unggah ke server, tanpa akun, terisolasi dalam Web Worker, penegakan Content Security Policy yang ketat, dan dukungan PWA offline penuh.

**Tipe**
: Proyek

**Lini Waktu**
: Sep 2026 – Okt 2026

**Teknologi**
: SvelteKit 3 · Svelte 5 · TypeScript · Tailwind CSS 4 · Web Workers · WebCodecs · pdf.js · pdf-lib

> Fitur alat konversi berkas yang berjalan 100% di dalam peramban: tanpa unggah ke server, tanpa akun, terisolasi dalam Web Worker, penegakan Content Security Policy yang ketat, dan dukungan PWA offline penuh.

|  |  |
| --- | --- |
| **Tipe** | Portofolio / showcase rekayasa perangkat lunak |
| **Peran** | Solo — desain manifes, alur kerja web worker, penjadwalan memori, arsitektur PWA, perkakas pengujian |
| **Teknologi** | SvelteKit 3 · Svelte 5 (runes) · TypeScript · Tailwind CSS 4 · Web Workers · WebCodecs · `pdfjs-dist` · `pdf-lib` · `docx` · `jspdf` |
| **Status** | PWA statis siap produksi; berfungsi offline penuh, tanpa ketergantungan server |
| **Repositori** | [`converty`](https://github.com/ridwanmuh3/converty) |

---

## 1. Gambaran Proyek

Layanan konversi berkas berbasis web umumnya membawa risiko tersembunyi: privasi yang terancam, batasan ukuran berkas, hingga pengunggahan dokumen rahasia ke server pihak ketiga. Tantangan rekayasa utama bukan sekadar merancang antarmuka masukan berkas — melainkan **menjalankan pemrosesan dokumen, gambar, dan media langsung di dalam engine peramban** dengan tetap menjaga responsivitas UI, melindungi memori perangkat pengguna, serta menjamin privasi *zero-trust* yang terverifikasi.

Converty menghadirkan platform perkakas tanpa server: mengonversi PDF ke Word, mengekstrak audio dari video menggunakan WebCodecs, mengompresi gambar, menggabung/memisah PDF, dan mengodekan MP3 — seluruhnya dieksekusi secara lokal di sisi klien melalui Web Workers.

Implementasi inti bertumpu pada tiga jaminan arsitektur:

1. **Arsitektur Pipeline Terisolasi Worker**: Seluruh proses *parser*, *decoder*, dan *encoder* yang berat dieksekusi di luar *main thread* melalui tujuh berkas worker khusus (`audio`, `document`, `image`, `image-pdf`, `pdf-edit`, `pdf-image`, `video`).

2. **Blokir Eksfiltrasi Jaringan (`connect-src 'self'`)**: Kebijakan Keamanan Konten (CSP) menjamin bahwa meskipun terdapat dependensi yang bermasalah, peramban secara otomatis memblokir seluruh pengiriman data keluar selama konversi berlangsung.

3. **Batasan Memori & Penjadwalan Responsif**: Sistem penjadwal mendeteksi kapasitas CPU dan RAM untuk menjalankan pemrosesan paralel 2-up pada perangkat desktop, serta membatasi ukuran memori untuk melindungi perangkat seluler dari *crash*.

### Sekilas proyek

| Dimensi | Nilai |
| --- | --- |
| Alat konversi | 15 alat manipulasi & konversi berkas |
| Berkas Web Worker | 7 bundel worker terisolasi (`src/lib/workers/entries/`) |
| Ketergantungan server | 0 endpoint API runtime; 100% aset statis *prerendered* |
| Kebijakan Keamanan | CSP Ketat (`connect-src 'self'`), tanpa telemetri, tanpa skrip pihak ke-3 |
| Batas aman memori | Batas 25 MB per berkas, batas masukan 100 MB per *batch* |
| Anggaran PWA Offline | *App shell* tersimpan + batas *cache* worker 50 MB |
| Pengujian & Audit | 115 pengujian E2E Playwright, 306 audit desain/SEO, kalibrasi performa CPU |

### Batasan yang disengaja di luar cakupan

Converty dirancang khusus sebagai showcase rekayasa *browser-first*. Fitur OCR berbasis server untuk dokumen hasil pemindaian (*scan*) sengaja ditiadakan untuk menghindari pembengkakan ukuran bundel aplikasi. Ekspor dokumen PDF menggunakan metode penyusunan tata letak *block layout* alih-alih mereplikasi engine cetak peramban (`window.print()`), sehingga generasi dokumen dibatasi pada karakter Latin (WinAnsi). Penggunaan pustaka FFmpeg WASM yang berat dihindari dan digantikan oleh API peramban bawaan yang ringan (WebCodecs, `AudioContext`, `createImageBitmap`).

---

## 2. Fitur Utama

### Pengalaman Pengguna & Penerimaan Berkas

- **Penerimaan berkas universal** — antarmuka *drag-and-drop* dengan deteksi tipe MIME dan ekstensi otomatis, yang langsung mengarahkan berkas ke pilihan format konversi yang valid.

- **Konversi *mixed-batch*** — mengonversi berbagai jenis berkas yang berbeda dalam satu antrean sekaligus tanpa perlu berpindah halaman alat.

- **Pratinjau hasil instan** — *thumbnail* gambar real-time, penayangan halaman pertama PDF pada kanvas, serta visualisasi gelombang dan durasi audio.

- **Penyimpanan opsi lokal** — pengaturan per alat (tingkat kompresi, orientasi PDF, rentang halaman) tersimpan secara lokal di `localStorage` dengan tombol reset satu klik.

- **Progressive Web App** — aplikasi desktop dan seluler yang dapat diinstal, didukung oleh Service Worker yang menyimpan *app shell* untuk penggunaan offline penuh.

### Rekayasa Dokumen & PDF

- **Word → PDF** — memproses struktur OOXML secara langsung (`fflate` + *parser* tata letak kustom) dan mengalirkan posisi elemen ke dalam struktur blok `jsPDF` dan `autoTable`.

- **Excel → PDF** — mengekstrak matriks data lembar kerja melalui SheetJS dan menyusun tabel PDF terstruktur.

- **PDF → Word** — mengekstrak posisi teks melalui `pdfjs-dist`, menerapkan heuristik spasial baris dan paragraf, lalu menyusun elemen DOCX terstruktur menggunakan `docx`.

- **Manipulasi PDF** — penggabungan PDF yang dapat diurutkan ulang (`merge-pdf`) dan pemisahan rentang halaman (`split-pdf`) yang dieksekusi melalui `pdf-lib`.

- **Gambar → PDF & PDF → JPG** — mengonversi gambar menjadi PDF tunggal atau multi-halaman; mengubah halaman PDF menjadi gambar JPEG yang digambar pada `OffscreenCanvas` dan dikirimkan sebagai berkas ZIP via `fflate`.

### Pemrosesan Media & Audio

- **Video → MP3** — mengekstrak trek audio MP4/MOV dengan `mp4box`, men-decode audio mentah melalui API `WebCodecs` bawaan peramban, dan mengodekan MP3 128 kbps di luar *main thread* menggunakan `lamejs`.

- **Transcoding Audio** — men-decode audio masukan menggunakan `AudioContext` peramban, melakukan *resampling* ke WAV PCM 16-bit, atau mengodekannya ke MP3.

- **Pemrosesan & Kompresi Gambar** — konversi format gambar (PNG, JPEG, WebP) serta kompresi kualitas/dimensi berbasis klien menggunakan `createImageBitmap` dan `OffscreenCanvas`.

- **Konversi HEIC** — *decoding* gambar HEIC/HEIF bawaan menggunakan `heic2any`.

### Rekayasa & Jaminan Kualitas

- **Audit keamanan zero-trust** — pengujian E2E otomatis yang menjamin tidak ada permintaan HTTP POST/PUT, tanpa *request body*, dan tanpa panggilan ke domain pihak ketiga selama proses konversi.

- **Pengujian performa terkalibrasi CPU** — *harness* pengujian performa yang menyesuaikan ambang batas waktu eksekusi berdasarkan performa CPU perangkat (`test/perf.mjs`).

- **Suite audit desain & SEO** — 306 pengujian otomatis yang memastikan kontras WCAG AA, target sentuh minimum 44 px, navigasi kibor, mode gelap, serta skor Lighthouse.

---

## 3. Teknologi / Tech Stack

| Lapisan | Teknologi | Alasan Penggunaan |
| --- | --- | --- |
| **Frontend & UI** | SvelteKit 3, Svelte 5 (runes), TypeScript, Tailwind CSS 4, `@sveltejs/adapter-static` | Antarmuka reaktif berkinerja tinggi dengan Svelte 5 runes, *prerendered* penuh sebagai HTML/JS statis |
| **Status & Manifes Deklaratif** | Manifes Alat Deklaratif (`src/lib/tools/`) | Sumber kebenaran tunggal (*single source of truth*) untuk rute, penanganan worker, tipe berkas, SEO, dan opsi |
| **Sistem Worker** | Web Workers (ES Modules), Integrasi bundel worker Vite | Pemrosesan di luar *main thread* untuk mengisolasi *parsing* dokumen dan pengodean media |
| **Pemrosesan PDF** | `pdfjs-dist`, `pdf-lib`, `jspdf`, `jspdf-autotable` | Penayangan PDF presisi tinggi, pembuatan PDF biner, serta manipulasi biner tingkat halaman |
| **Pemrosesan Dokumen** | `docx`, SheetJS (`xlsx`), `fflate` | *Parsing* OOXML, ekstraksi matriks XLSX, pembuatan DOCX, serta kompresi ZIP |
| **Media & Audio** | WebCodecs API, `mp4box`, `@breezystack/lamejs`, `createImageBitmap`, `heic2any` | *Demuxing* dan *decoding* perangkat keras bawaan peramban dengan pengodean MP3 yang ringan |
| **PWA & Offline** | Service Worker, Pembuat manifes *cache* `scripts/build-sw.mjs` | Penyimpanan *app shell* awal dan *cache* worker dinamis dengan batas 50 MB LRU |
| **Pengujian & Audit** | Playwright Chromium, Vitest, Audit Desain/SEO Kustom, Kalibrator Performa CPU | Pengujian E2E komprehensif, aksesibilitas, validasi CSP, dan batas performa terkalibrasi |

---

## 4. Arsitektur

### Model Eksekusi

Aplikasi berjalan sepenuhnya di dalam *sandbox* peramban. *Main thread* mengelola antarmuka pengguna, navigasi berkas, dan indikator kemajuan, lalu melimpahkan beban pemrosesan konversi ke Web Worker yang terisolasi.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              MAIN THREAD PERAMBAN                              │
│  ┌────────────────────────┐    ┌────────────────────┐    ┌──────────────────┐  │
│  │ Svelte 5 UI (App Shell)│ ── │ Intake & Routing   │ ── │ Progress & Store │  │
│  └────────────────────────┘    └────────────────────┘    └──────────────────┘  │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │ PostMessage (ArrayBuffer / Transferable File)
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           WEB WORKERS (TERISOLASI)                             │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐ │
│ │ document     │ │ pdf-edit     │ │ pdf-image    │ │ video        │ │ audio  │ │
│ │ (DOCX/XLSX)  │ │ (Merge/Split)│ │ (PDF → JPG)  │ │(WebCodecs)   │ │(LameJS)│ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └────────┘ │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                     BATAS KEAMANAN & BATASAN SISTEM                            │
│  • Penegakan CSP: connect-src 'self' (0 panggilan jaringan keluar)             │
│  • Batas memori: batas 25 MB per berkas / batas masukan 100 MB per batch       │
│  • Penjadwal Thread: eksekusi 2-up (desktop) / eksekusi 1-up (seluler)         │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Distribusi Worker & Pipeline Pemrosesan

| Berkas Worker | Alat yang Dikelola | Engine Inti | Metode Transfer Data |
| --- | --- | --- | --- |
| `document.worker.ts` | Word → PDF, Excel → PDF, PDF → Word | `pdfjs-dist`, `jspdf`, `fflate`, `docx`, SheetJS | Transfer `ArrayBuffer` |
| `pdf-edit.worker.ts` | Merge PDF, Split PDF | `pdf-lib` | Transfer `ArrayBuffer` |
| `pdf-image.worker.ts` | PDF → JPG | `pdfjs-dist`, `OffscreenCanvas`, `fflate` | `Blob` / *Transferable Streams* |
| `image-pdf.worker.ts` | Gambar → PDF, JPG → PDF | `pdf-lib` | Transfer `ArrayBuffer` |
| `image.worker.ts` | Konverter Gambar, Kompresi Gambar | `createImageBitmap`, `OffscreenCanvas` | `ImageBitmap` yang dapat ditransfer |
| `audio.worker.ts` | Konverter Audio, Konverter MP3 | *Decoder* `AudioContext`, *Encoder* MP3 `lamejs` | *Buffer* `Float32Array` |
| `video.worker.ts` | MP4 → MP3, Video → MP3 | `mp4box`, `AudioDecoder` WebCodecs, `lamejs` | *Chunk* `AudioData` |
| *Main Thread* | HEIC → JPG | `heic2any` | Object Blob URL Lokal |

### Strategi Penegakan Keamanan Privasi

| Area Perlindungan | Mekanisme Penegakan | Metode Validasi |
| --- | --- | --- |
| **Bebas Eksfiltrasi Data** | CSP `connect-src 'self'` | Peramban menolak seluruh koneksi keluar non-origin |
| **Pencegahan Muatan Data** | Pemeriksaan HTTP ketat saat pengujian E2E | `test/e2e.mjs` memastikan 0 permintaan POST/PUT dan 0 *request body* |
| **Pelacakan Pihak Ketiga** | Tanpa telemetri, *font* diinang secara lokal | Pengujian E2E memverifikasi 0 koneksi domain pihak ketiga |
| **Pencegahan Kebocoran Memori** | Pencabutan Object URL secara eksplisit (`URL.revokeObjectURL`) | Divalidasi setelah pengunduhan berkas / pembersihan tugas |

### Model Performa & Konkurensi

- **Penjadwalan Konkurensi Berbasis Kapasitas**: Perangkat dengan RAM ≥8 GB dan ≥4 inti CPU dapat menjalankan hingga 2 tugas worker secara bersamaan; perangkat seluler atau berkapasitas rendah secara otomatis menggunakan mode sekuensial (1-up).
- **Isolasi Alur Kerja Berat**: Operasi dengan beban memori tinggi (seperti konversi video atau *parsing* PDF besar) mendapatkan kunci eksekusi eksklusif untuk mencegah penurunan laju bingkai (*frame rate*) pada antarmuka utama.
- **Pengaliran Memori (*Memory Streaming*)**: Ekstraksi halaman PDF → JPG mengalirkan hasil JPEG secara langsung ke dalam arsip ZIP `fflate` untuk mencegah lonjakan penggunaan memori.

### Penanganan Kegagalan

| Skenario Kegagalan | Penanganan di Sisi Klien | Dampak Pada Pengguna |
| --- | --- | --- |
| Batas Memori Terlampaui | Pembaca masukan berkas menolak beban sebelum konversi dimulai | Pesan kesalahan yang jelas bahwa ukuran atau jumlah halaman melebihi batas |
| Codec Audio Tidak Didukung | Pemeriksaan kapabilitas WebCodecs gagal secara aman | Petunjuk yang menginformasikan bahwa berkas video butuh *transcoding* |
| Masukan PDF Hasil Scan | Pemeriksaan teks mendeteksi tidak ada teks yang dapat dipilih | Pemberitahuan bahwa dokumen pemindaian butuh fitur OCR (di luar cakupan) |
| Worker Crash / Out-of-Memory | Penangan `onerror` pada worker menangkap eksepsi dan menghentikan tugas | Konversi gagal secara terisolasi; aplikasi pada *main thread* tetap stabil |

---

## 5. Spesifikasi Teknis & Matriks Konversi

### Matriks Konverter

| Alat | Engine Pipeline | Tingkat Presisi (Fidelity) | Batasan Teknis / Kompromi |
| --- | --- | --- | --- |
| **Word → PDF** | `fflate` + *parser* OOXML → `jsPDF` + `autoTable` | Struktur mendekati asli | Pengodean *font* WinAnsi (hanya karakter Latin); *text box* tidak diproses |
| **Excel → PDF** | SheetJS → matriks lembar kerja → `jspdf-autotable` | Presisi tabel tinggi | Nilai formula dievaluasi; grafik dan gambar ditiadakan |
| **PDF → Word** | Heuristik spasial `pdfjs-dist` → penyusun `docx` | Rekonstruksi teks terstruktur | Tabel diubah menjadi paragraf; gambar ditiadakan |
| **PDF → JPG** | `pdfjs-dist` → `OffscreenCanvas` → ZIP `fflate` | Hasil gambar presisi | Maksimal 50 halaman; teks diubah menjadi piksel |
| **JPG / Gambar → PDF** | Penyisipan gambar `pdf-lib` | Kualitas asli gambar | Dimensi halaman 1:1 atau disesuaikan ke A4; metadata dibersihkan |
| **Merge PDF** | Penggabungan halaman `pdf-lib` | Salinan biner *lossless* | Elemen formulir disalin; penanda buku kompleks diratakan |
| **Split PDF** | Ekstraksi halaman `pdf-lib` | Salinan biner *lossless* | Metadata dipertahankan pada tiap sub-berkas hasil ekstraksi |
| **Compress Image** | `createImageBitmap` → `OffscreenCanvas` | Kualitas dapat disesuaikan | Batas dimensi kanvas peramban (penyesuaian otomatis di atas 16.7 MP) |
| **Konverter Gambar** | Pengodean ulang kanvas `toBlob` | Presisi visual tinggi | GIF animasi diubah menjadi bingkai pertama; tag EXIF dibersihkan |
| **HEIC → JPG** | *Decoder main-thread* `heic2any` | Presisi warna tinggi | Dieksekusi di *main thread* karena keterbatasan pustaka |
| **MP4 / Video → MP3** | *Demuxer* `mp4box` → WebCodecs → `lamejs` | Audio MP3 jernih 128 kbps | Membutuhkan dukungan codec peramban; batas durasi 30 menit |
| **Konverter Audio / MP3**| *Decode* `AudioContext` → *encode* `lamejs` | MP3 konstan 128 kbps | Batas durasi audio 10 menit dan *buffer* eksekusi 200 MB |

### Keputusan Desain Arsitektural

- **Penyusunan Tata Letak jsPDF vs. `window.print()`**: Meskipun `window.print()` menghasilkan tipografi yang sedikit lebih baik, metode tersebut membutuhkan dialog interaktif pengguna sehingga tidak dapat mendukung proses *batching*, pemantauan kemajuan, maupun pembuatan berkas ZIP. Penggunaan `jsPDF` memungkinkan pemrosesan *batch* dan penanganan latar belakang secara penuh di dalam worker.
- **WebCodecs vs. FFmpeg WASM**: Ukuran bundel FFmpeg WASM mencapai 20–30 MB. Menggunakan fitur bawaan peramban `WebCodecs` untuk *demuxing* dan *decoding* menekan ukuran unduhan awal hingga di bawah 50 KB untuk alat media.

---

## 6. Kompromi & Keputusan Desain

| Keputusan | Keuntungan | Dampak / Biaya | Penanganan Risiko |
| --- | --- | --- | --- |
| **Pemrosesan 100% Sisi Klien** | Privasi mutlak, tanpa biaya server, dapat berjalan offline | Tergantung pada spesifikasi CPU dan RAM perangkat pengguna | Batasan memori yang aman (batas 25 MB per berkas, masukan *batch* 100 MB) |
| **WebCodecs Dibandingkan FFmpeg WASM** | Ukuran bundel JS sangat kecil, waktu muat cepat | Tergantung pada dukungan codec peramban | Pesan penanganan kesalahan yang jelas jika codec tidak didukung |
| **Engine Dokumen `jsPDF`** | Pembuatan PDF secara terprogram di dalam worker tanpa pop-up UI | Batasan pengodean *font* Latin (WinAnsi) | Umpan balik langsung jika karakter non-Latin terdeteksi |
| **Manifes Deklaratif Tunggal** | Navigasi, pemanggilan worker, dan metadata SEO terintegrasi | Membutuhkan validasi ketat saat kompilasi | Pemeriksaan *build-time* memastikan konsistensi struktur manifes |
| **Penyimpanan Cache PWA Offline** | Halaman langsung terbuka tanpa koneksi internet | Menggunakan kuota penyimpanan lokal hingga 50 MB | Pembersihan *cache* worker otomatis dengan batas 50 MB LRU |

### Hal yang akan ditingkatkan untuk skala produksi lanjutan

- Mengintegrasikan **Tesseract.js WASM** untuk ekstraksi teks OCR pada dokumen PDF hasil pemindaian (*scan*).
- Menerapkan ***subsetting font* WebAssembly** (HarfBuzz / FreeType) untuk mendukung generasi PDF berbasis aksara CJK dan non-Latin.
- Memanfaatkan **pengodean perangkat keras WebGPU / WebCodecs** untuk *transcoding* video penuh di sisi klien.

---

## 7. Kesimpulan

Converty dirancang dengan satu prinsip utama yang tidak dapat ditawar: **tidak ada satu byte pun data pengguna yang keluar dari peramban, dan tidak ada server yang memproses berkas pengguna.**

Prinsip tersebut dicapai melalui lapisan jaminan teknis:

- **Web Workers** memastikan tugas berat dieksekusi di luar *main thread* agar antarmuka pengguna tetap lancar.
- **Content Security Policy yang Ketat** menjamin secara mutlak bahwa tidak ada data yang terkirim ke luar.
- **Manifes Deklaratif Inti** memastikan navigasi, pemanggilan worker, dan opsi berkas yang teratur dan *type-safe*.
- **Engine Peramban Bawaan (WebCodecs, `AudioContext`, Canvas)** menggantikan pustaka WASM yang berat untuk menjaga ukuran unduhan tetap minim.
- **Penyimpanan Cache Service Worker** mengubah aplikasi menjadi alat offline yang tangguh.

Converty membuktikan bahwa aplikasi web dapat menghadirkan pemrosesan dokumen dan media berkinerja tinggi tanpa mengorbankan privasi pengguna maupun mengeluarkan biaya operasional server.

### Bacaan lebih lanjut

- [`README.md`](https://github.com/ridwanmuh3/converty/blob/main/README.md) — Memulai cepat dan gambaran proyek
- [`ROADMAP.md`](https://github.com/ridwanmuh3/converty/blob/main/ROADMAP.md) — Arsitektur, manifes inti, dan fase pengembangan
- [`src/lib/tools/`](https://github.com/ridwanmuh3/converty/tree/main/src/lib/tools) — Implementasi manifes deklaratif alat

[Kembali ke Proyek](/projects/)

© 2026 Ridwan M. Raihan. Hak cipta dilindungi undang-undang.
---