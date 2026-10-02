+++
title = "tm-agent — Unified Cross-Platform Event Collector Daemon"
date = "2026-09-20T21:00:00+07:00"
draft = false
summary = "Bedah arsitektur tm-agent: daemon background berbasis Go untuk streaming event lifecycle container secara real-time langsung dari engine socket API, deteksi OOM/crash instan (<10ms), dan serialisasi bukti atomik."
author = "Eddy Wiyatno"
categories = ["DevOps", "Observability", "Go"]
tags = ["golang", "daemon", "podman", "docker", "event-streaming", "sre", "linux", "windows"]
series = ["Tomcat Autonomous Diagnostic Platform"]
toc = true
showSummary = true
+++

{{< lead >}}
**Real-Time Container Lifecycle Streaming & Atomic Evidence Spooling Daemon**

`tm-agent` (*Tomcat Monitoring Event Collector Daemon*) adalah background daemon mandiri berbobot ringan yang ditulis dalam Go. Daemon ini bertugas menangkap event streaming lifecycle container secara real-time langsung dari **Container Engine Socket API** (Podman dan Docker) dan menerbitkan rekaman bukti JSON terstruktur ke direktori spool host secara atomik.
{{< /lead >}}

---

## 💡 Motivasi Rekayasa: Mengapa Shell Collector Gagal di Production?

Dalam alur investigasi insiden otonom, merekam status kegagalan yang bersifat *ephemeral* (*OOM-Killed*, exit code 137, terminasi sinyal SIGKILL, atau kematian proses mendadak) membutuhkan mekanisme penangkapan event yang persisten dan tangguh. 

Mengandalkan skrip collector berbasis Bash konvensional (`src/collector.sh`) dengan pipa subshell seperti `podman events | while read line; do ...` terbukti menimbulkan liabilitas operasional serius di lingkungan enterprise:

1. **Stdout Pipe Buffering & Keterlambatan Deteksi:** Pipa subshell shell script mengalami *buffering delay*, menyebabkan keterlambatan puluhan detik dalam menangkap event fatal—krusial saat insiden terjadi.
2. **Kerapuhan Koneksi & Silent Deaths:** Jika subshell terputus akibat engine restart atau socket timeout, skrip shell sering kali mati diam-diam (*silent failure*) tanpa mekanisme *reconnect* otomatis.
3. **Race Condition pada Konsumsi Bukti Forensik:** Skrip shell yang menulis langsung ke file tujuan (`> event.json`) sering terbaca saat data baru terisi separuh oleh Diagnostic Service, memicu galat *corrupted JSON parse*.
4. **Pertumbuhan Spool Tak Terbatas (*Unbounded Spool Growth*):** Skrip shell tidak memiliki mekanisme kuota dan rotasi FIFO yang andal, berisiko memenuhi kapasitas disk (*disk full outage*) pada insiden berskala besar.
5. **Inkompatibilitas Windows Server:** Skrip shell Linux (`systemd --user`) tidak dapat berjalan secara native di Windows Server tanpa lapisan emulasi berat.

### 📊 Matriks Perbandingan: Raw CLI vs Shell Script vs `tm-agent`

| Kapabilitas Operasional | Raw `podman/docker events` CLI | Legacy Shell Daemon (`src/collector.sh`) | **`tm-agent` (Go Daemon)** |
| :--- | :--- | :--- | :--- |
| **Eksekusi Native Windows** | Memerlukan loop PowerShell manual | Gagal (membutuhkan Bash/Linux) | **Single native static binary (`tm-agent.exe`)** |
| **Protokol Socket Stream** | Unstructured CLI stdout | String scraping rapuh di subshell | **Persistent HTTP chunked socket streaming** |
| **Resiliensi Koneksi** | Keluar saat engine disconnect | Unhandled background crash | **Automatic exponential backoff reconnect** |
| **Serialisasi File Atomik** | Redireksi langsung (`>`) | Race-prone non-atomic writes | **Thread-safe `.tmp` $\rightarrow$ `.json` (`0600`)** |
| **Jaminan Kontrak Skema** | Tidak ada | Ad-hoc text formatting | **100% validasi skema `event-record-v1`** |
| **Retensi Spool Otonom** | Tidak didukung | Memerlukan cron eksternal | **Built-in 24h prune & batas 1.000 file FIFO** |
| **Ketergantungan Runtime** | Binary CLI engine terpasang | Memerlukan Bash, Coreutils, jq | **Nol dependensi eksternal (`CGO_ENABLED=0`)** |

---

## 🏛️ Arsitektur & Pipeline Aliran Event

`tm-agent` berjalan terus-menerus di latar belakang (*background daemon*), mengalirkan rekaman bukti secara atomik dari socket ke direktori spool berizin terbatas:

