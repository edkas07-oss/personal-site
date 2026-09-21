+++
title = "Mendeteksi Concurrency Saturation & GC Thrashing: Jangan Hanya Mengandalkan Metrik CPU & Memory Biasa"
date = "2026-09-19T18:00:00+07:00"
draft = false
summary = "Membongkar jebakan ambang batas statis mentah pada Java Virtual Machine dan bagaimana sinyal saturasi beban nyata (GC Golden Signals & Concurrency Saturation) mencegah alert fatigue dan cascading outage di Apache Tomcat."
author = "Eddy Wiyatno"
categories = ["SRE", "Observability", "Performance"]
tags = ["jvm", "tomcat", "garbage-collection", "concurrency", "promql", "prometheus", "sre-best-practices"]
series = ["JVM & Tomcat Performance Engineering"]
toc = true
showSummary = true
aliases = ["/articles/mendeteksi-concurrency-saturation-dan-gc-thrashing/"]
+++

## 📌 Ringkasan Eksekutif (TL;DR)

Dalam praktik pemantauan sistem berbasis Java Virtual Machine (JVM) seperti Apache Tomcat, banyak tim operasional terjebak pada pendekatan naif: memasang alert peringatan saat **CPU Usage > 80%** atau **Heap Memory Usage > 80%**. Ambang batas statis mentah (*static raw thresholds*) ini adalah sumber utama kebisingan peringatan palsu (*alert fatigue*). Karakteristik JVM yang generasional secara alami akan mengisi memori hingga 90% sebelum membersihkannya melalui *Garbage Collection* (GC), dan lonjakan thread sesaat adalah mekanisme normal penyerapan lonjakan trafik (*burst traffic elasticity*).

Sebaliknya, metrik agregat CPU dan memori biasa sering kali **gagal mendeteksi krisis mematikan**. CPU host mungkin hanya terlihat terpakai 40%, tetapi aplikasi telah membeku total selama 5 detik akibat *Stop-The-World (STW) GC pause*. Begitu pula sebaliknya: memori heap tampak berfluktuasi normal, tetapi thread pool Tomcat telah mengalami kejenuhan 100% (*thread starvation*) sehingga antrean request baru ditolak (*rejected execution*).

Artikel ini mengulas mengapa arsitektur observabilitas kami secara resmi menolak ambang batas statis mentah melalui [`TM-ADR-0022`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0022/), bagaimana kami merancang **Sinyal Emas GC (*GC Golden Signals*)** dan **Indikator Kejenuhan Konkurensi (*Concurrency Saturation Indicators*)**, serta formula PromQL konkret siap pakai yang diadopsi dari operasional nyata platform Tomcat Monitoring.

---

## 🌍 Latar Belakang & Real-World Problem: Jebakan Ambang Batas Statis Mentah

Setiap engineer yang pernah memegang pager on-call pasti akrab dengan dua skenario frustrasi berikut:

1. **Alarm Palsu Tengah Malam (*The 03:00 AM Phantom Alert*):**  
   Pager berdering kencang dengan pesan `TomcatHeapMemoryHigh: used > 80%`. SRE terbangun, membuka laptop dengan tergesa, lalu mendapati grafik penggunaan heap sudah kembali anjlok ke 30%. Skenario ini berulang setiap siklus GC minor selesai. Akibatnya, tim on-call mulai mengabaikan alert, mematikan notifikasi, atau menaikkan ambang batas secara serampangan.
2. **Krisis Senyap yang Tidak Terdeteksi (*The Silent Outage*):**  
   Pengguna mengeluhkan transaksi checkout perbankan mengalami timeout massal. Tim operasional mengecek dashboard infrastruktur utama: CPU utilization hanya 50%, memori fisik tersisa 12 GB. Tidak ada alert yang berbunyi! Namun di balik layar, siklus Full GC sedang mengalami *thrashing*—menghabiskan 85% siklus eksekusi thread hanya untuk mencari ruang memori yang tidak pernah ada, membekukan seluruh pemrosesan servlet (*cascading backlog*).

> [!WARNING]
> Metrik kapasitas mentah (seperti Gigabyte memori atau persentase CPU OS) hanya mengukur **kuantitas ruang yang dialokasikan**, bukan **kualitas waktu eksekusi dan efisiensi kerja aplikasi**.

---

## 🔍 Analisis Masalah & Dilema Teknis: Mengapa Metrik Standar Menipu?

Untuk memahami mengapa pendekatan ambang batas statis mentah gagal di lingkungan produksi, kita perlu membedah internal runtime JVM dan arsitektur model konkurensi Apache Tomcat.

