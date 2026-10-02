+++
title = "Merancang Autonomous Diagnostic Engine: Mengubah Diagnosa Insiden Manual Menjadi Evaluasi Otomatis Real-Time"
date = "2026-09-21T08:30:00+07:00"
draft = false
summary = "Membedah arsitektur Autonomous Diagnostic Engine pada project tomcat-diagnostic-service: bagaimana mentransformasikan proses diagnosa insiden yang selama ini manual, lambat, dan membebani on-call SRE menjadi evaluasi otomatis real-time berbasis declarative JSON rulepack yang dapat di-hot-reload di runtime tanpa restart container, analisis keputusan arsitektur TM-ADR-0013 (Node.js 24 ESM + SQLite WAL), 5-Layer Defense-in-Depth ingestion guard (TM-ADR-0018), serta Out-of-Band AI Forensic Enrichment Loop (TM-ADR-0019)."
author = "Eddy Wiyatno"
categories = ["Architecture", "SRE"]
tags = ["sre", "architecture", "nodejs", "sqlite", "incident-management", "rules-engine", "devops"]
series = ["Enterprise Observability & Systems Engineering"]
toc = true
showSummary = true
aliases = ["/articles/knowledge-as-code-diagnostic-rule-engine-hot-reload/"]
+++

## 📌 Ringkasan Eksekutif (TL;DR)

Selama bertahun-tahun dalam operasional sistem produksi berskala besar, ketika sistem pemantauan (*monitoring*) membunyikan alarm insiden, **proses triase dan diagnosa akar masalah (*Root Cause Analysis* — RCA) hampir selalu dilakukan secara manual oleh manusia**. Ketika server Apache Tomcat mengalami *crash* atau penurunan performa ekstrem, *on-call* SRE dipaksa bangun di tengah malam, terburu-buru melakukan login VPN, membuka sesi terminal SSH ke puluhan instans, menyisir ratusan ribu baris log `catalina.out`, memeriksa *thread dump*, hingga mencari-cari dokumen SOP di Confluence. Proses investigasi manual yang melelahkan ini memakan waktu 30 hingga 60 menit—rentang waktu krusial di mana layanan bisnis mengalami gangguan (*downtime*) dan kepuasan pengguna tergerus.

Di sisi lain, upaya mengotomasi deteksi kegagalan sering kali terbentur oleh siklus hidup rilis perangkat lunak (*software deployment lifecycle*). Jika aturan deteksi kegagalan ditulis secara statis (*hardcoded if-else logic*) di dalam basis kode aplikasi pemantau, setiap kali ada pola error baru yang teridentifikasi, tim SRE harus melewati siklus *Git commit*, *CI/CD pipeline*, pembangunan ulang *container image*, hingga proses *rolling restart*. Selain lambat, me-restart kontainer diagnostik di tengah operasional aktif membawa risiko fatal: hilangnya antrean insiden yang sedang diproses (*in-flight work queue*), terputusnya koneksi webhook peringatan (*dropped alerts*), serta terciptanya celah kebutaan pemantauan (*observability blind spot*).

Untuk mengatasi tantangan fundamental ini, saya merancang dan mengimplementasikan **Autonomous Diagnostic Engine** pada ekosistem `tomcat-diagnostic-service` (bagian dari platform `tomcat-monitoring`). Sistem ini mentransformasikan proses diagnosa insiden yang selama ini manual dan lambat menjadi **evaluasi otomatis real-time** berbasis paradigma **Knowledge-as-Code**:
1. **Otomasi Triase Instan:** Menggantikan proses manual menyisir log dan metrik dengan korelasi bukti multi-sumber secara otomatis (< 500 ms) saat webhook Alertmanager masuk.
2. **Runtime Hot-Reloading:** Aturan deteksi kegagalan diformalkan sebagai **Declarative JSON Rulepack** yang dapat di-ingest dan diaktifkan seketika di memori pencocokan tanpa perlu me-restart kontainer dan tanpa *downtime*.
3. **Pondasi Berkinerja Tinggi:** Mengadopsi **Node.js 24 LTS ESM** dengan modul bawaan `node:sqlite` dalam mode **Write-Ahead Logging (WAL)** berdasarkan [TM-ADR-0013](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0013/), menghadirkan konkurensi pembacaan tinggi tanpa memblokir penulisan aturan baru.
4. **Keamanan Berlapis (5-Layer Defense Guard):** Melindungi endpoint ingesti dari serangan ReDoS, kebocoran memori, tabrakan nama cabang, dan pemalsuan audit historis merujuk pada [TM-ADR-0018](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0018/).
5. **Siklus Pembelajaran Berkelanjutan:** Menerapkan **Out-of-Band AI Forensic Enrichment Loop** berdasarkan [TM-ADR-0019](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0019/), menjembatani determinisme runtime lini depan dengan kecerdasan analitik LLM di fase pasca-insiden.

{{< mermaid >}}
flowchart LR
    subgraph TRADISIONAL["Proses Diagnosa Tradisional (Manual & Lambat)"]
        direction TB
        M1["Alert Berbunyi Jam 02:00"] --> M2["SRE Login VPN & SSH Host"]
        M2 --> M3["Manual Grep 500 MB catalina.out"]
        M3 --> M4["Cari Wiki SOP di Confluence"]
        M4 --> M5["MTTR: 30 - 60 Menit Terbuang!"]
    end

    subgraph AUTONOMOUS["Autonomous Diagnostic Engine (Otomatis & Real-Time)"]
        direction TB
        A1["Alertmanager Webhook Masuk"] --> A2["Autonomous Multi-Source Correlation"]
        A2 --> A3["Dynamic Rule Engine Matching"]
        A3 --> A4["Instant 7-Section SRE Report + SOP"]
        A4 --> A5["MTTR: Selesai dalam < 1 Detik!"]
    end
{{< /mermaid >}}

Artikel teknis ini membedah arsitektur lengkap, keputusan rekayasa, serta implementasi kode di balik evolusi dari diagnosa manual menuju *autonomous diagnostic engine* ini.

---

## 🌍 1. Latar Belakang & Dilema: Dari Diagnosa Manual Menuju Autonomous Triage

### A. Realita di Lapangan: Kerapuhan dan Beban Diagnosa Manual

Bagi seorang *Site Reliability Engineer*, tidak ada situasi yang lebih menegangkan selain menerima notifikasi panggilan darurat (*paging alert*) di luar jam kerja. Bayangkan skenario umum yang kerap terjadi di lingkungan produksi perbankan atau e-commerce:

{{< mermaid >}}
sequenceDiagram
    autonumber
    actor SRE as On-Call SRE Engineer
    participant MON as Monitoring / PagerDuty
    participant PROD as Production Tomcat Server
    participant WIKI as Confluence / Runbook Wiki

    MON->>SRE: PagerDuty Alert: TomcatDown [CRITICAL] (Pukul 02:15 WIB)
    activate SRE
    Note over SRE: Bangun tidur, cari laptop, koneksi VPN
    SRE->>PROD: SSH ke host produksi (srv-tomcat-04)
    SRE->>PROD: tail -n 1000 /var/log/tomcat/catalina.out
    Note over SRE: 500.000 baris log, pesan bercampur jutaan transaksi
    SRE->>PROD: grep -E "(Exception|Error|OOM)" catalina.out
    Note over SRE: Menemukan HikariPool-1 - Connection timeout
    SRE->>WIKI: Buka Confluence, cari runbook "Database Connection Pool"
    Note over SRE: Dokumen terakhir diupdate 11 bulan lalu oleh engineer yang sudah resign
    SRE->>PROD: Lakukan mitigasi manual (restart/kill PID)
    Note over SRE: Insiden selesai pukul 03:02 WIB (47 menit downtime)
    deactivate SRE
{{< /mermaid >}}

Pola penanganan insiden di atas mengungkap **tiga kerapuhan sistemik diagnosa manual**:
1. **Waktu Respons Terbuang untuk Triase Dasar (High MTTR):** Lebih dari 70% waktu pemulihan insiden dihabiskan hanya untuk *mencari tahu apa yang sebenarnya terjadi* (triase dan isolasi bukti), bukan untuk melakukan tindakan perbaikan itu sendiri.
2. **Ketergantungan pada Kepakaran Individual (*Tribal Knowledge*):** SRE senior mungkin dapat mengenali pola error dalam 5 menit, namun SRE junior membutuhkan waktu 45 menit. Pengetahuan sistem terkunci di kepala individu, bukan pada sistem operasional.
3. **Tingginya Risiko Human Error di Bawah Tekanan:** Melakukan investigasi manual di terminal server produksi pada pukul 02:00 pagi di bawah tekanan manajemen membuka risiko kesalahan perintah (*fat-finger command*), seperti salah me-restart node yang salah atau menghapus bukti log yang dibutuhkan untuk audit.

