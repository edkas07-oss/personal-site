+++
title = "tmctl — Unified Cross-Platform Operator CLI for Socket-Based Container Orchestration"
date = "2026-09-20T21:00:00+07:00"
draft = false
summary = "Bedah arsitektur tmctl: binary Go statis mandiri untuk orkestrasi container engine via Socket API (Podman Unix Socket & Windows Named Pipe), dynamic rulepack ingestion, dan stateful safe rollback tanpa ketergantungan skrip shell."
author = "Eddy Wiyatno"
categories = ["DevOps", "Platform Engineering", "Go"]
tags = ["golang", "cli", "podman", "docker", "orchestration", "sre", "multi-os"]
series = ["Tomcat Autonomous Diagnostic Platform"]
toc = true
showSummary = true
+++

{{< lead >}}
**Single Static Go Binary for Direct Container Engine Socket Orchestration**

`tmctl` (*Tomcat Monitoring Control CLI*) dirancang untuk menjembatani operator dan pipeline CI/CD dengan runtime container secara deterministik melalui antarmuka **Container Engine Socket API** (Podman dan Docker), menggantikan kerapuhan skrip Bash imperatif dan keterbatasan eksekusi di lingkungan hybrid Linux/Windows.
{{< /lead >}}

---

## 💡 Motivasi Rekayasa: Mengapa Mengeliminasi Skrip Shell?

Dalam operasional infrastruktur hybrid enterprise yang menjalankan Apache Tomcat pada Linux (Podman rootless) dan Windows Server (Docker), pendekatan otomatisasi berbasis skrip shell (`.sh` / `.ps1`) atau perintah CLI mentah (`docker run`, `podman run`) menimbulkan friksi teknis yang signifikan:

1. **Dual-Script Maintenance & Desinkronisasi:** Mempertahankan dua set skrip terpisah—Bash untuk Linux dan PowerShell untuk Windows—hampir selalu berujung pada inkonsistensi logika *lifecycle* dan *error handling*.
2. **Kerapuhan Parsing Teks (*String Scraping*):** Menjalankan perintah shell dan mem-parsing output terminal menggunakan kombinasi `grep`, `awk`, dan `jq` rentan pecah saat format output CLI berubah atau saat terjadi *unhandled error output* di `stderr`.
3. **Kompleksitas Abstraksi Multi-Engine:** Menangani perbedaan soket rootless Podman, flag SELinux (`:z`), user namespace (`--userns=keep-id`), serta Windows Named Pipe (`\\.\pipe\docker_engine`) di dalam skrip shell membutuhkan percabangan logika yang rumit dan rentan kesalahan.
4. **Ketiadaan Stateful Rollback Terjamin:** Skrip imperatif sulit mengelola *snapshot state* container lama secara atomik ketika deployment versi baru mengalami *health check timeout*.

### 📊 Matriks Perbandingan: Raw CLI vs Shell Script vs `tmctl`

| Kapabilitas Operasional | Raw `docker` / `podman` CLI | Skrip Shell (`.sh` / `.ps1`) | **`tmctl` (Go Static Binary)** |
| :--- | :--- | :--- | :--- |
| **Eksekusi Native Windows** | Memerlukan PowerShell wrappers | Memerlukan duplikasi `.ps1` | **Single native static binary (`tmctl.exe`)** |
| **Abstraksi Engine** | Pergantian sintaks manual | Wrapper kondisional rumit | **Deteksi otomatis Socket & Named Pipe** |
| **Parsing Error & Status** | Unstructured CLI stdout | Regular expression rapuh | **Pure JSON via Direct Socket REST API** |
| **Ketergantungan Runtime** | Binary CLI engine terpasang | Memerlukan Bash, Coreutils, jq | **Nol dependensi eksternal (`CGO_ENABLED=0`)** |
| **Automated Safe Rollback** | Butuh intervensi manual | Logika shell rumit & rawan gagal | **Built-in stateful snapshot & auto-rollback** |
| **Platform Contract Audit** | Tidak didukung | Perlu tool validasi eksternal | **Built-in compliance & schema validator** |
| **Orchestrator Integration** | Skrip rapuh di Ansible/Jenkins | Risiko tinggi host lock-in | **Deterministik & seragam di semua CI/CD runner** |

---

## 🏛️ Arsitektur & Jalur Komunikasi Socket

`tmctl` beroperasi tanpa memanggil binary `podman` atau `docker` di host. Sebaliknya, ia berkomunikasi langsung menggunakan protokol HTTP di atas soket stream lokal:

