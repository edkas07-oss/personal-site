+++
title = "Panduan Praktis: Build Image Container Monitoring Stack (Prometheus, Alertmanager, Mailpit & Node.js Diagnostic Service) di Windows NanoServer"
date = "2026-09-26T16:30:00+07:00"
draft = false
summary = "Panduan komprehensif langkah-demi-langkah membangun citra container Windows native berbasis NanoServer untuk seluruh komponen stack observabilitas enterprise: Prometheus TSDB, Alertmanager, Mailpit Test Inbox, dan Node.js 22 Diagnostic Service. Mengulas mitigasi dependensi netapi32.dll untuk biner Go, runtime node:sqlite bawaan tanpa kompilasi native C++, perancangan Dockerfile modular, hingga publikasi ke private OCI container registry untuk kesiapan orkestrasi GitOps."
author = "Eddy Wiyatno"
categories = ["How-To", "Container", "Observability", "DevOps"]
tags = ["windows-containers", "nanoserver", "prometheus", "alertmanager", "mailpit", "nodejs", "docker", "powershell", "devops", "monitoring"]
series = ["Tomcat Monitoring Enterprise Operations"]
toc = true
showSummary = true
+++

{{< lead >}}
**Membangun Ekosistem Observabilitas Ramping (< 600 MB) Berbasis Windows NanoServer untuk Lingkungan Enterprise & GitOps**

Pada infrastruktur Windows Server modern yang menjalankan beban kerja container (seperti Apache Tomcat di atas Docker Engine `windowsfilter`), tim SRE dan DevOps kerap menghadapi kendala ketika hendak mendistribusikan stack pemantauan. Image resmi Prometheus, Alertmanager, dan Mailpit dari upstream umumnya hanya dikemas sebagai container Linux ELF. Panduan ini mengupas secara tuntas teknik menyusun container image native Windows berbasis **Microsoft Windows NanoServer** untuk keempat pilar monitoring: **Prometheus TSDB**, **Alertmanager Routing Hub**, **Mailpit Testing SMTP/Web**, dan **Node.js 22 Diagnostic Engine**, lengkap dengan mitigasi pustaka sistem, struktur build modular, serta alur publikasi ke private OCI registry.
{{< /lead >}}

---

## 📌 Latar Belakang & Nilai Strategis

Ketika organisasi memutuskan untuk menjalankan container Apache Tomcat di atas sistem operasi Microsoft Windows Server (Windows Server 2022 atau Windows Server 2019), terdapat dua pendekatan umum dalam memasang perangkat pemantau:

1. **Pendekatan Proses Native Host (Windows Services):** Memasang biner `.exe` langsung di sistem operasi host. Kelemahannya adalah ketiadaan isolasi sumber daya (CPU/RAM), risiko konflik dependensi, dan kesulitan pelacakan siklus hidup aplikasi saat pembaruan versi.
2. **Pendekatan Containerization Terpadu (Container Windows NanoServer):** Membungkus seluruh biner observabilitas ke dalam citra container mandiri.

Pendekatan kedua memberikan keuntungan operasional yang sangat nyata:
* **Konsistensi Manajemen:** Seluruh komponen aplikasi dan monitoring dapat diinspeksi secara seragam melalui antarmuka container standar (`docker ps`, `docker logs`, `docker inspect`).
* **Kesiapan Otomatisasi GitOps:** Pembaruan versi metrik atau diagnostik cukup dilakukan dengan memodifikasi deklarasi tag citra pada manifest GitOps (`monitoring-spec.yaml`), yang kemudian secara otomatis di-reconcile oleh operator.
* **Ukuran Citra Ramping (Ultra-Lightweight Footprint):** Menggunakan base image **Windows NanoServer (`nanoserver:ltsc2022` / `nanoserver:1809`)** menghasilkan layer sistem operasi hanya ~100–170 MB, sangat jauh lebih hemat dibandingkan Windows Server Core (~4,5 GB).
* **Isolasi Volume & Data Storage:** Penyimpanan data time-series TSDB, state SQLite diagnostik, dan inbox email dikelola melalui *Named Volume* Docker yang terisolasi.

