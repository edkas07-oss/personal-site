+++
title = "Panduan Praktis: Instalasi Docker Engine Community Edition (CE) v27+ di Windows Server (Mode Windows Containers)"
date = "2026-09-25T15:30:00+07:00"
draft = false
summary = "Panduan operasional tingkat produksi untuk menginstal dan mengonfigurasi Docker Engine Community Edition (CE) v27+ mode Windows Containers native secara headless sebagai Windows Service. Lengkap dengan konfigurasi daemon.json enterprise, tuning log rotation, manajemen HNS network, hingga smoke test citra NanoServer."
author = "Eddy Wiyatno"
categories = ["How-To", "Container", "Infrastructure"]
tags = ["docker", "docker-ce", "windows-containers", "windows-server", "powershell", "devops", "sre", "hyper-v", "sysadmin"]
series = ["Windows Server Container Platform"]
toc = true
showSummary = true
+++

{{< lead >}}
**Membangun Fondasi Container Engine Native Tanpa GUI Overhead di Lingkungan Windows Server Enterprise**

Pada infrastruktur Windows Server berskala produksi, menjalankan Docker Desktop bukanlah pilihan yang tepat karena beban antarmuka grafis (GUI), ketergantungan akun interaktif, dan lisensi. Pendekatan standar industri adalah memasang **Docker Engine Community Edition (CE) v27+ mandiri (*headless daemon*)** yang didaftarkan langsung sebagai *Windows Service* native untuk mengorkestrasi beban kerja **Windows Containers**.
{{< /lead >}}

---

## 📌 Mengapa Docker Engine CE Mandiri (Bukan Docker Desktop)?

Bagi insinyur sistem dan operator infrastruktur, pemisahan antara kebutuhan workstation dan server produksi sangat tegas:

1. **Operasional Headless & Unattended:** Server produksi berjalan tanpa sesi login aktif (*unattended*). Docker Engine harus beroperasi murni sebagai latar belakang (*Windows Service*) yang otomatis menyala saat host *booting*.
2. **Zero GUI Overhead & Efisiensi Resource:** Docker Desktop membawa dependensi Electron, WSL2 backend, dan dashboard visual yang memboroskan memori server. Biner statis Docker CE hanya membutuhkan memori saat beban kerja kontainer berjalan.
3. **Native Named Pipe API:** Komunikasi CLI dan modul orkestrator (seperti [`tcctl`]({{< ref "packages/tcctl" >}})) terhubung langsung ke Windows Named Pipe lokal (`\\.\pipe\docker_engine`) dengan performa socket IPC deterministik.
4. **Catatan Deprecasi `DockerMsftProvider`:** Modul lama PowerShell `DockerMsftProvider` yang sebelumnya disediakan Microsoft untuk Windows Server kini telah pensiun (*deprecated*). Instalasi biner statis resmi dari upstream Docker merupakan metode kanonikal dan paling stabil untuk mendapatkan versi modern (v27+).

---

## 🏛️ Arsitektur & Alur Instalasi

Diagram berikut mengilustrasikan urutan operasional pemasangan Docker Engine CE v27+ hingga siap menerima beban kerja Windows Containers:

{{< mermaid >}}
flowchart TD
    A["Operator: PowerShell Admin"] --> B["Langkah 1: Aktivasi Fitur Windows (Containers & Hyper-V)"]
    B --> C{"Perlu Reboot Host?"}
    C -->|Ya| D["Restart-Computer & Login Kembali"]
    C -->|Tidak / Sudah Aktif| E["Langkah 2: Unduh Biner Statis Docker CE v27+ (ZIP)"]
    D --> E
    E --> F["Langkah 3: Ekstraksi ke C:/Program Files/Docker & Daftarkan PATH"]
    F --> G["Langkah 4: Konfigurasi Hardened daemon.json (Log Rotation & Storage)"]
    G --> H["Langkah 5: Daftarkan & Jalankan Windows Service (dockerd --register-service)"]
    H --> I["Langkah 6: Verifikasi Runtime & Smoke Test NanoServer (Process/Hyper-V)"]
    I --> J["Selesai: Engine Siap untuk Orkestrasi Beban Kerja (tcctl, CI/CD, dll.)"]
{{< /mermaid >}}

---

