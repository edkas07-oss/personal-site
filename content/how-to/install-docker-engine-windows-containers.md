+++
title = "Panduan Praktis: Instalasi Docker Engine Community Edition (CE) v27+ di Windows Server (Mode Windows Containers)"
date = "2026-09-25T15:30:00+07:00"
draft = false
summary = "Panduan operasional terverifikasi untuk menginstal dan mengonfigurasi Docker Engine Community Edition (CE) v27+ native Windows Containers secara headless sebagai Windows Service. Mengulas aktivasi filter driver kernel windowsfilter, penanganan offline archive di lingkungan lab terisolasi, pemisahan storage data-root D:, named pipe readiness polling, hingga smoke test citra NanoServer."
author = "Eddy Wiyatno"
categories = ["How-To", "Container", "Infrastructure"]
tags = ["docker", "docker-ce", "windows-containers", "windows-server", "powershell", "devops", "sre", "hyper-v", "sysadmin"]
series = ["Windows Server Container Platform"]
toc = true
showSummary = true
+++

{{< lead >}}
**Penyediaan Headless Docker Engine CE v27+ Skala Enterprise untuk Beban Kerja Windows Containers Native**

Pada infrastruktur Windows Server produksi, menjalankan Docker Desktop bukanlah pilihan yang tepat karena beban antarmuka grafis (GUI), ketergantungan sesi interaktif, dan lisensi. Pendekatan standar industri adalah memasang **Docker Engine Community Edition (CE) v27+ mandiri (*headless daemon*)** yang didaftarkan langsung sebagai *Windows Service* native untuk mengorkestrasi beban kerja **Windows Containers**.
{{< /lead >}}

---

## 📌 Mengapa Docker Engine CE Mandiri (Bukan Docker Desktop)?

Bagi insinyur sistem dan administrator infrastruktur Windows, terdapat perbedaan fundamental antara kebutuhan workstation dan server produksi:

1. **Operasional Headless & Unattended:** Server produksi berjalan tanpa login pengguna interaktif. Docker Engine harus beroperasi murni sebagai latar belakang (*Windows Service*) yang otomatis aktif saat host *booting*.
2. **Zero GUI Overhead & Efisiensi Resource:** Docker Desktop membawa dependensi Electron, WSL2 backend, dan dashboard visual yang memboroskan memori server. Biner statis Docker CE hanya membutuhkan memori saat beban kerja kontainer berjalan.
3. **Native Named Pipe API:** Komunikasi CLI terhubung langsung ke Windows Named Pipe lokal (`\\.\pipe\docker_engine`) dengan performa socket IPC deterministik dan kontrol akses bawaan Windows ACL.
4. **Catatan Deprecasi `DockerMsftProvider`:** Modul lama PowerShell `DockerMsftProvider` yang sebelumnya disediakan Microsoft untuk Windows Server kini telah pensiun (*deprecated*). Instalasi biner statis resmi dari upstream Docker merupakan metode kanonikal dan paling stabil untuk mendapatkan versi modern (v27+).

---

## 🏛️ Esensi Alur Kerja Instalasi Produksi

Berdasarkan praktik operasional server produksi di lingkungan terisolasi (*restricted network/air-gap*), alur kerja instalasi Docker Engine Windows Containers terbagi menjadi tahapan deterministik berikut:

{{< mermaid >}}
flowchart TD
    A["Operator: PowerShell Elevated (Run as Administrator)"] --> B["Tahap 1: Validasi Hak Akses & Fitur Containers"]
    B --> C{"Fitur Containers Baru Dipasang?"}
    C -->|RestartNeeded = Yes| D["Host Wajib Reboot (windowsfilter driver)"]
    D -->|Setelah Reboot| A
    C -->|Sudah Aktif| E["Tahap 2: Resolusi Biner Docker CE v27+"]
    E --> F{"Arsip Lokal C:/temp/docker.zip Tersedia?"}
    F -->|Ya| G["Gunakan Arsip Offline (Air-Gap)"]
    F -->|Tidak| H["Fallback: Unduh dari download.docker.com"]
    G --> I["Tahap 3: Ekstraksi ke C:/Program Files/Docker & Daftarkan PATH"]
    H --> I
    I --> J["Tahap 4: Injeksi daemon.json (Deteksi D:/docker vs C:/)"]
    J --> K["Tahap 5: Registrasi Windows Service & Start-Service docker"]
    K --> L["Tahap 6: Readiness Polling Named Pipe (Loop 20 Detik)"]
    L --> M["Tahap 7: Verifikasi Kesiapan Default NAT Network"]
    M --> N["Tahap 8: Smoke Test Kontainer Windows Native (NanoServer)"]
{{< /mermaid >}}