Satu-satunya jalan keluar berkelanjutan adalah **mengotomasi seluruh proses diagnosa tersebut**: mesin pemantau harus mampu membaca bukti forensik sendiri, mencocokkannya dengan basis aturan, dan langsung menyajikan kesimpulan akar masalah beserta langkah remediasinya kepada SRE.

### B. Jebakan Solusi Awal: Menaruh Logika Deteksi di Kode Aplikasi (Hardcoded Rules)

Ketika tim mulai mencoba mengotomasi diagnosa, jebakan paling umum adalah menuliskan logika pencocokan langsung di dalam basis kode aplikasi (*hardcoded if-else logic*):

```javascript
// ⚠️ ANTI-PATTERN: Menuliskan aturan deteksi kegagalan secara statis di kode sumber
export function evaluateFailure(logLines) {
  for (const line of logLines) {
    if (line.includes("OutOfMemoryError: Java heap space")) {
      return { branch: "TD-02", issue: "Heap OOM", action: "Periksa memory leak & restart" };
    }
    if (line.includes("Connection is not available, request timed out")) {
      return { branch: "TD-14", issue: "HikariCP Exhausted", action: "Periksa database lock" };
    }
    // Menambah pola error baru mengharuskan modifikasi file JS ini!
  }
  return { branch: "TD-08", issue: "Undetermined" };
}
```

Pendekatan *hardcoded* ini dengan cepat berubah menjadi mimpi buruk pemeliharaan:
* **Deployment Friction:** Setiap kali ditemukan pola error baru di lapangan, tim SRE tidak bisa langsung menambahkannya. Mereka harus membuat *pull request*, melewati serangkaian pengujian CI, membangun *container image*, dan menjadwalkan *deployment*. Menunggu rilis aplikasi hanya untuk memperbarui satu baris regex adalah inefisiensi besar.
* **Risiko Regresi Sistem Inti:** Mengutak-atik kode aplikasi utama berisiko merusak fungsionalitas lain yang sedang berjalan stabil.
* **Pemisahan Logika dan Dokumen SOP:** Logika deteksi berada di kode aplikasi, sementara panduan tindakan SOP berada di dokumen eksternal, membuat keduanya mudah mengalami desinkronisasi.

### C. Paradigma Knowledge-as-Code: RCA Menjadi Artefak yang Dapat Dieksekusi Mesin

Untuk memecahkan kebuntuan tersebut, kami mengadopsi paradigma **Knowledge-as-Code**. Dalam paradigma ini, kepakaran operasional SRE yang diperoleh dari hasil investigasi mendalam (*Root Cause Analysis* — RCA) tidak dibiarkan mengendap sebagai dokumen pasif di arsip pasca-insiden (*post-mortem report*). Sebaliknya, pengetahuan tersebut langsung diformalkan menjadi **artefak deklaratif terstruktur berbasis kode**.

{{< mermaid >}}
flowchart TD
    subgraph TRADITIONAL["Paradigma Tradisional (Dokumentasi Pasif)"]
        direction TB
        T1["Insiden Terjadi"] --> T2["Investigasi Manual"]
        T2 --> T3["Tulis Dokumen Post-Mortem PDF / Confluence"]
        T3 --> T4["Dokumen Terlupakan di Arsip"]
        T4 -.->|Insiden Serupa Terjadi 3 Bulan Kemudian| T1
    end

    subgraph KAC["Paradigma Knowledge-as-Code (Aktif & Deklaratif)"]
        direction TB
        K1["Insiden Terjadi"] --> K2["Investigasi & Analisis Forensik"]
        K2 --> K3["Sintesis Declarative JSON Rulepack"]
        K3 --> K4["Hot-Ingest ke Diagnostic Service via CLI"]
        K4 --> K5["Engine Mengenali Pola Seketika (0 ms Downtime)"]
        K5 -.->|Insiden Serupa Terulang| K6["Autonomous Triage Instan + 7-Section SOP Dispatched"]
    end
{{< /mermaid >}}

Dengan *Knowledge-as-Code*:
- Aturan deteksi kegagalan diperlakukan sebagai **kontrak data** (*data contract*), bukan logika program kompilasi.
- Definisi kegagalan, batas ambang kepastian (*confidence score*), taksonomi domain, dan langkah remediasi SOP disimpan dalam satu berkas terpadu yang dapat diverifikasi oleh skema (*schema-validated*).
- Mesin diagnostik berfungsi sebagai *interpreter runtime* yang agnostik terhadap aturan, memungkinkan basis pengetahuan berkembang tanpa batas (*infinitely extensible*).

### D. Syarat Mutlak Operasional: Zero-Downtime Hot-Reloading Tanpa Restart Kontainer

Ketika sebuah sistem pemantauan bertugas mengawasi klaster Tomcat kritikal, **layanan diagnostik tidak boleh dimatikan atau di-restart secara sengaja hanya untuk memuat konfigurasi aturan baru**. 

Me-restart kontainer di lingkungan produksi memicu kerugian operasional yang nyata:
- **Terputusnya Antrean Kerja (*In-Flight Work Queue Loss*):** Jika Alertmanager sedang mengirimkan kumpulan webhook insiden aktif saat kontainer di-restart, transaksi HTTP yang belum selesai dapat terputus dan memicu kegagalan pelaporan (*dropped notifications*).
- **Kebutaan Pemantauan (*Observability Blackout*):** Selama rentang waktu kontainer melakukan terminasi sinyal `SIGTERM`, pelepasan *socket*, dan inisialisasi ulang proses baru (biasanya 5 hingga 15 detik), sistem monitoring berada dalam kondisi buta (*blind*). Jika server aplikasi Tomcat mengalami *crash* tepat pada detik-detik tersebut, bukti kejadian tidak tertangkap.
- **Overhead State Reconstruction:** Setiap kali *restart*, memori cache harus dibangun ulang dan koneksi ke relay SMTP atau repositori telemetri harus diinisialisasi ulang dari nol.

Oleh karena itu, kemampuan **Zero-Downtime Hot-Reloading**—di mana aturan baru dapat di-ingest via REST API, divalidasi, disimpan ke penyimpanan persisten, dan langsung aktif di memori pencocokan dalam hitungan milidetik tanpa interupsi antrean kerja—merupakan **syarat mutlak (hard invariant)** dari arsitektur ini.

---

## 🏛️ 2. Arsitektur Engine: Node.js 24 ESM + Embedded SQLite (WAL Mode)

Dalam merancang fondasi teknis mesin diagnostik, keputusan arsitektur utama dituangkan secara formal dalam [TM-ADR-0013: Use Node.js 24 ESM and Isolated Built-In SQLite](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0013/). Keputusan ini didasarkan pada kebutuhan akan sistem yang ber-footprint memori ringan, memiliki dependensi minimal (*zero bloated dependencies*), serta mampu menangani transaksi konkuren secara deterministik.

```text
Reusable Node.js 24 Runtime Image (Pinned Non-Root)
                    │
                    ▼
Diagnostic Service ESM Application
                    │
   ├── [Server Adapter]        : HTTPS, Bearer Auth, Schema Guard, Health (/health/ready)
   ├── [Application Layer]     : Accepted-work queue (50 cap), Worker Loop, Life-Cycle Guard
   ├── [Domain Layer]          : Multi-Domain Dispatcher, DynamicRuleEvaluator, Canonical Result
   └── [Storage Adapters]      : Isolated SQLite Adapter (WAL Mode), Bounded Evidence Readers
```

### A. Memanfaatkan Built-in `node:sqlite` pada Node.js 24 LTS

Secara historis, mengintegrasikan SQLite ke dalam aplikasi Node.js selalu memerlukan modul pihak ketiga berbasis *native C++ addon* seperti `better-sqlite3` atau `sqlite3`. Pendekatan ini menimbulkan beban operasional signifikan pada pipeline kontainerisasi:
- Pembangunan *container image* berbasis Alpine Linux membutuhkan instalasi paket kompilator: `python3`, `make`, `gcc`, dan `g++` (`node-gyp`).
- Ukuran *image* membengkak puluhan megabyte hanya untuk toolchain kompilasi sementara.
- Kerentanan keamanan (*vulnerabilities*) pada paket kompilator OS yang tertinggal di dalam image produksi.
- Risiko inkompatibilitas pustaka C (*glibc* vs *musl libc*) saat memindahkan biner antar-distribusi.

Hadirnya rilis **Node.js 24 LTS** membawa terobosan besar dengan menyertakan modul bawaan **`node:sqlite`** (`DatabaseSync`) langsung di dalam *core runtime*. 

