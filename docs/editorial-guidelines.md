# ✍️ Hugo Editorial & Technical Writing Guidelines

Panduan ini mendefinisikan standar penulisan artikel teknis, struktur file, skema frontmatter, dan konvensi visual untuk publikasi di personal site Eddy Wiyatno.

---

## 1. 📁 Struktur File & Penamaan (Leaf Bundle Pattern)

Setiap artikel teknis wajib menggunakan pola **Hugo Page Leaf Bundle** (`content/articles/<slug>/index.md`).

```text
content/
└── articles/
    └── mengapa-auto-restart-di-production-berbahaya/
        ├── index.md           # Dokumen utama artikel
        └── images/            # Asset gambar/diagram pendukung lokal
            └── architecture.png
```

### Keunggulan Leaf Bundle:
1. **Penyimpanan Aset Terlokalisasi:** Semua gambar, diagram visual, dan lampiran berada dalam satu folder spesifik artikel.
2. **URL Bersih & Portabel:** URL yang dihasilkan rapi (`/articles/<slug>/`) dan mudah dipindahkan tanpa merusak referensi file internal.
3. **Kompatibilitas Pemrosesan Gambar Hugo:** Mendukung fungsi *image processing* bawaan Hugo (`.Resize`, `.Fit`, WebP optimization).

---

## 2. 📝 Skema TOML Frontmatter

Setiap artikel diawali dengan blok TOML frontmatter (`+++` ... `+++`) standar berikut:

```toml
+++
title = "Judul Artikel Lengkap dan Deskriptif"
date = "2026-09-19T15:00:00+07:00"
draft = false
summary = "Ringkasan eksekutif 1-2 kalimat yang padat dan menarik untuk ditampilkan pada listing dan metadata SEO."
author = "Eddy Wiyatno"
categories = ["SRE", "Observability", "DevOps"]
tags = ["tomcat", "incident-response", "zero-remediation", "prometheus", "alertmanager"]
series = ["SRE & Incident Diagnostics Architecture"]
toc = true
+++
```

### Spesifikasi Field Frontmatter:
- `title` *(String)*: Judul artikel teknis yang lugas, problem-oriented, dan mencerminkan tema arsitektur.
- `date` *(ISO 8601 String)*: Format tanggal dan waktu publikasi dengan zona waktu lokal (`+07:00`).
- `draft` *(Boolean)*: `false` untuk siap publish, `true` jika masih dalam tahap draf.
- `summary` *(String)*: Ringkasan 1-2 kalimat untuk meta tag dan cuplikan artikel.
- `author` *(String)*: Nama penulis kanonikal (`"Eddy Wiyatno"`).
- `categories` *(Array)*: Domain topik utama (`"SRE"`, `"Observability"`, `"DevOps"`, `"Architecture"`, `"CI/CD"`).
- `tags` *(Array)*: Kata kunci teknologi spesifik (`"tomcat"`, `"prometheus"`, `"podman"`, `"sqlite"`, `"least-privilege"`).
- `series` *(Array)*: Kelompok seri tulisan jika artikel merupakan bagian dari serial tematik.
- `toc` *(Boolean)*: `true` untuk mengaktifkan Table of Contents otomatis.

---

## 3. 🎯 Gaya Penulisan & Bahasa (Tone of Voice)

- **Bahasa:** Bahasa Indonesia semi-formal yang mengalir, otoritatif, lugas, dan mudah dipahami (*authoritative yet accessible*).
- **Istilah Teknis:** Mempertahankan istilah teknis standar industri dalam bahasa Inggris dengan format cetak miring (*italics*), misalnya: *heap dump*, *thread pool exhaustion*, *zero auto-remediation*, *cascading failure*, *blast radius*, *flapping*, *root cause analysis (RCA)*, *human-in-the-loop*, *runbook*.
- **Kedalaman Materi:** Berbasis pengalaman lapangan dan implementasi nyata (bukan sekadar tutorial teoritis), menyajikan dilema teknis, trade-off arsitektur, dan analisis konsekuensi.

---

## 4. 🏛️ Struktur Anatomi 6 Bagian Wajib Artikel

1. **TL;DR / Ringkasan Eksekutif:** Intisari masalah dan solusi dalam 1-2 paragraf singkat berbobot.
2. **Latar Belakang & Real-world Problem:** Konteks operasional nyata di balik timbulnya masalah dan godaan anti-pattern (misal: dorongan melakukan auto-restart).
3. **Analisis Masalah & Dilema Teknis:** Pembahasan mendalam mengapa pendekatan naif gagal (*reboot loops*, hilangnya bukti forensik crash dump, risiko eskalasi privilege, pemulihan semu).
4. **Solusi & Desain Arsitektur:** Prinsip desain sistem, alur kerja diagram Mermaid, batasan hak akses *read-only*, format laporan kanonikal, serta cuplikan konfigurasi nyata.
5. **Pelajaran Praktis (SRE / DevOps Best Practices):** Prinsip operasional yang dapat diaplikasikan lintas sistem (*least privilege*, *deterministic honesty*, *human-in-the-loop triage*).
6. **Kesimpulan & Checklist Triage:** Rangkuman penutup dan checklist langkah operasional on-call yang siap pakai.

---

## 5. 📊 Elemen Visual & Formatting

- **GitHub-Style Alerts:** Gunakan alert blockquotes untuk penekanan penting:
  ```markdown
  > [!NOTE] Informasi konteks atau detail implementasi tambahan.
  > [!IMPORTANT] Persyaratan esensial atau prinsip utama yang tidak boleh dilanggar.
  > [!WARNING] Risiko teknis, perangkap umum, atau potensi masalah operasional.
  > [!CAUTION] Tindakan berbahaya yang berpotensi merusak data atau kestabilan sistem.
  ```
- **Mermaid Diagrams:** Gunakan diagram alur atau sequence untuk memvisualisasikan data flow dan boundary keamanan:
  ```markdown
  ```mermaid
  flowchart TD
      A[Alert Trigger] --> B[Read-Only Evaluation]
  ```
  ```
- **Annotated Code Blocks:** Sertakan bahasa syntax highlighting dan komentar penjelas yang jelas di dalam blok kode.