---

## 🏛️ Arsitektur & Topologi Build Citra

Proses perakitan citra dilakukan di sebuah host builder Windows Server yang memiliki Docker Engine berkemampuan Windows Containers. Hasil perakitan kemudian dipublikasikan ke OCI Container Registry internal perusahaan:

{{< mermaid >}}
flowchart TD
    subgraph Host_Builder ["Host Builder Windows Server (Docker Engine)"]
        subgraph Artifacts ["Biner & Berkas Runtime"]
            Bin_Go["Biner Native Go (Windows x64):<br/>• prometheus.exe & promtool.exe<br/>• alertmanager.exe & amtool.exe<br/>• mailpit.exe"]
            Bin_Node["Node.js 22 LTS Runtime:<br/>• node.exe (v22.14.0+)"]
            Sys_DLL["Pustaka Subsistem:<br/>• netapi32.dll (C:\\Windows\\System32)"]
            Src_Diag["Source Code Diagnostic Engine:<br/>• src/, config/, migrations/, node_modules/"]
        end

        subgraph Dockerfiles ["Dockerfile Windows NanoServer"]
            DF_Prom["prometheus.Dockerfile"]
            DF_Alert["alertmanager.Dockerfile"]
            DF_Mail["mailpit.Dockerfile"]
            DF_Diag["diagnostic-service.Dockerfile"]
        end

        Docker_Build["Docker Engine (windowsfilter)"]
    end

    subgraph Registry_Enterprise ["Distribusi Enterprise OCI Registry"]
        Repo_Prom["registry.corp.internal/monitoring/prometheus:1.0.0"]
        Repo_Alert["registry.corp.internal/monitoring/alertmanager:1.0.0"]
        Repo_Mail["registry.corp.internal/monitoring/mailpit:v1.31.0"]
        Repo_Diag["registry.corp.internal/monitoring/diagnostic-service:latest"]
    end

    Artifacts --> Dockerfiles
    Dockerfiles --> Docker_Build
    Docker_Build -->|docker push| Registry_Enterprise
{{< /mermaid >}}

---

## 🔬 Dua Tantangan Teknis Kritis & Mitigasinya

Sebelum menyusun Dockerfile, ada dua karakteristik subsistem Windows NanoServer yang wajib diantisipasi agar container tidak crash saat startup:

### 1. Ketiadaan Pustaka `netapi32.dll` pada Base Image NanoServer
* **Akar Masalah:**
  Base image Windows NanoServer didesain sangat minimalis dan meniadakan pustaka Win32 API warisan. Biner yang dikompilasi menggunakan bahasa Go (seperti Prometheus, Alertmanager, dan Mailpit) secara internal memanggil fungsi sistem Windows `os/user.Current()` saat inisialisasi akun runner atau pengecekan identitas proses. Modul standar Go tersebut mengasumsikan keberadaan file `netapi32.dll`. Tanpa file ini, proses container akan langsung mengalami abort seketika (*DLL Initialization Failure*).
