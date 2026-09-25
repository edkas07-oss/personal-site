+++
title = "Apache Tomcat Enterprise Super Module (tcctl)"
date = "2026-09-25T23:45:00+07:00"
draft = false
summary = "Platform operator terpadu (Super Module) berbasis Go untuk tata kelola siklus hidup, security hardening CIS Benchmark, audit kerentanan Trivy, GitOps otonom (Zero-Git), dynamic JVM tuning, dan zero-downtime staging rollout Apache Tomcat di Windows Server dan Linux."
author = "Eddy Wiyatno"
categories = ["Platform Engineering", "Middleware", "DevOps", "Security"]
tags = ["tcctl", "tomcat", "windows-server", "linux", "gitops", "docker", "podman", "cis-benchmark", "golang", "sre"]
series = ["Apache Tomcat Enterprise Platform"]
toc = true
showSummary = true
aliases = ["/projects/tomcat-super-module/"]
+++

{{< lead >}}
**Single Static Binary Operator for Enterprise Apache Tomcat Workloads**

`tcctl` (*Tomcat Control CLI*) adalah perangkat lunak operator terpadu (*Super Module*) berbasis bahasa Go yang dirancang khusus untuk standarisasi tata kelola, kepatuhan keamanan (*CIS Benchmark*), dan orkestrasi kontainer Apache Tomcat enterprise di lingkungan multi-OS (Windows Server Docker Engine dan Linux Podman rootless).
{{< /lead >}}

---

## 📌 Ringkasan Eksekutif & Value Proposition

Mengoperasikan beban kerja Apache Tomcat skala produksi di atas arsitektur kontainer heterogen—khususnya pada ekosistem **Windows Containers**—menghadirkan tantangan operasional dan tata kelola keamanan yang unik:

1. **Kompleksitas Hak Akses & Keamanan Runtime:**  
   Banyak operator tergoda menjalankan kontainer dengan akun istimewa `ContainerAdministrator` untuk menghindari kendala perizinan bind-mount. `tcctl` secara otomatis menegakkan eksekusi di bawah akun non-root `ContainerUser` dengan mengunci konfigurasi XML (`conf/`) sebagai *Read-Only* (`:ro`).
2. **Ketiadaan Validasi Keamanan Pre-Flight:**  
   Konfigurasi bawaan Tomcat kerap membiarkan port shutdown (`8005`) terbuka dan membocorkan header versi server. `tcctl` menyematkan mesin audit statis 9 aturan CIS Benchmark yang memverifikasi kepatuhan XML sebelum kontainer diizinkan berjalan.
3. **Pembaruan Berisiko Downtime (Upgrade Java/Tomcat):**  
   Pola pembaruan tradisional langsung mematikan kontainer lama sebelum kontainer baru dipastikan sehat. `tcctl` mengotomasi alur *Temporary Staging Rollout* di port penampung sementara (9080) dengan validasi *health probe* sebelum melakukan promosi instan ke port kanonikal (8080).
4. **Friksi Ketergantungan Tooling pada Windows Target:**  
   Server Windows di lingkungan tertutup sering kali tidak memiliki Git CLI atau MinGit. `tcctl` mengintegrasikan klien REST API native untuk rekonsiliasi GitOps murni langsung ke repositori Gitea tanpa memerlukan instalasi Git eksternal (*Zero-Git Dependency*).
5. **Fragmentasi Manajemen Sertifikat HTTPS:**  
   Alih-alih mengandalkan perintah `keytool` atau OpenSSL manual yang rumit dan rawan salah ketik, `tcctl` menyediakan mesin kriptografi terintegrasi untuk *bootstrapping* keystore PKCS#12, validasi modulus RSA, dan pemantauan kedaluwarsa sertifikat.

---

## 🏛️ Arsitektur Super Module: 7 Pilar Tata Kelola

`tcctl` mengonsolidasikan 7 pilar rekayasa platform ke dalam satu biner statis tunggal tanpa ketergantungan *runtime* (`libc` murni independen via `CGO_ENABLED=0`):

