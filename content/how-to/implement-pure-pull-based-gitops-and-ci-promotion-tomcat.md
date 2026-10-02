+++
title = "Panduan Praktis: Implementasi Pure Pull-Based GitOps dan Otomasi CI Promotion Apache Tomcat di Windows Server"
date = "2026-09-25T23:15:00+07:00"
draft = false
summary = "Panduan langkah-demi-langkah membangun arsitektur GitOps murni (Pure Pull-Based) dan otomasi CI Promotion untuk beban kerja Apache Tomcat di Windows Server 2022. Membahas eliminasi port inbound SSH/WinRM, reconciler mandiri via tcctl, rollout zero-downtime berbasis temporary staging container, hingga pipeline Gitea Actions terintegrasi dengan audit kepatuhan CIS Benchmark dan Trivy scanner."
author = "Eddy Wiyatno"
categories = ["How-To", "DevOps", "GitOps", "Middleware", "Container"]
tags = ["gitops", "tomcat", "windows-server", "gitea", "ci-cd", "tcctl", "docker", "sre", "powershell", "security"]
series = ["Apache Tomcat Enterprise Operations"]
toc = true
showSummary = true
+++

{{< lead >}}
**Mewujudkan Arsitektur Continuous Delivery Modern Tanpa Port Inbound SSH/WinRM dengan Pemulihan Mandiri (Self-Healing) Berkelanjutan**

Pada infrastruktur enterprise tradisional, server CI (seperti Jenkins) atau Ansible Controller umumnya melakukan *push deployment* dengan membuka akses langsung ke server produksi melalui SSH atau WinRM. Pola ini memperluas bidang serangan jaringan (*attack surface*) dan berisiko tinggi terhadap kebocoran kredensial admin. Panduan ini mengupas tuntas cara menerapkan arsitektur **Pure Pull-Based GitOps** menggunakan operator CLI [`tcctl`]({{< relref "packages/tcctl" >}}), repositori deklaratif Gitea, dan pipeline Gitea Actions untuk mengelola kontainer Apache Tomcat pada Windows Server 2022 secara aman, konsisten, dan tanpa downtime.
{{< /lead >}}

---

## 📌 Mengapa Memilih Pure Pull-Based GitOps?

Bagi tim DevOps, System Administrator, dan SRE yang bertanggung jawab atas ketersediaan serta keamanan server produksi, beralih dari model *Push-Based* konvensional ke *Pure Pull-Based GitOps* memberikan sejumlah keuntungan fundamental:

1. **Nol Lubang Inbound (*Zero Inbound Attack Surface*):**  
   Server target (Windows Server) tidak perlu membuka port inbound SSH (22) maupun WinRM (5985/5986) ke arah server CI. Seluruh komunikasi bersifat *outbound HTTPS* murni ke repositori Git dan Container Registry internal.
2. **Kredensial Server Target Tetap Terisolasi:**  
   Server CI tidak perlu menyimpan username/password Administrator maupun private key SSH dari server produksi. Risiko kebocoran kredensial (*blast radius*) jika server CI tersusupi dapat ditekan sepenuhnya.
3. **Pemulihan Mandiri Otomatis (*Continuous Self-Healing*):**  
   Pada model push, perbaikan hanya terjadi saat ada jadwal rilis. Pada model GitOps, *reconciler* lokal pada host berjalan terjadwal (misal setiap 5 menit). Jika kontainer tidak sengaja terhenti (*killed*) atau konfigurasi host dirusak (*drift*), sistem otomatis mengembalikan kondisi kontainer sesuai spesifikasi di Git tanpa intervensi manual.
4. **Pembaruan Tanpa Gangguan Layanan (*Zero-Downtime Staging Rollout*):**  
   Pembaruan versi Java atau image Tomcat tidak langsung mematikan kontainer aktif. Reconciler meluncurkan kontainer penampung sementara (*temporary staging*) pada port alternatif (9080), memverifikasi ketersediaan aplikasi lewat *health probe*, lalu mempromosikannya ke port utama (8080) secara mulus.
