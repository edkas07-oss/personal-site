+++
title = "Panduan Praktis: Instalasi Docker Engine Community Edition (CE) v27+ di Windows Server (Mode Windows Containers)"
date = "2026-09-25T15:30:00+07:00"
draft = false
summary = "Panduan operasional untuk menginstal dan mengonfigurasi Docker Engine Community Edition (CE) v27+ native Windows Containers secara headless sebagai Windows Service. Membahas aktivasi filter driver kernel windowsfilter, penanganan offline file di lab terisolasi, pemisahan storage data-root D:, named pipe polling, sampai smoke test image NanoServer."
author = "Eddy Wiyatno"
categories = ["How-To", "Container", "Infrastructure"]
tags = ["docker", "docker-ce", "windows-containers", "windows-server", "powershell", "devops", "sre", "hyper-v", "sysadmin"]
series = ["Windows Server Container Platform"]
toc = true
showSummary = true
+++

{{< lead >}}
**Setup Headless Docker Engine CE v27+ untuk Windows Containers di Windows Server Production**

Di server Windows production, memakai Docker Desktop bukanlah pilihan yang tepat karena ada overhead GUI, ketergantungan sesi login, serta urusan lisensi. Praktik standarnya adalah memasang **Docker Engine Community Edition (CE) v27+ standalone (*headless daemon*)** yang didaftarkan langsung sebagai *Windows Service* untuk menjalankan **Windows Containers** secara native.
{{< /lead >}}

---

## 📌 Kenapa Pakai Docker Engine CE Standalone (Bukan Docker Desktop)?

Bagi System Engineer dan System Administrator (SysAdmin), kebutuhan di server production jelas berbeda dengan laptop workstation:

1. **Headless & Berjalan Otomatis (Unattended):** Server production harus bisa jalan tanpa perlu ada user yang login. Docker Engine wajib berjalan sebagai background service (*Windows Service*) yang otomatis menyala begitu server nyala (*booting*).
2. **Tanpa GUI & Hemat Resource:** Docker Desktop membawa dependensi Electron, WSL2 backend, dan dashboard visual yang memakan RAM server. Docker CE standalone berupa biner murni yang sangat ringan dan hanya menggunakan resource saat container sedang berjalan.
3. **Komunikasi via Windows Named Pipe:** Docker CLI berkomunikasi langsung dengan daemon lewat Named Pipe lokal (`\\.\pipe\docker_engine`), sehingga performanya cepat dan aksesnya otomatis diamankan oleh Windows ACL.
4. **Modul `DockerMsftProvider` Sudah Tidak Dipakai:** Modul lama PowerShell `DockerMsftProvider` yang dulu disediakan Microsoft kini sudah *deprecated*. Cara resmi dan paling stabil untuk memasang Docker CE versi modern (v27+) saat ini adalah menggunakan file biner statis langsung dari upstream resmi Docker.

---

## 🏛️ Alur Kerja Instalasi di Production

Berdasarkan pengalaman setup di server lab dan data center yang jaringannya tertutup (*air-gap / restricted network*), langkah-langkah instalasi Docker Engine Windows Containers dibagi menjadi tahapan berikut:

{{< mermaid >}}
flowchart TD
    A["Operator: PowerShell Run as Administrator"] --> B["Langkah 1: Cek & Aktifkan Fitur Containers"]
    B --> C{"Apakah Perlu Reboot?"}
    C -->|RestartNeeded = Yes| D["Wajib Reboot Server (Load Driver windowsfilter)"]
    D -->|Setelah Reboot| A
    C -->|Sudah Aktif| E["Langkah 2: Siapkan File Biner Docker CE v27+"]
    E --> F{"Apakah File C:/temp/docker.zip Ada?"}
    F -->|Ada| G["Pakai File Offline (Air-Gap)"]
    F -->|Tidak Ada| H["Download Otomatis dari download.docker.com"]
    G --> I["Langkah 3: Ekstrak ke C:/Program Files/Docker & Set PATH"]
    H --> I
    I --> J["Langkah 4: Konfigurasi daemon.json (Deteksi D:/docker vs C:/)"]
    J --> K["Langkah 5: Daftarkan Windows Service & Start Docker"]
    K --> L["Langkah 6: Polling Named Pipe sampai Service Ready"]
    L --> M["Langkah 7: Cek Default Network nat"]
    M --> N["Langkah 8: Smoke Test Container Windows (NanoServer)"]
{{< /mermaid >}}