```javascript
// src/adapters/sqlite-repository.js (Potongan Inisialisasi Database)
import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";

export class SqliteRepository {
  constructor(databasePath, { migrationsDirectory }) {
    // 1. Inisialisasi embedded engine bawaan Node.js 24 (Zero native C++ addon / Zero node-gyp)
    this.database = new DatabaseSync(databasePath);

    // 2. Terapkan pengerasan izin berkas ketat (0600: read/write hanya oleh pemilik proses)
    if (databasePath !== ":memory:") {
      chmodSync(databasePath, 0o600);
    }

    // 3. Konfigurasi integritas referensial dan performa konkurensi tingkat tinggi
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");

    // 4. Eksekusi migrasi forward-only terurut
    this.migrate(migrationsDirectory);
  }
  // ...
}
```

Keuntungan arsitektural penggunaan `node:sqlite` bawaan:
- **Zero Native Toolchain Overhead:** *Containerfile* `tomcat-diagnostic-service` tidak membutuhkan `node-gyp`, Python, atau gcc. Pembangunan image berjalan dalam hitungan detik dengan footprint sangat ramping (< 80 MB).
- **Direct C Binding Performance:** Menggunakan binding native internal Node.js yang dieksekusi secara sinkron tanpa overhead marshaling kompleks antar-layer JS-C++.
- **Single-Adapter Encapsulation:** Seluruh interaksi dengan `DatabaseSync` diisolasi ketat di dalam satu kelas adapter (`SqliteRepository`). Logika HTTP, evaluator aturan, dan *evidence adapters* tidak pernah mengakses modul database secara langsung, menjaga batas modularitas (*architectural boundary*) sesuai [TM-ADR-0013](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0013/).

### B. Keunggulan SQLite dengan Mode Write-Ahead Logging (WAL)

Salah satu kelemahan SQLite tradisional dalam mode standar (*Rollback Journal*) adalah terjadinya penguncian seluruh database (*database-level lock*) saat terjadi operasi penulisan. Dalam sistem observabilitas berkecepatan tinggi, di mana worker berkala membaca antrean insiden dan HTTP server menerima webhook peringatan, mode jurnal tradisional akan menyebabkan *lock contention* dan *event loop stall*.

Untuk mengatasinya, mesin kami mengaktifkan mode **Write-Ahead Logging (WAL)**:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

{{< mermaid >}}
flowchart TD
    subgraph TRADITIONAL_JOURNAL["Rollback Journal (Mode Standar)"]
        direction TB
        W1["Writer: Tulis Rulepack Baru"] -->|Lock Mutlak Database| DB1[("diagnostic.db")]
        R1["Reader: Worker Baca Antrean Insiden"] -.->|TERBLOKIR! (SQLITE_BUSY)| DB1
    end

    subgraph WAL_MODE["Write-Ahead Logging (WAL Mode)"]
        direction TB
        W2["Writer: POST /api/v1/rules<br/>(Append ke WAL File)"] --> WAL["diagnostic.db-wal<br/>(Write-Ahead Log)"]
        R2["Reader: Diagnostic Worker Loop<br/>(Baca State & History)"] --> DB2[("diagnostic.db<br/>(Shared Snapshot)")]
        WAL -.->|Asynchronous Checkpoint| DB2
    end
{{< /mermaid >}}

Dalam mode WAL:
1. **Readers Do Not Block Writers, and Writers Do Not Block Readers:** Worker diagnostik dapat mengevaluasi aturan, membaca status antrean `work_queue`, dan memeriksa riwayat insiden secara kontinu tanpa pernah terhambat ketika ada operator yang melakukan *ingestion* paket aturan baru via `POST /api/v1/rules`.
2. **Durasi Transaksi Ultra-Singkat:** Seluruh operasi penulisan menggunakan transaksi eksplisit `BEGIN IMMEDIATE` yang dirancang sangat singkat (rata-rata < 3 ms per transaksi). Tidak ada downstream I/O (seperti pemanggilan jaringan SMTP atau pembacaan log dari disk) yang dijalankan di dalam blok transaksi SQLite.
3. **Ketahanan Data Tinggi (Durability):** Perubahan dicatat secara berurutan (*sequential append*) pada berkas `-wal`, meminimalkan operasi *disk head seeking* dan melindungi integritas data jika proses terhenti mendadak.

### C. Skema Database dengan Forward-Only Migrations

Integritas data aturan kustom dan riwayat insiden dijamin melalui sistem migrasi skema terurut ke depan (*forward-only migrations*). Saat aplikasi pertama kali melakukan *bootstrapping*, method `migrate()` memindai direktori `migrations/` dan mengeksekusi berkas `*.sql` yang belum tercatat di tabel `schema_migrations` dalam transaksi atomik:

```text
migrations/
├── 001-initial.sql                           # Requests, Incidents, Events, Work Queue (FIFO)
├── 002-canonical-results.sql                  # Canonical Results, Evidence Summaries, Result Hash
├── 003-delivery-attempts.sql                  # Resilient SMTP Notification History & Retry State
├── 004-notification-lifecycle.sql            # Alert Suppression & Material Update Counters
├── 005-custom-rules.sql                      # Declarative Custom Rules & Unique Branch Index
├── 006-rule-category.sql                     # Failure Domain Category Support & Domain Query Index
└── 007-stale-lock-recovery-and-retention.sql # Automated Stale Lock Recovery & Safe Retention Pruning
```

Pada migrasi `005-custom-rules.sql` dan `006-rule-category.sql`, skema tabel aturan didefinisikan dengan penguatan integritas referensial dan indeks pencarian:

```sql
-- migrations/005-custom-rules.sql & 006-rule-category.sql
CREATE TABLE custom_rules (
    id INTEGER PRIMARY KEY,
    rule_id TEXT NOT NULL,
    branch TEXT NOT NULL UNIQUE,       -- Menjamin tidak ada collision nama branch
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general', -- 8 Standard Failure Domains
    target_source TEXT NOT NULL,       -- local_file, prometheus, collector, dll.
    pattern TEXT NOT NULL,             -- Ekspresi regex aman
    assessment TEXT NOT NULL,          -- Deskripsi akar masalah
    classification TEXT NOT NULL,      -- confirmed_cause, probable_cause, dll.
    confidence TEXT,                   -- high, medium, low
    rule_json TEXT NOT NULL,           -- Payload lengkap untuk de-serialisasi cepat
    created_by TEXT NOT NULL,          -- Audit trail SRE / AI
    created_at TEXT NOT NULL           -- Timestamp ISO-8601
);

CREATE INDEX custom_rules_branch_idx ON custom_rules(branch);
CREATE INDEX custom_rules_category_idx ON custom_rules(category);
```

Dengan indeks unik pada kolom `branch`, database secara otomatis menolak pendaftaran aturan dengan nama cabang yang sama di tingkat *storage engine*, memberikan lapisan pertahanan fisik terhadap duplikasi aturan.

---

## 🛡️ 3. Keamanan Ingestion: 5-Layer Defense-in-Depth

Membuka antarmuka HTTP API untuk mendaftarkan aturan evaluasi langsung ke dalam memori proses yang sedang berjalan merupakan vektor serangan yang berisiko tinggi jika tidak dipagari secara ketat. Payload berbahaya dapat menyebabkan *catastrophic backtracking* pada regex (ReDoS), menguras memori RAM, atau menimpa aturan standar yang telah teruji.

Berdasarkan keputusan arsitektur [TM-ADR-0018: Strict Declarative Rulepack Engine and Append-Only Ingestion API](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0018/), endpoint `POST /api/v1/rules` dilindungi oleh **5-Layer Defense-in-Depth Ingestion Guard**:

{{< mermaid >}}
flowchart TD
    REQ["HTTP POST /api/v1/rules<br/>(Client Ingestion Request)"] --> L1

    subgraph GUARD_PIPELINE["5-Layer Defense-in-Depth Ingestion Guard (TM-ADR-0018)"]
        direction TB
        
        subgraph L1["Layer 1: Bearer Authentication Guard"]
            L1_CHK{"Validasi Authorization Header?<br/>crypto.timingSafeEqual()"}
        end
        
        subgraph L2["Layer 2: Payload Size Guard"]
            L2_CHK{"Ukuran Body <= 64 KiB?<br/>(Stream Buffer Accumulator)"}
        end
        
        subgraph L3["Layer 3: Strict Schema & ReDoS Guard"]
            L3_CHK{"Validasi Ajv (Draft-07)<br/>+ isSafeRegex() Pattern?"}
        end
        
        subgraph L4["Layer 4: Branch Collision Guard"]
            L4_CHK{"Bukan Built-in (TD-01..08)<br/>& Belum Ada di SQLite?"}
        end
        
        subgraph L5["Layer 5: Append-Only & Immutability Guard"]
            L5_CHK{"Hanya POST Diizinkan?<br/>(PUT / DELETE = 405)"}
        end

        L1_CHK -->|Gagal| E401["HTTP 401 Unauthorized"]
        L1_CHK -->|Lolos| L2_CHK
        
        L2_CHK -->|Gagal| E413["HTTP 413 Payload Too Large"]
        L2_CHK -->|Lolos| L3_CHK
        
        L3_CHK -->|Gagal| E400["HTTP 400 Bad Request<br/>(Schema / Unsafe Regex)"]
        L3_CHK -->|Lolos| L4_CHK
        
        L4_CHK -->|Gagal| E409["HTTP 409 Conflict<br/>(Branch Collision)"]
        L4_CHK -->|Lolos| SUCCESS["Simpan ke SQLite (custom_rules)<br/>& Register ke DynamicRuleEvaluator"]
    end

    SUCCESS --> RESP["HTTP 201 Created<br/>(Rule Aktif Seketika Tanpa Restart)"]
{{< /mermaid >}}