5. **Jejak Audit Deklaratif (*Audit Trail* Lengkap):**  
   Semua riwayat perubahan versi aplikasi, variabel lingkungan, dan mapping port tercatat rapi dalam riwayat commit Git di repositori GitOps.

---

## 🏛️ Arsitektur Sistem & Alur Aliran Data

Arsitektur ini menghubungkan tiga domain utama: lingkungan pengembangan/CI, repositori acuan kebenaran (*Single Source of Truth*), dan runtime server target:

{{< mermaid >}}
flowchart TD
    subgraph CI_DOMAIN ["1. Domain Pengembang & CI (Linux Host / Gitea Actions)"]
        Dev["Developer Push Commit"] --> RepoApp["Repo: tomcat<br/>(Source, Containerfile, conf/)"]
        RepoApp --> CIPipeline["Pipeline Gitea Actions (.gitea/workflows/ci.yaml)<br/>1. Podman Build Hardened Image (Tag: 9.0-SHA)<br/>2. Quality Gate 1: CIS Hardening Audit (tcctl)<br/>3. Quality Gate 2: Trivy Vulnerability Scan (tcctl)<br/>4. Push Image ke Internal Registry (:3000)<br/>5. Auto-Promote Tag ke Repo GitOps"]
    end

    subgraph SOT_DOMAIN ["2. Domain Single Source of Truth (GitOps)"]
        RepoGitOps["Repo: tomcat-gitops<br/>File: tomcat-spec.yaml<br/>(Menyimpan Desired State Kanonikal)"]
    end

    subgraph TARGET_DOMAIN ["3. Domain Target Host (Windows Server 2022)"]
        direction TB
        SchedTask["Windows Scheduled Task<br/>(tcctl-gitops-reconciler: Setiap 5 Menit)"]
        Reconciler["tcctl.exe gitops sync<br/>(Polling tomcat-spec.yaml via HTTPS)"]
        
        subgraph ROLLOUT_FLOW ["Alur Staging Rollout (Zero-Downtime)"]
            Step1["1. Jalankan payment-service-staging (:9080)<br/>+ Health Probe Probing (HTTP 200 OK)"]
            Step2["2. Hentikan & Bersihkan Kontainer Lama (:8080)"]
            Step3["3. Promosikan Kontainer ke Nama Kanonikal: payment-service (:8080)"]
            Step1 --> Step2 --> Step3
        end

        SchedTask --> Reconciler
        Reconciler --> ROLLOUT_FLOW
    end

    CIPipeline -->|Commit & Push Tag Baru| RepoGitOps
    RepoGitOps -.->|Outbound HTTPS Pull Query| Reconciler
{{< /mermaid >}}

---

## 🗂️ Pemisahan Tanggung Jawab 3 Repositori Git

Untuk menjaga kebersihan tata kelola dan memisahkan hak akses secara tegas, sistem ini dibagi ke dalam 3 repositori:

| Repositori | URL Remote Contoh | Deskripsi & Isi Repositori | Aktor / Pemilik |
| :--- | :--- | :--- | :--- |
| **`tomcat`** | `http://localhost:3000/gitadm/tomcat.git` | Menyimpan `Containerfile`, template konfigurasi XML (`conf/`), library Java agent JMX, dan skrip alur CI (`.gitea/workflows/ci.yaml`). | Tim Pengembang Aplikasi & Middleware |
| **`tomcat-gitops`** | `http://localhost:3000/gitadm/tomcat-gitops.git` | Menyimpan manifes deklaratif kondisi yang diharapkan ([`tomcat-spec.yaml`](#spesifikasi-manifes-tomcat-specyaml)). Berfungsi sebagai *Single Source of Truth*. | Diperbarui otomatis oleh **CI Bot**, diawasi oleh SRE |
| **`tcctl`** | `http://localhost:3000/gitadm/tcctl.git` | Menyimpan kode sumber biner operator CLI Go. Digunakan oleh CI untuk audit kepatuhan dan oleh Windows Server sebagai agen rekonsiliasi. | Tim Platform Core / DevOps |

---

## 🛠️ Prasyarat Lingkungan

Pastikan komponen-komponen berikut sudah tersedia sebelum memulai konfigurasi:

| Komponen | Spesifikasi / Kebutuhan |
| :--- | :--- |
| **Target Host** | Windows Server 2022 Datacenter atau Windows Server 2019 dengan [Docker Engine CE v27+]({{< relref "how-to/install-docker-engine-windows-containers" >}}) mode Windows Containers |
| **Operator CLI** | Biner [`tcctl.exe`]({{< relref "packages/tcctl" >}}) terpasang di `C:\Program Files\tcctl\` dan terdaftar pada sistem `PATH` Windows Server |
| **Git Server** | Gitea Server v1.21+ dengan fitur Actions (`[actions] ENABLED = true`) dan built-in OCI Container Registry |
| **CI Runner Host** | Linux Workstation/Server dengan biner `podman`, `tcctl`, `trivy`, `node`, dan `act_runner` v4.0+ |
| **Akses Jaringan** | Target host Windows Server dapat melakukan *outbound connection* (HTTP/HTTPS) ke host Gitea port 3000 |

> [!TIP]
> **Belum Menyiapkan Prasyarat di Atas? Ikuti Panduan Pendukung Berikut:**
> - Unduh biner siap pakai melalui **[Katalog Paket tcctl]({{< relref "packages/tcctl" >}})**.
> - Siapkan runtime kontainer Windows dengan **[Panduan Instalasi Docker Engine di Windows Server]({{< relref "how-to/install-docker-engine-windows-containers" >}})**.
> - Pelajari pembuatan base image melalui **[Panduan Build Image Tomcat NanoServer]({{< relref "how-to/build-tomcat-jmx-nanoserver-image" >}})**.

---

## 🚀 Langkah Implementasi Langkah-demi-Langkah

Proses implementasi dibagi menjadi 6 tahap yang terstruktur dan mudah diikuti:

### Tahap 1: Membuat Repositori GitOps (`tomcat-gitops`)

Repositori ini bertindak sebagai acuan kondisi server yang sah.

1. Buat repositori baru bernama `tomcat-gitops` di Gitea Web UI.
2. Di mesin lokal Anda, buat direktori kerja baru dan susun file manifes kanonikal bernama `tomcat-spec.yaml`:

```yaml
version: "1.0"
metadata:
  application: "payment-service"
  environment: "production"
  tier: "backend"

spec:
  image:
    repository: "tomcat"
    tag: "9.0-jdk21"
    pullPolicy: "IfNotPresent"

  runtime:
    containerName: "payment-service"
    httpPort: 8080
    stagingPort: 9080
    httpsPort: 8443

  healthCheck:
    path: "/"
    expectedStatus: 200
    timeoutSeconds: 60

  autoRollback: true
```

3. Simpan, lakukan commit, dan push manifes tersebut ke branch `main`:

```bash
git init
git add tomcat-spec.yaml
git commit -m "feat(gitops): initial declarative specification for payment-service"
git branch -M main
git remote add origin http://localhost:3000/gitadm/tomcat-gitops.git
git push -u origin main
```

---

### Tahap 2: Menyiapkan Reconciler Mandiri di Windows Server

Langkah ini dilakukan langsung pada server target Windows Server menggunakan PowerShell (*Run as Administrator*):

1. **Uji Kesiapan Operator `tcctl.exe`:**
   ```powershell
   & "C:\Program Files\tcctl\tcctl.exe" version
   ```

2. **Inisialisasi Lingkungan GitOps dengan Parameter `--timer`:**
   ```powershell
   tcctl.exe gitops init `
     --repo http://localhost:3000/gitadm/tomcat-gitops.git `
     --branch main `
     --timer
   ```

   **Apa yang Dikerjakan Perintah Ini Secara Otomatis?**
   - Membuat direktori kerja standar di `C:\Program Files\tcctl\gitops\`.
   - Mengambil manifes `tomcat-spec.yaml` dari remote repository.
   - Menyimpan berkas konfigurasi lokal `gitops-config.json`.
   - Mendaftarkan **Windows Scheduled Task** bernama `tcctl-gitops-reconciler` yang akan menjalankan `tcctl.exe gitops sync` setiap 5 menit secara otomatis.

3. **Verifikasi Pendaftaran Scheduled Task di Windows:**
   ```powershell
   Get-ScheduledTask -TaskName 'tcctl-gitops-reconciler'
   ```
   *Pastikan status yang keluar menunjukkan **Ready**.*

4. **Jalankan Sinkronisasi Awal (*Initial Declarative Sync*):**
   ```powershell
   tcctl.exe gitops sync --work-dir 'C:/Program Files/tcctl/gitops'
   ```
   *Hasil:* `tcctl` akan menyiapkan direktori `C:\tomcats\payment-service`, menginjeksi konfigurasi CIS XML yang sudah dikeraskan, men-generate sertifikat SSL PKCS#12, dan menyalakan kontainer `payment-service` pada port 8080 & 8443.

---

### Tahap 3: Menyiapkan Runner Gitea Actions (`act_runner`) di Linux

1. **Aktifkan Fitur Actions di Gitea:**  
   Buka file konfigurasi `app.ini` Gitea Anda dan tambahkan baris berikut jika belum ada:
   ```ini
   [actions]
   ENABLED = true
   ```
   Restart service/kontainer Gitea setelah menyimpan perubahan.

2. **Unduh Biner `act_runner`:**
   ```bash
   mkdir -p ~/devops-lab/act-runner
   cd ~/devops-lab/act-runner

   curl -L -o act_runner https://dl.gitea.com/gitea-runner/4.0.0/gitea-runner-4.0.0-linux-amd64
   chmod +x act_runner
   ```

3. **Buat Konfigurasi Runner Host Mode (`config.yaml`):**
   ```yaml
   log:
     level: info

   runner:
     file: .runner
     capacity: 1
     timeout: 3h
     shutdown_timeout: 0s
     labels:
       - "ubuntu-latest:host"
       - "linux-amd64:host"

   host:
     workdir_parent: /home/eddywiyatno/devops-lab/act-runner/workdir
   ```

   > [!NOTE]
   > **Mengapa Menggunakan Host Mode (`:host`)?**  
   > Mode ini memungkinkan job CI berjalan langsung di lingkungan Linux host tanpa overhead Docker-in-Docker (DinD). Job dapat langsung memanggil biner `tcctl`, `podman`, `git`, dan `trivy` yang sudah terpasang di host secara native.

4. **Daftarkan Runner ke Gitea Server:**  
   Ambil token registrasi runner dari menu Gitea (*Site Administration* $\rightarrow$ *Actions* $\rightarrow$ *Runners* atau via CLI), lalu jalankan:
   ```bash
   ./act_runner register \
     --instance http://localhost:3000 \
     --token "<REGISTRATION_TOKEN>" \
     --no-interactive \
     --name edkas-runner \
     --config config.yaml
   ```

5. **Jalankan Runner sebagai Background Service (`systemd --user`):**  
   Buat file `~/.config/systemd/user/act_runner.service`:
   ```ini
   [Unit]
   Description=Gitea Actions Runner
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=/home/eddywiyatno/devops-lab/act-runner
   ExecStart=/home/eddywiyatno/devops-lab/act-runner/act_runner daemon -c /home/eddywiyatno/devops-lab/act-runner/config.yaml
   Restart=always
   RestartSec=5
   Environment=PATH=/home/eddywiyatno/bin:/home/eddywiyatno/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

   [Install]
   WantedBy=default.target
   ```
   Aktifkan service:
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now act_runner.service
   systemctl --user status act_runner.service
   ```

---

### Tahap 4: Mengonfigurasi Secret Promosi Lintas Repositori

Agar runner CI pada repositori `tomcat` diizinkan melakukan push commit pembaruan tag ke repositori `tomcat-gitops`, kita memerlukan Personal Access Token (PAT):

1. Di Gitea Web UI, klik avatar profil Anda $\rightarrow$ **Settings** $\rightarrow$ **Applications**.
2. Di bagian **Generate New Token**:
   - Beri nama: `gitops-ci-promotion-token`
   - Berikan izin: **Repository: Read and Write**
   - Klik **Generate Token** dan salin string token tersebut.
3. Buka repositori **`tomcat`** $\rightarrow$ **Settings** $\rightarrow$ **Actions** $\rightarrow$ **Secrets**.
4. Tambahkan Secret baru:
   - **Name**: `GITOPS_PUSH_TOKEN`
   - **Content**: *(tempelkan token yang baru saja Anda salin)*

---

### Tahap 5: Menyusun Pipeline CI Terotomasi (`.gitea/workflows/ci.yaml`)

Pada repositori aplikasi **`tomcat`**, buat berkas alur kerja di lokasi `.gitea/workflows/ci.yaml`:

```yaml
name: Apache Tomcat CI & Automated GitOps Promotion

on:
  push:
    branches:
      - main
      - lab
    paths-ignore:
      - '**.md'
      - '.gitignore'

jobs:
  build-and-promote:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Source Code
        uses: actions/checkout@v4

      - name: Set Image Metadata
        id: meta
        run: |
          SHORT_SHA=$(echo "${{ github.sha }}" | cut -c1-7)
          echo "tag=9.0-${SHORT_SHA}" >> "$GITHUB_OUTPUT"
          echo "image=localhost:3000/gitadm/tomcat:9.0-${SHORT_SHA}" >> "$GITHUB_OUTPUT"

      - name: Prepare Artifacts & Dependencies
        run: |
          mkdir -p .artifacts
          if [ ! -f .artifacts/jmx_prometheus_javaagent.jar ]; then
            if [ -f /home/eddywiyatno/git/tomcat/.artifacts/jmx_prometheus_javaagent.jar ]; then
              cp /home/eddywiyatno/git/tomcat/.artifacts/jmx_prometheus_javaagent.jar .artifacts/
            else
              curl -sL -o .artifacts/jmx_prometheus_javaagent.jar https://repo1.maven.org/maven2/io/prometheus/jmx/jmx_prometheus_javaagent/1.6.0/jmx_prometheus_javaagent-1.6.0.jar
            fi
          fi

      - name: Build Hardened Container Image
        run: |
          echo "Membangun container image: ${{ steps.meta.outputs.image }}"
          podman build \
            --build-arg PROJECT=tomcat \
            --build-arg VERSION=9.0 \
            -t "${{ steps.meta.outputs.image }}" \
            -f Containerfile .

      - name: "Quality Gate 1: CIS Hardening Audit"
        run: |
          echo "Menjalankan audit kepatuhan CIS Benchmark (9 rules) via tcctl..."
          tcctl hardening audit --conf conf/

      - name: "Quality Gate 2: Vulnerability Assessment Scan"
        run: |
          echo "Memindai celah keamanan High/Critical menggunakan Trivy via tcctl..."
          tcctl va scan \
            -image "${{ steps.meta.outputs.image }}" \
            -severity HIGH,CRITICAL \
            -report-only

      - name: Push Container Image to Internal Gitea Registry
        run: |
          echo "Push citra yang telah diaudit ke Gitea OCI Registry..."
          podman login --tls-verify=false -u gitadm -p "${{ secrets.GITOPS_PUSH_TOKEN }}" localhost:3000
          podman push --tls-verify=false "${{ steps.meta.outputs.image }}"

      - name: "Stage 5: Automated GitOps Promotion"
        run: |
          echo "Mempromosikan tag baru ${{ steps.meta.outputs.tag }} ke tomcat-gitops..."
          git config --global user.name "Gitea CI Bot"
          git config --global user.email "ci-bot@localhost"

          git clone http://gitadm:${{ secrets.GITOPS_PUSH_TOKEN }}@localhost:3000/gitadm/tomcat-gitops.git gitops-workdir
          cd gitops-workdir

          # Perbarui tag image di dalam tomcat-spec.yaml
          sed -i -E 's/(tag: *")[^"]+(")/\1${{ steps.meta.outputs.tag }}\2/' tomcat-spec.yaml
          
          git diff tomcat-spec.yaml
          git commit -am "chore(deploy): promote payment-service to ${{ steps.meta.outputs.tag }} [skip ci]"
          git push origin main
```

Lakukan commit dan push file workflow ini ke repositori `tomcat`.

---

### Tahap 6: Verifikasi End-to-End Siklus Tertutup (*Closed-Loop*)

Setelah konfigurasi selesai, mari kita uji alur kerjanya dari ujung ke ujung:

1. Buat commit perubahan kecil di repositori `tomcat` (misalnya perbaikan deskripsi konfigurasi) dan push ke branch `lab`:
   ```bash
   git commit -am "fix: optimize connector thread pool parameters"
   git push origin lab
   ```
2. **Pantau Eksekusi Pipeline CI:**  
   Buka Gitea Web UI pada menu **Actions** di repo `tomcat`. Pipeline akan:
   - Mengompilasi citra baru dengan tag turunan commit Git (misal `9.0-6fa9ce9`).
   - Menjalankan **CIS Hardening Audit** (skor kepatuhan 100%).
   - Menjalankan **Trivy Vulnerability Scan** (0 celah High/Critical).
   - Melakukan push image ke internal OCI Registry.
   - Meng-clone `tomcat-gitops`, mengupdate baris `tag:` di `tomcat-spec.yaml`, dan melakukan push commit promosi secara otomatis.
3. **Observasi di Target Windows Server:**  
   Dalam kurun waktu 5 menit (atau saat Anda mengeksekusi `tcctl.exe gitops sync` manual), reconciler Windows Server akan:
   - Mendeteksi commit promosi baru di `tomcat-gitops`.
   - Mengunduh image `tomcat:9.0-6fa9ce9`.
   - Meluncurkan `payment-service-staging` pada port 9080.
   - Menguji *health probe* HTTP 200 OK.
   - Mematikan kontainer lama pada port 8080 dan mempromosikan kontainer baru menjadi `payment-service` aktif tanpa ada jeda kegagalan request.

---

## 💼 Skenario Operasional Sehari-hari

Berikut panduan menangani situasi operasional riil yang umum dihadapi tim SRE:

### Skenario A: Simulasi Kontainer Terhenti & Pemulihan Mandiri (*Self-Healing*)

Untuk menguji apakah sistem benar-benar dapat memulihkan diri jika terjadi kegagalan sistem atau kesalahan manusia:

1. Buka PowerShell di Windows Server dan matikan kontainer produksi secara paksa:
   ```powershell
   docker stop payment-service
   ```
2. Jalankan rekonsiliasi manual atau tunggu jadwal Scheduled Task berjalan:
   ```powershell
   tcctl.exe gitops sync --work-dir 'C:/Program Files/tcctl/gitops'
   ```
3. **Hasil yang Muncul:**
   ```text
   ⚠ Drift or Update Detected: Container is not running (stopped or missing)
   ✔ Re-provisioning container to match declarative state...
   ✔ Container payment-service is healthy (HTTP 200 OK)
   ✔ Reconcile completed successfully. Status: SYNCED
   ```
   Kontainer otomatis dihidupkan kembali dan diselaraskan tanpa perlu login interaktif dari tim on-call.

---

### Skenario B: Rollback Versi Instan Melalui Git

Jika versi aplikasi terbaru yang dirilis ternyata memicu kendala fungsional pada database atau logika bisnis:

1. Operator atau SRE **tidak perlu login ke Windows Server**.
2. Buka repositori **`tomcat-gitops`**, edit berkas [`tomcat-spec.yaml`](#spesifikasi-manifes-tomcat-specyaml), dan kembalikan nilai tag ke versi stabil sebelumnya:
   ```yaml
   spec:
     image:
       tag: "9.0-jdk21"  # Versi stabil sebelumnya
   ```
3. Lakukan commit dan push ke branch `main`:
   ```bash
   git commit -am "rollback(deploy): revert payment-service to 9.0-jdk21 due to bug"
   git push origin main
   ```
4. Reconciler Windows Server pada jadwal berikutnya akan langsung mendeteksi penurunan tag, menjalankan staging container versi stabil, dan melakukan rollback zero-downtime secara otomatis.

---

### Skenario C: Monitoring Status Reconciler & Ekspor JSON

Untuk mengintegrasikan pemantauan GitOps dengan dashboard monitoring eksternal (seperti Telegraf, Zabbix, atau Prometheus script):

```powershell
tcctl.exe gitops status `
  --dir 'C:/Program Files/tcctl/gitops' `
  --json-out 'C:/temp/gitops-status.json'
```

Perintah ini menghasilkan dua output sekaligus:
- **Tampilan Konsol Interaktif:** Menampilkan status sinkronisasi Git, SHA commit aktif, kondisi kontainer fisik, serta riwayat jadwal Windows Task Scheduler.
- **Berkas JSON Terstruktur (`gitops-status.json`):** Berisi payload JSON murni yang mencatat parameter `sync_status`, `drift_detected`, `container_healthy`, dan `last_reconcile_time` untuk dikonsumsi oleh agent monitoring.

---

## 🔧 Panduan Pemecahan Masalah (Troubleshooting)

| Masalah yang Sering Muncul | Kemungkinan Penyebab | Tindakan Solusi |
| :--- | :--- | :--- |
| **Error:** `server gave HTTP response to HTTPS client` saat push image di CI | Podman secara bawaan mewajibkan koneksi HTTPS, sedangkan Gitea Registry lokal berjalan pada HTTP port 3000. | Tambahkan flag `--tls-verify=false` pada perintah `podman login` dan `podman push` di file workflow CI. |
| **Job CI Berstatus `Waiting` Tanpa Batas Waktu** | Runner `act_runner` tidak aktif atau label di workflow (`ubuntu-latest:host`) tidak terdaftar pada runner. | Periksa service dengan `systemctl --user status act_runner.service`. Pastikan konfigurasi `config.yaml` runner memuat label `ubuntu-latest:host`. |
| **Push Promosi Gagal:** `Authentication failed` / `Permission denied` | Token `GITOPS_PUSH_TOKEN` salah, kadaluarsa, atau tidak memiliki hak akses tulis (*write*). | Buat Personal Access Token baru di Gitea dengan permission **Repository: Write**, kemudian perbarui Secret di repositori `tomcat`. |
| **Rollout Gagal di Tahap Staging:** `Healthcheck probe timed out` | Aplikasi di kontainer penampung (port 9080) tidak merespons HTTP 200/404 dalam batas `timeoutSeconds`. | Periksa log kontainer sementara: `docker logs payment-service-staging`. Periksa apakah terjadi error alokasi memori Java (*OutOfMemoryError*) atau database timeout. |
| **Scheduled Task Windows Tidak Berjalan Otomatis** | Windows Task Scheduler dimatikan atau akun pengguna tidak memiliki hak untuk menjalankan tugas terjadwal. | Buka Task Scheduler (`taskschd.msc`), pastikan task `tcctl-gitops-reconciler` berstatus **Ready** dan dikonfigurasi untuk berjalan dengan hak istimewa tertinggi (*Run with highest privileges*). |

---

## 📚 Referensi Terkait

- [Katalog Paket & Download Biner Operator tcctl (Windows & Linux)]({{< relref "packages/tcctl" >}})
- [Panduan Praktis: Deploy Kontainer Apache Tomcat Hardened di Windows Server Menggunakan tcctl]({{< relref "how-to/deploy-tomcat-container-windows-server-tcctl" >}})
- [Panduan Praktis: Build Image Container Apache Tomcat + Prometheus JMX Exporter di Windows NanoServer]({{< relref "how-to/build-tomcat-jmx-nanoserver-image" >}})
- [Panduan Praktis: Instalasi Docker Engine Community Edition (CE) v27+ di Windows Server]({{< relref "how-to/install-docker-engine-windows-containers" >}})
- [Tomcat Monitoring & Autonomous Diagnostic Platform]({{< relref "projects/tomcat-monitoring" >}})
- [Spesifikasi Standar CNCF OpenGitOps (OpenGitOps.dev)](https://opengitops.dev/)
