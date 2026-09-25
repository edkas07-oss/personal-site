+++
title = "Tomcat Monitoring & Autonomous Diagnostic Platform"
date = "2026-09-20T21:00:00+07:00"
draft = false
summary = "Platform pemantauan dan diagnosa insiden otonom untuk Apache Tomcat di lingkungan multi-OS (Linux & Windows) dengan kebijakan Zero Destructive Auto-Remediation, korelasi bukti forensik deterministik, dan tiga modul terpadu: tmctl, tm-agent, dan diagnostic service."
author = "Eddy Wiyatno"
categories = ["SRE", "Observability", "Platform Engineering"]
tags = ["tomcat", "sre", "observability", "golang", "nodejs", "podman", "docker", "prometheus", "alertmanager"]
series = ["Tomcat Autonomous Diagnostic Platform"]
toc = true
showSummary = true
modules_subtitle = "Tiga perangkat lunak mandiri yang menopang observabilitas dan diagnosa otonom Tomcat."
+++

{{< lead >}}
**Embedded, High-Availability Observability & Autonomous Incident Decision Authority**

Arsitektur pemantauan performa internal dan diagnosa insiden deterministik untuk Apache Tomcat di lingkungan hybrid enterprise (Linux Podman rootless & Windows Server Docker), dirancang dengan prinsip *Zero Destructive Auto-Remediation* dan korelasi forensik multi-sumber tanpa pengadaan infrastruktur tambahan.
{{< /lead >}}

---

## 📌 Ringkasan Eksekutif & Value Proposition

Dalam ekosistem aplikasi enterprise mission-critical, runtime Java Virtual Machine (JVM) dan Apache Tomcat kerap mengalami kegagalan operasional yang kompleks—mulai dari *Garbage Collection (GC) thrashing*, saturasi konektor thread HTTP, kebocoran memori (*memory leak* / OOM), hingga crash mendadak akibat kegagalan dependensi backend.

Pemantauan tradisional sering kali menghadapi dua dilema ekstrem:
1. **Alert Fatigue & Fragmentasi Bukti:** Tim on-call dibanjiri puluhan alert mentah dari Prometheus/Alertmanager tanpa konteks, memaksa operator melakukan SSH manual, memeriksa file log berukuran gigabyte, dan mengumpulkan data forensik secara reaktif.
2. **Bahaya Blind Auto-Remediation:** Skrip *watchdog* atau auto-restart container yang tidak memiliki pemahaman konteks sering kali memperparah kerusakan (*reboot loops*, penghapusan artefak memori/heap dump, dan badai koneksi ke database).

**Tomcat Monitoring & Autonomous Diagnostic Platform** hadir sebagai solusi terpadu yang dirancang dengan karakteristik:
* **Cost-Efficient & Embedded Topology:** Berjalan berdampingan langsung di dalam kapasitas host server Tomcat tanpa memerlukan alokasi VM atau node monitoring terpisah.
* **Autonomous Incident Decision Authority:** Mengubah alert mentah menjadi investigasi forensik deterministik yang berkorelasi dengan log aplikasi, event kernel/container, dan telemetri metrik.
* **Human-in-the-Loop Governance:** Menolak tindakan destruktif buta; menyajikan laporan insiden kanonikal 7-seksi lengkap dengan Standard Operating Procedure (SOP) kurasi SRE siap eksekusi.
* **Multi-OS Native Portability:** Beroperasi secara seragam pada Linux (Podman rootless) dan Windows Server (Docker) melalui abstraksi Socket API langsung.

---

## 🏛️ Arsitektur Platform & Alur Data

Diagram berikut mengilustrasikan interaksi menyeluruh antara runtime Tomcat, komponen pengumpul telemetri, modul streaming event, dan mesin diagnosa otonom:

{{< mermaid >}}
flowchart TD
    %% ── Color Palette Definitions ──
    classDef runtime fill:#1e3a8a,stroke:#3b82f6,stroke-width:1.5px,color:#ffffff;
    classDef telemetry fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#ffffff;
    classDef authority fill:#4c1d95,stroke:#8b5cf6,stroke-width:1.5px,color:#ffffff;
    classDef cli fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#38bdf8;
    classDef external fill:#7c2d12,stroke:#f97316,stroke-width:1.5px,color:#ffffff;
    classDef storage fill:#1e293b,stroke:#64748b,stroke-width:1.5px,color:#e2e8f0;

    subgraph Host["Host Server (Linux / Windows Server)"]
        subgraph TomcatRuntime["Apache Tomcat Runtime"]
            TC["Tomcat Catalina Container"]:::runtime
            JMX["Prometheus JMX Exporter<br/>(Java Agent :9404 TLS)"]:::runtime
            LOGS["Application Logs<br/>(catalina.out / crash dumps)"]:::storage
        end

        subgraph IngestionStream["Event & Metric Ingestion"]
            AGENT["📦 tm-agent<br/>(Go Socket Event Daemon)"]:::telemetry
            PROM["Prometheus Server<br/>(Scrape JMX & OS Metrics)"]:::telemetry
            AM["Alertmanager<br/>(Webhook Dispatcher)"]:::telemetry
        end

        subgraph CoreEngine["Diagnostic Authority & Orchestration"]
            DS["🚀 Tomcat Diagnostic Service<br/>(Node.js 24 LTS / Rulepack Engine)"]:::authority
            SQLITE[("Embedded SQLite<br/>Incident Ledger")]:::storage
            TMCTL["🛠️ tmctl CLI<br/>(Go Socket Operator Tool)"]:::cli
        end
    end

    subgraph External["External Notification & On-Call"]
        SMTP["Mail Server (Postfix / SMTP)"]:::external
        ONCALL["👨‍💻 SRE / DevOps On-Call Team<br/>(Human-in-the-Loop)"]:::external
    end

    TC -- "Container Socket Stream" --> AGENT
    AGENT -- "Atomic Spool (.json)" --> DS
    JMX -- "Scrape :9404 (HTTPS)" --> PROM
    PROM -- "Alert Threshold Firing" --> AM
    AM -- "Webhook Ingestion" --> DS
    LOGS -- "Forensic Evidence Read" --> DS

    DS -- "Evaluate Rulepacks & Correlate" --> SQLITE
    DS -- "Dispatch 7-Section Report" --> SMTP
    SMTP --> ONCALL

    ONCALL -- "Verified Remediation via" --> TMCTL
    TMCTL -- "Direct Socket Orchestration" --> TC

    %% Subgraph Styling
    style Host fill:#070d1e,stroke:#1e3a8a,stroke-width:1.5px,stroke-dasharray: 4 4,color:#93c5fd
    style TomcatRuntime fill:#0b1329,stroke:#1e293b,stroke-width:1px,color:#cbd5e1
    style IngestionStream fill:#0b1329,stroke:#1e293b,stroke-width:1px,color:#cbd5e1
    style CoreEngine fill:#0b1329,stroke:#1e293b,stroke-width:1px,color:#cbd5e1
    style External fill:#0b1329,stroke:#1e293b,stroke-width:1px,color:#cbd5e1
{{< /mermaid >}}

---

## 🛡️ Invarian & Prinsip Desain Utama

Arsitektur platform ini dikunci oleh seperangkat keputusan arsitektur resmi (*Architectural Decision Records / ADR*):

| Invarian Arsitektur | Landasan ADR | Deskripsi Teknis |
| :--- | :--- | :--- |
| **Zero Destructive Auto-Remediation** | [`TM-ADR-0014`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0014/) | Sistem diagnosa beroperasi secara *read-only*. Dilarang mengeksekusi restart container otomatis secara buta untuk menjaga integritas artefak forensik (*heap dumps*, *hs_err_pid.log*). |
| **Canonical Incident Notification Authority** | [`TM-ADR-0016`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0016/) | Seluruh alert eksternal di-routing eksklusif melalui Diagnostic Service untuk menghasilkan laporan insiden kanonikal 7-seksi yang seragam dan actionable. |
| **Direct Socket API Portability** | [`TM-ADR-0027`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0027/) | Mengeliminasi ketergantungan pada subshell Bash atau binary CLI mentah. Tooling berinteraksi langsung dengan Unix Socket Podman atau Windows Named Pipes. |
| **Two-Tier Storage Architecture** | [`TM-ADR-0030`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0030/) | Standarisasi direktori kerja `tm_home` dengan pemisahan izin ketat antara *ephemeral spool evidence* (`0700`) dan *immutable configuration/rulepacks* (`0400`). |

