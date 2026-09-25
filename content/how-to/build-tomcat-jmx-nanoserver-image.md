+++
title = "Panduan Praktis: Build Image Container Apache Tomcat + Prometheus JMX Exporter + JDK di Windows NanoServer"
date = "2026-09-25T16:50:00+07:00"
draft = false
summary = "Panduan langkah-demi-langkah membangun container image Apache Tomcat 9.0 native Windows NanoServer yang dilengkapi instrumentasi Prometheus JMX Exporter dan multi-versi Eclipse Temurin JDK/JRE (11, 17, 21). Mengupas pembuatan Dockerfile modular, mekanisme setenv.bat untuk JRE_HOME dan Java Agent, hingga dua metode distribusi image ke private OCI container registry dan arsip tar offline untuk lingkungan air-gapped."
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

---

## 🏛️ Arsitektur & Alur Distribusi Image

Proses pembuatan dimulai dari host builder Windows Server yang memiliki akses internet atau file biner lokal, kemudian didistribusikan ke server-server target melalui registry internal atau arsip offline:

{{< mermaid >}}
flowchart TD
    subgraph Build_Host ["Host Windows Server (Docker Engine)"]
        TomcatZip["Biner Apache Tomcat 9.0"]
        NanoBase["Base Image: Eclipse Temurin NanoServer<br/>(Java 11 / 17 / 21)"]
        JmxAgent["Prometheus JMX Exporter<br/>Java Agent JAR"]
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
| **Container Engine** | [Docker Engine Community Edition (CE) v27.0+]({{< ref "how-to/install-docker-engine-windows-containers" >}}) dalam mode **Windows Containers** |
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

# 5. Konfigurasi setenv.bat (Bridging JRE_HOME & Instrumentasi JMX Opsional)
$setenvContent = @'
@echo off
rem Alihkan JAVA_HOME ke JRE_HOME agar catalina.bat tidak memvalidasi javac.exe
set "JRE_HOME=%JAVA_HOME%"
set "JAVA_HOME="

rem Aktifkan Prometheus JMX Java Agent secara otomatis jika file konfigurasi tersedia
if exist "C:\jmx-exporter\config.yaml" (
    set "CATALINA_OPTS=%CATALINA_OPTS% -javaagent:C:\jmx-exporter\jmx_prometheus_javaagent.jar=9404:C:\jmx-exporter\config.yaml"
)
'@

Set-Content -Path "C:\build\tomcat\bin\setenv.bat" -Value $setenvContent -Encoding ASCII
```

> [!NOTE]
> **Mengapa Membutuhkan `setenv.bat`?**
> 1. **Bridging `JRE_HOME`:** Image resmi Temurin JRE mengekspor variabel `JAVA_HOME`. Skrip startup `catalina.bat` secara default akan memvalidasi keberadaan compiler `javac.exe` jika `JAVA_HOME` didefinisikan (mengasumsikan JDK penuh terpasang). Mengalihkan nilainya ke `JRE_HOME` membuat Tomcat hanya memvalidasi `java.exe` runtime sehingga dapat berjalan normal di lingkungan JRE murni.
> 2. **Instrumentasi JMX Dinamis:** Dengan menyematkan logika `if exist "C:\jmx-exporter\config.yaml"`, image ini tetap fleksibel: saat berjalan tanpa file konfigurasi JMX, Tomcat berfungsi seperti biasa. Saat Anda menyuntikkan konfigurasi via *host bind-mount*, Prometheus JMX Exporter otomatis aktif di port 9404 tanpa perlu mengubah image.

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

Untuk memastikan image yang telah dibuild berfungsi dengan baik, jalankan uji coba kontainer sederhana:

```powershell
# 1. Jalankan container uji coba di port 8080
docker run -d --name tomcat-test -p 8080:8080 -p 9404:9404 tomcat:9.0-jdk17

# 2. Tunggu beberapa detik dan cek status container
docker ps

# 3. Periksa log bootstrap Tomcat
docker logs tomcat-test

# 4. Uji respons HTTP
Invoke-WebRequest -Uri "http://localhost:8080/" -UseBasicParsing | Select-Object StatusCode, StatusDescription
```

Jika output `StatusCode` bernilai `404` atau `200`, Tomcat telah berhasil menyala dan siap melayani permintaan. Setelah pengujian selesai, bersihkan container uji coba:

```powershell
docker rm -f tomcat-test
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

### 3. Mengapa NanoServer Hanya Mendukung Java 11 ke Atas?
- **NanoServer (`nanoserver:ltsc2022`):** Merupakan sistem operasi kontainer Windows paling ramping (~100–170 MB). NanoServer sengaja menghilangkan subsistem grafis Win32, konsol legasi GDI, dan font library. Java 11, 17, dan 21 telah didesain *headless-native* sehingga berjalan sempurna di atas NanoServer.
- **Java 8 (Legacy Dependency):** Java 8 memerlukan pustaka DLL Win32 tertentu dan subsistem font sistem yang tidak ada di NanoServer. Jika aplikasi Anda mutlak membutuhkan Java 8, Anda **wajib** menggunakan base image **ServerCore (`servercore:ltsc2022`)** yang memiliki dependensi lengkap namun berukuran sekitar ~4,5 GB.

### 4. Mengatasi Error "server gave HTTP response to HTTPS client"
Jika saat menjalankan `docker push` atau `docker pull` muncul error:
```text
Error response from daemon: Get "https://registry.internal.corp:5000/v2/": http: server gave HTTP response to HTTPS client
```
Penyebabnya adalah Docker client secara default selalu mencoba koneksi aman TLS/HTTPS. Daftarkan nama domain/IP registry tersebut ke dalam array `insecure-registries` pada `C:\ProgramData\docker\config\daemon.json`, kemudian restart daemon dengan perintah `Restart-Service docker`.

---

## 📚 Referensi Terkait

- [Panduan Praktis: Instalasi Docker Engine Community Edition (CE) v27+ di Windows Server]({{< ref "how-to/install-docker-engine-windows-containers" >}})
- [Panduan Praktis: Deploy Kontainer Apache Tomcat di Windows Server Menggunakan tcctl]({{< ref "how-to/deploy-tomcat-container-windows-server-tcctl" >}})
- [Microsoft Windows Container Base Images Documentation](https://learn.microsoft.com/en-us/virtualization/windows-containers/manage-images/container-base-images)
- [Eclipse Temurin Official Container Images (Docker Hub)](https://hub.docker.com/_/eclipse-temurin)
- [Prometheus JMX Exporter Official Repository](https://github.com/prometheus/jmx_exporter)
- [Apache Tomcat Official Archive Downloads](https://archive.apache.org/dist/tomcat/)
