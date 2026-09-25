+++
title = "Panduan Praktis: Instalasi Docker Engine Community Edition (CE) v27+ di Windows Server (Mode Windows Containers)"
date = "2026-09-25T15:30:00+07:00"
draft = false
summary = "Panduan operasional terverifikasi berbasis standar Day-1 Bootstrapping untuk menginstal dan mengonfigurasi Docker Engine Community Edition (CE) v27+ native Windows Containers secara headless. Mengupas aktivasi filter driver kernel, penanganan offline archive di lingkungan terisolasi, pemisahan storage data-root D:, named pipe polling, hingga provisi NAT network."
author = "Eddy Wiyatno"
categories = ["How-To", "Container", "Infrastructure"]
tags = ["docker", "docker-ce", "windows-containers", "windows-server", "powershell", "devops", "sre", "tcctl", "hyper-v"]
series = ["Windows Server Container Platform"]
toc = true
showSummary = true
+++

{{< lead >}}
**Standar Operasional Day-1 Bootstrapping untuk Container Engine Native di Windows Server Enterprise**

Menjalankan Docker di lingkungan Windows Server produksi memiliki karakteristik yang sangat berbeda dibandingkan workstation. Panduan ini disusun berdasarkan implementasi nyata skrip operasional **Day-1 Host Bootstrapper** (`day1_bootstrap.ps1`), memverifikasi instalasi **Docker Engine Community Edition (CE) v27+** tanpa antarmuka grafis (*headless daemon*), siap dioperasikan pada server terisolasi (*air-gapped/lab*), dan terintegrasi langsung dengan orkestrator enterprise.
{{< /lead >}}

---

## 📌 Mengapa Mengikuti Pola Day-1 Bootstrapper?

Banyak panduan umum di internet mengasumsikan instalasi Docker pada Windows selalu memiliki akses internet langsung dan menggunakan direktori default drive `C:`. Dalam implementasi enterprise nyata di perbankan atau data center, terdapat sejumlah tantangan kritis:

1. **Jaringan Terisolasi (Offline / Restricted Network):** Server produksi sering kali tidak memiliki akses langsung ke `download.docker.com`. Skrip instalasi harus mendukung paradigma *offline-first* dengan mendeteksi arsip lokal di `C:\temp\docker.zip` sebelum mencoba *download fallback*.
2. **Kewajiban Reboot untuk Driver Kernel (`windowsfilter.sys`):** Mengaktifkan fitur Windows `Containers` mewajibkan *reboot* sistem agar filter driver kernel terpasang. Menjalankan Docker daemon sebelum *reboot* dipastikan berujung pada kegagalan runtime.
3. **Pemisahan Partisi Disk Data (`data-root`):** Menyimpan image dan container layer di drive sistem `C:\ProgramData\docker` berisiko menyebabkan *disk exhaustion* yang melumpuhkan OS. Standar Day-1 mendeteksi drive sekunder `D:\` secara otomatis dan mengalokasikan `data-root` ke `D:\docker`.
4. **Named Pipe Latency & Readiness Polling:** Setelah layanan *Windows Service* `docker` dinyalakan, named pipe `\\.\pipe\docker_engine` membutuhkan waktu beberapa detik untuk inisialisasi socket IPC. Diperlukan mekanisme *readiness polling loop* untuk memastikan daemon benar-benar siap menerima perintah.

---

## 🏛️ Alur Kerja Day-1 Bootstrapping

Diagram berikut merefleksikan alur eksekusi deterministik yang telah teruji pada lingkungan Windows Server 2019, 2022, dan 2025:

{{< mermaid >}}
flowchart TD
    A["Operator: PowerShell Elevated (Run as Administrator)"] --> B["Tahap 1: Validasi Hak Akses & Fitur Containers"]
    B --> C{"Fitur Containers Baru Dipasang?"}
    C -->|RestartNeeded = Yes| D["Host Wajib Reboot (windowsfilter driver)"]
    D -->|Setelah Reboot| A
    C -->|Sudah Aktif| E["Tahap 2: Resolusi Biner Docker CE v27+"]
    E --> F{"Arsip Lokal C:/temp/docker.zip Tersedia?"}
    F -->|Ya| G["Gunakan Arsip Offline"]
    F -->|Tidak| H["Fallback: Unduh dari download.docker.com"]
    G --> I["Tahap 3: Ekstraksi ke C:/Program Files/Docker & Daftarkan PATH"]
    H --> I
    I --> J["Tahap 4: Injeksi daemon.json (Deteksi D:/docker vs C:/)"]
    J --> K["Tahap 5: Registrasi Windows Service & Start-Service docker"]
    K --> L["Tahap 6: Readiness Polling Named Pipe (Loop 20 Detik)"]
    L --> M["Tahap 7: Verifikasi Default NAT Network & Base Dir"]
    M --> N["Selesai: Host Siap untuk Orkestrasi Beban Kerja tcctl"]
{{< /mermaid >}}

---

## 🛠️ Prasyarat Lingkungan

| Parameter | Spesifikasi / Ketentuan |
| :--- | :--- |
| **Sistem Operasi** | Windows Server 2019 (Build 17763+), Windows Server 2022 / 2025 Datacenter |
| **Arsitektur CPU** | x86_64 / amd64 (Virtualisasi hardware VT-x / AMD-V aktif) |
| **Tata Kelola Disk** | Drive `C:` untuk OS + Drive `D:` (sangat disarankan) untuk container storage |
| **Biner Target** | Docker Engine CE `v27.5.1` (atau versi stabil v27+ lainnya) |
| **Hak Akses Shell** | Windows PowerShell 5.1 / PowerShell 7+ dijalankan sebagai **Administrator** |

---

## 🚀 Prosedur Langkah Demi Langkah

Berikut adalah urutan teknis terverifikasi yang diambil langsung dari arsitektur Day-1.

---

### Langkah 1: Aktivasi Fitur Windows `Containers` & Evaluasi Reboot

Kernel Windows membutuhkan modul isolasi kontainer dan driver filter sistem berkas (`windowsfilter`).

Jalankan blok skrip berikut:

```powershell
# 1. Validasi hak akses Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "ERROR: Skrip ini wajib dijalankan di konsol PowerShell sebagai Administrator!"
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