{{< mermaid >}}
flowchart TD
    %% Styling Classes
    classDef core fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#38bdf8;
    classDef module fill:#1e3a8a,stroke:#60a5fa,stroke-width:1.5px,color:#ffffff;
    classDef runtime fill:#064e3b,stroke:#34d399,stroke-width:1.5px,color:#ffffff;
    classDef storage fill:#312e81,stroke:#a78bfa,stroke-width:1.5px,color:#ffffff;

    subgraph CLI ["Core Operator Engine"]
        TCCTL["⚙️ tcctl (Single Static Go Binary)"]:::core
    end

    subgraph PILLARS ["7 Pilar Modul Tata Kelola Enterprise"]
        M1["🛡️ hardening<br/>(CIS Benchmark 9 Rules Audit)"]:::module
        M2["🔎 va<br/>(Trivy Vulnerability Scanner)"]:::module
        M3["📊 monitoring<br/>(Synthetic Health & JMX :9404)"]:::module
        M4["🚀 deploy<br/>(Staging Rollout & bin/setenv)"]:::module
        M5["🔄 gitops<br/>(Zero-Git REST API Reconciler)"]:::module
        M6["🔒 ssl<br/>(PKCS#12 & OpenSSL PEM Engine)"]:::module
        M7["⚡ serve<br/>(Embedded REST API Daemon :8089)"]:::module
    end

    subgraph RUNTIME ["Multi-OS Container Engine"]
        ENG1["🪟 Windows Server (Docker Engine / windowsfilter)"]:::runtime
        ENG2["🐧 Enterprise Linux (Podman Rootless / Bridge)"]:::runtime
    end

    subgraph STORAGE ["Host Bind-Mount Hierarchy (TC-ADR-0009 / TN-006)"]
        DIR["C:/tomcats/ atau D:/tomcats/<instance>/<br/>• bin/ (setenv.bat / setenv.sh JVM Tuning)<br/>• conf/ (server.xml, web.xml, SSL Certs :ro)<br/>• webapps/ (Application Artifacts)<br/>• logs/ (Catalina & Access Logs)"]:::storage
    end

    TCCTL --> M1 & M2 & M3 & M4 & M5 & M6 & M7
    M4 & M5 --> RUNTIME
    RUNTIME --> STORAGE
{{< /mermaid >}}

---

## 🔍 Pembahasan Mendalam 7 Modul Inti

### 1. Security Hardening Engine (`tcctl hardening`)
* **Tujuan:** Menjamin seluruh berkas konfigurasi XML Tomcat memenuhi standar keamanan tertinggi industri sebelum aplikasi dijalankan.
* **Audit Statis Offline 9 Aturan CIS Benchmark:**
  - `CIS-TC-01`: Penonaktifan port shutdown server (`port="-1"`).
  - `CIS-TC-02`: Penyembunyian identitas dan banner versi server (`xpoweredBy="false"`).
  - `CIS-TC-03`: Pembatasan akses resource internal dan restriksi symlink.
  - `CIS-TC-04` s.d `09`: Penegakan Secure dan HttpOnly cookie flags, proteksi HTTP Header Security Filter, dan isolasi perizinan file.
* **Perintah Utama:**
  ```bash
  # Audit kepatuhan pada direktori host bind-mount
  tcctl hardening audit --conf C:/tomcats/payment-service/conf

  # Ekspor laporan kepatuhan ke format JSON untuk audit eksternal
  tcctl hardening audit --conf conf/ --json report.json
  ```

---

### 2. Vulnerability Assessment Quality Gate (`tcctl va`)
* **Tujuan:** Mencegah citra kontainer yang memiliki celah keamanan kritis (*Common Vulnerabilities and Exposures / CVE*) masuk ke lingkungan produksi.
* **Mekanisme Kerja:**
  - Mendeteksi ketersediaan biner `trivy` lokal di host; jika tidak ditemukan, secara otomatis menggunakan *fallback* pemanggilan kontainer `docker.io/aquasec/trivy:latest`.
  - Memindai paket OS dan library Java (arsip `.jar` internal Tomcat dan agent telemetri).
  - Berfungsi sebagai **Quality Gate** pada pipeline CI (Gitea Actions / Jenkins); build akan otomatis digagalkan (*exit code 1*) jika ditemukan celah dengan tingkat keparahan `HIGH` atau `CRITICAL` yang sudah memiliki patch perbaikan.
* **Perintah Utama:**
  ```bash
  tcctl va scan --image localhost:3000/gitadm/tomcat:9.0-6fa9ce9 --severity HIGH,CRITICAL
  ```

---