{{< mermaid >}}
flowchart LR
    %% ── Color Palette Definitions ──
    classDef socket fill:#1e293b,stroke:#a855f7,stroke-width:1.5px,color:#e2e8f0;
    classDef agent fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#ffffff;
    classDef spool fill:#1e293b,stroke:#f59e0b,stroke-width:1.5px,color:#fde68a;
    classDef authority fill:#4c1d95,stroke:#8b5cf6,stroke-width:1.5px,color:#ffffff;

    subgraph ENGINE["1. Container Engine Socket"]
        direction LR
        SOCK["Unix Socket / Named Pipe"]:::socket --> STREAM["GET /events Stream"]:::socket
    end

    subgraph AGENT["2. tm-agent Stream Pipeline"]
        direction LR
        LISTENER["Stream Consumer"]:::agent --> FORMATTER["Schema Formatter"]:::agent --> PRUNER["FIFO Pruner"]:::agent --> WRITER["Atomic Writer (0600)"]:::agent
    end

    subgraph SPOOL["3. Host Spool (0700)"]
        SPOOL_DIR["/opt/tm-home/spool (Linux)<br/>C:/tm-home/spool (Windows)"]:::spool
    end

    subgraph CONSUMER["4. Diagnostic Engine"]
        DS["🚀 Tomcat Diagnostic Service<br/>(Read-Only Mount)"]:::authority
    end

    STREAM ==>|HTTP/JSON Stream| LISTENER
    WRITER ==>|Atomic .tmp to .json| SPOOL_DIR
    SPOOL_DIR ==>|Correlate Event Evidence| DS

    style ENGINE fill:#0b1329,stroke:#7c3aed,stroke-width:1px,color:#c4b5fd
    style AGENT fill:#0b1329,stroke:#059669,stroke-width:1px,color:#a7f3d0
    style SPOOL fill:#0b1329,stroke:#d97706,stroke-width:1px,color:#fde68a
    style CONSUMER fill:#0b1329,stroke:#7c3aed,stroke-width:1px,color:#c4b5fd
{{< /mermaid >}}

### Keunggulan Arsitektur Utama
* **Direct Socket Event Streaming:** Terhubung langsung ke Docker (`GET /events`) atau Podman (`GET /v4.0.0/libpod/events`) melalui Unix Domain Socket atau Windows Named Pipe dengan koneksi HTTP chunked persistent.
* **Deteksi Instan (<10ms):** Mengidentifikasi event kritis seperti `died`, `oom`, dan `exit_code: 137` seketika saat kernel memicu cgroup termination.
* **Atomic File Serialization (`0600`):** Setiap record ditulis ke file sementara `.tmp` terlebih dahulu sebelum dieksekusi operasi atomik rename (`.tmp` $\rightarrow$ `.json`). Hal ini menggaransi Diagnostic Service hanya membaca file yang sudah terisi sempurna (*race condition elimination*).
* **Strict Schema Contract (`event-record-v1`):** Menerbitkan event berformat standar yang memuat timestamp ISO 8601, container ID, image, status, exit code, sinyal terminasi, dan atribut environment.
* **Autonomous FIFO Retention:** Secara mandiri membersihkan record yang lebih lama dari 24 jam, menghapus file `.tmp` yatim (*orphaned*) di atas 60 menit, dan menerapkan batas maksimal 1.000 file dengan rotasi FIFO untuk mencegah kehabisan kapasitas disk.
* **Multi-OS Daemon Management:** Dapat didaftarkan sebagai `systemd --user` service di Linux atau dijalankan sebagai background service di Windows Server.

---

## 📦 Mode Operasional

`tm-agent` mendukung dua mode eksekusi utama:

### 1. Foreground Streaming Daemon (Mode Produksi)

```bash
# Menjalankan agent di background/foreground dengan konfigurasi default
tm-agent

# Menentukan target container spesifik dan direktori spool kustom
tm-agent \
  --target tomcat-jmx-exporter \
  --target-id lab/tomcat-01/default \
  --spool-dir /opt/tm-home/spool

# Menentukan jalur soket Podman kustom
tm-agent --engine podman --socket /run/user/1000/podman/podman.sock
```

### 2. One-Shot Snapshot Mode (Audit & Pengujian)

```bash
# Mengambil snapshot status kontainer saat ini secara instan lalu exit
tm-agent --run-once --spool-dir /opt/tm-home/spool
```

---

## 🔗 Bagian dari Platform
Halaman ini merupakan sub-modul dari:
* [**Tomcat Monitoring & Autonomous Diagnostic Platform**]({{< ref "projects/tomcat-monitoring" >}})
* Sub-modul lainnya: [**tmctl**]({{< ref "projects/tomcat-monitoring/tmctl" >}}) · [**Diagnostic Service**]({{< ref "projects/tomcat-monitoring/diagnostic-service" >}})