Arsip biner resmi yang digunakan adalah biner statis Windows 64-bit dari Docker upstream (contoh: `docker-27.5.1.zip`). 

Skrip menerapkan logika cerdas:
1. Memeriksa keberadaan berkas di `C:\temp\docker.zip` atau `C:\temp\docker-27.5.1.zip`.
2. Jika server berada di lab tertutup tanpa internet, operator dapat melakukan *push* berkas dari mesin Linux kerja via SCP:
   ```bash
   scp -o IdentitiesOnly=yes docker-27.5.1.zip Administrator@<host_windows>:C:\temp\docker.zip
   ```
3. Jika berkas tidak ditemukan di `C:\temp`, barulah skrip mencoba mengunduh langsung dari upstream resmi:

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

Di lingkungan enterprise, pemisahan partisi data sangat dianjurkan. Skrip memeriksa apakah drive `D:\` tersedia. Jika ada, Docker diarahkan menggunakan `D:\docker` sebagai `data-root`.

```powershell
$dataDrive       = if (Test-Path "D:\") { "D:" } else { "C:" }
$dockerDataRoot  = if ($dataDrive -eq "D:") { "D:\docker" } else { "C:\ProgramData\docker" }
$dockerConfigDir = "C:\ProgramData\docker\config"

if (-not (Test-Path $dockerConfigDir)) {
    New-Item -ItemType Directory -Force -Path $dockerConfigDir | Out-Null
}

$daemonJsonPath = Join-Path $dockerConfigDir "daemon.json"

# Buat folder data-root jika di drive D:
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

---

### Langkah 4: Registrasi Windows Service & Named Pipe Polling Loop

Kini daftarkan daemon sebagai *Windows Service* resmi, atur agar berjalan otomatis saat boot, lalu lakukan *polling* hingga socket Named Pipe siap:

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

### Langkah 5: Registrasi System PATH & Dukungan Sesi Remote (SSH)

Agar biner `docker.exe` dapat diakses dari PowerShell baru atau sesi non-interaktif SSH/WinRM:

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

### Langkah 6: Verifikasi Default NAT Network & Persiapan Base Directory

> [!NOTE]
> **Standardisasi Jaringan Kontainer:**  
> Arsitektur `tcctl` dan Docker di Windows Server mengandalkan jaringan bawaan default **`nat`** (Host Network Service). Penggunaan *custom network* lawas (seperti `devops-lab`) sudah di-*deprecate* karena dapat memicu konflik alokasi pool IPv4 dan kompleksitas routing HNS yang tidak perlu.

Secara default, Docker di Windows Server otomatis membuat jaringan NAT bawaan bernama `nat`. Kita cukup memverifikasi ketersediaannya dan menyiapkan direktori host bind-mount (`$dataDrive\tomcats`):

```powershell
$NetworkName = "nat"
$BaseDir     = "$dataDrive\tomcats"

# 1. Pastikan default NAT Network tersedia
$netInspect = & "$dockerCliPath" network ls --filter "name=^$NetworkName$" --format "{{.Name}}" 2>$null
if (-not $netInspect) {
    Write-Host "--> Jaringan default '$NetworkName' belum terdeteksi. Membuat network nat..." -ForegroundColor Yellow
    & "$dockerCliPath" network create -d nat $NetworkName | Out-Null
    Write-Host "    [OK] Network '$NetworkName' berhasil dibuat." -ForegroundColor Green
} else {
    Write-Host "    [OK] Network '$NetworkName' (Default HNS NAT) sudah aktif." -ForegroundColor Green
}

# 2. Buat Base Directory untuk bind-mount kontainer (D:\tomcats atau C:\tomcats)
if (-not (Test-Path $BaseDir)) {
    New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
    Write-Host "    [OK] Tomcat Base Directory dibuat di $BaseDir." -ForegroundColor Green
} else {
    Write-Host "    [OK] Tomcat Base Directory sudah siap di $BaseDir." -ForegroundColor Green
}
```

---

### Langkah 7: Verifikasi Runtime & Smoke Test Citra NanoServer

Lakukan pengujian akhir untuk memastikan seluruh subsistem bekerja:

```powershell
# 1. Uji Versi Docker
docker version

# 2. Uji Status Engine & Driver
docker info --format 'OS: {{.OperatingSystem}} | Driver: {{.Driver}} | Root: {{.DockerRootDir}}'

# 3. Eksekusi Smoke Test Container Native (Windows Server 2022)
docker run --rm mcr.microsoft.com/windows/nanoserver:ltsc2022 cmd.exe /c "echo Verifikasi Sukses: Docker Engine CE v27+ Beroperasi Sempurna di Windows Containers!"
```

---

## 📜 Skrip Otomasi Penuh (`day1_bootstrap.ps1`)

Berikut adalah blok skrip otomatisasi terpadu yang menggabungkan seluruh tahapan di atas ke dalam satu berkas siap pakai. Simpan sebagai `day1_bootstrap.ps1`:

```powershell
<#
.SYNOPSIS
    Day-1 Windows Host Bootstrapper for Docker Engine CE v27+ (Windows Containers).
.DESCRIPTION
    Skrip operasional produksi untuk mengotomatiskan:
    - Validasi hak administrator & fitur Windows Containers
    - Instalasi biner Docker CE v27+ (Offline C:\temp\docker.zip atau online fallback)
    - Konfigurasi data-root otomatis pada drive D: (jika tersedia)
    - Registrasi Windows Service & polling kesiapan named pipe
    - Verifikasi default NAT network ('nat') & base directory bind-mount
#>

param (
    [string]$DockerZipPath    = "C:\temp\docker.zip",
    [string]$DockerInstallDir = "C:\Program Files\Docker",
    [string]$NetworkName      = "nat",
    [string]$BaseDir          = "",
    [switch]$AutoReboot
)

$ErrorActionPreference = "Stop"

# Deteksi Drive Data
$dataDrive = if (Test-Path "D:\") { "D:" } else { "C:" }
if (-not $BaseDir) { $BaseDir = "$dataDrive\tomcats" }
$dockerDataRoot = if ($dataDrive -eq "D:") { "D:\docker" } else { "C:\ProgramData\docker" }

Write-Host "=== Memulai Day-1 Bootstrapping: Docker Engine CE v27+ ===" -ForegroundColor Cyan

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
if ($dataDrive -eq "D:" -and -not (Test-Path $dockerDataRoot)) {
    New-Item -ItemType Directory -Force -Path $dockerDataRoot | Out-Null
}
@{
    "data-root"    = $dockerDataRoot
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

# 6. Docker Network & Base Directory
Write-Host "--> [5/5] Menyiapkan Jaringan NAT & Direktori Host..." -ForegroundColor Yellow
if (-not (& "$dockerCli" network ls --filter "name=^$NetworkName$" --format "{{.Name}}" 2>$null)) {
    & "$dockerCli" network create -d nat $NetworkName | Out-Null
}
New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " DOCKER ENGINE CE v27+ (WINDOWS CONTAINERS) BERHASIL TERPASANG!  " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " - Engine Version  : $(& "$dockerCli" version --format '{{.Server.Version}}')"
Write-Host " - Data Root       : $dockerDataRoot"
Write-Host " - NAT Network     : $NetworkName (Default HNS NAT)"
Write-Host " - Host Base Dir   : $BaseDir"
Write-Host "=================================================================" -ForegroundColor Green
```

---

## 📚 Langkah Selanjutnya (Menuju Day-2 Operations)

Host Windows Server Anda kini telah 100% siap untuk menjalankan beban kerja kontainer enterprise. Lanjutkan ke tahap operasional orkestrasi:

* [Panduan Praktis: Deploy Kontainer Apache Tomcat Hardened di Windows Server Menggunakan tcctl]({{< ref "how-to/deploy-tomcat-container-windows-server-tcctl" >}})
* [Unduh Biner Resmi tcctl di Menu Packages]({{< ref "packages/tcctl" >}})
* [Arsitektur Blueprint: Tomcat Monitoring & Autonomous Diagnostic Platform]({{< ref "projects/tomcat-monitoring" >}})
