+++
title = "How-To Guides"
description = "Koleksi panduan praktis, prosedur operasional standar (SOP), dan tutorial implementasi teknologi DevOps, SRE, dan Platform Engineering."
cascade = { showDate = false, showAuthor = false }
+++

{{< lead >}}
**Panduan Praktis, Prosedur Operasional Standar (SOP) & Resep Teknis**

Kumpulan tutorial terstruktur langkah-demi-langkah untuk implementasi, konfigurasi, dan otomatisasi infrastruktur skala enterprise.
{{< /lead >}}

---

## 🎯 Fokus & Tujuan

Bagian **How-To** dirancang sebagai referensi teknis langsung (*hands-on reference*) yang dapat dipelajari secara mandiri dan diimplementasikan kembali pada berbagai skenario operasional. Berbeda dengan [**Journals**]({{< ref "journals" >}}) yang fokus pada analisis arsitektur mendalam dan investigasi insiden produksi, bagian ini berfokus pada **tata cara eksekusi, konfigurasi, dan solusi langkah-demi-langkah**.

---

## 📚 Cakupan Kategori & Domain

| Kategori | Cakupan & Fokus Operasional |
| :--- | :--- |
| **Container & Runtimes** | Docker CE, Podman rootless, Windows Server Containers, image multi-stage build, isolasi namespace & cgroup. |
| **Keamanan & Hardening** | CIS Benchmark compliance, OpenSSH Day-0 provisioning, ACL lockdown, tata kelola sertifikat TLS (PKCS#12 & PEM). |
| **Observability & SRE** | Instrumentasi Prometheus, JMX Exporter, Alertmanager dispatching, monitoring JVM, dan metrik sistem. |
| **Automasi & GitOps** | Pure pull-based GitOps reconciler, Windows Task Scheduler, systemd timer, pipeline CI/CD, dan script automasi. |
| **Web Server & Middleware** | Tata kelola runtime Apache Tomcat, konfigurasi HTTPS connector, reverse proxy, dan integrasi enterprise. |

---

## 🧭 Standar Penulisan Panduan

Setiap panduan di bagian ini disusun dengan format terstandar:
1. **Prasyarat & Lingkungan Uji:** Spesifikasi OS, runtime, dependensi, dan batasan kompatibilitas.
2. **Langkah Implementasi Bertahap:** Perintah CLI, konfigurasi deklaratif, dan verifikasi pre-flight.
3. **Validasi & Verifikasi:** Pengecekan status layanan, health probe, dan output yang diharapkan.
4. **Troubleshooting & Lessons Learned:** Penanganan error umum dan peringatan keamanan spesifik.
