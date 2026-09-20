+++
title = "Tomcat Diagnostic Service — Autonomous Decision Authority & Multi-Domain Triage"
date = "2026-09-20T21:00:00+07:00"
draft = false
summary = "Bedah arsitektur Tomcat Diagnostic Service: mesin diagnosa otonom berbasis Node.js 24 LTS yang mengorelasikan bukti forensik multi-sumber, mengklasifikasi kegagalan dalam 8 Failure Domain, dan mendistribusikan laporan insiden kanonikal 7-seksi via SMTP."
author = "Eddy Wiyatno"
categories = ["SRE", "Observability", "Architecture"]
tags = ["nodejs", "sre", "incident-response", "alertmanager", "forensics", "sqlite", "architecture"]
series = ["Tomcat Autonomous Diagnostic Platform"]
toc = true
showSummary = true
+++

{{< lead >}}
**Autonomous Diagnostic Engine, Forensic Correlator & Incident Decision Authority**

`Tomcat Diagnostic Service` bertindak sebagai pusat otoritas diagnosa insiden otonom untuk platform pemantauan Apache Tomcat. Berjalan di atas Node.js 24 LTS, layanan ini bertugas mengonsumsi alert runtime dari Alertmanager, mengorelasikan bukti forensik multi-sumber secara deterministik, mengevaluasi aturan berbasis rulepack deklaratif, mencatat ledger insiden ke SQLite lokal, dan mendistribusikan laporan insiden 7-seksi siap tindak lanjut (*actionable SOP*) ke tim on-call.
{{< /lead >}}

---

## 💡 Motivasi Rekayasa: Dari "Alert Fatigue" ke Investigasi Forensik

Dalam operasional SRE skala enterprise, tantangan terbesar saat insiden terjadi bukanlah ketiadaan alat pantau, melainkan **kebisingan alert (*alert noise*) dan fragmentasi bukti**. 

Ketika sebuah instance Tomcat mengalami degradasi atau mati mendadak:
1. **Badai Alert Tak Terkorelasi:** Prometheus dapat memicu 5 hingga 10 alert secara bersamaan (`TomcatDown`, `HighHttp5xxRate`, `ThreadPoolExhausted`, `HighGCPauseDuration`). Operator manusia kesulitan membedakan mana yang merupakan akar masalah (*root cause*) dan mana yang sekadar gejala lanjutan (*cascading symptoms*).
2. **Ketiadaan Konteks Bukti Forensik:** Notifikasi alert standar Alertmanager hanya berisi nilai metrik mentah pada saat threshold terlampaui. Data esensial seperti potongan stack trace dari `catalina.out`, status OOM kernel dari host spool `tm-agent`, atau crash dump JVM (`hs_err_pid.log`) harus dicari secara manual oleh engineer on-call.
3. **Risiko Auto-Remediation Liar:** Memasang script restart otomatis tanpa analisis konteks dapat menghapus memori sementara, memicu *reboot loop*, dan memperparah insiden merujuk pada [`TM-ADR-0014`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0014/).

`Tomcat Diagnostic Service` menyelesaikan problematika ini dengan bertindak sebagai **Canonical Incident Notification Authority** ([`TM-ADR-0016`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0016/)) yang beroperasi secara *read-only* murni.

---

## 🏛️ Alur Investigasi & Pipeline Triage Insiden

Diagnostic Service menerapkan pola evaluasi multi-tahap yang deterministik:

{{< mermaid >}}
flowchart TD
    %% ── Color Palette Definitions ──
    classDef webhook fill:#7c2d12,stroke:#f97316,stroke-width:1.5px,color:#ffffff;
    classDef core fill:#4c1d95,stroke:#8b5cf6,stroke-width:1.5px,color:#ffffff;
    classDef evidence fill:#1e293b,stroke:#3b82f6,stroke-width:1.5px,color:#93c5fd;
    classDef evaluation fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#ffffff;
    classDef storage fill:#1e293b,stroke:#64748b,stroke-width:1.5px,color:#e2e8f0;
    classDef dispatch fill:#7c2d12,stroke:#f43f5e,stroke-width:1.5px,color:#ffffff;

    AM["Alertmanager Webhook<br/>(HTTPS Ingestion :8443)"]:::webhook --> INGEST["Queue & Ingestion Controller"]:::core
    
    subgraph CORRELATION["Multi-Source Forensic Correlator"]
        INGEST --> DISP["Multi-Domain Dispatcher<br/>(TM-ADR-0023)"]:::core
        DISP --> EV1["1. Application Logs<br/>(catalina.out tail & sanitize)"]:::evidence
        DISP --> EV2["2. Container Spool<br/>(tm-agent lifecycle JSON)"]:::evidence
        DISP --> EV3["3. Metrics Telemetry<br/>(Prometheus instantaneous scrape)"]:::evidence
        DISP --> EV4["4. JVM Crash Artifacts<br/>(hs_err_pid.log detection)"]:::evidence
    end

    subgraph EVALUATION["Decision Engine & Rulepack Matrix"]
        EV1 & EV2 & EV3 & EV4 --> RULEPACK["Declarative Rulepack Engine<br/>(8 Domains / 20+ Branches)"]:::evaluation
        RULEPACK --> SCORE["Confidence Scoring Engine<br/>(HIGH / MEDIUM / LOW)"]:::evaluation
    end

    subgraph PERSISTENCE_DISPATCH["Persistence & Delivery Pipeline"]
        SCORE --> SQLITE[("Embedded SQLite<br/>Incident Ledger & State Engine")]:::storage
        SCORE --> REPORT["Canonical 7-Section Report Builder"]:::dispatch
        REPORT --> SMTP["SMTP Worker (Postfix / TLS)<br/>(Bounded Backoff Retry)"]:::dispatch
        SMTP --> ONCALL["👨‍💻 SRE On-Call Engineers"]:::dispatch
    end

    style CORRELATION fill:#0b1329,stroke:#1e3a8a,stroke-width:1px,color:#93c5fd
    style EVALUATION fill:#0b1329,stroke:#059669,stroke-width:1px,color:#a7f3d0
    style PERSISTENCE_DISPATCH fill:#0b1329,stroke:#7c3aed,stroke-width:1px,color:#c4b5fd
{{< /mermaid >}}

---

## 📑 Taksonomi 8 Domain Kegagalan (*Failure Domains*)

Diagnostic Service mengklasifikasikan setiap insiden ke dalam salah satu dari **8 Formal Failure Domains** untuk mempermudah eskalasi ke tim spesialis yang tepat:

| Failure Domain | Cakupan Kegagalan | Pola & Signature Error Tipikal | Tim Eskalasi Target |
| :--- | :--- | :--- | :--- |
| **`jvm_memory`** | Alokasi memori internal JVM, kebocoran heap, Metaspace, GC overhead. | `OutOfMemoryError: Java heap space`, `Metaspace`, `GC overhead limit exceeded`. | Backend / Java Engineering |
| **`concurrency_threading`** | Kejenuhan worker thread pool Tomcat, deadlock thread JVM. | `RejectedExecutionException: Thread pool is exhausted`, `Java-level deadlock`. | Backend / Platform Team |
| **`database_persistence`** | Kejenuhan connection pool database, timeout query, SQL deadlock. | `CannotGetJdbcConnectionException`, `HikariPool timeout`, `SQLTimeoutException`. | Database Administrator (DBA) |
| **`network_integration`** | Kegagalan handshake TLS/SSL, timeout microservice upstream, DNS error. | `SSLHandshakeException`, `SocketTimeoutException: Read timed out`. | Network & Cloud Infra Team |
| **`application_lifecycle`** | Kegagalan startup aplikasi, error deployment WAR, inisialisasi context. | `LifecycleException: Failed to start component`, `BeanCreationException`. | Application Development Team |
| **`storage_os_limits`** | Batasan resource OS host, exhausti file descriptor (`ulimit`), disk full. | `Too many open files`, `No space left on device`, `Read-only file system`. | Systems / Infrastructure Team |
| **`security_session`** | Kegagalan autentikasi/otorisasi, token expiry, session replication crash. | `LDAPException`, `SessionReplicationException`, `InvalidTokenException`. | Security / IAM & Middleware |
| **`general`** | Anomali lintas domain atau status pembuktian belum terklasifikasi. | `Contradicting state`, `Undetermined evidence`, fallback unclassified. | SRE / Incident Commander |

