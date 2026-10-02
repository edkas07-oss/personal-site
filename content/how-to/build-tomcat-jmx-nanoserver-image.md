+++
title = "Panduan Praktis: Build Image Container Apache Tomcat + Prometheus JMX Exporter + JDK di Windows NanoServer"
date = "2026-09-25T16:50:00+07:00"
draft = false
summary = "Panduan langkah-demi-langkah membangun container image Apache Tomcat 9.0 native Windows NanoServer yang dilengkapi instrumentasi Prometheus JMX Exporter dan multi-versi Eclipse Temurin JDK/JRE (11, 17, 21). Mengupas pembuatan Dockerfile modular, arsitektur setenv.bat dengan Hierarchy Fallback (Zero-Rebuild) untuk JRE_HOME dan Java Agent, hingga dua metode distribusi image ke private OCI container registry dan arsip tar offline untuk lingkungan air-gapped."
author = "Eddy Wiyatno"
categories = ["How-To", "Container", "Middleware", "Observability"]
tags = ["tomcat", "windows-containers", "nanoserver", "jmx-exporter", "prometheus", "docker", "powershell", "devops", "sysadmin"]
series = ["Apache Tomcat Enterprise Operations"]
toc = true
showSummary = true
+++

{{< lead >}}
**Membangun Container Image Apache Tomcat Ramping (< 450 MB) Berbasis Windows NanoServer dengan Instrumentasi Observabilitas Bawaan**

Pada lingkungan server enterprise dan data center dengan regulasi ketat, server aplikasi kerap berada di jaringan terisolasi (*air-gapped*) tanpa akses internet langsung. Panduan ini membahas teknik menyusun *container image* Apache Tomcat 9.0 native Windows Containers berbasis **NanoServer (ltsc2022)** yang disematkan agent telemetri **Prometheus JMX Exporter** serta multi-versi Java LTS (Eclipse Temurin JRE 11, 17, dan 21) menggunakan satu *Dockerfile* modular, lengkap dengan metode distribusinya ke private OCI registry maupun berkas arsip offline.
{{< /lead >}}

---

## 📌 Mengapa Menggunakan Windows NanoServer + JMX Exporter?

Bagi System Engineer dan System Administrator (SysAdmin) yang mengelola beban kerja berbasis Java di ekosistem Microsoft Windows Server, kombinasi ini memberikan keuntungan operasional yang signifikan:

1. **Ukuran Image Ultra-Ramping (< 450 MB Total):** Base image Windows Server Core berukuran sekitar ~4,5 GB hingga 5 GB. Sebaliknya, **Windows NanoServer (`nanoserver:ltsc2022`)** memangkas subsistem grafis (GDI) dan Win32 legacy, menghasilkan base OS layer hanya ~100–170 MB. Total image setelah digabung dengan Java Runtime, Tomcat, dan JMX Agent berada di kisaran ~430–456 MB.
2. **Observabilitas JVM Native Tanpa Port RMI Terbuka:** Mengaktifkan Remote JMX standar melalui protokol Java RMI membuka risiko keamanan eksploitasi deserialization (*Remote Code Execution*) serta kerumitan *port traversal* di firewall. Menanamkan **Prometheus JMX Exporter Java Agent** langsung ke dalam image memungkinkan metrik internal JVM (Heap Memory, Metaspace, GC pause, dan Tomcat Thread Pools) diekspos melalui endpoint HTTP/HTTPS standar (port 9404) secara aman dan efisien.
3. **Fleksibilitas Multi-Versi Java dengan Satu Dockerfile:** Kebutuhan aplikasi legacy maupun modern dapat dipenuhi cukup dengan satu template Dockerfile modular yang memanfaatkan argumen build (`--build-arg JAVA_TAG=...`), sehingga Anda tidak perlu memelihara banyak Dockerfile terpisah untuk Java 11, 17, dan 21.
4. **Kemandirian di Lingkungan Tertutup (Air-Gapped Ready):** Image yang sudah dibuild dapat didistribusikan ke *private container registry* internal (seperti Gitea, Harbor, Nexus, Artifactory) atau diekspor ke file arsip `.tar` untuk diimpor langsung di server target tanpa memerlukan koneksi ke Docker Hub atau internet publik.
5. **Arsitektur Observabilitas Zero-Rebuild:** Konfigurasi JMX bawaan menyertakan aturan dasar siap pakai serta mendukung mekanisme penimpaan (*override*) otomatis melalui direktori `conf/`, sehingga penambahan metrik atau kustomisasi aturan baru dapat dilakukan sewaktu-waktu tanpa perlu membangun ulang (*rebuild*) citra container.