Mari kita bedah implementasi kode dari masing-masing lapisan pengamanan tersebut:

### 1. Layer 1: Bearer Authentication Guard (Timing-Safe Comparison)
Setiap permintaan ke endpoint manajemen aturan wajib menyertakan token otentikasi rahasia pada header `Authorization: Bearer <token>`. Untuk mencegah serangan saluran samping (*side-channel timing attack*), perbandingan string token tidak menggunakan operator kesetaraan standar `===`, melainkan memanfaatkan fungsi kriptografi waktu konstan bawaan Node.js `timingSafeEqual`:

```javascript
// src/server/http-service.js (Potongan Layer 1)
import { timingSafeEqual } from "node:crypto";

const authenticated = (header, token) => {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return false;
  
  const supplied = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(token);
  
  // Wajib periksa panjang buffer terlebih dahulu, lalu timingSafeEqual
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};
```
Jika token tidak valid atau tidak disertakan, server langsung mengembalikan `HTTP 401 Unauthorized` tanpa mengevaluasi isi *payload*.

### 2. Layer 2: Payload Size Guard (Anti-Memory Exhaustion)
Untuk mencegah serangan penolakan layanan (*Denial of Service* — DoS) akibat pengiriman *payload* raksasa yang dapat melumpuhkan alokasi memori Node.js (*heap exhaustion*), ukuran body permintaan dibatasi secara ketat pada **64 KiB (`65.536 byte`)**:

```javascript
// src/server/http-service.js (Potongan Layer 2)
const rulesLimitBytes = 64 * 1024; // Maksimum 64 KiB per Rulepack

const chunks = [];
let size = 0;

for await (const chunk of request) {
  size += chunk.length;
  if (size > rulesLimitBytes) {
    return json(response, 413, { 
      error: "payload_too_large",
      message: "Rulepack payload exceeds strict 64 KiB buffer limit" 
    });
  }
  chunks.push(chunk);
}
```
Jika akumulasi stream melampaui 64 KiB, koneksi langsung diputus dengan status `HTTP 413 Payload Too Large`.

### 3. Layer 3: Strict Schema Validation & Safety Guard (Anti-ReDoS)
Setelah lolos batasan ukuran dan di-parse sebagai JSON, *payload* aturan divalidasi menggunakan validator JSON Schema berkategori ketat (*strict mode*) menggunakan pustaka **Ajv (Draft-07)**. Validator ini menolak properti asing yang tidak terdefinisi (`additionalProperties: false`), memverifikasi tipe data, dan mencocokkan nilai terhadap *enum* yang sah.

Selain skema struktural, lapisan ini menerapkan **dua pengujian semantik krusial**:
- **Konsistensi Derajat Keyakinan (*Classification-Confidence Consistency*):** Memastikan kombinasi `classification` dan `confidence` mematuhi matriks validitas (misalnya status `confirmed_cause` wajib memiliki keyakinan `high`, sedangkan `undetermined` tidak boleh memiliki bobot keyakinan numerik).
- **Inspeksi Keamanan Regex (*Anti-ReDoS Protection*):** Ekspresi reguler dianalisis terhadap konstruksi berbahaya seperti *nested quantifiers* (misal: `(a+)+$` atau `([a-zA-Z]+)*`) yang dapat memicu *catastrophic backtracking* pada mesin V8 dan membekukan seluruh proses server.

```javascript
// src/server/rulepack-schema.js (Potongan Layer 3)
import Ajv from "ajv";

const dangerousRegexPatterns = [
  /[+*]\s*\)[+*]/,                                // Pola nested quantifier: (x+)+ atau (x*)*
  /([+*]|\{\d+,?\d*\})\s*\)[+*]|\{\d+,?\d*\}/     // Pola quantified repetition bersarang
];

export function isSafeRegex(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0 || pattern.length > 1024) return false;
  
  // 1. Deteksi pola ReDoS berbahaya
  for (const dangerous of dangerousRegexPatterns) {
    if (dangerous.test(pattern)) return false;
  }
  
  // 2. Uji coba kompilasi regex
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
```
Jika skema tidak valid atau pola regex terindikasi membahayakan, server menolak permintaan dengan kode `HTTP 400 Bad Request` disertai rincian kegagalan validasi.

### 4. Layer 4: Branch Collision Guard (Anti-Accidental Overwrite)
Untuk mencegah tim operasi atau sistem otomatis menimpa aturan logika bawaan (*built-in baseline*) atau aturan kustom yang sudah ada, mesin menerapkan proteksi tabrakan cabang:

```javascript
// src/server/http-service.js (Potongan Layer 4)
const BUILTIN_BRANCHES = new Set([
  "TD-01", "TD-02", "TD-03", "TD-04", "TD-05", "TD-06", "TD-07", "TD-08",
  "AH-01", "AH-02", "AH-03", "AH-04", "AH-05",
  "GC-01", "GC-02", "GC-03", "GC-04",
  "TH-01", "TH-02", "TH-03"
]);

// 1. Cek terhadap Built-in Reserved Branches
if (BUILTIN_BRANCHES.has(body.branch)) {
  return json(response, 409, {
    error: "rule_branch_conflict",
    message: `Branch '${body.branch}' conflicts with built-in rule branches (TD-01..TD-08)`
  });
}

// 2. Cek duplikasi di database SQLite via UNIQUE constraint
try {
  const savedRule = options.repository.insertCustomRule(body, createdBy);
  options.ruleEvaluator.registerRule(savedRule); // Hot-reload ke memori!
  return json(response, 201, savedRule);
} catch (error) {
  if (error instanceof RuleCollisionError) {
    return json(response, 409, {
      error: "rule_branch_conflict",
      message: `Branch '${body.branch}' already exists in database`
    });
  }
  return json(response, 500, { error: "internal_error" });
}
```
Jika `branch` sudah terdaftar, server mengembalikan `HTTP 409 Conflict`. Aturan lama tidak akan pernah tertimpa secara tidak sengaja.

### 5. Layer 5: Append-Only & Immutability Guard (HTTP 405 Lockout)
Salah satu prinsip audit terpenting dalam [TM-ADR-0018](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0018/) adalah **Immutabilitas Aturan**. Aturan diagnostik yang telah aktif tidak boleh diubah di tempat (*in-place mutation*) atau dihapus (*deletion*). Mengapa? Karena setiap laporan insiden historis yang tersimpan di tabel `canonical_results` merujuk secara pasti pada cabang aturan yang mengevaluasinya saat itu. Memodifikasi aturan lama akan merusak jejak forensik dan membuat diagnosis historis tidak lagi dapat direproduksi (*loss of reproducibility*).

Oleh karena itu, HTTP handler mengunci method selain `GET` dan `POST`:

```javascript
// src/server/http-service.js (Potongan Layer 5)
if (url === "/api/v1/rules" || url.startsWith("/api/v1/rules/")) {
  if (["PUT", "DELETE", "PATCH"].includes(request.method)) {
    return json(response, 405, {
      error: "method_not_allowed",
      message: "Rules API is append-only. Modification and deletion of rules are prohibited."
    }, { Allow: "GET, POST" });
  }
  // ...
}
```
Jika tim SRE ingin menyempurnakan logika sebuah aturan, mereka wajib menerbitkannya sebagai cabang aturan baru (misalnya `TD-19-V2` atau `TD-20`), menjaga silsilah evolusi aturan tetap transparan dan terverifikasi.

---

## 📋 4. Anatomi Declarative JSON Rulepack

Paket aturan deklaratif didefinisikan dalam format JSON terstruktur yang mematuhi skema ketat `rulepack-v1.schema.json`. Setiap rulepack adalah unit mandiri yang menggabungkan ekspresi pencocokan bukti (*evidence pattern*), konteks domain kegagalan (*failure domain*), derajat keyakinan, dan panduan tindakan perbaikan (*remediation runbook*).

