+++
title = "tcctl deploy — Zero-Downtime Temporary Staging Rollout & Dynamic JVM Engine"
date = "2026-09-25T23:50:00+07:00"
draft = false
summary = "Bedah arsitektur modul deploy tcctl: orkestrasi temporary staging container pada port penampung sementara (:9080), verifikasi health probe barrier, swap instan ke port kanonikal (:8080), dynamic setenv JVM memory tuning, dan stateful automated rollback tanpa downtime."
author = "Eddy Wiyatno"
categories = ["Platform Engineering", "Middleware", "DevOps"]
tags = ["tcctl", "deploy", "staging-rollout", "tomcat", "windows-containers", "linux", "golang", "jvm-tuning"]
series = ["Apache Tomcat Enterprise Platform"]
toc = true
showSummary = true
+++

{{< lead >}}
**Zero-Downtime Temporary Staging Rollout & Automated Dynamic JVM Memory Tuning**

Modul `tcctl deploy` dirancang untuk mengeliminasi downtime dan risiko kegagalan rilis aplikasi Java enterprise pada lingkungan Windows Containers dan Linux. Menerapkan pola *temporary staging container* pada port isolasi sebelum promosi port kanonikal, serta otomasi kalkulasi alokasi memori JVM (`bin/setenv`) berbasis kapasitas container host.
{{< /lead >}}

---

## 💡 Motivasi Rekayasa: Mengapa In-Place Restart Membunuh Ketersediaan?

Dalam ekosistem aplikasi perbankan atau enterprise mission-critical yang ditenagai Apache Tomcat, proses pembaruan aplikasi (*deployment*) atau perubahan konfigurasi runtime kerap dilakukan dengan pola tradisional:
1. Mematikan kontainer lama (`docker stop`).
2. Menghapus atau menimpa berkas `.war` di folder `webapps/`.
3. Menjalankan kontainer baru (`docker run`) langsung mengikat port produksi (`8080`).

Pendekatan *in-place restart* konvensional ini memiliki cacat arsitektural fatal:

1. **Downtime Jendela *Warm-Up* JVM:**  
   Runtime Java Virtual Machine (JVM) membutuhkan waktu antara 15 hingga 90 detik untuk inisialisasi class loading, parsing Spring context, dan *connection pool bootstrapping*. Selama periode ini, port `8080` sudah menerima request namun menghasilkan HTTP 502/503 atau connection refused.
2. **Ketiadaan Jaminan Kesehatan (*Health Gate Barrier*):**  
   Jika image baru memiliki cacat konfigurasi XML atau kegagalan migrasi skema database, kontainer lama sudah terlanjur dimatikan, memicu *extended outage* hingga tim SRE melakukan investigasi manual.
3. **Konflik Port Binding pada Multi-Instance:**  
   Mencoba menjalankan dua kontainer berdampingan di port yang sama secara bersamaan akan memicu galat `bind: address already in use`.
4. **Stateless Scripts Tanpa Jejak Rollback:**  
   Skrip shell imperatif (`.sh` / `.ps1`) tidak menyimpan snapshot konfigurasi kontainer sebelumnya secara atomik, menyulitkan proses rollback saat kontainer baru mengalami *boot crash*.

---

### 📊 Matriks Perbandingan: In-Place Deployment vs Raw Scripts vs `tcctl deploy`

| Kapabilitas Operasional | In-Place `docker restart` | Skrip Shell Rollout | **`tcctl deploy` (Go Engine)** |
| :--- | :--- | :--- | :--- |
| **Ketersediaan Layanan** | Mengalami downtime warm-up | Berpotensi downtime | **Zero-Downtime (Staging Isolation)** |
| **Port Staging Verifikasi** | Tidak ada | Port mapping manual rapuh | **Port 9080 terisolasi otomatis** |
| **Health Probe Barrier** | Tidak ada verifikasi | Polling cURL parsial | **Synthetic HTTP + TCP handshake gate** |
| **Dynamic JVM Tuning** | Variabel ENV statis manual | Skrip regex rapuh | **Kalkulasi memori host atomik (`bin/setenv`)** |
| **Atomic Container Swap** | Manual stop-then-start | Rawan race-condition | **Deterministik port swap & prune** |
| **Stateful Rollback** | Tidak ada (manual deploy ulang) | Bergantung backup manual | **Auto-rollback instan ke kontainer lama** |
| **Eksekusi Lintas OS** | Beda sintaks Linux/Windows | Butuh duplikasi Bash/PowerShell | **Satu biner statis (`CGO_ENABLED=0`)** |

---

## 🏛️ Arsitektur Staging Rollout & Port Swap

`tcctl deploy` mengimplementasikan strategi rilis berbasis *Temporary Staging Barrier*: kontainer baru pertama kali dijalankan pada port evaluasi sementara (`9080`), diuji kelayakan fungsionalnya melalui synthetic health probe, lalu dipromosikan ke port produksi kanonikal (`8080`) secara atomik.