---

## 🏛️ Arsitektur & Alur Distribusi Image

Proses pembuatan dimulai dari host builder Windows Server yang memiliki akses internet atau file biner lokal, kemudian didistribusikan ke server-server target melalui registry internal atau arsip offline:

{{< mermaid >}}
flowchart TD
    subgraph Build_Host ["Host Windows Server (Docker Engine)"]
        TomcatZip["Biner Apache Tomcat 9.0"]
        NanoBase["Base Image: Eclipse Temurin NanoServer<br/>(Java 11 / 17 / 21)"]
        JmxAgent["Prometheus JMX Exporter<br/>Java Agent JAR + config.yaml"]
        Builder["Docker Engine (windowsfilter)"]
        BuiltImages["Local Container Images:<br/>- tomcat:9.0-jdk11<br/>- tomcat:9.0-jdk17<br/>- tomcat:9.0-jdk21"]
    end

    subgraph Distribution ["Distribusi Image Enterprise"]
        Registry["Private OCI Container Registry<br/>(Gitea / Harbor / Artifactory)"]
        TarArchive["File Arsip Offline (.tar)<br/>(Air-Gapped Deployment)"]
    end

    TomcatZip --> Builder
    NanoBase --> Builder
    JmxAgent --> Builder
    Builder --> BuiltImages
    BuiltImages -->|docker push| Registry
    BuiltImages -->|docker save| TarArchive
{{< /mermaid >}}

---

## 🛠️ Prasyarat Sistem & Kebutuhan

Sebelum memulai tahapan build, pastikan host telah memenuhi spesifikasi berikut:

| Parameter | Spesifikasi / Kebutuhan |
| :--- | :--- |
| **Sistem Operasi Host** | Windows Server 2022 Datacenter (OS Build 20348) atau Windows Server 2019 (OS Build 17763) |
| **Container Engine** | [Docker Engine Community Edition (CE) v27.0+]({{< relref "how-to/install-docker-engine-windows-containers" >}}) dalam mode **Windows Containers** |
| **Hak Akses Shell** | PowerShell 5.1 atau PowerShell 7+ dijalankan sebagai **Administrator** |
| **Konektivitas / Biner** | Akses internet untuk mengunduh biner upstream, ATAU file biner yang telah disiapkan sebelumnya pada folder lokal |
| **Private Registry (Opsional)** | Private OCI Container Registry (misal: Gitea Container Registry, Harbor, Docker Trusted Registry) jika menggunakan metode push jaringan |

> [!IMPORTANT]
> **Kernel Matching pada Windows Containers (Process Isolation):**
> Pada mode *Process Isolation* (performa I/O disk NTFS 100% native), versi build kernel host Windows dan versi base image container **harus identik**:
> - Host Windows Server 2022 (Kernel Build `20348`) $\rightarrow$ gunakan base tag `:ltsc2022`.
> - Host Windows Server 2019 (Kernel Build `17763`) $\rightarrow$ gunakan base tag `:1809` atau `:ltsc2019`.

---

## 🚀 Langkah-Langkah Implementasi

### Langkah 1: Persiapan Direktori Kerja & Unduh Biner Komponen

Jalankan perintah PowerShell berikut di host Windows untuk membuat direktori kerja (`C:\build`) dan mengunduh komponen yang dibutuhkan:

```powershell
# 1. Buat struktur folder build kerja
New-Item -ItemType Directory -Force -Path "C:\build" | Out-Null
Set-Location "C:\build"

# 2. Unduh Apache Tomcat 9.0 binary zip resmi (~11 MB)
$tomcatVersion = "9.0.98"
$tomcatUrl = "https://archive.apache.org/dist/tomcat/tomcat-9/v$tomcatVersion/bin/apache-tomcat-$tomcatVersion.zip"
Write-Host "Mengunduh Apache Tomcat $tomcatVersion..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $tomcatUrl -OutFile "tomcat.zip"

# 3. Ekstrak dan rapikan folder distribusi
Expand-Archive -Path "tomcat.zip" -DestinationPath "temp"
Move-Item "temp\apache-tomcat-$tomcatVersion" "tomcat"
Remove-Item -Recurse -Force "temp", "tomcat.zip"

# 4. Siapkan folder & unduh Prometheus JMX Exporter Java Agent (~500 KB)
New-Item -ItemType Directory -Force -Path "C:\build\jmx-exporter" | Out-Null
$jmxVersion = "1.0.1"
$jmxUrl = "https://repo1.maven.org/maven2/io/prometheus/jmx/jmx_prometheus_javaagent/$jmxVersion/jmx_prometheus_javaagent-$jmxVersion.jar"
Write-Host "Mengunduh Prometheus JMX Exporter v$jmxVersion..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $jmxUrl -OutFile "C:\build\jmx-exporter\jmx_prometheus_javaagent.jar"

# 5. Konfigurasi Standar Prometheus JMX Exporter (Bawaan Citra)
# Aturan ini menangkap metrik Catalina dasar dan wildcard '.*' untuk auto-discovery MBean baru
$jmxConfig = @'
lowercaseOutputLabelNames: true
lowercaseOutputName: true
rules:
  - pattern: 'Catalina<type=GlobalRequestProcessor, name=\"([^\"]+)\"><>(\w+):'
    name: tomcat_request_processor_$2
    labels:
      name: "$1"
  - pattern: 'Catalina<type=ThreadPool, name=\"([^\"]+)\"><>(\w+):'
    name: tomcat_threadpool_$2
    labels:
      name: "$1"
  - pattern: 'Catalina<type=Manager, host=([^,]+), context=([^,]+)><>(activeSessions|maxActive|sessionCounter):'
    name: tomcat_session_$3
    labels:
      host: "$1"
      context: "$2"
  - pattern: '.*'
'@
Set-Content -Path "C:\build\jmx-exporter\config.yaml" -Value $jmxConfig -Encoding ASCII

# 6. Konfigurasi setenv.bat (Defensive JRE_HOME & Hierarchy Fallback JMX)
$setenvContent = @'
@echo off
rem 1. Alihkan JAVA_HOME ke JRE_HOME secara defensif agar catalina.bat tidak memvalidasi javac.exe
if not "%JAVA_HOME%" == "" set "JRE_HOME=%JAVA_HOME%"
set "JAVA_HOME="

rem 2. Logika Hierarchy Fallback JMX Exporter:
rem Prioritaskan custom config dari host bind-mount (%CATALINA_HOME%\conf\jmx-config.yaml) jika ada,
rem atau fallback ke default config bawaan citra (C:\jmx-exporter\config.yaml).
if exist "%CATALINA_HOME%\conf\jmx-config.yaml" (
    set "CATALINA_OPTS=%CATALINA_OPTS% -javaagent:C:\jmx-exporter\jmx_prometheus_javaagent.jar=9404:%CATALINA_HOME%\conf\jmx-config.yaml"
) else if exist "C:\jmx-exporter\config.yaml" (
    set "CATALINA_OPTS=%CATALINA_OPTS% -javaagent:C:\jmx-exporter\jmx_prometheus_javaagent.jar=9404:C:\jmx-exporter\config.yaml"
)
'@

Set-Content -Path "C:\build\tomcat\bin\setenv.bat" -Value $setenvContent -Encoding ASCII
```

> [!NOTE]
> **Mengapa Membutuhkan `setenv.bat` dengan Hierarchy Fallback?**
> 1. **Defensive Bridging `JRE_HOME`:** Image resmi Temurin JRE mengekspor variabel `JAVA_HOME`. Skrip startup `catalina.bat` secara default akan memvalidasi keberadaan compiler `javac.exe` jika `JAVA_HOME` didefinisikan (mengasumsikan JDK penuh terpasang). Mengalihkan nilainya ke `JRE_HOME` membuat Tomcat hanya memvalidasi `java.exe` runtime sehingga dapat berjalan normal di lingkungan JRE murni tanpa memicu error `NB: JAVA_HOME should point to a JDK not a JRE`.
> 2. **Zero-Rebuild Observability Architecture:** Dengan menanamkan `config.yaml` default ke dalam image dan menyematkan logika pengecekan `conf\jmx-config.yaml`:
>    - **Out-of-the-Box:** Container langsung menyajikan metrik Prometheus di port 9404 begitu di-start dengan parameter JMX.
>    - **Bebas Masalah Mount Windows:** Keterbatasan Windows Containers yang tidak mendukung *file bind-mount* dan ancaman *directory shadowing* dapat dihindari sepenuhnya.
>    - **Kustomisasi Tanpa Rebuild:** Jika aplikasi Anda membutuhkan aturan metrik kustom di masa depan, Anda cukup meletakkan file `jmx-config.yaml` di direktori host `conf/` (yang sudah ter-mount via `conf:ro`) tanpa perlu membangun ulang (*rebuild*) citra container!