### A. Bedah Struktur Skema `rulepack-v1.schema.json`

| Field | Tipe Data | Aturan Validasi | Deskripsi & Tujuan |
| :--- | :---: | :--- | :--- |
| **`branch`** | `string` | Regex `^TD-[0-9]{2,}$`, 5–16 karakter | Pengenal unik cabang keputusan (misal: `TD-14`, `TD-19`). Wajib unik di seluruh sistem. |
| **`ruleName`** | `string` | Regex `^[A-Za-z0-9_-]+$`, 3–64 karakter | Nama kanonikal aturan yang deskriptif dan terbaca manusia. |
| **`category`** | `string` | Enum (8 Domain Kegagalan Formal) | Klasifikasi domain masalah untuk tujuan eskalasi tim teknis spesifik. |
| **`targetSource`** | `string` | Enum: `local_file`, `prometheus`, `collector`, `application_health`, `any` | Sumber bukti telemetri yang menjadi target pemindaian regex. |
| **`pattern`** | `string` | String 1–1024 karakter, lolos `isSafeRegex` | Pola ekspresi reguler yang dicocokkan terhadap teks bukti. |
| **`assessment`** | `string` | String 5–256 karakter | Ringkasan eksekutif akar masalah untuk dicantumkan pada Section 2 laporan SRE. |
| **`classification`** | `string` | Enum: `confirmed_cause`, `probable_cause`, `possible_cause`, dll. | Bobot status diagnosis kausalitas. |
| **`confidence`** | `string` / `null` | Enum: `high`, `medium`, `low`, atau `null` | Derajat keyakinan sistem terhadap temuan diagnosis. |
| **`recommendedActions`** | `array[string]` | 1 hingga 10 item, masing-masing 5–500 karakter | Daftar langkah runbook SOP konkret yang wajib dijalankan oleh *on-call SRE*. |
| **`createdBy`** | `string` | Maksimum 64 karakter (Opsional) | Identitas pembuat aturan (misal: `sre-incident-commander`, `ai-forensic-synthesizer`). |

### B. Taksonomi 8 Domain Kegagalan Formal (`category`)

Untuk memastikan laporan insiden dapat langsung dieskalasikan ke tim penanggung jawab yang tepat tanpa jeda koordinasi manual, setiap aturan wajib dipetakan ke salah satu dari **8 Formal Failure Domains**:

1. **`database_persistence`** : Masalah koneksi basis data, *HikariCP pool saturation*, transaksi macet, atau *deadlock* SQL. (*Target: DBA & Platform Engineering*).
2. **`jvm_memory`** : Kegagalan alokasi memori JVM, kebocoran memori heap (*Java heap space*), atau *Metaspace exhaustion*. (*Target: Java Software Engineer*).
3. **`concurrency_threading`** : Saturasi *thread pool* Tomcat Catalina, kehabisan worker thread, atau *Java-level thread deadlocks*. (*Target: Core Platform Backend*).
4. **`network_integration`** : Kegagalan jabat tangan TLS/SSL, sertifikat kedaluwarsa, atau *upstream socket read timeout*. (*Target: Network & Cloud Infrastructure*).
5. **`application_lifecycle`** : Kegagalan *deployment* berkas WAR, servlet context initialization crash, atau *BeanCreationException*. (*Target: Application Development Team*).
6. **`storage_os_limits`** : Batasan resource sistem operasi host, kehabisan *file descriptor* (`ulimit`), atau media penyimpanan penuh. (*Target: Systems & Linux Engineering*).
7. **`security_session`** : Anomali replikasi session, kegagalan otentikasi LDAP/OAuth, atau serangan injeksi. (*Target: Cyber Security & IAM Team*).
8. **`general`** : Anomali lintas domain atau pola kegagalan baru yang belum diklasifikasikan secara spesifik. (*Target: Incident Commander*).

---

### C. Contoh Nyata Declarative Rulepack di Lingkungan Produksi

#### Kasus 1: HikariCP Connection Pool Timeout (`TD-14`)
Ketika beban transaksi melonjak atau kueri database mengalami perlambatan ekstrem, *connection pool* Tomcat akan terkuras hingga batas maksimum, menyebabkan benang pekerja (*worker threads*) mengalami timeout saat meminta koneksi baru.

```json
{
  "branch": "TD-14",
  "ruleName": "HikariPoolConnectionTimeout",
  "category": "database_persistence",
  "targetSource": "local_file",
  "pattern": "Connection is not available, request timed out after [0-9]+ms",
  "assessment": "HikariCP connection pool timeout: Unable to obtain connection within connectionTimeout period",
  "classification": "confirmed_cause",
  "confidence": "high",
  "recommendedActions": [
    "Enable leakDetectionThreshold parameter in HikariCP configuration to detect unclosed connections.",
    "Review connection pool utilization and increase maximumPoolSize if backend database capacity permits.",
    "Check for slow SQL queries or table locks in the backend PostgreSQL/MySQL database.",
    "Ensure database connections are properly closed within try-with-resources blocks in application code."
  ],
  "createdBy": "sre-database-squad"
}
```

#### Kasus 2: Metaspace OutOfMemoryError (`TD-12`)
Pola kegagalan khas pada aplikasi perbankan berbasis microservices yang sering melakukan *hot-redeployment* tanpa me-restart JVM, atau aplikasi yang menggunakan kakas bytecode generation dinamis (seperti CGLIB atau ByteBuddy) yang memicu kebocoran memori pada ruang *class metadata*:

```json
{
  "branch": "TD-12",
  "ruleName": "MetaspaceOOM",
  "category": "jvm_memory",
  "targetSource": "local_file",
  "pattern": "java.lang.OutOfMemoryError: Metaspace",
  "assessment": "Tomcat JVM class metadata exhausted: OutOfMemoryError in Metaspace",
  "classification": "confirmed_cause",
  "confidence": "high",
  "recommendedActions": [
    "Check for potential ClassLoader leaks caused by repeated hot-redeployment without JVM restart.",
    "Review dynamic libraries generating runtime classes (e.g., CGLIB, Javassist, ByteBuddy).",
    "Increase JVM startup parameter -XX:MaxMetaspaceSize in Tomcat configuration.",
    "Perform a full restart of the Tomcat container to reset Metaspace memory allocation."
  ],
  "createdBy": "sre-jvm-specialist"
}
```

### D. Mekanisme Evaluasi Dinamis di Dalam Memori (DynamicRuleEvaluator)

Bagaimana mesin mengevaluasi aturan-aturan JSON ini terhadap bukti forensik? Komponen `DynamicRuleEvaluator` mengelola array aturan aktif di dalam RAM proses Node.js. Saat aturan baru didaftarkan via `POST /api/v1/rules`, aturan tersebut langsung dikompilasi menjadi objek RegExp reguler V8:

```javascript
// src/domain/rulepack-loader.js (Potongan Evaluator)
export class DynamicRuleEvaluator {
  constructor(initialRules = []) {
    this.rules = [];
    for (const rule of initialRules) {
      this.registerRule(rule);
    }
  }

  // Hot-reloading method: dipanggil langsung oleh HTTP service saat POST /api/v1/rules
  registerRule(rule) {
    const compiled = {
      ...rule,
      category: rule.category ?? "general",
      // Kompilasi regex satu kali saat registrasi (Case-Insensitive)
      regex: new RegExp(rule.pattern, "i")
    };
    
    const existingIndex = this.rules.findIndex((r) => r.branch === rule.branch);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = compiled;
    } else {
      this.rules.push(compiled);
    }
    return compiled;
  }

  evaluate(evidence, event = {}) {
    // 1. Layer 2 Evaluation: Prioritaskan Custom Declarative Rules
    for (const rule of this.rules) {
      const match = evidence.some((item) => {
        if (item.status !== "collected") return false;
        if (rule.targetSource !== "any" && item.source !== rule.targetSource) return false;
        
        // Pengecekan teks bukti string atau potongan excerpt log JSON
        if (typeof item.value === "string") return rule.regex.test(item.value);
        if (typeof item.value === "object" && item.value !== null) {
          if (typeof item.value.excerpt === "string" && rule.regex.test(item.value.excerpt)) return true;
          return rule.regex.test(JSON.stringify(item.value));
        }
        return false;
      });

      if (match) {
        // Match ditemukan! Kembalikan keputusan diagnosis deterministik seketika
        return {
          ruleId: event?.labels?.alertname || rule.ruleId || "TomcatDown",
          ruleVersion: rule.ruleVersion ?? "1",
          branch: rule.branch,
          category: rule.category ?? "general",
          assessment: rule.assessment,
          classification: rule.classification,
          confidence: rule.confidence ?? null,
          recommendedActions: rule.recommendedActions ?? []
        };
      }
    }

    // 2. Layer 1 Evaluation: Fallback ke Mesin Bawaan (Built-in Multi-Domain Engines)
    const alertName = event?.labels?.alertname || "TomcatDown";
    if (alertName === "TomcatDown") return evaluateTomcatDown(evidence, event);
    if (alertName === "TomcatApplicationHealthFailed") return evaluateApplicationHealth(evidence, event);
    if (alertName === "TomcatGCPauseHigh") return evaluateJvmWorkload(evidence, event);
    if (alertName === "TomcatThreadPoolSaturated") return evaluateConcurrency(evidence, event);

    // 3. Fallback jika tidak ada pola yang cocok sama sekali
    return {
      ruleId: alertName,
      branch: "TD-08",
      category: "general",
      assessment: "Undetermined failure pattern: No active diagnostic rule matched multi-source evidence",
      classification: "undetermined",
      confidence: null,
      recommendedActions: [
        "Lakukan inspeksi manual log catalina.out dan dump forensik kontainer.",
        "Gunakan AI post-mortem synthesis untuk membuat rulepack baru jika ditemukan pola spesifik."
      ]
    };
  }
}
```