{{< mermaid >}}
flowchart TD
    %% Styling Classes
    classDef step fill:#0f172a,stroke:#38bdf8,stroke-width:1.5px,color:#38bdf8;
    classDef gate fill:#7c2d12,stroke:#f97316,stroke-width:1.5px,color:#ffffff;
    classDef success fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#ffffff;
    classDef rollback fill:#881337,stroke:#f43f5e,stroke-width:1.5px,color:#ffffff;

    START["1. Operator / GitOps Trigger: tcctl deploy"]:::step --> STAGING["2. Spin-Up Container Baru pada Port Staging (:9080)<br/>tc-[service]-staging"]:::step
    
    STAGING --> PROBE{"3. Synthetic Health Probe Barrier<br/>GET http://localhost:9080/[health-path]"}:::gate
    
    PROBE -- "HTTP 200 OK (Warm-up Selesai)" --> PROMOTION["4. Eksekusi Promosi Atomik:<br/>• Hentikan kontainer lama (:8080)<br/>• Swap port staging ke kanonikal (:8080)<br/>• Rename container ke tc-[service]"]:::success
    
    PROBE -- "Timeout / Non-200 (Gagal)" --> ABORT["5. Trigger Automated Rollback:<br/>• Hentikan kontainer staging (:9080)<br/>• Bersihkan alokasi port sementara<br/>• Pertahankan kontainer aktif lama (:8080)<br/>• Kirim laporan kegagalan"]:::rollback

    PROMOTION --> CLEANUP["6. Prune Staging State & Persist Active Snapshot"]:::success
{{< /mermaid >}}

---

## ⚙️ Dynamic JVM Tuning Engine (`bin/setenv`)

Salah satu fitur unggulan dari `tcctl deploy` adalah kemampuan menghasilkan berkas konfigurasi `setenv.bat` (Windows) dan `setenv.sh` (Linux) secara dinamis sebelum kontainer dijalankan.

### 1. Algoritma Pembagian Memori JVM
Secara default, kontainer Windows atau Linux yang tidak dikonfigurasi dengan benar akan mengalokasikan heap memory berdasarkan batas host fisik, bukan batas isolasi kontainer (*cgroup* atau *Job Object*). Hal ini memicu *Out Of Memory (OOM)* fatal pada host.

`tcctl deploy` menghitung alokasi memori secara proporsional sesuai batas yang dialokasikan:
* **Initial Heap (`-Xms`)**: Ditetapkan sama dengan `-Xmx` untuk mencegah latensi alokasi memori runtime.
* **Maximum Heap (`-Xmx`)**: 70% dari batas memori kontainer yang dialokasikan.
* **Metaspace (`-XX:MaxMetaspaceSize`)**: 15% dari batas memori kontainer (mencegah kebocoran ClassLoader).
* **Native & Thread Overhead**: 15% dialokasikan untuk stack thread (`-Xss1m`), garbage collection tracking, dan OS overhead.

### 2. Penegakan Flag JVM Modern
Engine secara otomatis menyuntikkan flag JVM enterprise:
```properties
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200
-XX:+ParallelRefProcEnabled
-XX:+AlwaysPreTouch
-Djava.security.egd=file:/dev/urandom
-Djava.awt.headless=true
```

---

## 🛡️ Penegakan Akun Non-Root & Bind Mount Safety

Sesuai standar keamanan enterprise [TC-ADR-0009](file:///home/eddywiyatno/git/devops-handbook/docs/projects/tomcat/engineering-journal/platform-foundation-and-hardening/TN-006-standardize-enterprise-drive-separation-docker-data-root-and-host-bind-mount-hierarchy.md), `tcctl deploy` secara ketat mematuhi hierarki volume:

1. **Windows Containers:**  
   Kontainer dijalankan menggunakan akun terbatas `ContainerUser`. Direktori konfigurasi host bind-mount (`conf/`) di-mount dengan proteksi *Read-Only* (`:ro`), mencegah manipulasi runtime oleh aplikasi yang disusupi.
2. **Linux Containers:**  
   Dijalankan di bawah Podman Rootless dengan pemetaan user namespace `keep-id`, menjamin UID container tidak memiliki hak istimewa di host.
3. **Pemisahan Disk Data & Log:**  
   Direktori `logs/` dan `webapps/` dipisahkan pada drive khusus (Drive `D:` pada Windows Server), mencegah saturasi disk sistem operasi (Drive `C:`).

---

## 💻 Panduan Eksekusi CLI

### 1. Deploy Versi Baru dengan Verifikasi Staging
```bash
# Menjalankan deployment kontainer Tomcat dengan health check port 9080
tcctl deploy \
  --name payment-service \
  --image myregistry.local/tomcat/payment:v2.1.0 \
  --memory 4g \
  --cpu 2 \
  --health-path "/payment/health" \
  --timeout 60s
```

### 2. Dry-Run Validasi Konfigurasi & Setenv
```bash
# Memeriksa alokasi setenv dan port tanpa menjalankan kontainer
tcctl deploy --name payment-service --dry-run
```

### 3. Rollback Paksa ke Versi Stabil Sebelumnya
```bash
# Mengembalikan kontainer ke image dan konfigurasi snapshot sebelumnya
tcctl deploy rollback --name payment-service
```

---

## 🔗 Keterkaitan dengan Modul Lain

* [**tcctl hardening & va**]({{< relref "hardening-audit" >}}): Konfigurasi XML dan base image diverifikasi terlebih dahulu sebelum perintah `tcctl deploy` diizinkan mengeksekusi kontainer.
* [**tcctl gitops**]({{< relref "gitops-reconciler" >}}): Rekonsiliator GitOps memanggil modul `deploy` secara headless saat mendeteksi commit baru pada repositori spesifikasi deklaratif.