## 🛠️ Prasyarat Lingkungan

Pastikan server Anda memenuhi persyaratan minimum berikut sebelum menjalankan prosedur instalasi:

| Komponen | Persyaratan Minimum | Rekomendasi Produksi |
| :--- | :--- | :--- |
| **Sistem Operasi** | Windows Server 2019 (Build 17763+) | Windows Server 2022 / 2025 Datacenter (LTSC) |
| **Arsitektur CPU** | 64-bit (x86_64 / amd64) | Mendukung Virtualisasi Hardware (VT-x / AMD-V) |
| **Memori (RAM)** | Minimal 4 GB | 8 GB+ (Tergantung kapasitas container Java/Tomcat) |
| **Penyimpanan Disk** | 20 GB ruang kosong di Drive `C:` | Partisi SSD terpisah untuk Container Data Root |
| **Privilese Shell** | Sesi PowerShell dengan hak **Run as Administrator** | Akun Administrator Lokal atau Domain Admin |

---

## 🚀 Prosedur Langkah Demi Langkah

Seluruh perintah di bawah ini dijalankan di dalam konsol **PowerShell sebagai Administrator**.

---

### Langkah 1: Mengaktifkan Fitur Windows (`Containers` & `Hyper-V`)

Windows Server membutuhkan subsystem kernel isolation dan driver Host Network Service (HNS) yang disediakan oleh fitur `Containers`. Jika Anda berencana menggunakan isolasi tingkat perangkat keras (*Hyper-V Isolation*), fitur `Hyper-V` juga harus diaktifkan.

Jalankan perintah berikut:

```powershell
# 1. Periksa status fitur saat ini
Get-WindowsFeature -Name Containers, Hyper-V

# 2. Aktifkan fitur Containers dan modul Hyper-V Management
Install-WindowsFeature -Name Containers, Hyper-V -IncludeManagementTools

# 3. Periksa apakah sistem mewajibkan reboot
$rebootNeeded = (Get-WindowsFeature -Name Containers).Installed -eq $false
if ($rebootNeeded) {
    Write-Warning "Sistem memerlukan restart untuk menerapkan komponen kernel Containers."
    Restart-Computer -Force
} else {
    Write-Host "Fitur Containers sudah aktif. Melanjutkan instalasi..." -ForegroundColor Green
}
```

> [!NOTE]
> Jika Anda menjalankan Windows Server di dalam mesin virtual (VMware ESXi, Hyper-V, atau KVM), pastikan fitur **Nested Virtualization** telah diaktifkan pada level hypervisor jika ingin menggunakan mode `--isolation=hyperv`. Untuk mode `--isolation=process` (native container), nested virtualization tidak diwajibkan.

---

### Langkah 2: Mengunduh Biner Statis Docker Engine CE v27+

Biner resmi untuk arsitektur Windows x86_64 didistribusikan oleh Docker upstream melalui repositori statis `download.docker.com`. Kita akan mengunduh versi rilis stabil **v27.x.x**.

Jalankan skrip pengunduhan berikut:

```powershell
# 1. Tentukan direktori unduhan sementara
$tempDir = "$env:TEMP\docker-install"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

# 2. Tentukan target versi (Docker CE v27.1.2 atau rilis stabil v27 terbaru)
$dockerVersion = "27.1.2"
$downloadUrl   = "https://download.docker.com/win/static/stable/x86_64/docker-$dockerVersion.zip"
$zipFile       = "$tempDir\docker-$dockerVersion.zip"

Write-Host "Mengunduh Docker Engine CE v$dockerVersion dari upstream resmi..." -ForegroundColor Cyan
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile -UseBasicParsing

# 3. Validasi ukuran file yang berhasil diunduh (~50 MB - 60 MB)
$fileSize = (Get-Item $zipFile).Length / 1MB
Write-Host ("Arsip berhasil diunduh: {0:N2} MB" -f $fileSize) -ForegroundColor Green
```

---

### Langkah 3: Ekstraksi & Konfigurasi Lingkungan (`PATH`)

Arsip ZIP memuat dua berkas eksekusi utama: `docker.exe` (CLI client) dan `dockerd.exe` (daemon server). Kita tempatkan keduanya di direktori standar sistem `C:\Program Files\Docker\`.

```powershell
# 1. Hentikan service jika sebelumnya pernah ada instalasi lama
if (Get-Service -Name docker -ErrorAction SilentlyContinue) {
    Stop-Service -Name docker -Force
}