---

## 🛠️ Prasyarat Sistem & Spesifikasi

| Parameter | Spesifikasi / Kebutuhan |
| :--- | :--- |
| **Sistem Operasi** | Windows Server 2019 (Build 17763+), Windows Server 2022 / 2025 Datacenter |
| **Arsitektur CPU** | x86_64 / amd64 (Virtualisasi hardware VT-x / AMD-V aktif) |
| **Penyimpanan Disk** | Drive `C:` untuk OS + Drive `D:` (sangat disarankan) untuk data container |
| **Versi Docker** | Docker Engine CE `v27.5.1` (atau rilis stabil v27+ lainnya) |
| **Hak Akses Terminal** | Windows PowerShell 5.1 / PowerShell 7+ dijalankan dengan hak **Run as Administrator** |

---

## 🚀 Langkah-Langkah Instalasi

Buka konsol **PowerShell sebagai Administrator**, lalu jalankan perintah berikut secara berurutan.

---

### Langkah 1: Aktifkan Fitur Windows `Containers` & Cek Kebutuhan Reboot

Windows membutuhkan komponen container isolation dan filesystem filter driver (`windowsfilter`).

Jalankan script berikut:

```powershell
# 1. Pastikan script jalan sebagai Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "ERROR: PowerShell harus dijalankan sebagai Administrator (Run as Administrator)!"
    exit 1
}

# 2. Cek status fitur Containers
Write-Host "--> Memeriksa fitur Windows: Containers..." -ForegroundColor Yellow
$containerFeature = Get-WindowsFeature -Name Containers -ErrorAction SilentlyContinue

if ($containerFeature -and -not $containerFeature.Installed) {
    Write-Host "    Mengaktifkan fitur Containers..." -ForegroundColor Yellow
    $installResult = Install-WindowsFeature -Name Containers

    if ($installResult.RestartNeeded -eq "Yes") {
        Write-Warning "Sistem perlu di-restart untuk memuat driver kernel 'windowsfilter'."
        Write-Host "Silakan reboot server sekarang: Restart-Computer -Force" -ForegroundColor Red
        exit 0
    }
} else {
    Write-Host "    [OK] Fitur Windows Containers sudah aktif." -ForegroundColor Green
}
```

> [!IMPORTANT]
> Kalau fitur `Containers` baru saja diaktifkan, server **wajib di-restart**. Jika tidak di-restart, service `dockerd` dipastikan gagal start karena driver kernel `windowsfilter` belum termuat di memori Windows.

---

### Langkah 2: Siapkan File Biner Docker CE v27+ (Mendukung Offline / Air-Gap)

File biner resmi Docker untuk Windows didistribusikan dalam bentuk file zip statis (misal: `docker-27.5.1.zip`).

Di lingkungan enterprise yang tidak punya akses internet langsung (air-gapped atau restricted network), Anda bisa meng-copy file zip tersebut ke `C:\temp\docker.zip` terlebih dahulu (misalnya via SCP dari laptop/bastion host):
```bash
scp -o IdentitiesOnly=yes docker-27.5.1.zip Administrator@<host_windows>:C:\temp\docker.zip
```

Script di bawah ini akan memprioritaskan file lokal terlebih dahulu. Jika file zip lokal tidak ada, barulah script mendownload otomatis dari server resmi Docker:

```powershell
$DockerInstallDir = "C:\Program Files\Docker"
$dockerdPath      = Join-Path $DockerInstallDir "dockerd.exe"
$dockerCliPath    = Join-Path $DockerInstallDir "docker.exe"

if (-not (Test-Path $dockerdPath) -or -not (Test-Path $dockerCliPath)) {
    # 1. Cari apakah ada file zip offline di C:\temp
    $candidates = @(
        "C:\temp\docker.zip",
        "C:\temp\docker-27.5.1.zip",
        (Get-ChildItem -Path "C:\temp" -Filter "docker*.zip" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName -First 1)
    )

    $targetArchive = ""
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) {
            $targetArchive = $c
            Write-Host "    [OK] Menggunakan file zip lokal: $targetArchive" -ForegroundColor Green
            break
        }
    }

    # 2. Download otomatis kalau file lokal tidak ditemukan
    if (-not $targetArchive) {
        Write-Host "    File lokal tidak ditemukan. Mendownload langsung dari repositori Docker..." -ForegroundColor Yellow
        New-Item -ItemType Directory -Force -Path "C:\temp" | Out-Null
        $downloadUrl = "https://download.docker.com/win/static/stable/x86_64/docker-27.5.1.zip"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $downloadUrl -OutFile "C:\temp\docker.zip" -UseBasicParsing
        $targetArchive = "C:\temp\docker.zip"
        Write-Host "    [OK] Berhasil mendownload Docker CE v27.5.1." -ForegroundColor Green
    }

    # 3. Ekstrak biner ke C:\Program Files\Docker
    Write-Host "    Mengekstrak file ke $DockerInstallDir..." -ForegroundColor Yellow
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
    Write-Host "    [OK] Biner Docker CE berhasil dipasang di $DockerInstallDir." -ForegroundColor Green
} else {
    Write-Host "    [OK] Docker Engine sudah terpasang di $DockerInstallDir." -ForegroundColor Green
}
```