---

## 🛠️ Prasyarat Sistem Operasi & Hardware

| Parameter | Spesifikasi / Ketentuan |
| :--- | :--- |
| **Sistem Operasi** | Windows Server 2019 (Build 17763+), Windows Server 2022 / 2025 Datacenter |
| **Arsitektur CPU** | x86_64 / amd64 (Virtualisasi hardware VT-x / AMD-V aktif) |
| **Tata Kelola Disk** | Drive `C:` untuk OS + Drive `D:` (sangat disarankan) untuk container storage |
| **Biner Target** | Docker Engine CE `v27.5.1` (atau versi stabil v27+ lainnya) |
| **Hak Akses Shell** | Windows PowerShell 5.1 / PowerShell 7+ dijalankan sebagai **Administrator** |

---

## 🚀 Prosedur Langkah Demi Langkah

Seluruh perintah di bawah ini dijalankan di dalam konsol **PowerShell sebagai Administrator**.

---

### Langkah 1: Aktivasi Fitur Windows `Containers` & Evaluasi Reboot

Kernel Windows membutuhkan subsistem isolasi kontainer dan driver filter sistem berkas (`windowsfilter`).

Jalankan blok skrip berikut:

```powershell
# 1. Validasi hak akses Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "ERROR: Sesi PowerShell wajib dijalankan sebagai Administrator!"
    exit 1
}

# 2. Periksa status fitur Containers
Write-Host "--> Memeriksa Windows Feature: Containers..." -ForegroundColor Yellow
$containerFeature = Get-WindowsFeature -Name Containers -ErrorAction SilentlyContinue

if ($containerFeature -and -not $containerFeature.Installed) {
    Write-Host "    Mengaktifkan Windows Feature Containers..." -ForegroundColor Yellow
    $installResult = Install-WindowsFeature -Name Containers

    if ($installResult.RestartNeeded -eq "Yes") {
        Write-Warning "Sistem memerlukan restart untuk memuat driver kernel filter 'windowsfilter'."
        Write-Host "Silakan reboot server sekarang: Restart-Computer -Force" -ForegroundColor Red
        exit 0
    }
} else {
    Write-Host "    [OK] Fitur Windows Containers sudah aktif." -ForegroundColor Green
}
```

> [!IMPORTANT]
> Jika sistem baru saja mengaktifkan fitur `Containers`, Anda **wajib me-restart komputer** sebelum melanjutkan ke langkah berikutnya. Mengabaikan restart akan menyebabkan `dockerd` gagal menginisialisasi driver `windowsfilter`.

---

### Langkah 2: Penyediaan Biner Docker CE v27+ (Offline-First)

Arsip biner resmi yang digunakan adalah biner statis Windows 64-bit dari repositori resmi Docker upstream (contoh: `docker-27.5.1.zip`).

Di lingkungan enterprise yang terisolasi (*air-gapped* atau lab perbankan tanpa akses internet langsung), operator dapat meletakkan berkas arsip di `C:\temp\docker.zip` (misal via SCP dari mesin workstation):
```bash
scp -o IdentitiesOnly=yes docker-27.5.1.zip Administrator@<host_windows>:C:\temp\docker.zip
```

Skrip instalasi secara cerdas memeriksa arsip lokal terlebih dahulu sebelum mencoba mengunduh ke internet:

```powershell
$DockerInstallDir = "C:\Program Files\Docker"
$dockerdPath      = Join-Path $DockerInstallDir "dockerd.exe"
$dockerCliPath    = Join-Path $DockerInstallDir "docker.exe"

if (-not (Test-Path $dockerdPath) -or -not (Test-Path $dockerCliPath)) {
    # 1. Cari kandidat arsip lokal
    $candidates = @(
        "C:\temp\docker.zip",
        "C:\temp\docker-27.5.1.zip",
        (Get-ChildItem -Path "C:\temp" -Filter "docker*.zip" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName -First 1)
    )

    $targetArchive = ""
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) {
            $targetArchive = $c
            Write-Host "    [OK] Menemukan arsip offline di $targetArchive" -ForegroundColor Green
            break
        }
    }

    # 2. Fallback download jika offline archive tidak ada
    if (-not $targetArchive) {
        Write-Host "    Arsip lokal tidak ditemukan. Mencoba unduh dari repositori resmi Docker..." -ForegroundColor Yellow
        New-Item -ItemType Directory -Force -Path "C:\temp" | Out-Null
        $downloadUrl = "https://download.docker.com/win/static/stable/x86_64/docker-27.5.1.zip"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $downloadUrl -OutFile "C:\temp\docker.zip" -UseBasicParsing
        $targetArchive = "C:\temp\docker.zip"
        Write-Host "    [OK] Berhasil mengunduh Docker CE v27.5.1." -ForegroundColor Green
    }

    # 3. Ekstraksi biner ke C:\Program Files\Docker
    Write-Host "    Mengekstrak biner ke $DockerInstallDir..." -ForegroundColor Yellow
    $extractTemp = "C:\temp\docker_extract_tmp"
    if (Test-Path $extractTemp) { Remove-Item $extractTemp -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $extractTemp | Out-Null
    
    Expand-Archive -Path $targetArchive -DestinationPath $extractTemp -Force
    New-Item -ItemType Directory -Force -Path $DockerInstallDir | Out-Null

    if (Test-Path "$extractTemp\docker") {
        Copy-Item "$extractTemp\docker\*" $DockerInstallDir -Recurse -Force
    } else {
        Copy-Item "$extractTemp\*" $DockerInstallDir -Recurse -Force
    }
    Remove-Item $extractTemp -Recurse -Force
    Write-Host "    [OK] Biner Docker CE berhasil diekstrak." -ForegroundColor Green
} else {
    Write-Host "    [OK] Biner Docker Engine sudah terpasang di $DockerInstallDir." -ForegroundColor Green
}
```

---

### Langkah 3: Konfigurasi `daemon.json` & Pemisahan Disk Data (`D:\docker`)

Pada server produksi, pemisahan partisi data sangat krusial. Menyimpan citra kontainer dan layer *scratch space* di drive sistem `C:\ProgramData\docker` berisiko menyebabkan *disk exhaustion* yang dapat melumpuhkan sistem operasi Windows.