# 2. Siapkan folder instalasi tujuan
$installPath = "$env:ProgramFiles\Docker"
New-Item -ItemType Directory -Force -Path $installPath | Out-Null

# 3. Ekstrak arsip biner ke Program Files
Write-Host "Mengekstrak biner ke $installPath..." -ForegroundColor Cyan
Expand-Archive -Path $zipFile -DestinationPath $tempDir -Force
Copy-Item -Path "$tempDir\docker\*" -Destination $installPath -Recurse -Force

# 4. Bersihkan folder sementara
Remove-Item -Path $tempDir -Recurse -Force

# 5. Daftarkan folder ke System Machine PATH secara permanen
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($machinePath -notlike "*$installPath*") {
    Write-Host "Mendaftarkan $installPath ke System PATH..." -ForegroundColor Cyan
    [Environment]::SetEnvironmentVariable("Path", "$machinePath;$installPath", "Machine")
}
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

# 6. Verifikasi biner CLI dapat dipanggil
docker --version
```

---

### Langkah 4: Konfigurasi `daemon.json` untuk Lingkungan Produksi

Secara default, Docker di Windows tidak membatasi ukuran log kontainer. Pada lingkungan produksi, kontainer yang menghasilkan log banyak (seperti Tomcat atau Java apps) dapat menghabiskan ruang disk `C:` dalam hitungan hari.

Kita membuat berkas konfigurasi `C:\ProgramData\docker\config\daemon.json` dengan parameter *best-practice*:

```powershell
# 1. Buat hierarki folder konfigurasi Docker Engine
$configDir = "$env:ProgramData\docker\config"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

# 2. Definisikan konfigurasi enterprise
$daemonConfig = @{
    "data-root"     = "C:\ProgramData\docker"
    "hosts"         = @("npipe:////./pipe/docker_engine")
    "storage-opts"  = @("size=120GB")
    "log-driver"    = "json-file"
    "log-opts"      = @{
        "max-size"  = "50m"
        "max-file"  = "5"
    }
    "experimental"  = $false
}

# 3. Simpan ke daemon.json dengan format JSON yang rapi
$daemonJsonPath = "$configDir\daemon.json"
$daemonConfig | ConvertTo-Json -Depth 5 | Set-Content -Path $daemonJsonPath -Encoding Ascii

Write-Host "Konfigurasi daemon.json berhasil dibuat di $daemonJsonPath" -ForegroundColor Green
Get-Content $daemonJsonPath
```

#### Penjelasan Parameter Kritis:
* **`log-driver` & `log-opts`:** Membatasi ukuran satu berkas log maksimal `50 MB` dan mempertahankan paling banyak `5` rotasi berkas per kontainer. Hal ini mengeliminasi risiko insiden kehabisan disk (*Disk Exhaustion*).
* **`storage-opts: ["size=120GB"]`:** Menentukan batas kuota layer disk virtual (*scratch space*) untuk setiap kontainer Windows. Nilai default Windows Containers biasanya 20 GB, yang sering kali kurang untuk aplikasi enterprise besar.
* **`hosts: ["npipe:////./pipe/docker_engine"]`:** Mengamankan daemon agar hanya melayani permintaan lokal via Windows Named Pipe dengan kontrol ACL Administrator bawaan OS.

---

### Langkah 5: Mendaftarkan & Menjalankan Windows Service

Kini kita daftarkan `dockerd.exe` sebagai *Windows Service* resmi bernama `docker`, atur kebijakan *startup* menjadi **Automatic**, lalu jalankan layanannya:

```powershell
# 1. Daftarkan service ke Windows Service Control Manager
& "$installPath\dockerd.exe" --register-service

# 2. Konfigurasi Startup Type menjadi Otomatis
Set-Service -Name docker -StartupType Automatic

# 3. Mulai layanan Docker
Start-Service -Name docker