---

### Langkah 3: Konfigurasi `daemon.json` & Pisahkan Storage Data (`D:\docker`)

Di server production, pemisahan storage data sangat penting. Menyimpan container image dan scratch space di drive `C:` bawaan (`C:\ProgramData\docker`) berisiko membuat drive C: penuh (*disk exhaustion*), yang bisa berujung pada server Windows hang.

Script berikut akan otomatis memeriksa apakah ada drive `D:`. Jika ada, `data-root` diarahkan ke `D:\docker`:

```powershell
$dataDrive       = if (Test-Path "D:\") { "D:" } else { "C:" }
$dockerDataRoot  = if ($dataDrive -eq "D:") { "D:\docker" } else { "C:\ProgramData\docker" }
$dockerConfigDir = "C:\ProgramData\docker\config"

if (-not (Test-Path $dockerConfigDir)) {
    New-Item -ItemType Directory -Force -Path $dockerConfigDir | Out-Null
}

$daemonJsonPath = Join-Path $dockerConfigDir "daemon.json"

# Buat folder data-root jika menggunakan drive D:
if ($dataDrive -eq "D:" -and -not (Test-Path $dockerDataRoot)) {
    New-Item -ItemType Directory -Force -Path $dockerDataRoot | Out-Null
}

# Konfigurasi daemon.json standar production
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
Write-Host "    [OK] daemon.json berhasil dikonfigurasi (data-root: $dockerDataRoot)." -ForegroundColor Green
```

#### Rincian Parameter Penting:
* **`log-driver` & `log-opts`:** Membatasi ukuran satu file log maksimal `50 MB` dan menyimpan paling banyak `5` file rotasi per container. Ini mencegah harddisk penuh akibat log aplikasi.
* **`storage-opts: ["size=120GB"]`:** Menentukan batas kapasitas disk virtual (*scratch space*) per container Windows (default bawaan Windows Containers biasanya hanya 20 GB).
* **`hosts: ["npipe:////./pipe/docker_engine"]`:** Mengamankan daemon agar hanya melayani koneksi lokal via Windows Named Pipe dengan proteksi akun Administrator.

---

### Langkah 4: Daftarkan Windows Service & Tunggu Named Pipe Ready

Daftarkan `dockerd.exe` sebagai *Windows Service*, atur tipe startup menjadi otomatis, jalankan servicenya, lalu tunggu sampai Named Pipe siap menerima perintah:

```powershell
# 1. Daftarkan service ke Windows Service Manager
Write-Host "--> Mendaftarkan Docker sebagai Windows Service..." -ForegroundColor Yellow
$dockerService = Get-Service -Name docker -ErrorAction SilentlyContinue
if (-not $dockerService) {
    & "$dockerdPath" --register-service | Out-Null
}
Set-Service -Name docker -StartupType Automatic
Start-Service -Name docker

# 2. Polling Named Pipe (Looping maksimal 20 detik)
Write-Host "--> Menunggu Named Pipe Docker (\\.\pipe\docker_engine) siap..." -ForegroundColor Yellow
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
    Write-Host "    [OK] Docker daemon aktif dan siap menerima perintah!" -ForegroundColor Green
} else {
    Write-Warning "Docker service sudah start tapi Named Pipe belum merespons dalam 20 detik. Cek Event Viewer!"
}
```

---

### Langkah 5: Daftarkan ke System PATH & Sesi Remote (SSH/WinRM)