{{< mermaid >}}
flowchart LR
    %% ── Color Palette Definitions ──
    classDef cli fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#38bdf8;
    classDef socket fill:#1e293b,stroke:#a855f7,stroke-width:1.5px,color:#e2e8f0;
    classDef workload fill:#1e3a8a,stroke:#3b82f6,stroke-width:1.5px,color:#ffffff;
    classDef daemon fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#ffffff;
    classDef authority fill:#4c1d95,stroke:#8b5cf6,stroke-width:1.5px,color:#ffffff;

    subgraph OPERATOR["Operator / CI Runner (Linux / Windows)"]
        CLI["🛠️ tmctl / tmctl.exe<br/>(Go 1.23+ Static Binary)"]:::cli
    end

    subgraph ENGINE["Container Engine Socket"]
        SOCK["Unix Domain Socket<br/>/run/user/.../podman.sock<br/>atau Windows Named Pipe<br/>\\\\.\\pipe\\docker_engine"]:::socket
        API["REST Engine API<br/>(/v4.0.0/libpod atau /v1.41)"]:::socket
    end

    subgraph WORKLOADS["Managed Workload Fleet"]
        TC["tomcat-jmx-exporter"]:::workload
        PROM["prometheus"]:::daemon
        AM["alertmanager"]:::daemon
        DS["diagnostic-service"]:::authority
    end

    CLI ==>|Direct HTTP over Socket| SOCK ==> API
    API --> WORKLOADS

    style OPERATOR fill:#0b1329,stroke:#1e3a8a,stroke-width:1px,color:#93c5fd
    style ENGINE fill:#0b1329,stroke:#7c3aed,stroke-width:1px,color:#c4b5fd
    style WORKLOADS fill:#0b1329,stroke:#1e293b,stroke-width:1px,color:#cbd5e1
{{< /mermaid >}}

### Keunggulan Arsitektur Utama
* **Zero Runtime Dependencies:** Dikompilasi dengan `CGO_ENABLED=0`, menghasilkan binary mandiri yang dapat langsung dieksekusi tanpa instalasi runtime Go, Python, atau Node.js pada target host.
* **Direct Socket REST Communication:** Memanfaatkan Unix Domain Socket (`/run/user/.../podman.sock` atau `/var/run/docker.sock`) dan Windows Named Pipes (`\\.\pipe\docker_engine`), menerima response JSON terstruktur langsung dari engine daemon.
* **Two-Tier Storage Aware:** Mengelola koordinasi workspace host (`/opt/tm-home` atau `C:\tm-home`) untuk konfigurasi, sertifikat TLS, dan rahasia, sembari mengaitkannya ke High-I/O Engine Named Volumes (`prometheus_data`, `diagnostic_data`, `tomcat_logs`) merujuk pada [`TM-ADR-0030`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0030/).
* **Stateful Safe Rollback:** Saat memperbarui container, `tmctl` melakukan snapshot nama container lama. Jika health probe kontainer baru gagal melampaui batas toleransi waktu, `tmctl` secara otomatis memusnahkan kontainer baru dan merestorasi kontainer lama ke status operasional.
* **Declarative Rulepack Ingestion:** Mengunggah atau mengekspor aturan diagnosa insiden JSON ke Diagnostic Service secara dinamis pada saat runtime tanpa memerlukan restart container.

---

## 📖 Panduan Penggunaan Subcommand

`tmctl` mengelompokkan fungsionalitas operasional ke dalam command tree yang modular dan ekspresif:

### 1. Manajemen Lifecycle Stack (`stack`)

```bash
# Menjalankan seluruh stack monitoring secara terorkestrasi
tmctl stack deploy

# Melakukan rolling update / deploy pada komponen spesifik
tmctl stack deploy --target tomcat
tmctl stack deploy --target diagnostic

# Memeriksa status kesehatan dan port binding seluruh kontainer
tmctl stack status

# Menghentikan kontainer stack dengan aman
tmctl stack clean

# Teardown total (termasuk engine named volumes dan network kustom)
tmctl stack clean --all
```

### 2. Manajemen Dynamic Rulepacks (`rules`)

```bash
# Melakukan validasi schema dan ingest rulepack JSON ke Diagnostic Service
tmctl rules ingest /opt/tm-home/rules/database-rules.json

# Mengunggah seluruh rulepack di sebuah direktori secara batch
tmctl rules ingest /opt/tm-home/rules/ --batch

# Mengekspor rulepack aktif dari Diagnostic Service ke file lokal
tmctl rules export --out /tmp/active-rules.json

# Menghapus rulepack berdasarkan ID aturan
tmctl rules delete TD-09
```

### 3. Validasi Kepatuhan & Kontrak Platform (`compliance`)

```bash
# Melakukan audit kepatuhan konfigurasi, permissions file, dan socket
tmctl compliance check

# Memeriksa integritas sertifikat TLS dan tanggal kedaluwarsa
tmctl compliance check --tls
```

---

## 🔗 Bagian dari Platform
Halaman ini merupakan sub-modul dari:
* [**Tomcat Monitoring & Autonomous Diagnostic Platform**]({{< ref "projects/tomcat-monitoring" >}})
* Sub-modul lainnya: [**tm-agent**]({{< ref "projects/tomcat-monitoring/tm-agent" >}}) · [**Diagnostic Service**]({{< ref "projects/tomcat-monitoring/diagnostic-service" >}})