---

### Langkah 2: Buat Dockerfile Modular Multi-Java

Gunakan sintaks array PowerShell `@(...) | Set-Content` untuk menghasilkan file `C:\build\Dockerfile`. Penggunaan *forward slash* (`/`) pada direktori Windows dianjurkan untuk mencegah kendala *escape character*:

```powershell
@(
    "ARG JAVA_TAG=11-jre-nanoserver-ltsc2022",
    'FROM eclipse-temurin:${JAVA_TAG}',
    'ENV CATALINA_HOME="C:/usr/local/tomcat"',
    'WORKDIR C:/usr/local/tomcat',
    'COPY tomcat .',
    'COPY jmx-exporter C:/jmx-exporter',
    'EXPOSE 8080 8443 9404',
    'CMD ["cmd.exe", "/c", "bin\\catalina.bat", "run"]'
) | Set-Content -Path "C:\build\Dockerfile" -Encoding ASCII

# Verifikasi isi Dockerfile
Get-Content "C:\build\Dockerfile"
```

> [!TIP]
> **Cukup Dibuat Sekali Saja:**
> Baris `ARG JAVA_TAG=11-jre-nanoserver-ltsc2022` hanyalah nilai default awal. Nilai ini akan ditimpa (*override*) secara dinamis pada saat proses build menggunakan parameter `--build-arg JAVA_TAG=...`.

---

### Langkah 3: Build Varian Image Java (JDK/JRE 11, 17, dan 21)

Jalankan perintah build untuk ketiga versi Java LTS yang didukung. Docker Engine akan secara otomatis menarik (*pull*) base image Eclipse Temurin NanoServer terkait dan memasukkan biner Apache Tomcat serta agent JMX ke dalamnya:

```powershell
Set-Location "C:\build"

# 1. Build varian Java 11 LTS
Write-Host "Membangun image Tomcat dengan Java 11..." -ForegroundColor Cyan
docker build --build-arg JAVA_TAG=11-jre-nanoserver-ltsc2022 -t tomcat:9.0-jdk11 .

# 2. Build varian Java 17 LTS
Write-Host "Membangun image Tomcat dengan Java 17..." -ForegroundColor Cyan
docker build --build-arg JAVA_TAG=17-jre-nanoserver-ltsc2022 -t tomcat:9.0-jdk17 .

# 3. Build varian Java 21 LTS
Write-Host "Membangun image Tomcat dengan Java 21..." -ForegroundColor Cyan
docker build --build-arg JAVA_TAG=21-jre-nanoserver-ltsc2022 -t tomcat:9.0-jdk21 .
```

Setelah proses kompilasi selesai, periksa daftar image yang tersedia di repositori Docker lokal:

```powershell
docker images
```

Output yang diharapkan menampilkan ketiga varian image dengan ukuran yang sangat ringkas:

```text
REPOSITORY   TAG        IMAGE ID       CREATED         SIZE
tomcat       9.0-jdk21  406e457bc8ed   1 minute ago    456MB
tomcat       9.0-jdk17  0789b6cb3d6f   2 minutes ago   435MB
tomcat       9.0-jdk11  3b5ceae84cd7   3 minutes ago   430MB
```

> [!NOTE]
> **Solusi Jika Image Berstatus `<none>:<none>`:**
> Jika opsi `-t` terpotong saat eksekusi, image tetap berhasil dibuild namun belum memiliki nama/tag. Anda tidak perlu mengulang proses build, cukup berikan tag secara manual menggunakan Image ID:
> ```powershell
> docker tag <IMAGE_ID> tomcat:9.0-jdk17
> ```

---

### Langkah 4: Publikasi & Distribusi Image

Terdapat dua metode distribusi image ke server produksi target:

#### Metode A: Private OCI Container Registry (Direkomendasikan untuk Jaringan Enterprise)

Metode ini paling efisien jika server produksi Anda dapat menjangkau server *container registry* internal (misal: Gitea Container Registry, Harbor, Nexus, Artifactory, atau Docker Registry v2).