* **Solusi Kanonikal:**
  Kita mengekstrak file resmi `netapi32.dll` dari direktori `C:\Windows\System32\` pada host Windows Server, lalu meng-copy file tersebut ke `C:/Windows/System32/netapi32.dll` di dalam setiap container image NanoServer pada tahap build.

### 2. Pemanfaatan `node:sqlite` Native Tanpa Toolchain Kompilasi Eksternal
* **Akar Masalah:**
  Engine diagnostik insiden Tomcat (`diagnostic-service`) memerlukan penyimpanan basis data relasional lokal (SQLite) untuk mencatat riwayat triase kegagalan kontainer. Pustaka npm SQLite lawas (seperti `sqlite3` atau `better-sqlite3`) memerlukan kompilasi biner C++ native via `node-gyp` dan Microsoft Visual C++ Build Tools, yang sangat memberatkan dan rentan gagal di lingkungan container headless.
* **Solusi Kanonikal:**
  Sejak **Node.js v22.5.0+ LTS**, Node.js secara resmi menyertakan modul bawaan **`node:sqlite`** (`DatabaseSync`). Dengan menggunakan biner resmi `node.exe` **Node.js 22 LTS (v22.14.0+)**, service diagnostik dapat membuka, menulis, dan meng-query database SQLite secara instan tanpa memerlukan kompilator C++ eksternal.

---

## 🛠️ Persiapan Direktori & Berkas Build

Buat struktur workspace kerja di drive server Anda (misalnya di `C:\build\windows-containers\`):

```text
C:\build\windows-containers\
├── alertmanager\
│   ├── alertmanager.exe
│   ├── amtool.exe
│   ├── netapi32.dll
│   └── Dockerfile
├── diagnostic-service\
│   ├── node.exe             (Node.js 22.14.0+ LTS)
│   ├── netapi32.dll
│   ├── package.json
│   ├── package-lock.json
│   ├── node_modules\
│   ├── src\
│   ├── config\
│   ├── migrations\
│   └── Dockerfile
├── mailpit\
│   ├── mailpit.exe
│   ├── netapi32.dll
│   └── Dockerfile
└── prometheus\
    ├── prometheus.exe
    ├── promtool.exe
    ├── netapi32.dll
    └── Dockerfile
```

### Langkah Otomatisasi Persiapan Folder & `netapi32.dll` (PowerShell)

Jalankan perintah PowerShell berikut sebagai Administrator:

```powershell
# 1. Buat hierarki folder build
$baseBuildDir = "C:\build\windows-containers"
$components = @("mailpit", "alertmanager", "prometheus", "diagnostic-service")

foreach ($comp in $components) {
    New-Item -ItemType Directory -Force -Path "$baseBuildDir\$comp" | Out-Null
}

# 2. Salin netapi32.dll dari host ke masing-masing konteks build
$sysNetApi = "C:\Windows\System32\netapi32.dll"
if (Test-Path $sysNetApi) {
    foreach ($comp in $components) {
        Copy-Item -Path $sysNetApi -Destination "$baseBuildDir\$comp\netapi32.dll" -Force
        Write-Host "✔ netapi32.dll berhasil disalin ke $comp" -ForegroundColor Green
    }
} else {
    Write-Error "File $sysNetApi tidak ditemukan di host Windows!"
}
```

---

## 📄 Spesifikasi Lengkap Dockerfile

Berikut adalah Dockerfile kanonikal untuk masing-masing dari keempat layanan monitoring. Seluruh Dockerfile memanfaatkan parameter `--build-arg BASE_IMAGE=...` agar dapat disesuaikan dengan versi Windows Server yang Anda gunakan (`ltsc2022` untuk Windows Server 2022 atau `1809` untuk Windows Server 2019).

### 1. Dockerfile Mailpit (Testing SMTP Server & Web Inbox)

Simpan sebagai `C:\build\windows-containers\mailpit\Dockerfile`:

```dockerfile
# ==============================================================================
# Windows Container Dockerfile for Mailpit
# ==============================================================================
ARG BASE_IMAGE=mcr.microsoft.com/windows/nanoserver:ltsc2022
FROM ${BASE_IMAGE}

LABEL maintainer="Enterprise Observability Team" \
      description="Windows Container for Mailpit Testing SMTP Server & Web UI"

# Salin pustaka networking Win32 untuk runtime Go
COPY netapi32.dll C:/Windows/System32/

WORKDIR C:/mailpit
COPY mailpit.exe C:/mailpit/mailpit.exe

# Port 8025: Web UI Inbox | Port 1025: SMTP Intake
EXPOSE 8025 1025