---

## 📦 Tiga Modul Kunci Platform

Platform ini ditopang oleh 3 pilar perangkat lunak mandiri yang saling berkolaborasi:

### 1. [tmctl — Unified Cross-Platform Operator CLI]({{< ref "projects/tomcat-monitoring/tmctl" >}})
* **Bahasa & Arsitektur:** Go 1.23+ (Single Static Binary, Zero Dependency).
* **Fokus Rekayasa:** Pengganti skrip imperatif shell. Mengorkestrasi container lifecycle, validasi kepatuhan platform (*compliance checks*), sinkronisasi aturan diagnosa (*rulepacks*), dan mekanisme *stateful rollback* saat health probe gagal.
* **Keunggulan:** Komunikasi socket native (Podman Unix Socket & Windows Named Pipe `\\.\pipe\docker_engine`), response JSON terstruktur tanpa text scraping (`grep`/`awk`).
* [👉 Pelajari Arsitektur & Perintah `tmctl` →]({{< ref "projects/tomcat-monitoring/tmctl" >}})

### 2. [tm-agent — High-Throughput Event Collector Daemon]({{< ref "projects/tomcat-monitoring/tm-agent" >}})
* **Bahasa & Arsitektur:** Go 1.23+ (Lightweight Background Daemon).
* **Fokus Rekayasa:** Mengonsumsi event stream lifecycle container secara real-time langsung dari engine socket.
* **Keunggulan:** Deteksi instan (<10ms) untuk kejadian *OOM-Killed*, exit code 137, dan kematian proses mendadak. Menggunakan teknik *atomic file write* (`.tmp` $\rightarrow$ `.json` rename) pada direktori spool berizin `0700` untuk mencegah *race condition* saat dibaca oleh Diagnostic Service.
* [👉 Pelajari Pipeline Event `tm-agent` →]({{< ref "projects/tomcat-monitoring/tm-agent" >}})

### 3. [Tomcat Diagnostic Service — Autonomous Decision Authority]({{< ref "projects/tomcat-monitoring/diagnostic-service" >}})
* **Bahasa & Arsitektur:** Node.js 24 LTS (Deterministic Multi-Domain Rulepack Engine).
* **Fokus Rekayasa:** Otak analisis insiden. Menerima webhook Alertmanager, mengorelasikan telemetri metrik Prometheus dengan log Tomcat dan event spool `tm-agent`.
* **Keunggulan:** Mengklasifikasikan insiden ke dalam **8 Failure Domain Taxonomy**, mencatat histori insiden ke SQLite lokal, dan mendistribusikan laporan insiden kanonikal 7-seksi dengan rekomendasi SOP SRE via email SMTP.
* [👉 Pelajari Mesin Diagnosa & Taksonomi Insiden →]({{< ref "projects/tomcat-monitoring/diagnostic-service" >}})

---

## 📚 Studi Kasus & Jurnal Rekayasa Terkait

Untuk pemahaman mendalam mengenai tantangan operasional dan implementasi teknis di balik platform ini, simak publikasi jurnal rekayasa berikut:

* [Mengapa Auto-Restart di Production Berbahaya: Menerapkan Kebijakan Zero Destructive Auto-Remediation]({{< ref "journals/mengapa-auto-restart-di-production-berbahaya" >}})
* [Deep-Dive Observability Apache Tomcat: Mengamankan JMX Exporter dengan TLS & Keystore]({{< ref "journals/deep-dive-observability-apache-tomcat-jmx-exporter-tls" >}})
* [Mendeteksi Concurrency Saturation dan GC Thrashing pada Workload Enterprise]({{< ref "journals/mendeteksi-concurrency-saturation-dan-gc-thrashing" >}})