1. **Daftarkan Insecure Registry (Jika Menggunakan HTTP Tanpa Sertifikat Publik):**
   Jika server registry internal Anda berjalan di atas protokol HTTP atau sertifikat *self-signed*, daftarkan alamatnya ke `C:\ProgramData\docker\config\daemon.json`:

   ```powershell
   # 1. Pastikan folder konfigurasi docker tersedia
   $configDir = "C:\ProgramData\docker\config"
   if (-not (Test-Path $configDir)) {
       New-Item -ItemType Directory -Force -Path $configDir | Out-Null
   }

   # 2. Tambahkan alamat registry ke array insecure-registries
   $registryAddress = "registry.internal.corp:5000"  # Sesuaikan dengan domain/IP registry Anda
   $configPath = "$configDir\daemon.json"
   $json = if (Test-Path $configPath) { Get-Content $configPath -Raw | ConvertFrom-Json } else { @{} }

   $currentInsecure = @($json.'insecure-registries')
   if ($currentInsecure -notcontains $registryAddress) {
       $json | Add-Member -NotePropertyName "insecure-registries" -NotePropertyValue ($currentInsecure + $registryAddress) -Force
       $json | ConvertTo-Json -Depth 5 | Set-Content $configPath -Encoding ASCII
       Write-Host "Merestart Docker Engine untuk memuat konfigurasi registry..." -ForegroundColor Yellow
       Restart-Service docker
   }
   ```

2. **Login, Berikan Tag, dan Push ke Registry:**

   ```powershell
   $registry = "registry.internal.corp:5000"
   $namespace = "devops"

   # Login ke registry
   docker login $registry

   # Tag image sesuai format OCI: <registry>/<namespace>/<repository>:<tag>
   docker tag tomcat:9.0-jdk11 "$registry/$namespace/tomcat:9.0-jdk11"
   docker tag tomcat:9.0-jdk17 "$registry/$namespace/tomcat:9.0-jdk17"
   docker tag tomcat:9.0-jdk21 "$registry/$namespace/tomcat:9.0-jdk21"

   # Push image ke registry
   docker push "$registry/$namespace/tomcat:9.0-jdk11"
   docker push "$registry/$namespace/tomcat:9.0-jdk17"
   docker push "$registry/$namespace/tomcat:9.0-jdk21"
   ```

3. **Menarik (*Pull*) Image di Server Target:**
   Di server target, image siap diunduh kapan saja tanpa membutuhkan koneksi internet:

   ```powershell
   docker pull registry.internal.corp:5000/devops/tomcat:9.0-jdk17
   ```

---

#### Metode B: Ekspor Arsip File `.tar` (Solusi untuk Jaringan Air-Gapped Murni)

Jika server produksi terisolasi secara fisik tanpa ada jaringan ke registry OCI, Anda dapat mengekspor image menjadi berkas arsip `.tar`:

1. **Simpan (*Save*) Image ke File `.tar` di Host Windows:**

   ```powershell
   New-Item -ItemType Directory -Force -Path "C:\images-archive" | Out-Null

   Write-Host "Mengekspor image ke file arsip..." -ForegroundColor Cyan
   docker save -o "C:\images-archive\tomcat-9.0-jdk11.tar" tomcat:9.0-jdk11
   docker save -o "C:\images-archive\tomcat-9.0-jdk17.tar" tomcat:9.0-jdk17
   docker save -o "C:\images-archive\tomcat-9.0-jdk21.tar" tomcat:9.0-jdk21
   ```

2. **Pindahkan File ke Server Target:**
   Kirimkan berkas `.tar` ke server target melalui SCP, SFTP, shared storage, atau media penyimpanan USB fisik.

3. **Impor (*Load*) Image di Server Produksi Offline:**
   Di server target, jalankan perintah `docker load`:

   ```powershell
   docker load -i "C:\images-archive\tomcat-9.0-jdk17.tar"

   # Verifikasi bahwa image telah terdaftar
   docker images
   ```

---

### Langkah 5: Smoke Test & Verifikasi Runtime

Untuk memastikan image yang telah dibuild berfungsi dengan baik, jalankan uji coba kontainer dengan mempublikasikan port HTTP aplikasi (8080) dan port Prometheus JMX Exporter (9404):