# 4. Verifikasi status berjalan
$svc = Get-Service -Name docker
if ($svc.Status -eq "Running") {
    Write-Host "✅ Layanan Docker Engine berhasil berjalan (Status: RUNNING)!" -ForegroundColor Green
} else {
    Write-Error "❌ Layanan Docker gagal berjalan. Periksa log Event Viewer (Application)!"
}
```

---

### Langkah 6: Verifikasi Runtime & Smoke Test Windows Containers

Lakukan verifikasi komprehensif untuk memastikan daemon merespons dengan benar dan mengenali mode **Windows Containers**:

#### 1. Uji Versi & Engine Platform
```powershell
docker version
```
*Output yang diharapkan:*
```text
Client:
 Version:           27.1.2
 API version:       1.47
 Go version:        go1.23.1
 OS/Arch:           windows/amd64

Server: Docker Engine - Community
 Engine:
  Version:          27.1.2
  API version:      1.47 (minimum version 1.24)
  Go version:       go1.23.1
  Git commit:       d2c20f7
  Built:            Wed Sep  4 18:20:00 2026
  OS/Arch:          windows/amd64
  Experimental:     false
```

#### 2. Uji Status Informasi Engine
```powershell
docker info --format 'OSType: {{.OSType}} | StorageDriver: {{.Driver}} | Isolation: {{.Isolation}}'
```
*Output harus menyatakan:* `OSType: windows | StorageDriver: windowsfilter`.

#### 3. Jalankan Smoke Test Native NanoServer
Tarik citra resmi Microsoft NanoServer yang sesuai dengan versi Windows Server Anda, lalu eksekusi uji cetak sederhana:

```powershell
# Contoh untuk Windows Server 2022 (LTSC):
docker run --rm mcr.microsoft.com/windows/nanoserver:ltsc2022 cmd.exe /c "echo Docker Engine CE v27+ Berhasil Terpasang di Windows Server!"
```

Jika teks konfirmasi berhasil tercetak ke terminal, lingkungan Windows Containers Anda telah berfungsi secara sempurna!

---

## 🛠️ Operasional Lanjutan & Troubleshooting

Berikut adalah ringkasan masalah umum yang sering dihadapi pada Windows Containers beserta solusi praktisnya:

### 1. Masalah Jaringan HNS Default NAT Hilang
Jika perintah `docker run` menghasilkan error seperti:
```text
Error response from daemon: could not find an available, non-overlapping IPv4 address pool
```
Artinya Host Network Service (HNS) belum mengalokasikan subnet NAT default. Solusinya:

```powershell
# Periksa daftar network Docker
docker network ls

# Jika network 'nat' tidak ada, buat secara manual:
docker network create -d nat --subnet 172.28.0.0/16 --gateway 172.28.0.1 nat
```

### 2. Version Mismatch: Kompatibilitas Versi Kernel Host & Kontainer
Windows Containers menerapkan isolasi kernel bersama (*Shared-Kernel Architecture*). Citra kontainer harus kompatibel dengan build sistem operasi host:

| Versi Windows Server Host | Build Host | Citra NanoServer/ServerCore yang Didukung (Process Isolation) |
| :--- | :--- | :--- |
| **Windows Server 2022** | `20348` | `ltsc2022` (Native / Process Isolation) |
| **Windows Server 2019** | `17763` | `1809` / `ltsc2019` (Native / Process Isolation) |
| **Windows Server 2025** | `26100` | `ltsc2025` (Native / Process Isolation) |

> [!WARNING]
> Menjalankan citra kontainer yang berbeda build dengan OS host (misal: citra `ltsc2019` di atas host Server 2022) mewajibkan penambahan flag `--isolation=hyperv`. Jika dijalankan dengan isolasi proses biasa, container akan gagal dimulai dengan pesan *The operating system of the container image is not compatible with the host operating system*.

### 3. Mengatur Hak Akses Named Pipe (Non-Administrator)
Secara default, hanya akun anggota grup **Administrators** yang memiliki hak akses membaca/menulis ke Named Pipe `\\.\pipe\docker_engine`. Jika Anda ingin mengizinkan pengguna non-admin tertentu mengakses Docker CLI tanpa elevasi UAC penuh:

```powershell
# Tambahkan entri ACL pada daemon.json
# Parameter: "group": "docker-users"
# Lalu buat local group tersebut di Windows:
New-LocalGroup -Name "docker-users" -Description "Pengguna berizin akses Docker CLI lokal"
Add-LocalGroupMember -Group "docker-users" -Member "NamaUserOperator"
```

---

## 📜 All-in-One Automation Script (`install-docker-ce.ps1`)

Untuk mempermudah instalasi otomatis pada banyak server atau via Ansible/PowerShell Remoting, salin seluruh blok skrip di bawah ini ke berkas `install-docker-ce.ps1`:

```powershell
<#
.SYNOPSIS
    Automated Headless Installer for Docker Engine Community Edition v27+ on Windows Server.