{{< mermaid >}}
flowchart TD
    subgraph NAIVE["Pendekatan Konvensional (Naif)"]
        M1["Heap Usage > 80%"] --> F1["False Alarm saat GC Normal"]
        M2["CPU Usage > 80%"] --> F2["Gagal deteksi STW Latency saat CPU Rendah"]
        M3["Active Threads > 80%"] --> F3["False Alarm saat Spike Trafik Singkat"]
    end

    subgraph SATURATION["Pendekatan Saturation-Based (TM-ADR-0022)"]
        S1["GC STW Latency > 1.5s"] --> D1["Deteksi Freeze Nyata Pengguna"]
        S2["GC Overhead CPU > 15%"] --> D2["Deteksi Thrashing & CPU Terbuang"]
        S3["Old Gen Retention > 90% (Post-GC)"] --> D3["Deteksi Kebocoran Memori Nyata (Leak)"]
        S4["Thread Saturation 100% (Sustained 5m)"] --> D4["Deteksi Antrean Macet / Starvation"]
    end
{{< /mermaid >}}

### 1. Siklus Alokasi Memori Generasional JVM (*Generational Heap Dynamic*)
Runtime modern Java (G1GC, ZGC, ParallelGC) membagi *heap space* ke dalam beberapa generasi:
- **Young Generation (Eden & Survivor Spaces):** Tempat objek baru dibuat. Sebagian besar objek Java berusia sangat pendek (*ephemeral*) dan mati dalam hitungan milidetik.
- **Old Generation (Tenured Space):** Tempat objek berumur panjang yang bertahan melewati beberapa siklus alokasi (*promotion*).

Ketika aplikasi aktif melayani trafik, ruang *Eden* akan terisi sangat cepat hingga 90%–95%. Ini adalah **perilaku alokasi optimal**, bukan anomali. Mengirim alert ketika heap menyentuh 80% sama saja dengan membunyikan alarm kebakaran setiap kali mesin mobil membakar bahan bakar saat berakselerasi.

Krisis memori yang sesungguhnya baru terjadi jika:
1. **Old Generation Pool Saturation:** Ruang Old Gen tetap penuh ($>90\%$) bahkan *setelah* siklus Full GC selesai dieksekusi. Ini adalah indikator kuat terjadinya kebocoran memori (*memory leak* atau *unclosed connection cache*).
2. **GC Thrashing:** GC berjalan berulang-ulang tanpa henti namun gagal merebut kembali ruang memori yang cukup (*GC overhead limit exceeded*).

### 2. Elastisitas Alami Thread Pool Tomcat (*Burst Traffic Elasticity*)
Tomcat mengelola request HTTP melalui *thread pool executor* (standar konektor NIO/NIO2). Ketika promosi flash sale atau batch request masuk serentak:
- Jumlah thread aktif (*busy threads*) wajar melonjak dari 15 ke 180 thread dalam beberapa detik untuk menguras antrean TCP socket.
- Begitu servlet selesai mengirimkan response HTTP, worker thread langsung kembali ke status *idle*.

Jika alert dikonfigurasikan dengan `tomcat_threads_busy > 80%` tanpa jeda durasi, sistem akan membunyikan ratusan peringatan setiap kali terjadi lonjakan trafik wajar. Sebaliknya, kondisi kritis baru terjadi jika thread pool mencapai **kejenuhan total 100% dan bertahan persisten (*sustained saturation*)**, atau saat request mulai ditolak (*task rejection*).

---

## 🏛️ Solusi & Desain Arsitektur: Sinyal Kejenuhan Beban Nyata (TM-ADR-0022)

Melalui keputusan arsitektur [`TM-ADR-0022`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0022/), platform pemantauan kami meninggalkan ambang batas statis dan mengadopsi model **Workload Saturation Signals**. 

{{< mermaid >}}
flowchart LR
    subgraph SCRAPE["JMX Exporter (Port 9404)"]
        JMX["JVM MBeans Telemetry"] -->|TLS Keystore| PROM["Prometheus Scraper"]
    end

    subgraph SIGNALS["Evaluasi Sinyal Emas"]
        PROM --> GC_LAT["1. STW Pause Latency (> 1.5s)"]
        PROM --> GC_OVR["2. GC CPU Overhead (> 15%)"]
        PROM --> GC_OLD["3. Old Gen Post-GC Retention (> 90%)"]
        PROM --> TH_SAT["4. Sustained Thread Saturation (100% for 5m)"]
    end

    subgraph ACTION["Triage Deterministik"]
        GC_LAT --> DS["Diagnostic Service<br/>(Domain: jvm_memory)"]
        GC_OVR --> DS
        GC_OLD --> DS
        TH_SAT --> DS_TH["Diagnostic Service<br/>(Domain: concurrency_threading)"]
    end
{{< /mermaid >}}

