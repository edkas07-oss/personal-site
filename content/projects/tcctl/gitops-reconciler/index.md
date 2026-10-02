+++
title = "tcctl gitops — Pure Pull-Based Zero-Git Declarative Reconciler"
date = "2026-09-25T23:50:00+07:00"
draft = false
summary = "Bedah arsitektur modul gitops tcctl: mesin rekonsiliasi state deklaratif pull-based murni langsung via REST API Gitea (Zero-Git dependency) dengan deteksi drift atomik, locking mechanism, dan otomatisasi task background OS native."
author = "Eddy Wiyatno"
categories = ["GitOps", "Platform Engineering", "Automation"]
tags = ["tcctl", "gitops", "gitea", "declarative", "reconciliation", "windows-server", "linux", "zero-git"]
series = ["Apache Tomcat Enterprise Platform"]
toc = true
showSummary = true
+++

{{< lead >}}
**Pure Pull-Based Declarative Reconciler with Zero External Git Tooling Dependency**

Modul `tcctl gitops` mewujudkan arsitektur GitOps murni berbasis *pull model* untuk server Windows dan Linux di lingkungan enterprise terisolasi (*air-gapped*). Beroperasi tanpa memerlukan biner Git terpasang di host, rekonsiliator ini berkomunikasi langsung dengan REST API Gitea untuk memvalidasi *desired state*, mendeteksi konfigurasi *drift*, dan memicu orkestrasi *staging rollout* secara otonom.
{{< /lead >}}

---

## 💡 Motivasi Rekayasa: Kerapuhan Push-Based CI & Git Dependencies di Host

Pola pengiriman konfigurasi konvensional berbasis *Push Model*—seperti script Ansible atau pipeline Jenkins yang melakukan SSH/WinRM langsung ke host target—menghadapi kendala operasional yang akut di skala enterprise:

1. **Eskalasi Port Masuk & Risiko Keamanan SSH/WinRM:**  
   Membuka port manajemen masuk (*ingress*) pada host produksi mengharuskan penambahan *firewall exceptions* dan meningkatkan risiko kompromi kredensial jika runner CI diserang.
2. **Ketiadaan Git CLI pada Windows Server Minimal:**  
   Banyak server Windows produksi beroperasi tanpa *MinGit* atau *Git for Windows*. Memasang biner Git penuh di ratusan server Windows menimbulkan overhead pembaruan keamanan, risiko kompatibilitas PATH, dan peningkatan *attack surface*.
3. **Konfigurasi *Drift* Tidak Terdeteksi:**  
   Jika seorang operator mengubah konfigurasi XML secara manual di server lokal, pipeline *push* tradisional tidak akan menyadarinya sampai pipeline berikutnya dijalankan secara sengaja.
4. **Ketergantungan Agen Eksternal Berat (Flux / ArgoCD):**  
   Solusi GitOps populer seperti ArgoCD atau Flux dirancang eksklusif untuk kluster Kubernetes dan tidak dapat dijalankan secara langsung pada server *bare-metal* atau VM Windows Server mandiri.

---

### 📊 Matriks Perbandingan: Push CI vs Kubernetes GitOps vs `tcctl gitops`

| Aspek Operasional | Push CI (Ansible / Jenkins SSH) | Kubernetes GitOps (ArgoCD / Flux) | **`tcctl gitops` (Go Engine)** |
| :--- | :--- | :--- | :--- |
| **Model Pengiriman** | Push (Inbound SSH/WinRM) | Pull (Kubernetes Controller) | **Pure Pull (Outbound HTTPS only)** |
| **Kebutuhan Git CLI Host** | Wajib atau via SSH wrapper | Git CLI tersemat di container | **Nol (`Zero-Git` via REST API)** |
| **Kebutuhan Kubernetes** | Tidak | Wajib (K8s Cluster) | **Mandiri (Bare-metal / VM / Docker)** |
| **Target OS Native** | Linux prioritas; Windows rapuh | Linux container only | **Windows Server & Linux seragam** |
| **Footprint Memori** | N/A (ephemeral SSH) | Ratusan Megabyte (Java/Go K8s pods) | **< 15 MB RAM (Go Static Binary)** |
| **Manajemen State Lokal** | Tidak ada state ledger | Kubernetes Custom Resource (CRD) | **Atomik JSON Ledger (`.gitops-state.json`)** |
| **Mekanisme Scheduling** | Cron terpisah / Webhook | Kubernetes reconciler loop | **Native Task Scheduler & systemd** |

---

## 🏛️ Arsitektur Rekonsiliasi & State Machine

`tcctl gitops` berjalan secara periodik melalui penugasan background native sistem operasi. Setiap iterasi rekonsiliasi membandingkan *desired state* di repositori Git dengan *applied state* di mesin host:

{{< mermaid >}}
flowchart TD
    %% Styling Classes
    classDef git fill:#7c2d12,stroke:#f97316,stroke-width:1.5px,color:#ffffff;
    classDef engine fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#38bdf8;
    classDef action fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#ffffff;
    classDef ledger fill:#312e81,stroke:#a78bfa,stroke-width:1.5px,color:#ffffff;

    REPO[("Gitea Git Repository<br/>(Single Source of Truth)")]:::git

    subgraph HOST ["Host Server (Windows / Linux)"]
        SCHED["OS Scheduler (Task Scheduler / systemd)"] --> TRIGGER["tcctl gitops sync --spec tcctl-gitops.yaml"]:::engine
        
        TRIGGER --> FETCH["1. Query Gitea REST API<br/>GET /repos/{owner}/{repo}/commits/{branch}<br/>GET /repos/{owner}/{repo}/contents/{path}"]:::engine
        
        FETCH --> COMPARE{"2. SHA & Drift Evaluation<br/>(Git Commit vs Local State Ledger)"}
        
        COMPARE -- "State Sama (No Drift)" --> IDLE["3. Rekonsiliasi Selesai (Exit 0)"]:::action
        
        COMPARE -- "Drift Ditemukan (New Commit)" --> STAGE["4. Tarik Konten Deklaratif & Tulis Atomik:<br/>• Update conf/*.xml (:ro)<br/>• Update bin/setenv tuning"]:::engine
        
        STAGE --> AUDIT{"5. Jalankan tcctl hardening audit"}
        
        AUDIT -- "Audit Lolos" --> ROLLOUT["6. Trigger tcctl deploy (Staging Port 9080)"]:::action
        AUDIT -- "Audit Gagal" --> HALT["Blokir Rollout & Kirim Alert Drift"]
        
        ROLLOUT --> PERSIST["7. Catat State Sukses ke .gitops-state.json"]:::ledger
    end

    TRIGGER -. "HTTPS REST API (Zero-Git)" .-> REPO
{{< /mermaid >}}

---

## 📄 Spesifikasi Deklaratif: `tcctl-gitops.yaml`

Tata kelola instance didefinisikan secara deklaratif di repositori Git melalui berkas spesifikasi berformat YAML:

```yaml
version: "1.0"
metadata:
  instance: "payment-service"
  environment: "production"
  platform: "windows-server-2022"

git:
  repo_url: "https://gitea.local/middleware/tomcat-fleet.git"
  branch: "main"
  token_env: "GITEA_TOKEN"
  sync_interval_seconds: 300

spec:
  image: "myregistry.local/tomcat-nanoserver:9.0.95"
  port: 8080
  staging_port: 9080
  resources:
    memory: "4g"
    cpu: 2
  health_check:
    path: "/payment/health"
    timeout_seconds: 45
  hardening:
    cis_audit: true
    enforce_user: "ContainerUser"
```

---

## 🔄 Otomasi Background Scheduler Lintas OS

Untuk memastikan rekonsiliasi berlangsung tanpa intervensi manual, `tcctl gitops` menyertakan generator penugasan latar belakang bawaan:

### 1. Windows Server (Task Scheduler Integration)
```powershell
# Mendaftarkan task scheduler berkala setiap 5 menit di Windows Server
tcctl gitops register-task \
  --spec C:\tomcats\payment-service\tcctl-gitops.yaml \
  --interval-minutes 5
```

### 2. Linux (systemd User Service)
```bash
# Menghasilkan dan mengaktifkan systemd user unit & timer
tcctl gitops systemd install --spec /opt/tomcats/tcctl-gitops.yaml
systemctl --user enable --now tcctl-gitops.timer
```

---

## 💻 Panduan Eksekusi CLI

### 1. Rekonsiliasi Sekali Jalan (*One-Shot Sync*)
```bash
# Mengeksekusi siklus rekonsiliasi langsung
tcctl gitops sync --spec C:\tomcats\payment-service\tcctl-gitops.yaml
```

### 2. Memeriksa Status State Ledger
```bash
# Melihat riwayat sinkronisasi dan commit hash aktif saat ini
tcctl gitops status --spec C:\tomcats\payment-service\tcctl-gitops.yaml
```

### 3. Simulasi Rekonsiliasi (*Dry-Run*)
```bash
# Memeriksa ada tidaknya drift antara Git dan host lokal tanpa mengubah konfigurasi
tcctl gitops sync --spec tcctl-gitops.yaml --dry-run
```

---

## 🔗 Keterkaitan dengan Modul Lain

* [**tcctl deploy**]({{< relref "staging-rollout" >}}): Menjalankan alur *temporary staging rollout* dan promosi port saat rekonsiliator mendeteksi pembaharuan image atau parameter memori.
* [**tcctl hardening & va**]({{< relref "hardening-audit" >}}): Menjamin seluruh berkas konfigurasi baru yang diunduh dari repositori Git diverifikasi secara ketat sebelum diterapkan ke runtime container.