---

## 📊 Format Laporan Insiden Kanonikal 7-Seksi

Setiap notifikasi email yang diterbitkan oleh Diagnostic Service mengikuti struktur kanonikal 7-seksi yang seragam:

1. **Seksi 1: Incident Header & Target Context** — Incident ID unik, nama alert Prometheus asli (*Rule ID Fidelity*), level keparahan (`[WARNING]` / `[CRITICAL]`), identitas target (`environment`, `host`, `tomcat_instance`), dan status insiden (`FIRING` / `RESOLVED`).
2. **Seksi 2: Primary Root Cause & Decision Branch** — Klasifikasi cabang keputusan deterministik (misal `TD-02: Cgroup OOM Killer`, `GC-02: GC CPU Thrashing`) disertai ringkasan eksekutif akar masalah.
3. **Seksi 3: Failure Domain Classification** — Kategori domain kegagalan resmi dari taksonomi 8 domain untuk perutean eskalasi seketika.
4. **Seksi 4: Diagnostic Confidence Score & Evaluation Matrix** — Skor keyakinan kuantitatif (`HIGH`, `MEDIUM`, `LOW`) berdasarkan kelengkapan bukti pendukung.
5. **Seksi 5: Correlated Evidence Summary** — Bukti forensik terkorelasi:
   - Cuplikan log `catalina.out` yang telah disanitasi (menghapus password/token rahasia).
   - Snapshot status container dan indikator OOM dari spool `tm-agent`.
   - Data telemetri scrape Prometheus dan hasil probe HTTP internal.
6. **Seksi 6: Actionable Operator SOP Steps** — Langkah-langkah remediasi manual terverifikasi (*runbook SOP*) yang dapat langsung dijalankan oleh engineer on-call (*Zero Destructive Auto-Remediation*).
7. **Seksi 7: System Metadata & Verification Audit Trail** — Audit trail SQLite ID, sidik jari trace, versi engine diagnosa, dan checksum rulepack.

---

## ⚙️ Dynamic Rulepack Hot-Reloading

Diagnostic Service mendukung injeksi dan pembaruan aturan diagnosa melalui endpoint REST API (`/api/v1/rules`) secara *hot-reload* tanpa memerlukan restart kontainer, dilindungi oleh mekanisme **5-Layer Defense-in-Depth**:

1. **Bearer Token Authentication:** Memeriksa otentikasi header token `0400` dari host secrets.
2. **Schema Contract Guard:** Memvalidasi payload terhadap JSON schema ketat sebelum evaluasi.
3. **Collision Guard:** Mencegah tumpang tindih ID aturan (`rule_id`) yang sudah terdaftar.
4. **Payload Size Guard:** Membatasi ukuran payload maksimal 2MB untuk mencegah serangan DoS memori.
5. **Append-Only Immutability Guard:** Melindungi aturan inti (*core decision branches*) agar tidak dapat ditimpa atau dihapus oleh modifikasi eksternal.

---

## 🔗 Bagian dari Platform
Halaman ini merupakan sub-modul dari:
* [**Tomcat Monitoring & Autonomous Diagnostic Platform**]({{< ref "projects/tomcat-monitoring" >}})
* Sub-modul lainnya: [**tmctl**]({{< ref "projects/tomcat-monitoring/tmctl" >}}) · [**tm-agent**]({{< ref "projects/tomcat-monitoring/tm-agent" >}})