### 1. Empat Sinyal Emas Garbage Collection (*The 4 GC Golden Signals*)

Alih-alih mengukur volume memori total, evaluasi kesehatan JVM kami didasarkan pada empat pilar:

| Sinyal Emas GC | Pertanyaan Operasional yang Dijawab | Metrik Kunci | Ambang Batas Rekomendasi |
| :--- | :--- | :--- | :--- |
| **GC STW Latency** | Berapa lama aplikasi benar-benar "membeku" dan berhenti melayani transaksi pengguna? | `jvm_gc_pause_seconds_max` | $> 1.5\text{s}$ (*Warning*), $> 2.5\text{s}$ (*Critical*) |
| **GC CPU Overhead** | Berapa persen kapasitas prosesor yang terbuang sia-sia hanya untuk membersihkan memori? | `rate(jvm_gc_pause_seconds_sum[5m]) * 100` | $> 15\%$ (*Warning*), $> 30\%$ (*Critical*) |
| **Old Gen Retention** | Berapa banyak memori jangka panjang yang tertahan persisten tanpa bisa dibebaskan? | `jvm_memory_pool_used_bytes{pool=~".*Old.*"}` | $> 90\%$ bertahan $> 10\text{ menit}$ |
| **Major GC Rate** | Apakah JVM panik dan memicu Full GC berulang kali dalam interval singkat? | `rate(jvm_gc_pause_seconds_count{action=~".*major.*"}[5m])` | $> 0.1\text{ ops/sec}$ (*Anomali*) |

### 2. Tiga Indikator Kejenuhan Konkurensi (*The 3 Concurrency Indicators*)

Untuk konektor HTTP Tomcat, kami memantau saturasi antrean kerja:

1. **Sustained 100% Saturation:** Rasio worker thread sibuk mencapai kapasitas maksimum dan bertahan terus-menerus selama minimal 5 menit (`for: 5m`).
2. **Task Rejection Spike:** Terjadinya penolakan request baru pada tingkat executor (`rejectedExecution > 0`). Ini berarti *backlog queue* TCP telah meluap.
3. **Thread Starvation / Deadlock:** Jumlah thread yang berstatus `BLOCKED` atau `WAITING` pada sinkronisasi lock internal meningkat tajam.

---

## 📊 SRE PromQL Cheatsheet & Alerting Rules Siap Pakai

Berikut adalah kumpulan kueri PromQL operasional yang diadopsi dari `RUNBOOK.md` dan aturan deteksi produksi:

### A. Memantau Retensi Old Generation (Deteksi Memory Leak)

```promql
# Persentase utilisasi memori pada pool Old Generation (G1 Old Gen / Tenured Gen)
(
  jvm_memory_pool_used_bytes{pool=~".*Old.*"} 
  / 
  jvm_memory_pool_max_bytes{pool=~".*Old.*"}
) * 100 > 90
```

> [!NOTE]
> Alert ini wajib dipasangkan dengan klausul `for: 10m` agar siklus pembersihan GC alami tidak memicu alarm palsu sesaat.

### B. Menghitung GC Overhead (% Waktu CPU yang Terbuang untuk GC)

```promql
# Persentase waktu CPU yang dikonsumsi oleh Garbage Collection dalam 5 menit terakhir
(rate(jvm_gc_pause_seconds_sum[5m]) * 100) > 15
```

Jika metrik ini melebihi **15%**, berarti dari setiap 100 detik komputasi prosesor, 15 detik habis hanya untuk menghentikan dunia (*Stop-The-World*). Jika menyentuh **85%**, JVM berada di ambang `java.lang.OutOfMemoryError: GC overhead limit exceeded`.

### C. Menangkap Puncak Jeda STW (Max Stop-The-World Pause)

```promql
# Durasi jeda GC terpanjang yang tercatat
jvm_gc_pause_seconds_max > 1.5
```

### D. Mengukur Kejenuhan Thread Pool Tomcat (Sustained Saturation)

```promql
# Rasio thread pool Tomcat yang sibuk mencapai 100% kapasitas maksimum
(
  tomcat_threads_busy_threads 
  / 
  tomcat_threads_current_threads
) * 100 == 100
```

Pasangkan dengan `for: 5m` dalam Prometheus alert rule:
```yaml
- alert: TomcatThreadPoolSaturated
  expr: (tomcat_threads_busy_threads / tomcat_threads_current_threads) * 100 == 100
  for: 5m
  labels:
    severity: critical
    category: concurrency_threading
  annotations:
    summary: "Tomcat connector thread pool 100% saturated on {{ $labels.instance }}"
    description: "Thread pool has been completely exhausted for over 5 minutes. Application is likely deadlocked or backlogged."
```