```powershell
# 1. Jalankan container uji coba
docker run -d --name tomcat-test -p 8080:8080 -p 9404:9404 tomcat:9.0-jdk17

# 2. Tunggu beberapa detik dan cek status container
docker ps

# 3. Periksa log bootstrap Tomcat (pastikan Java Agent JMX aktif)
docker logs tomcat-test

# 4. Uji respons HTTP aplikasi web Tomcat (port 8080)
Invoke-WebRequest -Uri "http://localhost:8080/" -UseBasicParsing | Select-Object StatusCode, StatusDescription

# 5. Uji respons endpoint metrik Prometheus JMX Exporter (port 9404)
$metricsResponse = Invoke-WebRequest -Uri "http://localhost:9404/metrics" -UseBasicParsing
[PSCustomObject]@{
    StatusCode        = $metricsResponse.StatusCode
    StatusDescription = $metricsResponse.StatusDescription
    SampleMetrics     = ($metricsResponse.Content -split "`n" | Where-Object { $_ -match "^(jvm_|tomcat_)" } | Select-Object -First 3) -join " | "
}
```

Jika output `StatusCode` untuk port 8080 bernilai `200` atau `404`, dan port 9404 mengembalikan metrik Prometheus (HTTP 200), berarti Tomcat dan agen observabilitas JMX telah aktif sempurna!

Setelah pengujian selesai, bersihkan container uji coba:

```powershell
docker rm -f tomcat-test
```

---

### Langkah 6: Praktik Kustomisasi & Menambah Metrik JMX Baru Tanpa Rebuild Citra (Zero-Rebuild Override)

Salah satu keunggulan terbesar dari arsitektur *Hierarchy Fallback* pada skrip `setenv.bat` adalah Anda **tidak perlu me-rebuild image Docker** saat ingin menambahkan metrik baru, memonitor MBean aplikasi tertentu, atau mengubah konvensi penamaan telemetri.

Berikut tutorial praktis langkah-demi-langkah cara mengubah konfigurasi JMX langsung dari host Windows:

#### 1. Skenario Kebutuhan: Menambahkan Monitoring Database Pool & Servlet
Katakanlah aplikasi enterprise Anda menambahkan *connection pool* **HikariCP** (`com.zaxxer.hikari`) dan Anda ingin mengekspos metrik koneksi aktif, idle, serta waktu pemrosesan servlet tertentu.

#### 2. Buat Berkas `jmx-config.yaml` pada Direktori Host `conf\`
Di host Windows, buat file `jmx-config.yaml` langsung di dalam folder bind-mount `conf/` instance Tomcat Anda (misal `C:\tomcats\tomcat-lab\conf\jmx-config.yaml`):

```powershell
$customJmx = @'
lowercaseOutputLabelNames: true
lowercaseOutputName: true
rules:
  # 1. Aturan Standar Tomcat (Request & ThreadPool)
  - pattern: 'Catalina<type=GlobalRequestProcessor, name=\"([^\"]+)\"><>(\w+):'
    name: tomcat_request_processor_$2
    labels:
      name: "$1"
  - pattern: 'Catalina<type=ThreadPool, name=\"([^\"]+)\"><>(\w+):'
    name: tomcat_threadpool_$2
    labels:
      name: "$1"

  # 2. METRIK TAMBAHAN BARU: Database Connection Pool (HikariCP)
  - pattern: 'com.zaxxer.hikari<type=Pool \((.+)\)><>(ActiveConnections|IdleConnections|TotalConnections|ThreadsAwaitingConnection):'
    name: app_hikaricp_$2
    labels:
      pool: "$1"
    type: GAUGE

  # 3. METRIK TAMBAHAN BARU: Waktu Eksekusi Servlet & Error Count
  - pattern: 'Catalina<j2eeType=Servlet, name=([^,]+), WebModule=([^,]+), J2EEApplication=none, J2EEServer=none><>(processingTime|requestCount|errorCount):'
    name: tomcat_servlet_$3
    labels:
      servlet: "$1"
      module: "$2"

  # 4. Fallback Catch-All Wildcard (Otomatis Tangkap MBean Lainnya)
  - pattern: '.*'
'@

# Tulis berkas ke folder conf host yang sudah di-mount ke container
Set-Content -Path "C:\tomcats\tomcat-lab\conf\jmx-config.yaml" -Value $customJmx -Encoding ASCII
```

#### 3. Terapkan Konfigurasi Baru (Cukup Restart atau Rollout)
Karena direktori host `conf/` terhubung ke kontainer melalui bind mount (`conf:ro`), kontainer cukup di-restart atau di-rollout tanpa perlu membuang image atau melakukan build ulang:

- **Jika Menggunakan Operator `tcctl`:**
  ```powershell
  # Opsi A: Restart cepat
  docker restart tomcat-lab

  # Opsi B: Zero-Downtime Rollout (Rekomendasi Staging/Production)
  tcctl deploy rollout --name tomcat-lab --port 8080 --staging-port 9080 --jmx --base-dir C:/tomcats
  ```
- **Jika Menggunakan Docker CLI Standar:**
  ```powershell
  docker run -d --name tomcat-lab `
    -p 8080:8080 -p 9404:9404 `
    -v "C:\tomcats\tomcat-lab\conf:C:\usr\local\tomcat\conf:ro" `
    tomcat:9.0-jdk17
  ```