### 3. Live Observability & Telemetry (`tcctl monitoring`)
* **Tujuan:** Memvalidasi status kesehatan fungsional aplikasi dan telemetri runtime secara real-time.
* **Kemampuan:**
  - **Synthetic Health Probing:** Menguji ketersediaan port HTTP (`8080`) dan HTTPS (`8443`) dengan validasi respons status HTTP 200 OK.
  - **Prometheus JMX Scraper:** Mengambil metrik performa internal JVM dan Tomcat Connector secara instan dari port `9404` tanpa memerlukan tools Java JDK pihak ketiga (`jconsole`/`jps`).
* **Perintah Utama:**
  ```bash
  tcctl monitoring probe --name payment-service --port 8080 --https-port 8443
  tcctl monitoring jmx --port 9404
  ```

---

### 4. Zero-Downtime Deployment & Dynamic JVM Tuning (`tcctl deploy`)
* **Tujuan:** Menyediakan orkestrasi deployment kontainer yang aman, terisolasi, dan bebas dari jeda kegagalan layanan (*zero-downtime*).
* **Fitur Utama:**
  - **Temporary Staging Rollout (TC-ADR-0006):** Saat pembaruan versi dilakukan, kontainer baru diluncurkan terlebih dahulu sebagai penampung sementara (`<instance>-staging`) di port `9080`. Setelah *health probe* memastikan aplikasi merespons dengan benar, kontainer lama dihentikan dan kontainer baru dipromosikan ke port `8080` kanonikal.
  - **Dynamic JVM Tuning via `bin/setenv` (TC-ADR-0010):** Membaca parameter memori dari berkas `setenv.bat` (Windows) atau `setenv.sh` (Linux) di host, lalu menyuntikkannya secara dinamis via variabel lingkungan `-e CATALINA_OPTS="..."` dengan rasio ramah kontainer (`-XX:MaxRAMPercentage=75.0`).
  - **Discovery Citra Interaktif:** Memindai citra Tomcat lokal dan menyajikan menu pemilihan otomatis jika parameter `--image` tidak ditentukan.
* **Perintah Utama:**
  ```powershell
  # Deployment instan interaktif
  tcctl deploy run --name payment-service --port 8080 --https-port 8443

  # Zero-Downtime Staging Rollout ke versi Java baru
  tcctl deploy rollout --name payment-service --image tomcat:9.0-jdk21 --port 8080 --staging-port 9080
  ```

---

### 5. Pure Pull-Based Autonomous GitOps (`tcctl gitops`)
* **Tujuan:** Menghadirkan model pengiriman berkelanjutan deklaratif modern tanpa membuka lubang port inbound SSH/WinRM pada server target.
* **Keunggulan Arsitektur (Zero-Git Dependency):**
  - Berkomunikasi langsung dengan remote Git (Gitea) menggunakan protokol HTTPS REST API native (`/api/v1/repos/...`), sehingga server target Windows **tidak perlu menginstal Git CLI maupun MinGit**.
  - **Otomasi Terjadwal Mandiri:** Mendaftarkan tugas periodik lokal—**Windows Task Scheduler** (`tcctl-gitops-reconciler`) pada Windows Server dan `systemd --user timer` pada Linux—yang mengeksekusi rekonsiliasi setiap 5 menit.
  - **Continuous Self-Healing:** Jika kontainer mati mendadak atau konfigurasi diubah di luar prosedur, reconciler otomatis mendeteksi deviasi (*drift*) dan memulihkan kontainer sesuai spesifikasi deklaratif `tomcat-spec.yaml`.
* **Perintah Utama:**
  ```powershell
  # Inisialisasi lingkungan GitOps & registrasi Task Scheduler
  tcctl.exe gitops init --repo http://localhost:3000/gitadm/tomcat-gitops.git --branch main --timer

  # Eksekusi sinkronisasi deklaratif manual
  tcctl.exe gitops sync --work-dir "C:/Program Files/tcctl/gitops"

  # Ekspor status rekonsiliasi ke JSON untuk monitoring eksternal
  tcctl.exe gitops status --json-out "C:/temp/gitops-status.json"
  ```

---