---

## 💡 Pelajaran Praktis: SRE & Performance Tuning Best Practices

Penerapan prinsip sinyal kejenuhan ini menghasilkan sejumlah rekomendasi operasional penting:

### 1. Pisahkan Tanggung Jawab Liveness dari Workload Health
Jangan gunakan metrik JMX untuk menguji apakah aplikasi Tomcat hidup atau mati.
- **Liveness & Application Availability:** Uji menggunakan probe HTTP eksternal (misal: Telegraf / Blackbox Exporter ke endpoint `GET :8080/health`).
- **Internal Workload Health:** Gunakan JMX Exporter murni untuk melacak degradasi laten (GC thrashing, memory leak, pool saturation).

### 2. Jangan Terburu-buru Me-Restart Saat Thread Pool Jenuh
Mengacu pada kebijakan Zero Destructive Auto-Remediation ([`TM-ADR-0014`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0014/)), me-restart Tomcat seketika saat thread jenuh adalah kesalahan fatal:
- **Ambil Thread Dump Segera:** Sebelum proses dimatikan, jalankan perintah diagnostik untuk melihat apa yang sedang ditunggu oleh ratusan thread:
  ```bash
  # Ambil 3 kali thread dump dengan jeda 5 detik untuk analisis deadlock
  for i in 1 2 3; do jcmd <PID> Thread.print > /tmp/thread_dump_$i.txt; sleep 5; done
  ```
- **Periksa Upstream & Database Dependency:** Sering kali thread Tomcat jenuh bukan karena kode Java yang buruk, melainkan karena *connection pool* basis data (HikariCP) kehabisan koneksi akibat query SQL yang terkunci (*row lock timeout*).

### 3. Kendalikan Overhead JMX Exporter (<1-2% CPU)
Memantau ribuan MBeans secara serampangan dapat membebani runtime JVM. Batasi aturan penarikan pada berkas `jmx-exporter.yml` hanya pada metrik yang relevan (`java.lang:type=Memory`, `java.lang:type=GarbageCollector`, dan `Catalina:type=ThreadPool`).

---

## 📋 Kesimpulan & Checklist Triage

Beralih dari metrik kapasitas statis mentah menuju **sinyal kejenuhan beban nyata (*workload saturation signals*)** adalah langkah kunci untuk membebaskan tim operasional dari lingkaran setan *alert fatigue*. Peringatan yang akurat bukan yang berbunyi paling cepat saat trafik naik, melainkan peringatan yang berbunyi ketika sistem benar-benar mengalami degradasi layanan yang dirasakan oleh pengguna akhir.

### 🛠️ Checklist Triage SRE Saat Menerima Alert GC atau Concurrency

- [ ] **1. Verifikasi Gejala Latensi Pengguna:**  
  Cek dashboard HTTP response time dan error rate (5xx). Apakah jeda GC berdampak langsung pada timeout request pengguna?
- [ ] **2. Evaluasi Sifat Kejenuhan (Transien vs Persisten):**  
  Apakah `tomcat_threads_busy_threads` kembali turun setelah burst lalu lintas selesai, ataukah tertahan di 100% selama lebih dari 5 menit?
- [ ] **3. Periksa Post-GC Heap Baseline:**  
  Amati grafik memori Old Gen *setelah* siklus GC selesai. Jika garis bawah (*trough*) terus merangkak naik secara linier, siapkan investigasi *heap dump* untuk kebocoran memori.
- [ ] **4. Ambil Thread Dump Sebelum Restart Manual:**  
  Jika thread pool mengalami kebuntuan (*deadlock*), abadikan status thread dengan `jcmd <PID> Thread.print` sebelum mengambil tindakan mitigasi manual.
- [ ] **5. Tinjau Log Diagnostik Terpusat:**  
  Periksa laporan notifikasi 7-seksi dari Diagnostic Service ([`TM-ADR-0016`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0016/)) untuk melihat klasifikasi *root cause* otomatis (`GC-01` .. `GC-04` atau `TH-01` .. `TH-03`).

---

### 📚 Referensi Terkait
- [TM-ADR-0022: Adopt JVM Garbage Collection and Concurrency Saturation Signals over Static Raw Thresholds](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0022/)
- [TM-ADR-0014: Enforce Zero Automatic Remediation for Diagnostic Service](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0014/)
- [TM-ADR-0016: Designate Diagnostic Service as the Canonical Incident Notification Authority](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0016/)
- [DevOps Engineering Handbook Online](https://edkas07-oss.github.io/devops-handbook/)
- [Tomcat Monitoring Platform SRE Operational Runbook](file:///home/eddywiyatno/git/tomcat-monitoring/RUNBOOK.md)