Saat Tomcat melakukan *bootstrap*, skrip `setenv.bat` otomatis mendeteksi:
```cmd
if exist "%CATALINA_HOME%\conf\jmx-config.yaml"
```
Karena file tersebut ditemukan di folder `conf`, Java Agent JMX langsung memuat konfigurasi kustom tersebut, **mengabaikan konfigurasi default image tanpa menyentuh satu pun layer Docker**.

#### 4. Verifikasi Metrik Baru di Endpoint `/metrics`
Uji apakah metrik baru HikariCP dan Servlet sudah berhasil diekspos oleh Prometheus JMX Exporter:

```powershell
# Filter output metrik baru dari endpoint port 9404
(Invoke-WebRequest -Uri "http://localhost:9404/metrics" -UseBasicParsing).Content -split "`n" | Select-String -Pattern "app_hikaricp|tomcat_servlet"
```

Output yang diharapkan menampilkan deretan metrik time-series baru yang siap di-scrape oleh server Prometheus:
```text
app_hikaricp_ActiveConnections{pool="HikariPool-1",} 5.0
app_hikaricp_IdleConnections{pool="HikariPool-1",} 15.0
tomcat_servlet_processingTime{module="//localhost/",servlet="dispatcherServlet",} 142.0
```

---

## 🛠️ Tips Operasional & Troubleshooting SysAdmin

### 1. Jebakan Indentasi Here-String PowerShell (Stuck pada Prompt `>>`)
Saat menyalin skrip yang menggunakan sintaks *Here-String* (`@' ... '@`) langsung ke konsol terminal:
- Tanda penutup `'@` **wajib berada persis di karakter pertama baris baru** tanpa spasi atau tab sama sekali.
- Jika ada spasi di depan `'@`, PowerShell tidak akan menganggapnya sebagai penutup blok teks, sehingga terminal akan *stuck* menunggu input baris baru dengan menampilkan prompt `>>`.
- **Solusi:** Tekan `Ctrl + C` untuk membatalkan eksekusi, dan gunakan sintaks array string `@( ... ) | Set-Content` yang kebal terhadap masalah spasi dan indentasi.

### 2. Error "Could not find a part of the path C:\ProgramData\docker\config\daemon.json"
Secara default, instalasi baru Docker CE di Windows Server tidak otomatis membuat subfolder `config` di dalam direktori `C:\ProgramData\docker`.
- Perintah PowerShell `Set-Content` akan melempar error `DirectoryNotFoundException` jika direktori induk belum ada.
- **Solusi:** Selalu jalankan `New-Item -ItemType Directory -Force -Path "C:\ProgramData\docker\config"` sebelum mencoba menulis atau memodifikasi file `daemon.json`.

### 3. Mengapa Menggunakan Base Image JRE Headless (Klarifikasi Label JDK vs JRE)
- **NanoServer (`nanoserver:ltsc2022`) + JRE:** Merupakan sistem operasi kontainer Windows paling ramping (~100–170 MB). Base image menggunakan **Eclipse Temurin JRE** tanpa compiler `javac.exe` dan pustaka grafis Win32/GDI untuk menjaga ukuran image tetap ultra-ringan (< 450 MB).
- **Kompilasi JSP Tetap Bekerja:** Apache Tomcat secara default menyertakan Eclipse Compiler for Java (`ecj-*.jar`) di dalam direktori `lib/`, sehingga aplikasi tetap dapat mengompilasi berkas JSP secara runtime di lingkungan JRE murni.
- **Konvensi Penamaan Tag:** Tag image diberi label `tomcat:9.0-jdk11` / `jdk17` / `jdk21` semata-mata sebagai konvensi industri untuk mengindikasikan level platform bahasa Java yang didukung, bukan berarti di dalamnya terdapat paket JDK penuh (*development kit*).

### 4. Mengatasi Error "server gave HTTP response to HTTPS client"
Jika saat menjalankan `docker push` atau `docker pull` muncul error:
```text
Error response from daemon: Get "https://registry.internal.corp:5000/v2/": http: server gave HTTP response to HTTPS client
```
Penyebabnya adalah Docker client secara default selalu mencoba koneksi aman TLS/HTTPS. Daftarkan nama domain/IP registry tersebut ke dalam array `insecure-registries` pada `C:\ProgramData\docker\config\daemon.json`, kemudian restart daemon dengan perintah `Restart-Service docker`.