# Lokasi persistent database mailbox
VOLUME ["C:/data"]

ENTRYPOINT ["C:/mailpit/mailpit.exe", "--listen=0.0.0.0:8025", "--smtp=0.0.0.0:1025", "--db-file=C:/data/mailpit.db"]
```

---

### 2. Dockerfile Alertmanager (Alert Routing & Notification Hub)

Simpan sebagai `C:\build\windows-containers\alertmanager\Dockerfile`:

```dockerfile
# ==============================================================================
# Windows Container Dockerfile for Alertmanager
# ==============================================================================
ARG BASE_IMAGE=mcr.microsoft.com/windows/nanoserver:ltsc2022
FROM ${BASE_IMAGE}

LABEL maintainer="Enterprise Observability Team" \
      description="Windows Container for Alertmanager Notification & Routing Hub"

# Salin pustaka networking Win32 untuk runtime Go
COPY netapi32.dll C:/Windows/System32/

WORKDIR C:/alertmanager
COPY alertmanager.exe C:/alertmanager/alertmanager.exe
COPY amtool.exe C:/alertmanager/amtool.exe

# Port 9093: HTTP API & Web UI | Port 9094: Cluster Gossip
EXPOSE 9093 9094

# Lokasi konfigurasi dan state alert
VOLUME ["C:/etc/alertmanager", "C:/alertmanager/data"]

ENTRYPOINT ["C:/alertmanager/alertmanager.exe", "--config.file=C:/etc/alertmanager/alertmanager.yml", "--storage.path=C:/alertmanager/data", "--web.listen-address=0.0.0.0:9093"]
```

---

### 3. Dockerfile Prometheus (Metrics Time-Series TSDB)

Simpan sebagai `C:\build\windows-containers\prometheus\Dockerfile`:

```dockerfile
# ==============================================================================
# Windows Container Dockerfile for Prometheus
# ==============================================================================
ARG BASE_IMAGE=mcr.microsoft.com/windows/nanoserver:ltsc2022
FROM ${BASE_IMAGE}

LABEL maintainer="Enterprise Observability Team" \
      description="Windows Container for Prometheus Monitoring TSDB"

# Salin pustaka networking Win32 untuk runtime Go
COPY netapi32.dll C:/Windows/System32/

WORKDIR C:/prometheus
COPY prometheus.exe C:/prometheus/prometheus.exe
COPY promtool.exe C:/prometheus/promtool.exe

# Port 9090: Prometheus Web & Metrics API
EXPOSE 9090

# Lokasi konfigurasi dan TSDB storage
VOLUME ["C:/etc/prometheus", "C:/prometheus/data"]

ENTRYPOINT ["C:/prometheus/prometheus.exe", "--config.file=C:/etc/prometheus/prometheus.yml", "--storage.tsdb.path=C:/prometheus/data", "--web.listen-address=0.0.0.0:9090", "--web.enable-lifecycle"]
```

---

### 4. Dockerfile Tomcat Diagnostic Service (Node.js 22 LTS & SQLite)

Simpan sebagai `C:\build\windows-containers\diagnostic-service\Dockerfile`:

```dockerfile
# ==============================================================================
# Windows Container Dockerfile for Tomcat Diagnostic Service
# ==============================================================================
ARG BASE_IMAGE=mcr.microsoft.com/windows/nanoserver:ltsc2022
FROM ${BASE_IMAGE}

LABEL maintainer="Enterprise Observability Team" \
      description="Windows Container for Tomcat Diagnostic Service Engine"

# Salin pustaka sistem helper
COPY netapi32.dll C:/Windows/System32/

# Pasang runtime Node.js 22 LTS
WORKDIR C:/node
COPY node.exe C:/node/node.exe

# Pasang kode sumber layanan diagnostik
WORKDIR C:/app
COPY package.json package-lock.json C:/app/
COPY node_modules C:/app/node_modules/
COPY src C:/app/src/
COPY config C:/app/config/
COPY migrations C:/app/migrations/