Agar perintah `docker` bisa langsung dipanggil dari command prompt mana pun ataupun dari sesi remote SSH non-interaktif:

```powershell
# 1. Daftarkan ke Machine PATH
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($machinePath -notlike "*$DockerInstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$machinePath;$DockerInstallDir", "Machine")
}
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

# 2. Copy biner ke System32 agar langsung kebaca di sesi SSH tanpa perlu re-login
Copy-Item "$DockerInstallDir\*.exe" "C:\Windows\System32\" -Force -ErrorAction SilentlyContinue

Write-Host "    [OK] Docker berhasil didaftarkan ke System PATH." -ForegroundColor Green
```

---

### Langkah 6: Verifikasi Kesiapan Default Network (`nat`)

Di Windows Server, Docker secara otomatis menyediakan jaringan NAT default bernama **`nat`** yang dikelola oleh *Host Network Service* (HNS). Cukup pastikan network ini sudah aktif:

```powershell
# Cek ketersediaan default network 'nat'
$netInspect = & "$dockerCliPath" network ls --filter "name=^nat$" --format "{{.Name}}" 2>$null
if (-not $netInspect) {
    Write-Host "--> Network default 'nat' belum terdeteksi. Membuat network nat baru..." -ForegroundColor Yellow
    & "$dockerCliPath" network create -d nat nat | Out-Null
    Write-Host "    [OK] Network 'nat' berhasil dibuat." -ForegroundColor Green
} else {
    Write-Host "    [OK] Network default 'nat' (HNS) sudah aktif." -ForegroundColor Green
}
```

---

### Langkah 7: Verifikasi Runtime & Smoke Test Container Windows

Lakukan verifikasi akhir untuk memastikan Docker sudah siap digunakan:

#### 1. Cek Versi Client & Server
```powershell
docker version
```
*Output yang muncul:*
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

#### 2. Cek Info Runtime & Storage Driver
```powershell
docker info --format 'OS: {{.OperatingSystem}} | Driver: {{.Driver}} | Root: {{.DockerRootDir}}'
```
*Pastikan driver yang digunakan adalah:* `windowsfilter` dan folder root storage mengarah ke disk yang sesuai (`D:\docker` atau `C:\ProgramData\docker`).

#### 3. Smoke Test dengan Image NanoServer
Jalankan uji coba container menggunakan image resmi Microsoft NanoServer:

```powershell
# Contoh untuk Windows Server 2022 (LTSC):
docker run --rm mcr.microsoft.com/windows/nanoserver:ltsc2022 cmd.exe /c "echo Verifikasi Sukses: Docker Engine CE v27+ Berjalan Normal!"
```

Jika teks konfirmasi muncul di layar terminal, Docker Engine CE di Windows Server Anda sudah 100% aktif dan siap digunakan untuk menjalankan container!

---

## 📜 Script Otomatis All-in-One (`install-docker-ce.ps1`)

Jika Anda ingin menjalankan seluruh langkah di atas secara otomatis dalam satu script (misalnya lewat automation tool atau remote script), simpan kode berikut sebagai `install-docker-ce.ps1`:

```powershell
<#
.SYNOPSIS
    Script Otomatis Instalasi Docker Engine CE v27+ di Windows Server.
.DESCRIPTION
    Menjalankan proses instalasi Docker mode Windows Containers secara otomatis:
    - Validasi hak administrator & fitur Windows Containers
    - Pasang biner Docker CE v27+ (prioritas file lokal C:\temp\docker.zip atau download otomatis)
    - Konfigurasi data-root otomatis ke drive D: (jika ada)
    - Registrasi Windows Service & polling kesiapan named pipe
    - Memastikan default network 'nat' aktif
#>

param (
    [string]$DockerZipPath    = "C:\temp\docker.zip",
    [string]$DockerInstallDir = "C:\Program Files\Docker",
    [string]$DataRoot         = "",
    [switch]$AutoReboot
)

$ErrorActionPreference = "Stop"

# Deteksi drive data jika tidak ditentukan manual
if (-not $DataRoot) {
    $dataDrive = if (Test-Path "D:\") { "D:" } else { "C:" }
    $DataRoot  = if ($dataDrive -eq "D:") { "D:\docker" } else { "C:\ProgramData\docker" }
}

Write-Host "=== Memulai Instalasi Docker Engine CE v27+ (Windows Containers) ===" -ForegroundColor Cyan

# 1. Cek Hak Akses Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "ERROR: Script ini wajib dijalankan sebagai Administrator!"
    exit 1
}

# 2. Cek Fitur Windows Containers & Kebutuhan Reboot
Write-Host "--> [1/5] Memeriksa Fitur Windows Containers..." -ForegroundColor Yellow
$feat = Get-WindowsFeature -Name Containers -ErrorAction SilentlyContinue
if ($feat -and -not $feat.Installed) {
    $res = Install-WindowsFeature -Name Containers
    if ($res.RestartNeeded -eq "Yes") {
        Write-Warning "Sistem perlu di-restart untuk memuat driver windowsfilter."
        if ($AutoReboot) { Restart-Computer -Force; exit 0 }
        else { Write-Host "Silakan reboot server (Restart-Computer -Force) lalu jalankan script ini kembali."; exit 0 }
    }
}

# 3. Siapkan File Biner & Ekstraksi
Write-Host "--> [2/5] Menyiapkan File Biner Docker Engine CE..." -ForegroundColor Yellow
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

# 4. Buat File daemon.json
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

# 5. Daftarkan dan Jalankan Service
Write-Host "--> [4/5] Mendaftarkan dan Menjalankan Service Docker..." -ForegroundColor Yellow
if (-not (Get-Service -Name docker -ErrorAction SilentlyContinue)) {
    & "$dockerdPath" --register-service | Out-Null
}
Set-Service -Name docker -StartupType Automatic
Start-Service -Name docker

# Tunggu Named Pipe Ready
$ready = $false
for ($i = 1; $i -le 20; $i++) {
    try {
        & "$dockerCli" version --format '{{.Server.Version}}' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}

# Set Machine PATH
$mPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($mPath -notlike "*$DockerInstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$mPath;$DockerInstallDir", "Machine")
}
Copy-Item "$DockerInstallDir\*.exe" "C:\Windows\System32\" -Force -ErrorAction SilentlyContinue

# 6. Pastikan Network 'nat' Tersedia
Write-Host "--> [5/5] Memastikan Default Network 'nat' Siap..." -ForegroundColor Yellow
if (-not (& "$dockerCli" network ls --filter "name=^nat$" --format "{{.Name}}" 2>$null)) {
    & "$dockerCli" network create -d nat nat | Out-Null
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " DOCKER ENGINE CE v27+ (WINDOWS CONTAINERS) BERHASIL TERPASANG!  " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " - Versi Engine    : $(& "$dockerCli" version --format '{{.Server.Version}}')"
Write-Host " - Data Root       : $DataRoot"
Write-Host " - Default Network : nat (HNS)"
Write-Host "=================================================================" -ForegroundColor Green
```

---

## 🛠️ Tips Operasional & Troubleshooting

### 1. Version Mismatch: Kompatibilitas Versi Kernel Host & Container
Windows Containers menggunakan sistem *Shared-Kernel*. Build container image harus cocok dengan versi OS host Windows Anda:

| Versi Windows Server Host | Build Host | Image NanoServer/ServerCore yang Didukung (Process Isolation) |
| :--- | :--- | :--- |
| **Windows Server 2022** | `20348` | `ltsc2022` (Bawaan Process Isolation) |
| **Windows Server 2019** | `17763` | `1809` / `ltsc2019` (Bawaan Process Isolation) |
| **Windows Server 2025** | `26100` | `ltsc2025` (Bawaan Process Isolation) |

> [!WARNING]
> Jika Anda menjalankan container image yang versinya berbeda dengan versi OS host (misalnya: image `ltsc2019` di host Windows Server 2022), Anda wajib menambahkan opsi `--isolation=hyperv`. Jika dijalankan dengan isolasi proses biasa, container tidak akan bisa start dan muncul pesan error: *The operating system of the container image is not compatible with the host operating system*.

### 2. Memperbaiki Default Network `nat` yang Error
Jika perintah `docker run` menghasilkan error seperti ini:
```text
Error response from daemon: could not find an available, non-overlapping IPv4 address pool
```
Penyebabnya adalah Host Network Service (HNS) Windows gagal mengalokasikan subnet NAT otomatis. Solusinya, Anda bisa membuat ulang network `nat` secara manual:

```powershell
# Buat ulang network nat secara manual dengan subnet spesifik:
docker network create -d nat --subnet 172.28.0.0/16 --gateway 172.28.0.1 nat
```