### 5. Jebakan Directory Shadowing & Strategi Menambah Metrik JMX Baru Tanpa Rebuild Citra
Dalam ekosistem Windows Containers, terdapat dua aturan penting terkait bind mount dan JMX:
1. **Windows Containers Tidak Mendukung File Bind-Mount:** Anda tidak dapat me-mount file tunggal seperti `-v C:\host\config.yaml:C:\jmx-exporter\config.yaml`.
2. **Bahaya Directory Shadowing:** Jangan sekali-kali mencoba me-mount direktori host ke `C:\jmx-exporter` (misal `-v C:\host\jmx:C:\jmx-exporter`), karena berkas `jmx_prometheus_javaagent.jar` di dalam image akan **tertimpa dan lenyap (*shadowed*)**, menyebabkan JVM gagal start dengan error `agent library failed to init: instrument`.

**Solusi Zero-Rebuild saat Ingin Menambah Metrik Baru:**
- **Kasus A (Auto-Discovery MBean Baru):** Image ini telah dilengkapi aturan wildcard `pattern: '.*'`. Jika aplikasi menambahkan *connection pool* baru (misal HikariCP, DBCP), metrik Spring Boot, atau custom Java MXBean, metrik tersebut **otomatis terdeteksi dan muncul di port 9404** tanpa perlu ubah konfigurasi apa pun.
- **Kasus B (Kustomisasi Format / Filter Aturan Khusus):** Anda **tidak perlu me-rebuild image**. Berkat arsitektur *Hierarchy Fallback*, cukup letakkan berkas kustom Anda di dalam direktori host `conf\` (misal `C:\tomcats\<instance>\conf\jmx-config.yaml` yang di-mount secara aman via `conf:ro`). Skrip `setenv.bat` akan otomatis memprioritaskan berkas tersebut dibandingkan konfigurasi bawaan image (panduan langkah-demi-langkah tersedia pada **[Langkah 6: Praktik Kustomisasi & Menambah Metrik JMX Baru](#langkah-6-praktik-kustomisasi--menambah-metrik-jmx-baru-tanpa-rebuild-citra-zero-rebuild-override)**).

### 6. Sinergi dengan Operator tcctl & Mekanisme setenv.bat di Host (TC-ADR-0010)
Jika Anda menggunakan operator CLI enterprise [**`tcctl`**]({{< relref "how-to/deploy-tomcat-container-windows-server-tcctl" >}}):
- **Otomasi JMX Port & Probing:** Cukup jalankan perintah `tcctl deploy run --jmx`, maka port 9404 otomatis dipublikasikan dan diverifikasi oleh health-probe bawaan `tcctl`.
- **Mengapa Host `bin/` Di-mount ke `bin/custom:ro`?** `tcctl` me-mount folder `bin` host ke `C:\usr\local\tomcat\bin\custom:ro` (bukan ke `bin/`) agar biner inti Tomcat di dalam image (`catalina.bat`, `bootstrap.jar`, `setenv.bat`) tidak tertimpa (*directory shadowing*).
- **Injeksi Dinamis `CATALINA_OPTS`:** `tcctl` membaca parameter memori JVM dari `setenv.bat` di host dan menyuntikkannya ke container via flag `-e CATALINA_OPTS="..."`. Skrip `setenv.bat` internal di dalam image NanoServer kemudian menggabungkan (*append*) opsi memori tersebut dengan argumen Java Agent JMX secara harmonis.

---

## 📚 Referensi Terkait

- [Panduan Praktis: Implementasi Pure Pull-Based GitOps dan Otomasi CI Promotion Apache Tomcat di Windows Server]({{< relref "how-to/implement-pure-pull-based-gitops-and-ci-promotion-tomcat" >}})
- [Panduan Praktis: Deploy Kontainer Apache Tomcat di Windows Server Menggunakan tcctl]({{< relref "how-to/deploy-tomcat-container-windows-server-tcctl" >}})
- [Panduan Praktis: Instalasi Docker Engine Community Edition (CE) v27+ di Windows Server]({{< relref "how-to/install-docker-engine-windows-containers" >}})
- [Microsoft Windows Container Base Images Documentation](https://learn.microsoft.com/en-us/virtualization/windows-containers/manage-images/container-base-images)
- [Eclipse Temurin Official Container Images (Docker Hub)](https://hub.docker.com/_/eclipse-temurin)
- [Prometheus JMX Exporter Official Repository](https://github.com/prometheus/jmx_exporter)
- [Apache Tomcat Official Archive Downloads](https://archive.apache.org/dist/tomcat/)