ENV NODE_ENV=production
# Port 8443: Endpoint HTTPS Webhook & Diagnostic API
EXPOSE 8443

ENTRYPOINT ["C:/node/node.exe", "C:/app/src/main.js", "--config", "C:/tm_home/config/diagnostic-service/application.json"]
```

---

## 🚀 Eksekusi Build Citra Container

Jalankan perintah pembangunan citra secara berurutan menggunakan PowerShell. Ganti tag base image bila target Anda adalah Windows Server 2019 (`1809`).

```powershell
Set-Location "C:\build\windows-containers"

# 1. Build Mailpit (~320 MB)
Write-Host "=== Membangun Mailpit Image ===" -ForegroundColor Cyan
Set-Location "C:\build\windows-containers\mailpit"
docker build --build-arg BASE_IMAGE=mcr.microsoft.com/windows/nanoserver:ltsc2022 -t mailpit:v1.31.0 .

# 2. Build Alertmanager (~370 MB)
Write-Host "=== Membangun Alertmanager Image ===" -ForegroundColor Cyan
Set-Location "C:\build\windows-containers\alertmanager"
docker build --build-arg BASE_IMAGE=mcr.microsoft.com/windows/nanoserver:ltsc2022 -t alertmanager:1.0.0 .

# 3. Build Prometheus (~590 MB)
Write-Host "=== Membangun Prometheus Image ===" -ForegroundColor Cyan
Set-Location "C:\build\windows-containers\prometheus"
docker build --build-arg BASE_IMAGE=mcr.microsoft.com/windows/nanoserver:ltsc2022 -t prometheus:1.0.0 .

# 4. Build Diagnostic Service (~380 MB)
Write-Host "=== Membangun Diagnostic Service Image ===" -ForegroundColor Cyan
Set-Location "C:\build\windows-containers\diagnostic-service"
docker build --build-arg BASE_IMAGE=mcr.microsoft.com/windows/nanoserver:ltsc2022 -t tomcat-diagnostic-service:latest .
```

Verifikasi daftar citra lokal di Docker:

```powershell
docker images
```

Output yang diharapkan:
```text
REPOSITORY                  TAG       IMAGE ID       CREATED          SIZE
tomcat-diagnostic-service   latest    3dd69b7c60c3   1 minute ago     387MB
prometheus                  1.0.0     5c91dfb2ce25   5 minutes ago    594MB
alertmanager                1.0.0     f47682cdfeed   8 minutes ago    371MB
mailpit                     v1.31.0   32e3ce89a3fe   12 minutes ago   323MB
```

---

## 📦 Publikasi Citra ke Enterprise OCI Container Registry

Setelah citra lokal berhasil dibangun, langkah berikutnya adalah mempublikasikannya ke registry internal perusahaan (misalnya Harbor, Nexus, Gitea Registry, atau AWS ECR).

```powershell
# Definisikan endpoint registry perusahaan Anda
$registry = "registry.corp.internal:5000/monitoring"

# 1. Berikan Tag Registry
docker tag mailpit:v1.31.0 "$registry/mailpit:v1.31.0"
docker tag alertmanager:1.0.0 "$registry/alertmanager:1.0.0"
docker tag prometheus:1.0.0 "$registry/prometheus:1.0.0"
docker tag tomcat-diagnostic-service:latest "$registry/tomcat-diagnostic-service:latest"

# 2. Login ke Registry (jika diperlukan)
docker login registry.corp.internal:5000 -u svc_devops_runner -p "SecretTokenOrPassword"