### 6. Cryptographic TLS/SSL Governance (`tcctl ssl`)
* **Tujuan:** Menghilangkan kerumitan pembuatan dan rotasi sertifikat keamanan HTTPS pada Apache Tomcat.
* **Fitur Utama:**
  - **Dual Keystore Engine:** Mendukung format standar industri **RFC 7292 PKCS#12** (`keystore.p12`) dan konektor **OpenSSL Native PEM** (`server.crt` & `server.key`).
  - **Bootstrapping Otomatis:** Men-generate sertifikat *self-signed* siap pakai saat kontainer pertama kali di-deploy.
  - **CSR & External CA Import:** Membuat berkas *Certificate Signing Request* (CSR PKCS#10) untuk diajukan ke Corporate Enterprise CA, serta memvalidasi kesesuaian pasangan kunci privat via verifikasi modulus RSA sebelum dipasang ke Tomcat.
* **Perintah Utama:**
  ```powershell
  tcctl ssl generate --domain payment.internal.corp --days 365
  tcctl ssl check --path "C:/tomcats/payment-service/conf/ssl"
  ```

---

### 7. Embedded REST API Daemon (`tcctl serve`)
* **Tujuan:** Menjembatani operator CLI dengan portal *Self-Service*, Internal Developer Platform (IDP), atau sistem orkestrasi eksternal.
* **Karakteristik Desain:**
  - Server HTTP REST API *in-memory* ultra-ramping (< 25 MB RAM) yang ditanam langsung di dalam biner `tcctl` tanpa ketergantungan framework web eksternal.
  - Dilengkapi pengamanan **API Key Authentication** via header `X-API-Key` dan dukungan konfigurasi CORS.
  - Menyediakan endpoint lengkap untuk memicu *deploy*, *rollout*, audit *hardening*, dan pemantauan status kontainer secara terprogram.
* **Perintah Utama:**
  ```bash
  tcctl serve --port 8089 --api-key "secret-corp-token" --cors
  ```

---

## 🏛️ Invarian Arsitektur & Landasan Keputusan (ADR)

Seluruh rancangan modul pada `tcctl` berlandaskan pada keputusan arsitektur resmi (*Architectural Decision Records*):

| Landasan ADR | Judul Keputusan Arsitektur | Dampak Implementasi pada `tcctl` |
| :--- | :--- | :--- |
| **TC-ADR-0006** | *Refactor Zero-Downtime Rollout to Temporary Staging Containers* | Mengeliminasi konvensi suffix kaku (`-blue`/`-green`) dan beralih ke kontainer sementara (`<name>-staging`) port 9080 dengan promosi kanonikal atomik. |
| **TC-ADR-0007** | *Adoption of Pure Pull-Based GitOps via Autonomous Host Reconciler* | Menghilangkan ketergantungan push SSH dari server CI; mengalihkan eksekusi CD ke reconciler lokal via Gitea REST API dan Windows Task Scheduler. |
| **TC-ADR-0009** | *Standardize Enterprise Drive Separation & Host Bind-Mount Hierarchy* | Membakukan lokasi persistensi ke `<Drive>:/tomcats/` (`D:` utama, `C:` cadangan) dan mengunci direktori konfigurasi `conf/` sebagai *Read-Only* (`:ro`). |
| **TC-ADR-0010** | *Host bin Bind-Mount and Dynamic JVM Tuning* | Mengisolasi skrip `setenv.bat`/`setenv.sh` di host, membaca parameter memori JVM, dan menyuntikkannya ke dalam kontainer melalui `-e CATALINA_OPTS="..."`. |

---

## 📚 Panduan Terkait & Referensi Lengkap

* [Panduan Praktis: Implementasi Pure Pull-Based GitOps dan Otomasi CI Promotion]({{< relref "how-to/implement-pure-pull-based-gitops-and-ci-promotion-tomcat" >}})
* [Panduan Praktis: Deploy Kontainer Apache Tomcat di Windows Server Menggunakan tcctl]({{< relref "how-to/deploy-tomcat-container-windows-server-tcctl" >}})
* [Panduan Praktis: Build Image Container Apache Tomcat + Prometheus JMX Exporter di Windows NanoServer]({{< relref "how-to/build-tomcat-jmx-nanoserver-image" >}})
* [Katalog Paket & Download Biner Operator tcctl (Windows & Linux)]({{< relref "packages/tcctl" >}})
* [Dokumentasi Lengkap Build & Instalasi Biner (INSTALL.md)](https://github.com/edkas07-oss/tcctl/blob/main/INSTALL.md)
* [Catatan Rekayasa Platform Tomcat di DevOps Handbook (TN-001 s.d TN-010)](http://localhost:8282/projects/tomcat/engineering-journal/platform-foundation-and-hardening/TN-004-design-pure-pull-based-gitops-temporary-staging-rollout-and-self-destructing-bootstrap/)
