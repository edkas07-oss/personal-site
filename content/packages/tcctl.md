+++
title = "tcctl — Universal Operator CLI for Apache Tomcat Enterprise"
date = "2026-09-25T14:40:00+07:00"
draft = false
summary = "Kakas operator statis tunggal untuk tata kelola siklus hidup, hardening CIS Benchmark, penilaian kerentanan (VA), orkestrasi kontainer dengan host bind-mount (conf:ro), manajemen sertifikat TLS (PKCS#12 & PEM), dan rekonsiliasi GitOps otonom."
author = "Eddy Wiyatno"
categories = ["Packages", "CLI", "Middleware"]
tags = ["tcctl", "tomcat", "windows-containers", "linux", "golang", "cli", "gitops"]
toc = true
showSummary = true
+++

{{< lead >}}
**Universal Cross-Platform Operator CLI for Apache Tomcat Enterprise**

Biner rilis resmi untuk kakas operator Apache Tomcat Enterprise. Mendukung Windows Server (Docker Engine) dan Linux (Podman rootless) dengan zero runtime dependency.
{{< /lead >}}

---

## 📌 Ikhtisar Paket

`tcctl` (*Tomcat Control CLI*) adalah kakas operator statis tunggal untuk tata kelola siklus hidup, hardening keamanan CIS Benchmark, penilaian kerentanan (VA), orkestrasi kontainer dengan host bind-mount (`conf:ro`), manajemen sertifikat TLS (PKCS#12 & PEM), dan rekonsiliasi GitOps otonom.

* **Versi Rilis:** `v1.0.0` (Latest Stable)
* **Kompiler:** Go 1.23+ (`CGO_ENABLED=0`, statically linked)
* **Repositori Sumber:** [github.com/edkas07-oss/tcctl](https://github.com/edkas07-oss/tcctl)
* **Lisensi:** [Apache License 2.0](https://github.com/edkas07-oss/tcctl/blob/main/LICENSE)

---

## 📥 Unduh Biner Versi Terbaru

| Platform & Arsitektur | Format File | Ukuran | Tautan Unduhan Resmi |
| :--- | :--- | :--- | :--- |
| **Windows Server (x86_64 / amd64)** | Windows PE Executable (`.exe`) | ~8.0 MB | [⬇️ Unduh `tcctl.exe` (Latest)](https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl.exe) |
| **Enterprise Linux (x86_64 / amd64)** | Linux ELF 64-bit Static Binary | ~7.7 MB | [⬇️ Unduh `tcctl` (Latest)](https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl) |

---

## ⚡ Instalasi Cepat (One-Liner Commands)

### 🪟 Windows Server (PowerShell as Administrator)
Jalankan di PowerShell untuk mengunduh biner langsung ke folder standar `C:\Program Files\tcctl\` dan menambahkannya ke PATH:

```powershell
# 1. Siapkan direktori instalasi standar
New-Item -ItemType Directory -Force -Path "C:\Program Files\tcctl"

# 2. Unduh biner versi terbaru dari GitHub Releases
Invoke-WebRequest -Uri "https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl.exe" `
                  -OutFile "C:\Program Files\tcctl\tcctl.exe"

# 3. Tambahkan ke Machine PATH (permanen)
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "Machine") + ";C:\Program Files\tcctl", "Machine")
$env:Path += ";C:\Program Files\tcctl"

# 4. Verifikasi instalasi
tcctl version
```

### 🐧 Enterprise Linux (Bash / Zsh as Root)
Jalankan di terminal Linux untuk mengunduh biner ke direktori sistem `/usr/local/bin/`:

```bash
# 1. Unduh biner rilis terbaru
sudo curl -fsSL "https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl" -o /usr/local/bin/tcctl

# 2. Berikan izin eksekusi
sudo chmod +x /usr/local/bin/tcctl

# 3. Verifikasi instalasi
tcctl version
```

---

## 🛡️ Verifikasi Integritas Checksum (SHA-256)

Untuk memastikan biner yang diunduh otentik dan bebas dari modifikasi pihak ketiga, verifikasi nilai hash SHA-256 setelah pengunduhan:

### Di Windows PowerShell:
```powershell
Get-FileHash -Path "C:\Program Files\tcctl\tcctl.exe" -Algorithm SHA256
```

### Di Linux:
```bash
sha256sum /usr/local/bin/tcctl
```

---

## 📚 Dokumentasi & Panduan Terkait

* [Panduan Praktis: Deploy Kontainer Apache Tomcat Hardened di Windows Server]({{< ref "how-to/deploy-tomcat-container-windows-server-tcctl" >}})
* [Panduan Instalasi & Build Lengkap (INSTALL.md)](https://github.com/edkas07-oss/tcctl/blob/main/INSTALL.md)
* [Arsitektur Platform: Tomcat Monitoring & Autonomous Diagnostic]({{< ref "projects/tomcat-monitoring" >}})
