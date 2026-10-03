+++
title = "Packages & Tools"
description = "Distribusi resmi berkas biner mandiri (Community Edition) untuk tooling platform engineering, runtime governance, dan observabilitas."
cascade = { showDate = false, showAuthor = false }
+++

> [!NOTE]
> **Distribusi Resmi Community Edition:**  
> Seluruh berkas biner yang tersedia di halaman ini didistribusikan secara cuma-cuma sebagai **Community Edition (Freeware)** untuk keperluan pengujian mandiri (*developer workstation*), standardisasi lab internal, dan riset platform engineering independen tanpa unsur komersial.

---

### 📦 Berkas Distribusi & Verifikasi Integritas

Setiap rilis biner dan arsip distribusi telah disertai nilai *hash* kriptografis SHA256 untuk memastikan keaslian dan integritas berkas saat diunduh:

* **Linux (Verifikasi Checksum):**
  ```bash
  sha256sum --check sha256sums.txt
  ```
* **Windows Server (PowerShell):**
  ```powershell
  Get-FileHash -Algorithm SHA256 tcctl-v1.0.0-windows-amd64.zip
  ```

---

### 🛡️ Disclaimer Independensi Riset

Seluruh *operator tooling*, skrip otomasi, dan arsitektur yang dibagikan pada portal ini diriset, dibangun, dan diuji secara independen di laboratorium rekayasa personal. Biner disediakan secara "as-is" untuk mempermudah standarisasi operasional sesama engineer dan praktisi SRE.