# 3. Unggah (Push) ke Registry
docker push "$registry/mailpit:v1.31.0"
docker push "$registry/alertmanager:1.0.0"
docker push "$registry/prometheus:1.0.0"
docker push "$registry/tomcat-diagnostic-service:latest"
```

> **Alternatif Distribusi Offline (Air-Gapped / Tanpa Jaringan Registry):**  
> Jika server target berada dalam zona DMZ tertutup tanpa akses ke registry OCI jaringan, simpan citra ke dalam file arsip `.tar`:
> ```powershell
> docker save -o C:\build\monitoring-stack-windows.tar `
>   mailpit:v1.31.0 `
>   alertmanager:1.0.0 `
>   prometheus:1.0.0 `
>   tomcat-diagnostic-service:latest
> ```
> Di server target, muat file arsip tersebut menggunakan:
> ```powershell
> docker load -i C:\transfers\monitoring-stack-windows.tar
> ```

---

## 🧪 Verifikasi Fungsionalitas & Health Probe

Untuk memastikan setiap container dapat berjalan normal dan melayani permintaan jaringan, lakukan pengujian sementara (*smoke test*):

### 1. Smoke Test Mailpit
```powershell
# Jalankan container test
docker run -d --name test-mailpit -p 8025:8025 -p 1025:1025 mailpit:v1.31.0

# Verifikasi Web UI
$res = Invoke-WebRequest -Uri "http://localhost:8025" -UseBasicParsing
Write-Host "Mailpit HTTP Status: $($res.StatusCode)" -ForegroundColor Green

# Bersihkan container test
docker rm -f test-mailpit
```

### 2. Smoke Test Prometheus
```powershell
# Jalankan container test
docker run -d --name test-prometheus -p 9090:9090 prometheus:1.0.0

# Verifikasi Endpoint /-/ready
$res = Invoke-WebRequest -Uri "http://localhost:9090/-/ready" -UseBasicParsing
Write-Host "Prometheus HTTP Status: $($res.StatusCode)" -ForegroundColor Green

# Bersihkan container test
docker rm -f test-prometheus
```

---

## 🔄 Integrasi GitOps dengan Operator `tmctl`

Dengan tersedianya image Windows NanoServer di registry, alur pembaruan dan operasional seluruh cluster server Windows kini terhubung mulus dengan deklarasi GitOps.

Pada berkas `monitoring-spec.yaml` repository GitOps Anda:

```yaml
version: "1.0"
metadata:
  environment: "production"
  platform: "windows"

services:
  prometheus:
    image: "registry.corp.internal:5000/monitoring/prometheus:1.0.0"
    ports:
      - "9090:9090"
  alertmanager:
    image: "registry.corp.internal:5000/monitoring/alertmanager:1.0.0"
    ports:
      - "9093:9093"
  mailpit:
    image: "registry.corp.internal:5000/monitoring/mailpit:v1.31.0"
    ports:
      - "8025:8025"
  diagnostic_service:
    image: "registry.corp.internal:5000/monitoring/tomcat-diagnostic-service:latest"
    ports:
      - "8443:8443"
```

Operator **`tmctl`** di server target akan secara berkala mengecek perubahan spec manifest melalui task scheduler (`tmctl gitops sync`), melakukan `docker pull` image Windows baru, dan me-recreate container monitoring secara idempoten tanpa kehilangan data pada volume persisten.

---

## 🏁 Kesimpulan

Membangun image monitoring berbasis Windows NanoServer memecahkan dilema klasik observabilitas di ekosistem Windows Server:
1. **Ringan & Aman:** Menghindari beban image raksasa Windows Server Core dengan memanfaatkan NanoServer yang hemat disk dan memori.
2. **Kepatuhan Native:** Memenuhi dependensi biner Go (`netapi32.dll`) dan Node.js 22 LTS (`node:sqlite`) secara elegan tanpa mengotori sistem operasi host.
3. **Standar Seragam:** Memberikan keseragaman operasional antara node Linux dan Windows, sehingga seluruh stack pemantauan dapat dipantau langsung via `docker ps` dan diorkestrasikan dengan pendekatan GitOps modern.