Skrip memeriksa apakah drive `D:\` tersedia. Jika ada, Docker otomatis diarahkan menggunakan `D:\docker` sebagai `data-root`:

```powershell
$dataDrive       = if (Test-Path "D:\") { "D:" } else { "C:" }
$dockerDataRoot  = if ($dataDrive -eq "D:") { "D:\docker" } else { "C:\ProgramData\docker" }
$dockerConfigDir = "C:\ProgramData\docker\config"

if (-not (Test-Path $dockerConfigDir)) {
    New-Item -ItemType Directory -Force -Path $dockerConfigDir | Out-Null
}

$daemonJsonPath = Join-Path $dockerConfigDir "daemon.json"

# Buat folder data-root jika menggunakan drive sekunder D:
if ($dataDrive -eq "D:" -and -not (Test-Path $dockerDataRoot)) {
    New-Item -ItemType Directory -Force -Path $dockerDataRoot | Out-Null
}

# Tulis konfigurasi daemon.json enterprise
$daemonConfig = @{
    "data-root"    = $dockerDataRoot
    "hosts"        = @("npipe:////./pipe/docker_engine")
    "storage-opts" = @("size=120GB")
    "log-driver"   = "json-file"
    "log-opts"     = @{
        "max-size" = "50m"
        "max-file" = "5"
    }
}
$daemonConfig | ConvertTo-Json -Depth 5 | Set-Content -Path $daemonJsonPath -Encoding ASCII
Write-Host "    [OK] daemon.json dikonfigurasi dengan data-root: $dockerDataRoot" -ForegroundColor Green
```

#### Rincian Parameter Kritis:
* **`log-driver` & `log-opts`:** Membatasi ukuran satu berkas log maksimal `50 MB` dan mempertahankan maksimal `5` rotasi berkas per kontainer.
* **`storage-opts: ["size=120GB"]`:** Menentukan batas kuota layer disk virtual (*scratch space*) untuk setiap kontainer Windows (default Windows Containers biasanya 20 GB).
* **`hosts: ["npipe:////./pipe/docker_engine"]`:** Mengamankan daemon agar hanya melayani permintaan lokal via Windows Named Pipe dengan kontrol ACL Administrator bawaan OS.

---

### Langkah 4: Registrasi Windows Service & Named Pipe Polling Loop

Kini daftarkan `dockerd.exe` sebagai *Windows Service* resmi, atur agar berjalan otomatis saat boot, lalu lakukan *polling* hingga socket Named Pipe siap:

```powershell
# 1. Daftarkan service ke Windows Service Control Manager
Write-Host "--> Mendaftarkan Docker Windows Service..." -ForegroundColor Yellow
$dockerService = Get-Service -Name docker -ErrorAction SilentlyContinue
if (-not $dockerService) {
    & "$dockerdPath" --register-service | Out-Null
}
Set-Service -Name docker -StartupType Automatic
Start-Service -Name docker

# 2. Polling Named Pipe (Loop hingga 20 detik)
Write-Host "--> Menunggu kesiapan Named Pipe Docker Engine (\\.\pipe\docker_engine)..." -ForegroundColor Yellow
$ready = $false
for ($i = 1; $i -le 20; $i++) {
    try {
        & "$dockerCliPath" version --format '{{.Server.Version}}' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if ($ready) {
    Write-Host "    [OK] Docker daemon aktif dan merespons Named Pipe!" -ForegroundColor Green
} else {
    Write-Warning "Daemon telah dinyalakan namun Named Pipe belum merespons dalam 20 detik. Periksa Event Viewer!"
}
```

---

### Langkah 5: Registrasi System PATH & Dukungan Sesi Remote (SSH/WinRM)

Agar biner `docker.exe` dapat diakses dari konsol PowerShell baru ataupun sesi non-interaktif SSH/WinRM:

```powershell
# 1. Daftarkan ke Machine Scope PATH
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($machinePath -notlike "*$DockerInstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$machinePath;$DockerInstallDir", "Machine")
}
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

# 2. Opsional: Salin ke System32 untuk ketersediaan instan di sesi OpenSSH tanpa reload PATH
Copy-Item "$DockerInstallDir\*.exe" "C:\Windows\System32\" -Force -ErrorAction SilentlyContinue

Write-Host "    [OK] Docker berhasil didaftarkan ke System PATH." -ForegroundColor Green
```

---

### Langkah 6: Verifikasi Kesiapan Default NAT Network (Host Network Service)

Pada Windows Server, Docker secara otomatis menyediakan jaringan NAT default bernama **`nat`** yang dikelola oleh *Host Network Service* (HNS). Seluruh kontainer Windows standar akan terhubung ke jaringan ini secara otomatis:

```powershell
# Pastikan default NAT Network tersedia
$netInspect = & "$dockerCliPath" network ls --filter "name=^nat$" --format "{{.Name}}" 2>$null
if (-not $netInspect) {
    Write-Host "--> Jaringan default 'nat' belum terdeteksi. Membuat network nat..." -ForegroundColor Yellow
    & "$dockerCliPath" network create -d nat nat | Out-Null
    Write-Host "    [OK] Network 'nat' berhasil dibuat." -ForegroundColor Green
} else {
    Write-Host "    [OK] Network 'nat' (Default HNS NAT) sudah aktif." -ForegroundColor Green
}
```

---

### Langkah 7: Verifikasi Runtime & Smoke Test Citra Windows Native

Lakukan pengujian akhir untuk memastikan seluruh subsistem bekerja:

#### 1. Uji Versi & Engine Platform
```powershell
docker version
```
*Output yang diharapkan:*
```text
Client:
 Version:           27.5.1
 API version:       1.47
 Go version:        go1.23.1
 OS/Arch:           windows/amd64

Server: Docker Engine - Community
 Engine:
  Version:          27.5.1
  API version:      1.47 (minimum version 1.24)
  Go version:       go1.23.1
  OS/Arch:          windows/amd64
```

#### 2. Uji Status Informasi Engine & Storage Driver
```powershell
docker info --format 'OS: {{.OperatingSystem}} | Driver: {{.Driver}} | Root: {{.DockerRootDir}}'
```
*Output harus menyatakan:* `Driver: windowsfilter` dengan root storage yang sesuai (`D:\docker` atau `C:\ProgramData\docker`).

#### 3. Eksekusi Smoke Test Citra NanoServer Native
Tarik dan jalankan citra resmi Microsoft NanoServer yang sesuai dengan versi Windows Server Anda:

```powershell
# Contoh smoke test untuk Windows Server 2022 (LTSC):
docker run --rm mcr.microsoft.com/windows/nanoserver:ltsc2022 cmd.exe /c "echo Verifikasi Sukses: Docker Engine CE v27+ Beroperasi Sempurna di Windows Containers!"
```

Jika teks konfirmasi tercetak ke terminal, lingkungan Windows Containers Anda telah berfungsi secara sempurna dan siap menerima beban kerja kontainer!

---

## 📜 All-in-One Automation Script (`install-docker-ce.ps1`)

Berikut adalah skrip otomatisasi mandiri murni (*standalone installer*) yang merangkum seluruh tahapan instalasi Docker Engine CE di atas ke dalam satu berkas PowerShell siap pakai:

```powershell
<#
.SYNOPSIS
    Standalone Automated Installer for Docker Engine CE v27+ on Windows Server.
.DESCRIPTION
    Mengotomatiskan penyediaan Docker Engine Community Edition mode Windows Containers:
    - Validasi hak administrator & fitur Windows Containers
    - Instalasi biner Docker CE v27+ (Offline C:\temp\docker.zip atau online fallback)
    - Konfigurasi data-root otomatis pada drive D: (jika tersedia)
    - Registrasi Windows Service & polling kesiapan named pipe
    - Verifikasi default NAT network ('nat')
#>

param (
    [string]$DockerZipPath    = "C:\temp\docker.zip",
    [string]$DockerInstallDir = "C:\Program Files\Docker",
    [string]$DataRoot         = "",
    [switch]$AutoReboot
)

$ErrorActionPreference = "Stop"

# Deteksi Drive Data otomatis jika tidak dispesifikasikan
if (-not $DataRoot) {
    $dataDrive = if (Test-Path "D:\") { "D:" } else { "C:" }
    $DataRoot  = if ($dataDrive -eq "D:") { "D:\docker" } else { "C:\ProgramData\docker" }
}

Write-Host "=== Memulai Instalasi Docker Engine CE v27+ (Windows Containers) ===" -ForegroundColor Cyan

# 1. Validasi Hak Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "ERROR: Sesi PowerShell wajib dijalankan sebagai Administrator!"
    exit 1
}

# 2. Windows Containers Feature & Reboot Handling
Write-Host "--> [1/5] Memeriksa Fitur Windows Containers..." -ForegroundColor Yellow
$feat = Get-WindowsFeature -Name Containers -ErrorAction SilentlyContinue
if ($feat -and -not $feat.Installed) {
    $res = Install-WindowsFeature -Name Containers
    if ($res.RestartNeeded -eq "Yes") {
        Write-Warning "Sistem membutuhkan restart untuk memuat driver windowsfilter."
        if ($AutoReboot) { Restart-Computer -Force; exit 0 }
        else { Write-Host "Harap reboot server (Restart-Computer -Force) lalu jalankan kembali skrip ini."; exit 0 }
    }
}

# 3. Resolusi Biner & Ekstraksi
Write-Host "--> [2/5] Menyiapkan Biner Docker Engine CE..." -ForegroundColor Yellow
$dockerdPath  = Join-Path $DockerInstallDir "dockerd.exe"
$dockerCli    = Join-Path $DockerInstallDir "docker.exe"

if (-not (Test-Path $dockerdPath) -or -not (Test-Path $dockerCli)) {
    $archive = ""
    $candidates = @($DockerZipPath, "C:\temp\docker.zip", "C:\temp\docker-27.5.1.zip")
    foreach ($c in $candidates) { if (Test-Path $c) { $archive = $c; break } }

    if (-not $archive) {
        New-Item -ItemType Directory -Force -Path "C:\temp" | Out-Null
        $url = "https://download.docker.com/win/static/stable/x86_64/docker-27.5.1.zip"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile "C:\temp\docker.zip" -UseBasicParsing
        $archive = "C:\temp\docker.zip"
    }

    $tmp = "C:\temp\docker_extract_tmp"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $tmp, $DockerInstallDir | Out-Null
    Expand-Archive -Path $archive -DestinationPath $tmp -Force
    if (Test-Path "$tmp\docker") { Copy-Item "$tmp\docker\*" $DockerInstallDir -Recurse -Force }
    else { Copy-Item "$tmp\*" $DockerInstallDir -Recurse -Force }
    Remove-Item $tmp -Recurse -Force
}

# 4. Konfigurasi daemon.json
Write-Host "--> [3/5] Mengonfigurasi daemon.json..." -ForegroundColor Yellow
$cfgDir = "C:\ProgramData\docker\config"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
if (-not (Test-Path $DataRoot)) {
    New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
}
@{
    "data-root"    = $DataRoot
    "hosts"        = @("npipe:////./pipe/docker_engine")
    "storage-opts" = @("size=120GB")
    "log-driver"   = "json-file"
    "log-opts"     = @{ "max-size" = "50m"; "max-file" = "5" }
} | ConvertTo-Json -Depth 5 | Set-Content -Path "$cfgDir\daemon.json" -Encoding ASCII

# 5. Service Registration & Start
Write-Host "--> [4/5] Mendaftarkan & Menjalankan Layanan Docker..." -ForegroundColor Yellow
if (-not (Get-Service -Name docker -ErrorAction SilentlyContinue)) {
    & "$dockerdPath" --register-service | Out-Null
}
Set-Service -Name docker -StartupType Automatic
Start-Service -Name docker

# Polling Named Pipe
$ready = $false
for ($i = 1; $i -le 20; $i++) {
    try {
        & "$dockerCli" version --format '{{.Server.Version}}' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}

# Registrasi PATH
$mPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($mPath -notlike "*$DockerInstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$mPath;$DockerInstallDir", "Machine")
}
Copy-Item "$DockerInstallDir\*.exe" "C:\Windows\System32\" -Force -ErrorAction SilentlyContinue

# 6. Verifikasi Default NAT Network
Write-Host "--> [5/5] Memverifikasi Jaringan Default NAT..." -ForegroundColor Yellow
if (-not (& "$dockerCli" network ls --filter "name=^nat$" --format "{{.Name}}" 2>$null)) {
    & "$dockerCli" network create -d nat nat | Out-Null
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " DOCKER ENGINE CE v27+ (WINDOWS CONTAINERS) BERHASIL TERPASANG!  " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " - Engine Version  : $(& "$dockerCli" version --format '{{.Server.Version}}')"
Write-Host " - Data Root       : $DataRoot"
Write-Host " - Network Default : nat (HNS)"
Write-Host "=================================================================" -ForegroundColor Green
```

---

## 🛠️ Tips Operasional & Troubleshooting Umum

### 1. Version Mismatch: Kompatibilitas Versi Kernel Host & Kontainer
Windows Containers menerapkan arsitektur *Shared-Kernel*. Citra kontainer harus memiliki build yang selaras dengan host:

| Versi Windows Server Host | Build Host | Citra NanoServer/ServerCore yang Didukung (Process Isolation) |
| :--- | :--- | :--- |
| **Windows Server 2022** | `20348` | `ltsc2022` (Process Isolation bawaan) |
| **Windows Server 2019** | `17763` | `1809` / `ltsc2019` (Process Isolation bawaan) |
| **Windows Server 2025** | `26100` | `ltsc2025` (Process Isolation bawaan) |

> [!WARNING]
> Menjalankan citra kontainer yang berbeda build dengan OS host (misal: citra `ltsc2019` di atas host Server 2022) mewajibkan penambahan flag `--isolation=hyperv`. Jika dijalankan dengan isolasi proses biasa, kontainer akan gagal dimulai dengan pesan error: *The operating system of the container image is not compatible with the host operating system*.

### 2. Memulihkan Default NAT Network yang Hilang
Jika perintah `docker run` menghasilkan error seperti:
```text
Error response from daemon: could not find an available, non-overlapping IPv4 address pool
```
Artinya Host Network Service (HNS) gagal mengalokasikan subnet NAT default. Anda dapat membersihkan dan membuatnya kembali:

```powershell
# Buat ulang network nat default secara eksplisit:
docker network create -d nat --subnet 172.28.0.0/16 --gateway 172.28.0.1 nat
```