.DESCRIPTION
    Mengaktifkan fitur Containers, mengunduh biner upstream resmi, mengonfigurasi hardened daemon.json,
    dan mendaftarkan Windows Service secara otonom.
#>

[CmdletBinding()]
param(
    [string]$Version = "27.1.2",
    [string]$DataRoot = "C:\ProgramData\docker"
)

$ErrorActionPreference = "Stop"
Write-Host "=== Memulai Instalasi Otomatis Docker Engine CE v$Version ===" -ForegroundColor Cyan

# 1. Validasi & Aktivasi Fitur Windows
$feat = Get-WindowsFeature -Name Containers
if (-not $feat.Installed) {
    Write-Host "[1/5] Mengaktifkan Windows Feature Containers..." -ForegroundColor Yellow
    Install-WindowsFeature -Name Containers -IncludeManagementTools | Out-Null
    Write-Warning "Fitur baru saja diaktifkan. Harap restart server dan jalankan kembali skrip ini!"
    exit 0
}

# 2. Persiapan Folder & Download
$installPath = "$env:ProgramFiles\Docker"
$tempDir     = "$env:TEMP\docker-setup"
New-Item -ItemType Directory -Force -Path $installPath, $tempDir | Out-Null

$zipUrl  = "https://download.docker.com/win/static/stable/x86_64/docker-$Version.zip"
$zipPath = "$tempDir\docker.zip"

Write-Host "[2/5] Mengunduh biner dari $zipUrl..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

# 3. Ekstraksi Biner
Write-Host "[3/5] Mengekstrak biner ke $installPath..." -ForegroundColor Yellow
if (Get-Service -Name docker -ErrorAction SilentlyContinue) { Stop-Service docker -Force }
Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
Copy-Item -Path "$tempDir\docker\*" -Destination $installPath -Recurse -Force
Remove-Item -Path $tempDir -Recurse -Force

# Daftarkan PATH
$mPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($mPath -notlike "*$installPath*") {
    [Environment]::SetEnvironmentVariable("Path", "$mPath;$installPath", "Machine")
}
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

# 4. Injeksi daemon.json
Write-Host "[4/5] Mengonfigurasi daemon.json enterprise..." -ForegroundColor Yellow
$cfgDir = "$env:ProgramData\docker\config"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
@{
    "data-root"    = $DataRoot
    "hosts"        = @("npipe:////./pipe/docker_engine")
    "storage-opts" = @("size=120GB")
    "log-driver"   = "json-file"
    "log-opts"     = @{ "max-size" = "50m"; "max-file" = "5" }
} | ConvertTo-Json -Depth 5 | Set-Content -Path "$cfgDir\daemon.json" -Encoding Ascii

# 5. Registrasi & Start Service
Write-Host "[5/5] Mendaftarkan & Menjalankan Docker Service..." -ForegroundColor Yellow
& "$installPath\dockerd.exe" --register-service
Set-Service -Name docker -StartupType Automatic
Start-Service -Name docker

Start-Sleep -Seconds 3
docker version
Write-Host "=== Instalasi Docker Engine CE v$Version Berhasil Selesai! ===" -ForegroundColor Green
```

---

## 📚 Langkah Selanjutnya & Panduan Terkait

Setelah Docker Engine CE v27+ aktif di Windows Server Anda, lanjutkan ke implementasi beban kerja produksi:

* [Panduan Praktis: Deploy Kontainer Apache Tomcat Hardened di Windows Server Menggunakan tcctl]({{< ref "how-to/deploy-tomcat-container-windows-server-tcctl" >}})
* [Unduh Biner Resmi tcctl di Menu Packages]({{< ref "packages/tcctl" >}})
* [Arsitektur Blueprint: Tomcat Monitoring & Autonomous Diagnostic Platform]({{< ref "projects/tomcat-monitoring" >}})