Hierarki evaluasi ini menjamin bahwa **aturan deklaratif kustom (Layer 2) memiliki prioritas utama**. Jika insiden Tomcat Down disebabkan oleh *HikariCP timeout* (`TD-14`), sistem tidak akan berhenti pada kesimpulan generik *Clean Shutdown* atau *Scrape Failure* bawaan, melainkan langsung menyajikan diagnosis spesifik beserta SOP tindakan yang relevan.

---

## 🔄 5. Siklus Belajar Berkelanjutan (*Continuous Knowledge Enrichment Loop*)

Salah satu keunggulan terbesar dari arsitektur *Knowledge-as-Code* adalah integrasinya yang mulus dengan pipeline kecerdasan buatan (*AI*). Keputusan arsitektur ini dituangkan secara komprehensif dalam [TM-ADR-0019: Adopt Out-of-Band AI Forensic Enrichment Loop for Diagnostic Rule Synthesis](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0019/).

### A. Filosofi Deterministic Honesty & Zero In-Path AI Dependency

Banyak pendekatan modern berusaha menaruh *Large Language Model* (LLM) secara langsung di dalam jalur deteksi insiden aktif (*inline alerting path*). Berdasarkan evaluasi kami pada [TM-ADR-0006](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0006/), pendekatan tersebut memiliki kelemahan mendasar:
1. **Latensi Tinggi & Risiko Timeout:** Memanggil model AI eksternal membutuhkan waktu 2 hingga 10 detik, yang tidak dapat diterima ketika Alertmanager membutuhkan respons cepat (< 500 ms).
2. **Halusinasi & Non-Determinisme:** Model AI generatif dapat memberikan interpretasi kausalitas yang berbeda untuk kumpulan log yang identik, melanggar prinsip audit perbankan (*deterministic reproducibility*).
3. **Kegagalan Bergantung Jaringan:** Jika koneksi internet atau API LLM terganggu saat insiden produksi terjadi, sistem pemantauan ikut tumbang (*cascading failure*).

Oleh karena itu, kami menetapkan prinsip **Deterministic Honesty**:
- Jalur kritis runtime produksi (`POST /api/v1/alerts`) **100% deterministik, offline, dan bebas dari dependensi AI**.
- Jika mesin mendeteksi pola yang belum dikenali, sistem tidak akan berhalusinasi atau menebak secara liar. Mesin secara jujur menyatakan status **`UNDETERMINED` (`TD-08`)** dan menyimpan seluruh snapshot bukti forensik ke database SQLite.
- Kapabilitas AI dimanfaatkan secara **Out-of-Band (di luar jalur kritis operasional)** pada fase analisis pasca-insiden (*post-mortem*).

### B. 5 Tahap Siklus Pengayaan Pengetahuan Berkelanjutan

{{< mermaid >}}
flowchart TD
    subgraph PRODUCTION_RUNTIME["Jalur Kritis Runtime Produksi (100% Deterministik & Cepat)"]
        ALERT["Tomcat Alert Triggered"] --> ENGINE["Diagnostic Engine"]
        ENGINE --> MATCH{"Pola Cocok dengan<br/>Rulepack Aktif?"}
        MATCH -->|Ya| KNOWN["RCA Teridentifikasi Seketika<br/>(e.g., TD-14 HikariCP)"]
        MATCH -->|Tidak| UNDET["UNDETERMINED (TD-08)<br/>(Jujur & Tanpa Halusinasi)"]
        KNOWN --> PERSIST[("SQLite Database<br/>(Bukti Forensik Tersimpan Penuh)")]
        UNDET --> PERSIST
    end

    subgraph OUT_OF_BAND_LOOP["Siklus Belajar Berkelanjutan (Out-of-Band AI Enrichment Loop)"]
        direction TB
        STEP1["1. Ekstraksi Bukti Forensik Pasca-Insiden<br/>(catalina.out, exit code, crash dump)"]
        STEP2["2. Analisis Post-Mortem Berbantuan AI / SRE<br/>(Root Cause Reconstruction & Pattern Synthesis)"]
        STEP3["3. Formulasi Declarative Rulepack JSON<br/>(Validasi Struktur terhadap rulepack-v1.schema.json)"]
        STEP4["4. Lab Fixture Verification Gate<br/>(Uji Determinisme terhadap Log Rekaman Insiden)"]
        STEP5["5. Hot-Ingestion via CLI ke Diagnostic Service<br/>(./scripts/ingest-rule.sh)"]

        PERSIST -.->|Batch Export Pasca-Insiden| STEP1
        STEP1 --> STEP2 --> STEP3 --> STEP4 --> STEP5
    end

    STEP5 ==>|Hot-Reload ke Memori & SQLite| ENGINE
{{< /mermaid >}}

Mari kita telaah bagaimana kelima langkah siklus ini bekerja:

1. **Insiden & Pengumpulan Bukti Multi-Sumber (Layer 1):** Ketika insiden terjadi pada klaster Tomcat, `tomcat-diagnostic-service` mengumpulkan bukti terikat (*bounded evidence*): 500 baris terakhir `catalina.out`, rekaman event soket kontainer dari `tm-agent` (kode keluar, indikator OOM), metrik Prometheus, serta status probe kesehatan HTTP.
2. **Evaluasi Deterministik & Fallback Transparan (Layer 2):** Karena pola kegagalan merupakan kasus baru, evaluator tidak menemukan aturan yang cocok. Sistem secara deterministik menerbitkan laporan dengan klasifikasi `UNDETERMINED (TD-08)`. Seluruh muatan telemetri disimpan secara persisten di tabel SQLite `incidents`, `events`, dan `evidence_summaries`.
3. **Sintesis Post-Mortem Out-of-Band (Layer 3):** Setelah situasi produksi distabilkan oleh tim on-call, tim SRE mengekstraksi data forensik dari SQLite. Data ini diumpankan ke model LLM melalui *forensic prompt template* khusus. AI merekonstruksi rantai kegagalan dan mensintesis berkas JSON deklaratif baru (misalnya aturan `TD-19` untuk mendeteksi saturasi thread pada konektor HTTP/2).
4. **Gerbang Pengujian Skema & Test Fixtures (Layer 4):** Berkas JSON hasil sintesis AI tidak langsung dimasukkan ke server produksi. Berkas tersebut diuji terlebih dahulu di lingkungan *devops-lab* terhadap *test fixture* (kumpulan log rekaman insiden) untuk memastikan:
   - Pola regex tidak mengalami *false positive* pada log normal.
   - Skema mematuhi `rulepack-v1.schema.json` secara sempurna.
   - Rekomendasi SOP tindakan realistis dan dapat dieksekusi oleh operator.
5. **Hot-Ingestion ke Runtime Produksi (Layer 5):** Rulepack yang telah disetujui di-ingest ke server produksi via skrip CLI `./scripts/ingest-rule.sh`. Aturan tersebut diverifikasi oleh *5-Layer Guard*, disimpan ke tabel `custom_rules`, dan dimuat ke dalam memori `DynamicRuleEvaluator` seketika.

**Hasilnya:** Ketika insiden serupa terulang kembali di masa depan, sistem tidak lagi berstatus `UNDETERMINED`. Engine akan **langsung mengenali pola tersebut dalam waktu kurang dari 50 milidetik**, mengklasifikasikannya ke domain kegagalan yang tepat, dan mengirimkan laporan insiden 7-bagian lengkap dengan instruksi SOP mitigasi instan kepada tim SRE.

---

## 💻 6. Implementasi Operasional: Diagram Arsitektur & Snippet Kode

