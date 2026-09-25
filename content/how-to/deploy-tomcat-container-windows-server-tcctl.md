+++
title = "Panduan Praktis: Deploy Kontainer Apache Tomcat Hardened di Windows Server Menggunakan tcctl"
date = "2026-09-25T14:00:00+07:00"
draft = false
summary = "Panduan langkah-demi-langkah mengorkestrasi kontainer Apache Tomcat enterprise di atas Windows Server menggunakan operator CLI tcctl. Mengupas tata kelola host bind-mount immutable (conf:ro), bootstrapping otomatis TLS PKCS#12, pre-flight audit kepatuhan CIS Benchmark, hingga verifikasi runtime tanpa friksi."
author = "Eddy Wiyatno"
categories = ["How-To", "Middleware", "Container"]
tags = ["tomcat", "windows-containers", "tcctl", "docker", "security", "cis-benchmark", "sre", "powershell"]
series = ["Apache Tomcat Enterprise Operations"]
toc = true
showSummary = true
+++

{{< lead >}}
**Orkestrasi Kontainer Tomcat Skala Produksi di Windows Server dalam Satu Perintah Terpadu**

Menjalankan beban kerja Java/Tomcat pada Windows Containers kerap terbentur friksi perizinan akun non-admin `ContainerUser`, manipulasi path backslash, konfigurasi manual SSL/TLS, serta kerentanan konfigurasi XML. Panduan ini mendemonstrasikan bagaimana modul `tcctl deploy` mengotomatiskan seluruh alur deployment kontainer yang aman, sesuai standar CIS Benchmark, dan siap produksi.
{{< /lead >}}

---

## 📌 Mengapa Menggunakan `tcctl` untuk Kontainer Windows?

Bagi tim DevOps dan SRE yang mengelola fleet server heterogen, men-deploy Apache Tomcat di atas **Windows Server (Docker Engine)** secara manual sering kali menimbulkan sejumlah kendala operasional:

1. **Perizinan & Keamanan Runtime:** Banyak operator tergoda menjalankan kontainer dengan user `ContainerAdministrator` untuk menghindari error *Access Denied* pada bind-mount, yang melanggar prinsip *Least Privilege*.
2. **Kompleksitas Sertifikat HTTPS:** Pembuatan keystore Java (JKS/PKCS#12) dan penyelarasan cipher suite pada `server.xml` memakan waktu serta rawan salah ketik (*syntax escape error* pada path Windows).
3. **Konfigurasi Tidak Terstandarisasi:** Tidak adanya mekanisme validasi pre-flight menyebabkan kontainer berjalan dengan port shutdown default (`8005`) aktif, banner informasi server bocor, atau tanpa proteksi cookie HTTP header security.

Operator CLI **`tcctl`** menyelesaikan seluruh kendala tersebut secara native melalui perintah `tcctl deploy run`, mengemas standar arsitektur enterprise (**TC-ADR-0009**) ke dalam otomasi terpadu.

---

## 🏛️ Alur Kerja Deployment Kontainer

{{< mermaid >}}
flowchart TD
    A["Operator: tcctl deploy run"] --> B["Deteksi Engine & Menu Pemilihan Citra"]
    B --> C["Siapkan Hierarki Host Bind-Mount C:/tomcats/[instance] (bin, conf, webapps, logs)"]
    C --> D["Auto-Seed setenv.bat & Injeksi Dinamis CATALINA_OPTS"]
    D --> E["Bootstrapping Otomatis TLS PKCS#12 Keystore"]
    E --> F["Injeksi Baseline Hardened XML (server.xml, web.xml)"]
    F --> G["Pre-flight CIS Static XML Audit (9 Rules)"]
    G -->|Lolos 100%| H["Docker Run: User ContainerUser & conf:ro"]
    H --> I["Probing HTTP 8080 & HTTPS 8443 Healthcheck"]
    I --> J["Ekstraksi Versi Runtime (Tomcat & OpenJDK)"]
    J --> K["Tampilkan Deploy Result Summary Siap Pakai"]
{{< /mermaid >}}

---

## 🛠️ Prasyarat Lingkungan

Sebelum memulai, pastikan host target telah memenuhi prasyarat berikut:

| Komponen | Spesifikasi / Kebutuhan |
| :--- | :--- |
| **Sistem Operasi** | Windows Server 2022 Datacenter (LTSC) atau Windows Server 2019 (Build 17763+) |
| **Container Engine** | [Docker Engine Community Edition v27.0+]({{< ref "how-to/install-docker-engine-windows-containers" >}}) (mode Windows Containers aktif) |
| **Operator CLI** | Biner `tcctl` terpasang di `C:\Program Files\tcctl\` dan terdaftar pada `$env:Path` |
| **Hak Akses Shell** | PowerShell 5.1 atau PowerShell 7+ dijalankan sebagai **Administrator** |
| **Container Image** | Image berbasis Windows NanoServer (misal `tomcat:9.0-jdk11` lokal atau dari private registry) |

---

## 🚀 Langkah 1: Verifikasi Engine & Tooling

Buka konsol **PowerShell as Administrator** dan pastikan Docker Engine serta `tcctl` siap beroperasi:

```powershell
# 1. Pastikan Docker Engine berjalan dalam mode Windows Containers
docker version --format '{{.Server.Os}}'
# Output yang diharapkan: windows

# 2. Pastikan tcctl dapat dieksekusi dari direktori mana pun
tcctl version

# 3. Periksa ketersediaan image Tomcat NanoServer di repository lokal
docker images "tomcat*"
```

---

## 🚀 Langkah 2: Eksekusi Deployment Interaktif

Jalankan sub-command deployment dengan menentukan nama instance serta mapping port HTTP dan HTTPS:

```powershell
tcctl deploy run --name tomcat-lab --port 8080 --https-port 8443
```

### Menu Pemilihan Image Otomatis
`tcctl` secara cerdas akan memindai image Tomcat/Java yang tersedia di host dan menampilkan menu pilihan interaktif:

```text
ℹ Discovered available Tomcat / Java images in local container repository:
   [1] tomcat:9.0-jdk11
   [2] localhost/tomcat:9.0-jdk17
   [3] localhost/tomcat:9.0-jdk21
 Select image to deploy [1-3] (default: 1): 1
✔ Selected image: tomcat:9.0-jdk11
```

> [!TIP]
> **Deployment Non-Interaktif (CI/CD / Skrip Automasi):**  
> Anda dapat melewatkan prompt interaktif dengan menambahkan argumen `--image` dan target drive `--base-dir`:
> ```powershell
> tcctl deploy run --name core-app --image tomcat:9.0-jdk17 --port 8080 --https-port 8443 --base-dir D:\tomcats
> ```

---

## 🔍 Langkah 3: Memahami Otomasi di Balik Layar

Ketika perintah dijalankan, `tcctl` secara deterministik melakukan tahapan keamanan tanpa memerlukan intervensi manual:

### 1. Provisioning Hierarki Host Bind-Mount (TC-ADR-0009 / TC-ADR-0010)
`tcctl` membangun struktur direktori terisolasi pada host:
- `C:\tomcats\tomcat-lab\bin\` — Direktori environment Java & tuning memori (`setenv.bat`).
- `C:\tomcats\tomcat-lab\conf\` — Konfigurasi XML hardened.
- `C:\tomcats\tomcat-lab\conf\ssl\` — Keystore dan material sertifikat TLS.
- `C:\tomcats\tomcat-lab\webapps\` — Direktori aplikasi target (`.war` / exploded).
- `C:\tomcats\tomcat-lab\logs\` — Log persisten Catalina untuk audit forensik.

### 2. Auto-Seeding `setenv.bat` & Pre-Flight Injeksi `CATALINA_OPTS` (TC-ADR-0010)
Secara otomatis men-generate template `setenv.bat` dengan opsi container-aware:
```cmd
set "CATALINA_OPTS=-XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=50.0 -XX:+UseG1GC -XX:+UseStringDeduplication -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Jakarta -Djava.awt.headless=true"
```
`tcctl` membaca parameter ini dari file host dan menginjeksikannya secara dinamis ke environment runtime Docker (`-e CATALINA_OPTS=...`), serta me-mount direktori `bin/` ke `C:\usr\local\tomcat\bin\custom:ro`. Pola ini memecahkan batasan *single-file bind mount* Windows dan mencegah biner inti Tomcat tertimpa (*directory shadowing*).

### 3. Bootstrapping Kriptografi TLS PKCS#12
Secara otomatis men-generate keystore standar industri `keystore.p12` (password default: `changeit`) beserta sertifikat ganda format PEM (`cert.pem`, `server.crt`) untuk kompatibilitas inspeksi tools monitoring.

### 4. Injeksi & Penyelarasan Hardened XML
Menyuntikkan baseline XML yang telah dikonfigurasi untuk membaca keystore HTTPS Connector (`:8443`) dengan protokol aman TLSv1.2 dan TLSv1.3.

### 5. Pre-Flight CIS Static XML Audit
Sebelum kontainer diluncurkan, parser XML internal memverifikasi **9 aturan CIS Benchmark**:
- Menonaktifkan Server Shutdown port (`port="-1"`).
- Menyamarkan Server Header info (`xpoweredBy="false"`, `server="Apache Tomcat"`).
- Mengaktifkan `ErrorReportValve` dengan `showServerInfo="false"` dan `showReport="false"`.
- Mengaktifkan `HttpHeaderSecurityFilter` (HSTS, Anti-Clickjacking `X-Frame-Options`, `X-Content-Type-Options`).
- Mengamankan Session Cookie (`HttpOnly`, `Secure`, `SameSite="strict"`).

### 6. Peluncuran Kontainer dengan Proteksi Immutability
Kontainer dijalankan menggunakan user non-privilege **`ContainerUser`**, dan direktori konfigurasi host dimounting dengan opsi **Read-Only (`:ro`)**:
```text
C:\tomcats\tomcat-lab\conf -> C:\usr\local\tomcat\conf:ro
```
Pola ini menjamin kontainer tidak dapat dimodifikasi konfigurasinya dari dalam secara ilegal saat runtime.

---

## 📊 Hasil Eksekusi & Ringkasan Runtime

Setelah container aktif, health check probe akan memvalidasi endpoint dan menampilkan ringkasan operasional:

```text
========================================================
 Deploying Hardened Tomcat Container: tomcat-lab
========================================================
ℹ Detected Container Engine: docker
ℹ Step 1: Preparing Host Bind-Mount Directory Structure in C:/tomcats/tomcat-lab...
✔ Environment configuration templates (setenv) verified in 'C:/tomcats/tomcat-lab/bin'.
ℹ Step 2: Auditing XML in Host Directory (C:/tomcats/tomcat-lab/conf)...
✔ Pre-flight XML audit on Host Directory passed (100% compliant).
ℹ Loaded JVM options from host setenv (C:/tomcats/tomcat-lab/bin): -XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=50.0 -XX:+UseG1GC -XX:+UseStringDeduplication -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Jakarta -Djava.awt.headless=true
ℹ Step 3: Launching container 'tomcat-lab' (image: tomcat:9.0-jdk11) via docker...
✔ Container started successfully (ID: 2041af9c8135)
ℹ Step 4: Probing HTTP healthcheck endpoint: http://localhost:8080/
✔ Tomcat HTTP Server is HEALTHY (Response status: 404)
✔ HTTP healthcheck probe passed.
✔ Tomcat instance 'tomcat-lab' is up, running, and fully hardened!

 Runtime Environment:
   - Container Image : tomcat:9.0-jdk11
   - Tomcat Version  : Apache Tomcat/9.0.98
   - Java / JDK      : 11.0.32+9 (Eclipse Adoptium)

 Endpoints:
   - HTTP    : http://localhost:8080/
   - HTTPS   : https://localhost:8443/

 Host Bind Mounts (TC-ADR-0009 / TC-ADR-0010):
   - Base Dir : C:/tomcats
   - Bin      : C:/tomcats/tomcat-lab/bin (Environment & setenv)
   - Conf     : C:/tomcats/tomcat-lab/conf (Read-Only :ro)
   - Webapps  : C:/tomcats/tomcat-lab/webapps
   - Logs     : C:/tomcats/tomcat-lab/logs
```

---

## 🧪 Langkah 4: Validasi & Audit Operasional

### 1. Uji Akses Layanan HTTP & HTTPS
Lakukan pengujian langsung melalui PowerShell:

```powershell
# Uji endpoint HTTP
Invoke-RestMethod -Uri "http://localhost:8080/" -Method Head

# Uji endpoint HTTPS (abaikan warning self-signed cert di lab)
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
Invoke-RestMethod -Uri "https://localhost:8443/" -Method Head
```

### 2. Audit Kepatuhan Keamanan Sewaktu-waktu
Kapan pun konfigurasi host diubah, Anda dapat memverifikasi ulang kepatuhan CIS Benchmark:

```powershell
tcctl hardening audit --conf C:\tomcats\tomcat-lab\conf
```
*Output: 9 Passed, 0 Failed (100% Compliant).*

### 3. Inspeksi Masa Berlaku Sertifikat TLS
Gunakan modul SSL internal `tcctl` untuk memastikan sertifikat tidak kadaluarsa:

```powershell
# Format teks informatif
tcctl ssl check --cert C:\tomcats\tomcat-lab\conf\ssl\keystore.p12

# Format JSON terstruktur untuk otomasi monitoring
tcctl ssl check --cert C:\tomcats\tomcat-lab\conf\ssl\keystore.p12 --json
```

---

## 🔒 Langkah 5: Mengganti dan Menggunakan Sertifikat SSL/TLS Sendiri (BYO Certificate)

Secara default, `tcctl deploy run` secara otomatis membuat sertifikat *self-signed* PKCS#12 agar konektor HTTPS (`:8443`) langsung aktif dan teruji pada fase bootstrap awal. Namun, untuk lingkungan **Staging dan Production Enterprise**, Anda wajib menggantinya dengan sertifikat resmi dari **Corporate PKI** (seperti Active Directory Certificate Services) atau **Commercial Public CA** (DigiCert, Sectigo, Let's Encrypt).

`tcctl` menyediakan modul kriptografi khusus (`tcctl ssl`) yang menyederhanakan proses penggantian sertifikat ini tanpa risiko kesalahan sintaks XML atau korupsi escape path.

### Skenario A: Menggunakan Sertifikat PKCS#12 (`.p12` / `.pfx`) — Rekomendasi Enterprise

Format PKCS#12 adalah standar industri yang menggabungkan private key, public certificate, dan intermediate CA chain ke dalam satu file terenkripsi password.

Gunakan sub-command `tcctl ssl setup` dengan flag `--keystore`:

```powershell
# 1. Pasang sertifikat PKCS#12 resmi milik organisasi
tcctl ssl setup `
  --keystore "C:\certs\tomcat-prod.pfx" `
  --password "PasswordKeystoreResmi123" `
  --out-dir "C:\tomcats\tomcat-lab\conf\ssl" `
  --server-xml "C:\tomcats\tomcat-lab\conf\server.xml"

# 2. Restart kontainer Tomcat agar konektor HTTPS memuat keystore baru
docker restart tomcat-lab
```

**Apa yang dilakukan `tcctl` secara otomatis?**
1. **Validasi Password & Integritas:** Membuka dan mengekstrak keystore di memori untuk memastikan password benar dan keypair valid sebelum menyentuh file produksi.
2. **Atomic Replacement:** Menyalin file ke direktori host bind-mount `C:\tomcats\tomcat-lab\conf\ssl\keystore.p12`.
3. **Penyelarasan `server.xml`:** Memperbarui atribut `certificateKeystorePassword` dan `certificateKeystoreFile` secara terprogram pada konfigurasi HTTPS Connector `:8443`.

---

### Skenario B: Menggunakan Sertifikat Native OpenSSL PEM (`.crt` / `.pem` / `.key`)

Jika tim Security Korporasi menerbitkan sertifikat dalam bentuk file teks terpisah (sertifikat publik, private key, dan root/intermediate bundle):

```powershell
# 1. Pasang sertifikat berbasis PEM dengan verifikasi kecocokan modulus RSA
tcctl ssl setup `
  --cert "C:\certs\app-prod.crt" `
  --key "C:\certs\app-prod.key" `
  --chain "C:\certs\ca-bundle.pem" `
  --out-dir "C:\tomcats\tomcat-lab\conf\ssl" `
  --server-xml "C:\tomcats\tomcat-lab\conf\server.xml"

# 2. Restart kontainer
docker restart tomcat-lab
```

> [!IMPORTANT]
> **Proteksi Human-Error (RSA Modulus Matching):**  
> `tcctl` secara otomatis membandingkan nilai hash modulus publik antara file `--cert` dan file `--key`. Jika private key yang Anda masukkan salah atau tertukar dengan server lain, instalasi akan **dibatalkan seketika** sebelum konfigurasi `server.xml` terlanjur rusak.

---

### Skenario C: Penempatan File Manual & Validasi Mandiri

Jika alur CI/CD atau kebijakan organisasi mengharuskan salinan file manual tanpa tooling CLI:

1. **Salin file sertifikat ke direktori bind-mount host:**
   ```powershell
   Copy-Item "C:\certs\my-cert.p12" "C:\tomcats\tomcat-lab\conf\ssl\keystore.p12" -Force
   ```
2. **Sesuaikan blok `<Certificate>` pada `C:\tomcats\tomcat-lab\conf\server.xml`:**
   ```xml
   <Certificate certificateKeystoreFile="conf/ssl/keystore.p12"
                certificateKeystorePassword="PasswordBaruAnda"
                certificateKeystoreType="PKCS12"
                type="RSA" />
   ```
3. **Jalankan Audit Keamanan CIS Benchmark:**
   Pastikan pengeditan manual tidak merusak kepatuhan XML:
   ```powershell
   tcctl hardening audit --conf C:\tomcats\tomcat-lab\conf
   ```
4. **Restart kontainer:**
   ```powershell
   docker restart tomcat-lab
   ```

---

### Verifikasi Keberhasilan Penggantian Sertifikat

Setelah kontainer di-restart, verifikasi bahwa Tomcat benar-benar menyajikan sertifikat baru:

```powershell
# 1. Periksa metadata, Issuer CA, DNS SANs, dan masa aktif sertifikat
tcctl ssl check --cert C:\tomcats\tomcat-lab\conf\ssl\keystore.p12

# 2. Uji handshake TLS nyata pada Port 8443
$tcpClient = New-Object System.Net.Sockets.TcpClient("localhost", 8443)
$sslStream = New-Object System.Net.Security.SslStream($tcpClient.GetStream(), $false, { $true })
$sslStream.AuthenticateAsClient("localhost")
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($sslStream.RemoteCertificate)

# Tampilkan Subject dan Issuer yang sedang aktif
[PSCustomObject]@{
    Subject = $cert.Subject
    Issuer  = $cert.Issuer
    Expiry  = $cert.NotAfter
}
$sslStream.Close()
$tcpClient.Close()
```

---

## 🚀 Langkah 6: Tata Kelola JVM Heap & Zero-Downtime Rollout (TC-ADR-0006 / TC-ADR-0010)

### 1. Menyesuaikan Parameter Java & Heap Size pada Host
Anda tidak perlu masuk ke dalam kontainer atau me-rebuild citra Docker untuk mengubah heap size atau argumen Java lainnya. Cukup buka dan edit berkas `setenv.bat` di host:

```powershell
notepad C:\tomcats\tomcat-lab\bin\setenv.bat
```

**Contoh Penyesuaian Alokasi Heap & Custom Flag:**
```cmd
@echo off
rem 1. Redirection JRE Adoptium
if not "%JAVA_HOME%" == "" set "JRE_HOME=%JAVA_HOME%"
set "JAVA_HOME="

rem 2. Dynamic Container-Aware Memory Tuning
if "%CATALINA_OPTS%" == "" (
    set "CATALINA_OPTS=-XX:MaxRAMPercentage=80.0 -XX:InitialRAMPercentage=50.0 -XX:+UseG1GC -XX:+UseStringDeduplication -Dcustom.flag=prod -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Jakarta -Djava.awt.headless=true"
)
```

> [!TIP]
> **Keunggulan `-XX:MaxRAMPercentage`:** Menggunakan rasio memori memastikan JVM menyesuaikan ukuran heap secara proporsional terhadap batas memori Docker (`--memory`), mengeliminasi risiko crash akibat *Out Of Memory (OOM)*.

### 2. Menerapkan Perubahan melalui Zero-Downtime Rollout
Setelah mengedit `setenv.bat` atau saat ingin meng-upgrade versi image Tomcat/Java di produksi tanpa downtime:

```powershell
tcctl deploy rollout `
  --name tomcat-lab `
  --image tomcat:9.0-jdk21 `
  --port 8080 `
  --staging-port 9080 `
  --base-dir C:/tomcats
```

`tcctl` akan secara otomatis mengeksekusi siklus hidup aman:
1. **Host Cloned to Staging**: Menyalin folder `bin/` (beserta `setenv.bat` yang baru diedit) dan `conf/` ke direktori sementara `C:\tomcats\tomcat-lab-staging\`.
2. **Launch Staging Container**: Menjalankan kontainer sementara `tomcat-lab-staging` pada port staging `9080` dengan citra baru (`tomcat:9.0-jdk21`) dan memuat `CATALINA_OPTS` kustom.
3. **Health Check Probing**: Melakukan probing hingga endpoint port 9080 berstatus `HEALTHY` (200 OK / 404).
4. **Atomic Promotion & Drain**: Menghentikan kontainer lama pada port `8080` dan mempromosikan kontainer baru ke nama kanonikal `tomcat-lab` pada port utama `8080` tanpa gangguan trafik.
5. **Ephemeral Staging Cleanup**: Menghapus folder sementara `C:\tomcats\tomcat-lab-staging` secara otomatis sehingga host disk tetap bersih.

**Verifikasi di dalam Kontainer yang Telah Dipromosikan:**
```powershell
docker exec tomcat-lab cmd /c "echo %CATALINA_OPTS%"
```

---


## 🧹 Langkah 7: Prosedur Teardown & Reset (Clean Slate)

Untuk membersihkan seluruh resource di lingkungan pengujian/lab hingga kembali ke kondisi awal (*clean slate*):

```powershell
# 1. Hentikan dan hapus kontainer
docker rm -f tomcat-lab
 
# 2. Hapus direktori persistensi host bind-mount
Remove-Item -Recurse -Force "C:\tomcats\tomcat-lab"
 
# 3. (Opsional) Redeploy instan dalam satu baris perintah
tcctl deploy run --name tomcat-lab --port 8080 --https-port 8443 --image "tomcat:9.0-jdk11"
```

---

## 🎯 Kesimpulan

Dengan memanfaatkan CLI tool **`tcctl`**, orkestrasi kontainer Apache Tomcat pada Windows Server tidak lagi memerlukan skrip PowerShell yang panjang dan rentan kesalahan. Standar keamanan enterprise—mulai dari CIS Benchmark, proteksi immutability, enkripsi HTTPS, hingga isolasi perizinan non-root—ditegakkan secara otomatis sejak detik pertama deployment.

### 📚 Referensi Terkait
- [Detailed Installation & Build Guide (INSTALL.md)](https://github.com/edkas07-oss/tcctl/blob/main/INSTALL.md)
- [Tomcat Monitoring & Autonomous Diagnostic Platform]({{< ref "projects/tomcat-monitoring" >}})
- [Jurnal: Menjinakkan Windows Containers Tanpa Mengubah Basis Kode]({{< ref "journals/menjinakkan-windows-containers-docker-nanoserver-linux" >}})