### A. Diagram Alir Komprehensif: Ingestion hingga In-Memory Indexing

Diagram Mermaid berikut menggambarkan interaksi lengkap antara operator, antarmuka HTTPS, validasi 5 lapis, penyimpanan persisten SQLite WAL, dan perbaruan indeks memori:

{{< mermaid >}}
sequenceDiagram
    autonumber
    actor SRE as SRE Operator / CI-CD Pipeline
    participant HTTP as HTTPS Server (:8443)
    participant GUARD as 5-Layer Ingestion Guard
    participant DB as SQLite Storage (WAL Mode)
    participant EVAL as DynamicRuleEvaluator (Memory)

    SRE->>HTTP: POST /api/v1/rules (Bearer Token, Rulepack JSON)
    activate HTTP
    
    HTTP->>GUARD: 1. Timing-Safe Bearer Authentication Check
    alt Token Tidak Valid
        GUARD-->>HTTP: Reject 401 Unauthorized
        HTTP-->>SRE: HTTP 401 Unauthorized
    end

    HTTP->>GUARD: 2. Buffer Accumulation & Size Guard (Max 64 KiB)
    alt Ukuran > 64 KiB
        GUARD-->>HTTP: Reject 413 Payload Too Large
        HTTP-->>SRE: HTTP 413 Payload Too Large
    end

    HTTP->>GUARD: 3. Strict Schema (Ajv) & isSafeRegex() Test
    alt Skema Rusak atau Pola ReDoS Berbahaya
        GUARD-->>HTTP: Reject 400 Bad Request
        HTTP-->>SRE: HTTP 400 Bad Request
    end

    HTTP->>GUARD: 4. Branch Collision Check (Reserved & DB Index)
    alt Branch Telah Digunakan (e.g. TD-01..TD-08 atau Duplikat)
        GUARD-->>HTTP: Reject 409 Conflict
        HTTP-->>SRE: HTTP 409 Conflict
    end

    HTTP->>DB: BEGIN IMMEDIATE Transaction
    activate DB
    DB->>DB: INSERT INTO custom_rules (branch, rule_json, ...)
    DB->>DB: COMMIT Transaction (Appended to WAL)
    DB-->>HTTP: Record Saved (Row ID #12)
    deactivate DB

    HTTP->>EVAL: registerRule(savedRule)
    activate EVAL
    EVAL->>EVAL: new RegExp(rule.pattern, "i")
    EVAL->>EVAL: Update Active this.rules Index Array
    EVAL-->>HTTP: Hot-Reload Completed in Memory
    deactivate EVAL

    HTTP-->>SRE: HTTP 201 Created (Full Rulepack Metadata)
    deactivate HTTP
{{< /mermaid >}}

---

### B. Kakas CLI Operator: `ingest-rule.sh`

Untuk menyederhanakan operasional tim SRE tanpa mengharuskan penulisan perintah `curl` yang panjang, repositori platform menyediakan kakas CLI cerdas [`ingest-rule.sh`](file:///home/eddywiyatno/git/tomcat-monitoring/scripts/ingest-rule.sh) yang mendukung pemrosesan berkas tunggal (*single rule*) maupun susunan berkas massal (*batch rulepacks array*):

```bash
#!/usr/bin/env bash
# scripts/ingest-rule.sh — Operator CLI untuk Hot-Ingestion Rulepack
set -euo pipefail

readonly DIAGNOSTIC_URL="${DIAGNOSTIC_URL:-https://localhost:8443}"
readonly AUTH_TOKEN="${BEARER_TOKEN:-$(cat /run/secrets/bearer-token)}"

PAYLOAD_FILE="$1"
[[ -f "${PAYLOAD_FILE}" ]] || { echo "File not found: ${PAYLOAD_FILE}" >&2; exit 1; }

# Deteksi tipe JSON: Batch Array vs Single Object menggunakan jq
IS_ARRAY=$(jq 'if type == "array" then true else false end' "${PAYLOAD_FILE}")

if [[ "${IS_ARRAY}" == "true" ]]; then
    TOTAL_RULES=$(jq 'length' "${PAYLOAD_FILE}")
    echo "ℹ Batch Rulepack terdeteksi: Memproses ${TOTAL_RULES} aturan..."
    
    for ((i = 0; i < TOTAL_RULES; i++)); do
        SINGLE_RULE=$(jq -c ".[$i]" "${PAYLOAD_FILE}")
        BRANCH=$(echo "${SINGLE_RULE}" | jq -r '.branch')
        
        RESPONSE=$(curl -k -s -w "\n%{http_code}" -X POST "${DIAGNOSTIC_URL}/api/v1/rules" \
            -H "Authorization: Bearer ${AUTH_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "${SINGLE_RULE}")
        
        HTTP_CODE=$(echo "${RESPONSE}" | tail -n1)
        if [[ "${HTTP_CODE}" == "201" ]]; then
            echo "✔ Rule ${BRANCH} berhasil di-ingest (201 Created)."
        elif [[ "${HTTP_CODE}" == "409" ]]; then
            echo "⚠ Rule ${BRANCH} dilewati: Sudah terdaftar sebelumnya (409 Conflict)."
        else
            echo "✘ Rule ${BRANCH} ditolak (${HTTP_CODE})!" >&2
            exit 1
        fi
    done
else
    # Ingest berkas aturan tunggal
    BRANCH=$(jq -r '.branch' "${PAYLOAD_FILE}")
    RESPONSE=$(curl -k -s -w "\n%{http_code}" -X POST "${DIAGNOSTIC_URL}/api/v1/rules" \
        -H "Authorization: Bearer ${AUTH_TOKEN}" \
        -H "Content-Type: application/json" \
        -d @"${PAYLOAD_FILE}")
    
    HTTP_CODE=$(echo "${RESPONSE}" | tail -n1)
    BODY=$(echo "${RESPONSE}" | sed '$d')
    
    if [[ "${HTTP_CODE}" == "201" ]]; then
        echo "✔ Rulepack ${BRANCH} aktif seketika di runtime!"
        echo "${BODY}" | jq .
    else
        echo "✘ Ingestion gagal (${HTTP_CODE}): ${BODY}" >&2
        exit 1
    fi
fi
```

### C. Eksekusi Pengujian Lapangan (*Field Test & Verification*)

Berikut adalah simulasi praktis saat seorang operator mendaftarkan aturan kegagalan baru untuk mendeteksi *SQL Query Lock Timeout* (`TD-18`):

#### 1. Mempersiapkan Payload Deklaratif (`rule-sql-timeout.json`)
```json
{
  "branch": "TD-18",
  "ruleName": "PostgreSQLTransactionLockTimeout",
  "category": "database_persistence",
  "targetSource": "local_file",
  "pattern": "org.postgresql.util.PSQLException: ERROR: canceling statement due to lock timeout",
  "assessment": "PostgreSQL transaction lock timeout: Long-running exclusive lock blocked incoming queries",
  "classification": "confirmed_cause",
  "confidence": "high",
  "recommendedActions": [
    "Check pg_stat_activity on PostgreSQL cluster to identify blocking PID and active query.",
    "Review concurrent table migrations or bulk ETL operations running against transactional tables.",
    "Terminate blocking backend processes using pg_cancel_backend(pid) or pg_terminate_backend(pid).",
    "Review database application isolation levels and lock acquisition timeouts."
  ],
  "createdBy": "sre-eddy-wiyatno"
}
```

#### 2. Eksekusi Ingestion via Script CLI
```bash
# Menjalankan hot-ingestion ke service yang sedang aktif memantau
BEARER_TOKEN="secret-prod-token-xyz" ./scripts/ingest-rule.sh rule-sql-timeout.json
```

**Output Log Konsol:**
```text
✔ Rulepack TD-18 aktif seketika di runtime!
{
  "id": 9,
  "ruleId": "TomcatDown",
  "branch": "TD-18",
  "ruleName": "PostgreSQLTransactionLockTimeout",
  "category": "database_persistence",
  "targetSource": "local_file",
  "pattern": "org.postgresql.util.PSQLException: ERROR: canceling statement due to lock timeout",
  "assessment": "PostgreSQL transaction lock timeout: Long-running exclusive lock blocked incoming queries",
  "classification": "confirmed_cause",
  "confidence": "high",
  "recommendedActions": [
    "Check pg_stat_activity on PostgreSQL cluster to identify blocking PID and active query.",
    "Review concurrent table migrations or bulk ETL operations running against transactional tables.",
    "Terminate blocking backend processes using pg_cancel_backend(pid) or pg_terminate_backend(pid).",
    "Review database application isolation levels and lock acquisition timeouts."
  ],
  "createdBy": "sre-eddy-wiyatno",
  "createdAt": "2026-09-21T08:31:14.204Z"
}
```

#### 3. Verifikasi Proteksi Tabrakan Cabang (Collision Guard Verification)
Jika operator secara tidak sengaja mencoba mendaftarkan kembali aturan `TD-18` tersebut:

```bash
BEARER_TOKEN="secret-prod-token-xyz" ./scripts/ingest-rule.sh rule-sql-timeout.json
```

**Output Penolakan Layer 4 (HTTP 409):**
```text
✘ Ingestion gagal (409): {
  "error": "rule_branch_conflict",
  "message": "Branch 'TD-18' already exists in custom rules"
}
```

#### 4. Verifikasi Proteksi Immutabilitas (Layer 5 Lockout)
Jika ada pihak yang mencoba menghapus atau memutasi aturan yang telah tersimpan menggunakan method `DELETE`:

```bash
curl -k -i -X DELETE "https://localhost:8443/api/v1/rules/TD-18" \
  -H "Authorization: Bearer secret-prod-token-xyz"
```

**Respons HTTP 405 Method Not Allowed:**
```http
HTTP/1.1 405 Method Not Allowed
Allow: GET, POST
content-type: application/json
x-engine-architect: Eddy Wiyatno
x-diagnostic-engine: Tomcat Diagnostic Engine/1.0
Date: Mon, 21 Sep 2026 08:31:45 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Content-Length: 121

{
  "error": "method_not_allowed",
  "message": "Rules API is append-only. Modification and deletion of rules are prohibited."
}
```

---

## 🎯 7. Dampak Operasional pada Laporan Kanonikal 7-Section SRE

Apa manfaat nyata dari seluruh arsitektur ini bagi *on-call engineer* di lapangan? Ketika insiden saturasi koneksi basis data atau *lock timeout* terjadi beberapa menit kemudian, Alertmanager menembakkan webhook ke mesin diagnostik.

Alih-alih menerima email peringatan Prometheus generik bertuliskan `TomcatDown: Instance Down`, mesin diagnostik secara mandiri mengkorelasikan baris log `catalina.out` terbaru, mencocokkannya dengan aturan `TD-18` yang baru saja di-ingest, dan mengirimkan **Canonical 7-Section Diagnostic Report** terstruktur via SMTP relay:

```text
========================================================================================
🚨 TOMCAT DIAGNOSTIC AUTONOMOUS INCIDENT REPORT
========================================================================================
1. INCIDENT HEADER & CONTEXT:
   - Incident ID     : e78f0d82-9302-4911-a887-bf1b50428d01
   - Prometheus Alert: TomcatDown [CRITICAL]
   - Target Host     : srv-app-tomcat-prod01.internal.bank:8080
   - Incident State  : FIRING (Detected: 2026-09-21T08:35:10Z)

2. PRIMARY ROOT CAUSE & DECISION BRANCH:
   - Decision Branch : TD-18 (PostgreSQLTransactionLockTimeout)
   - Root Cause      : PostgreSQL transaction lock timeout: Long-running exclusive lock 
                       blocked incoming queries

3. FAILURE DOMAIN CLASSIFICATION:
   - Category Scope  : database_persistence
   - Target Escalation: DBA & Database Platform Engineering

4. DIAGNOSTIC CONFIDENCE MATRIX:
   - Confidence Level: HIGH (Confirmed deterministic pattern match)
   - Evidence Match  : 100% regex match on local_file target stream

5. CORRELATED EVIDENCE SUMMARY:
   [catalina.out Log Excerpt (Line 412..418)]:
   > 2026-09-21 08:34:58.112 ERROR [http-nio-8080-exec-42] o.h.e.jdbc.spi.SqlExceptionHelper:
   > org.postgresql.util.PSQLException: ERROR: canceling statement due to lock timeout
   >   at org.postgresql.core.v3.QueryExecutorImpl.receiveErrorResponse(QueryExecutorImpl.java:2713)
   >   at com.zaxxer.hikari.pool.ProxyConnection.prepareStatement(ProxyConnection.java:311)

6. ACTIONABLE OPERATOR SOP STEPS (ZERO AUTOMATIC MUTATION):
   [1] Check pg_stat_activity on PostgreSQL cluster to identify blocking PID and active query.
   [2] Review concurrent table migrations or bulk ETL operations running against transactional tables.
   [3] Terminate blocking backend processes using pg_cancel_backend(pid) or pg_terminate_backend(pid).
   [4] Review database application isolation levels and lock acquisition timeouts.

7. SYSTEM METADATA & VERIFICATION AUDIT TRAIL:
   - Engine Version  : Tomcat Diagnostic Engine v1.0 (Node.js 24 LTS ESM)
   - Rulepack Author : sre-eddy-wiyatno
   - SQLite Event ID : 10842 | Result Hash: 8f9b2311de... (Deterministic Verification)
========================================================================================
```

Dengan laporan ini, on-call engineer tidak perlu membuang waktu 30 menit pertama insiden untuk melakukan SSH ke server host, menggali ribuan baris log teks, atau menebak-nebak penyebab kegagalan. Seluruh bukti, domain eskalasi, dan langkah mitigasi sudah tersaji secara instan di kotak masuk email mereka.

---

## 💡 8. Kesimpulan & Pelajaran Rekayasa Arsitektur (*Key Takeaways*)

Merancang sistem diagnostik mandiri (*Autonomous Diagnostic Engine*) untuk beban kerja kritis enterprise membutuhkan kompromi yang cermat antara **kecepatan evolusi operasional** dan **stabilitas keamanan sistem**. Pendekatan *Knowledge-as-Code* yang kami bangun di `tomcat-diagnostic-service` membuktikan bahwa tim SRE tidak harus memilih antara fleksibilitas dinamis atau determinisme yang kaku. Keduanya dapat dicapai secara harmonis melalui prinsip desain yang terukur:

1. **Pisahkan Logika Eksekusi dari Kontrak Pengetahuan:** Menjauhkan aturan deteksi dari kode kompilasi dan memperlakukannya sebagai *declarative data contracts* menghilangkan hambatan siklus rilis (*release friction*) serta memangkas waktu kodifikasi insiden dari hitungan hari menjadi menit.
2. **Kekuatan Fitur Bawaan Runtime Modern:** Pemanfaatan modul bawaan `node:sqlite` pada Node.js 24 LTS ([TM-ADR-0013](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0013/)) memangkas ketergantungan *build toolchain* C++ yang rapuh, sementara mode **Write-Ahead Logging (WAL)** menjamin konkurensi pembacaan tinggi oleh worker diagnostik tanpa pernah terhambat oleh penulisan aturan baru.
3. **Pertahanan Berlapis adalah Keharusan Mutlak:** Kemampuan *hot-reload* runtime tanpa pengamanan ketat adalah bencana keamanan. Arsitektur **5-Layer Defense-in-Depth Guard** ([TM-ADR-0018](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0018/))—mulai dari *timing-safe auth*, pembatasan buffer 64 KiB, proteksi ReDoS, pencegahan tabrakan cabang, hingga penguncian *append-only* (HTTP 405)—menjamin integritas runtime dan memelihara jejak audit historis tanpa celah.
4. **Jembatan Deterministik dan AI (Out-of-Band Synthesis):** Alih-alih mempertaruhkan ketersediaan produksi dengan menaruh model generatif langsung pada jalur notifikasi peringatan, pola **Out-of-Band AI Forensic Loop** ([TM-ADR-0019](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0019/)) memanfaatkan kecerdasan AI untuk mensintesis aturan pada fase pasca-insiden yang santai, sementara lini depan evaluasi peringatan tetap 100% deterministik, cepat, dan terukur.

Melalui arsitektur ini, platform observabilitas tidak lagi menjadi sistem pasif yang sekadar membunyikan alarm ketika sistem terbakar, melainkan berevolusi menjadi **mesin kognitif yang terus belajar dan memperkaya pengetahuannya di setiap insiden**—sebuah perwujudan sejati dari prinsip keandalan sistem modern.

---

### 📚 Referensi Arsitektur & Tautan Terkait
- [DevOps Handbook — Architecture Decision Records](https://edkas07-oss.github.io/devops-handbook/)
- [TM-ADR-0013: Use Node.js 24 ESM and Isolated Built-In SQLite](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0013/)
- [TM-ADR-0018: Adopt Strict Declarative Rulepack Engine and Append-Only Ingestion API](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0018/)
- [TM-ADR-0019: Adopt Out-of-Band AI Forensic Enrichment Loop for Diagnostic Rule Synthesis](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0019/)
- [Repositori Diagnostic Service: `tomcat-diagnostic-service`](https://github.com/edkas07-oss/tomcat-diagnostic-service)
- [Node.js 24 Documentation: Built-in SQLite Module (`node:sqlite`)](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
