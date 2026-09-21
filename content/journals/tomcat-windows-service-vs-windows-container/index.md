+++
title = "Windows Service vs Windows Containers: Studi Komparasi Isolasi Sumber Daya dan Keandalan Runtime Apache Tomcat"
date = "2026-09-21T19:20:00+07:00"
draft = false
summary = "Analisis komparatif mendalam antara Apache Tomcat sebagai Windows Service tradisional dan kontainerisasi berbasis Windows Docker NanoServer: membedah batas isolasi memori via Windows Job Objects, mitigasi kebuntuan status STOP_PENDING, pembatasan hak akses ContainerUser, serta strategi mengatasi strict kernel matching LTSC."
author = "Eddy Wiyatno"
categories = ["DevOps", "Infrastructure", "SRE"]
tags = ["tomcat", "windows-containers", "docker", "nanoserver", "windows-service", "sre", "architecture"]
series = ["Enterprise Observability & Multi-OS Architecture"]
toc = true
showSummary = true
aliases = ["/articles/tomcat-windows-service-vs-windows-container/"]
+++

## 📌 Ringkasan Eksekutif (TL;DR)

Di banyak lingkungan enterprise, Apache Tomcat sering kali harus beroperasi di atas **Windows Server** karena ketergantungan mendalam pada integrasi domain Active Directory, driver database komersial tertentu, atau mandat kebijakan vendor perangkat lunak inti. Secara historis, pendekatan standar yang diambil selama belasan tahun adalah memasang Tomcat sebagai **Windows Service** tradisional (`Tomcat9.exe` yang diregistrasikan ke Windows Service Control Manager / SCM).

Namun, mengelola beban kerja mission-critical sebagai Windows Service tradisional membawa empat kerapuhan operasional yang fatal:
1. **Ketiadaan kuota isolasi memori level OS**, di mana kebocoran memori native atau off-heap JVM dapat menguras memori *Non-Paged Pool* kernel dan membekukan seluruh host Windows.
2. **Kebuntuan status `STOP_PENDING`** yang legendaris pada SCM saat worker thread Tomcat mengalami hang, memaksa intervensi manual `taskkill`.
3. **Risiko keamanan eskalasi hak istimewa** akibat kebiasaan menjalankan service di bawah akun sakti `NT AUTHORITY\SYSTEM`.
4. **Pencemaran lingkungan (*environment drift*)** pada variabel sistem `JAVA_HOME`, registry, dan patch JRE host.

Mengalihkan Tomcat ke **Windows Containers** (Docker NanoServer dengan mode *Process Isolation*) menyelesaikan keempat masalah tersebut secara tuntas melalui pemanfaatan **Windows Job Objects**, virtualisasi namespace filesystem (NTFS Silos), isolasi hak akses akun non-admin **`ContainerUser`**, serta orkestrasi siklus hidup berbasis Docker Named Pipe API (`\\.\pipe\docker_engine`). Meskipun menuntut kedisiplinan rekayasa dalam menangani *Strict Kernel Matching LTSC* dan otomatisasi DACL NTFS, kontainerisasi Windows menghadirkan determinisme, keamanan, dan portabilitas modern tanpa perlu mengubah basis kode aplikasi.

---

## 🌍 Latar Belakang & Real-World Dilemma: Mengapa Windows Service Masih Bertahan?

Dalam diskusi modernisasi infrastruktur, pertanyaan pertama yang kerap muncul adalah: *"Mengapa tidak memindahkan seluruh beban kerja Tomcat ke Linux saja?"*

Bagi tim rekayasa platform di skala enterprise, kenyataan di lapangan tidak sesederhana itu. Ada berbagai batasan bisnis dan teknis yang sah:
* **Integrasi Native Windows Authentication:** Aplikasi servlet Java yang mengandalkan Integrated Windows Authentication (Kerberos/SPNEGO) dan *Windows SSPI/NTLM* untuk otentikasi single-sign-on (SSO) internal.
* **Keterikatan Pustaka Native (JNI / COM DLL):** Modul integrasi perangkat keras lama (seperti printer thermal perbankan, enkriptor HSM berbasis DLL Windows, atau driver ODBC proprietary).
* **Kebijakan Regulasi & Vendor:** Paket software perbankan atau ERP pihak ketiga yang lisensi resminya hanya mencakup ekosistem Windows Server.

Selama bertahun-tahun, satu-satunya solusi operasional untuk skenario di atas adalah menjalankan installer Tomcat atau mengeksekusi skrip `service.bat install Tomcat9`. Service ini berjalan di latar belakang, dipantau melalui panel GUI `services.msc` atau perintah PowerShell `Get-Service`.

```text
┌─────────────────────────────────────────────────────────────┐
│             TOMCAT SEBAGAI WINDOWS SERVICE TRADISIONAL      │
├─────────────────────────────────────────────────────────────┤
│  OS Host: Windows Server 2022                               │
│  Service Manager: SCM (services.exe)                        │
│  Wrapper: Tomcat9.exe (Apache Commons Daemon / Procrun)     │
│  Hak Akses: NT AUTHORITY\SYSTEM (Sering Terpaksa Dipakai)   │
│  Memori: Melihat 64 GB RAM fisik host tanpa batas cgroup    │
│  Logging: Menulis langsung ke C:\Tomcat\logs                │
└─────────────────────────────────────────────────────────────┘
```

Ketika ide kontainerisasi Windows diajukan, tim operasional sering kali menunjukkan keraguan yang beralasan:
> *"Windows Container kan base image-nya berukuran ratusan megabyte hingga gigabyte, ada aturan pencocokan kernel LTSC yang kaku, dan tidak punya folder `/tmp` standar. Apakah migrasi ini sepadan, atau kita hanya memindahkan masalah?"*

Untuk menjawab keraguan tersebut secara objektif, kita harus membedah kerapuhan mekanis yang melekat pada model Windows Service tradisional.

---

## 🔍 Analisis Masalah & Dilema Teknis: Kerapuhan Operasional Tomcat Tradisional

Mengapa pendekatan tradisional memasang Tomcat langsung di host Windows Server menjadi anti-pattern dalam standar operasional SRE modern?

{{< mermaid >}}
flowchart TD
    subgraph TRADISIONAL["Tomcat Windows Service Tradisional"]
        T1["Native Memory Leak di JVM/JNI"] -->|Tanpa Job Objects| T1_ERR["Kuras Non-Paged Pool & Crash Host OS"]
        T2["Worker Thread Hang / DB Stalled"] -->|Stop-Service macet| T2_ERR["SCM Terjebak Status STOP_PENDING"]
        T3["Celah RCE Webapp (Log4Shell dll)"] -->|Berjalan sebagai SYSTEM| T3_ERR["Penyerang Kuasai Penuh Host Windows"]
        T4["Host Update Patch Java Global"] -->|Pencemaran JAVA_HOME| T4_ERR["Environment Drift & Kerusakan Versi"]
    end

    subgraph CONTAINER["Tomcat Windows Container (NanoServer)"]
        C1["Native Memory Leak"] -->|Dibatasi Windows Job Object| C1_FIX["OOM Terisolasi di Kontainer Saja"]
        C2["Worker Thread Hang"] -->|Docker Named Pipe API| C2_FIX["Grace Period & Hard Kill Deterministik"]
        C3["Celah RCE Webapp"] -->|Akun ContainerUser + NTFS Silo| C3_FIX["Terkunci di Sandbox, Host Aman"]
        C4["Artefak Image Mandiri"] -->|Immutable JRE + Runtime| C4_FIX["Zero Host Drift & Konsistensi Fleet"]
    end
{{< /mermaid >}}

### 1. Ketiadaan Isolasi Sumber Daya: Tragedi Non-Paged Pool Kernel

Pada model Windows Service, parameter JVM seperti `-Xmx4g` hanya membatasi alokasi memori pada Java Heap. Namun, sebuah proses JVM Tomcat mengonsumsi memori jauh di luar heap:
* **Metaspace & Class Metadata:** Membesar seiring banyaknya class yang di-load oleh webapp.
* **Thread Stacks:** Setiap thread worker Tomcat (NIO connector) memesan 1 MB stack memori native secara default.
* **Off-Heap Direct Memory & JNI:** Alokasi native I/O dan driver pihak ketiga yang dialokasikan langsung melalui Windows subsystem.

Ketika terjadi kebocoran memori native di Windows Service, sistem operasi Windows tidak memiliki mekanisme default untuk menghentikan proses tersebut sebelum terlambat. Proses `Tomcat9.exe` akan terus meminta halaman memori dari kernel NT. 

Ketika memori fisik dan swap menipis, kernel Windows mulai kehabisan **Non-Paged Pool** (area memori yang dialokasikan khusus untuk driver kernel dan operasi internal OS). Dampaknya bukan hanya Tomcat yang berhenti, melainkan **seluruh server Windows mengalami freeze total**, koneksi RDP terputus, dan server harus di-restart secara paksa via hard reboot (IPMI/vSphere).

### 2. Kebuntuan Status `STOP_PENDING` pada Windows Service Control Manager (SCM)

Salah satu insiden paling melelahkan bagi tim on-call Windows adalah kegagalan shutdown service:
1. Operator atau skrip automasi menjalankan `Restart-Service Tomcat9` atau `net stop Tomcat9`.
2. SCM mengirimkan kontrol `SERVICE_CONTROL_STOP` ke pembungkus service (`Tomcat9.exe`).
3. Pembungkus service mengeksekusi shutdown hook Tomcat dan mencoba menutup thread pool konektor HTTP/AJP.
4. Jika terdapat satu query database yang mengalami kebuntuan (*database deadlocked connection*) atau socket stream yang menggantung tanpa timeout, thread Java menolak mati.
5. SCM menunggu proses keluar, namun **SCM tidak memiliki mekanisme built-in hard kill otomatis**.

Akibatnya, status layanan tersangkut di **`STOP_PENDING`**. Dalam kondisi ini:
* Perintah start berikutnya ditolak karena service sedang "dalam proses berhenti".
* Perintah stop tambahan ditolak dengan pesan error `An instance of the service is already running`.
* Operator terpaksa melakukan investigasi darurat di tengah malam: membuka `tasklist /svc`, mencari PID proses `Tomcat9.exe`, dan mengeksekusi `taskkill /F /PID <pid>`.

```powershell
# ⚠️ Anti-pattern: Intervensi darurat manual yang kerap terjadi pada Windows Service
Get-Service Tomcat9
# Status: StopPending (berlangsung selama 20 menit)

# Terpaksa mencari PID dan membunuh proses secara destruktif
$process = Get-WmiObject Win32_Service -Filter "Name = 'Tomcat9'"
taskkill /F /PID $process.ProcessId
```

### 3. Bahaya Hak Istimewa Akun `NT AUTHORITY\SYSTEM`

Mengonfigurasi akun service Windows (*Service Account*) yang menerapkan prinsip *Least Privilege* terkenal rumit. Akun tersebut harus diberi hak khusus `Log on as a service`, hak baca-tulis pada folder instalasi, akses registry, hingga izin membuka port HTTP (<1024).

Akibat friksi tersebut, tim infrastruktur kerap mengambil jalan pintas: menyetel service Tomcat agar berjalan di bawah akun bawaan **`NT AUTHORITY\SYSTEM`** (*LocalSystem*).

> [!CAUTION]
> Menjalankan runtime aplikasi web publik atau internal di bawah akun `NT AUTHORITY\SYSTEM` adalah risiko keamanan tingkat tinggi. Jika servlet memiliki celah *Remote Code Execution* (RCE)—seperti deserialisasi Java atau Log4Shell—penyerang langsung memperoleh kendali penuh atas sistem operasi host dengan hak akses paling tinggi di arsitektur Windows NT.

### 4. Pencemaran Host & Ketiadaan Immutability (*Host Environment Drift*)

Pada model tradisional, Tomcat sangat bergantung pada kondisi host:
* Variabel lingkungan sistem (`JAVA_HOME`, `CATALINA_HOME`, `PATH`) bersifat global.
* Jika ada dua aplikasi Tomcat di host yang sama yang membutuhkan versi minor JRE berbeda (misal Java 11.0.12 vs Java 11.0.22), terjadi konflik lingkungan (*dependency collision*).
* Pembaruan patch OS Windows secara otomatis terkadang memperbarui komponen runtime atau sertifikat sistem yang mengubah perilaku JVM tanpa disengaja.

---

## 🏛️ Solusi Arsitektur: Migrasi Menuju Windows Containers (Docker NanoServer)

Mengadopsi Windows Containers mentransformasikan cara Tomcat dikelola di lingkungan Windows Server. Arsitektur ini menggantikan keterikatan host yang rapuh dengan batasan isolasi deterministik.

```text
┌────────────────────────────────────────────────────────────────────────┐
│               ARSITEKTUR TOMCAT WINDOWS CONTAINER NATIVE               │
└────────────────────────────────────────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌─────────────────────────────────────┐   ┌──────────────────────────────┐
│ HOST: Windows Server 2022 (LTSC)    │   │ CONTROL PLANE: Named Pipe    │
│ NT Kernel Build: 10.0.20348         │   │ \\.\pipe\docker_engine       │
├─────────────────────────────────────┤   ├──────────────────────────────┤
│ Docker Engine (dockerd.exe)         │   │ Operator CLI: tmctl          │
│ Windows Job Object Manager          │   │ Event Daemon: tm-agent       │
└──────────────────┬──────────────────┘   └──────────────────────────────┘
                   │
                   ▼ Mode: Process Isolation (--isolation=process)
┌────────────────────────────────────────────────────────────────────────┐
│ CONTAINER SANDBOX: mcr.microsoft.com/windows/nanoserver:ltsc2022       │
├────────────────────────────────────────────────────────────────────────┤
│ • Isolasi Akun: ContainerUser (Non-Admin, SID S-1-5-93-2-1)           │
│ • Batas Kuota: Windows Job Object (--memory=4g --cpus=2)               │
│ • Filesystem: NTFS Silo terisolasi (Work & Temp di C:\temp)            │
│ • Runtime: OpenJDK 17 LTS Headless + Apache Tomcat 10.1 (Self-Bundled) │
│ • Entrypoint: CMD ["catalina.bat", "run"]                              │
│ • Telemetri: JMX Exporter HTTPS (Port 9404)                            │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Pembatasan Memori Deterministik via *Windows Job Objects*

Di Windows, primitif kernel yang mengatur kuota sumber daya adalah **Job Objects**. Ketika Anda menjalankan container dengan perintah:

```powershell
docker run -d `
  --name tomcat-production `
  --memory 4g `
  --cpus 2 `
  --isolation process `
  myregistry.enterprise/tomcat-app:10.1-nano
```

Docker Engine melalui *Host Compute Service* (HCS) Windows membuat sebuah *Job Object* dan menetapkan batasan memori maksimum 4 GB. 

JVM modern (sejak Java 8u191, Java 11, 17, dan 21) memiliki implementasi **`UseContainerSupport`** yang bekerja secara native di kernel Windows NT. JVM mendeteksi batas memori dari *Job Object* tersebut, bukan dari kapasitas RAM fisik host Windows:

```text
# Log inisialisasi JVM di dalam container Windows NanoServer:
[0.005s][info][os,container] Container-aware JVM detected
[0.005s][info][os,container] Memory Limit: 4294967296 (4096.00M)
[0.006s][info][os,container] Active Processor Count: 2
```

Jika terjadi kebocoran memori native yang parah, Windows kernel hanya akan memutus proses di dalam *Job Object* tersebut. Host Windows Server tetap berjalan normal tanpa gangguan pada *Non-Paged Pool*.

### 2. Eliminasi Status `STOP_PENDING` via Docker Named Pipe API

Pada Windows Container, Tomcat tidak lagi dijalankan melalui *Windows Service Control Manager*, melainkan sebagai proses konsol langsung (`catalina.bat run`) di dalam namespace container.

Siklus hidup dikendalikan secara mutlak oleh Docker Engine melalui **Windows Named Pipe API** (`\\.\pipe\docker_engine`):
1. Ketika sinyal penghentian dikirim (`docker stop -t 30 tomcat-production`), Docker mengirimkan sinyal shutdown ke proses Java di container.
2. Grace period (misal 30 detik) berjalan untuk memberi kesempatan servlet menyelesaikan transaksi aktif.
3. Jika worker thread tetap mengalami hang setelah batas waktu 30 detik habis, Docker Engine mengeksekusi **hard termination deterministik** melalui panggilan sistem HCS.
4. Kontainer keluar secara bersih dengan exit code terdefinisi. **Tidak ada lagi kemungkinan tersangkut di status `STOP_PENDING`**.

Operator tooling (seperti CLI `tmctl`) dapat mengorkestrasi restart atau rollback dengan jaminan deterministik tanpa perlu intervensi manual membunuh PID di Task Manager.

### 3. Penegakan Keamanan Non-Admin via `ContainerUser`

Di dalam base image Windows NanoServer, Microsoft menyediakan akun non-administratif bawaan bernama **`ContainerUser`** (memiliki SID kanonikal `S-1-5-93-2-1`).

Dengan menyetel instruksi `USER ContainerUser` di dalam Dockerfile:
* Runtime Tomcat berjalan tanpa hak administratif.
* Container berjalan di dalam **NTFS Silo**, yang memisahkan registry dan direktori sistem container dari host.
* Jika terjadi eksploitasi RCE pada Tomcat, penyerang terperangkap di dalam sandbox NanoServer tanpa izin menulis ke `C:\Windows\System32` atau mengakses volume host yang tidak di-mount.

```dockerfile
# Cuplikan Dockerfile: Standardisasi Least-Privilege NanoServer
FROM mcr.microsoft.com/windows/nanoserver:ltsc2022

# Menyetel direktori kerja terisolasi
WORKDIR C:/app

# Menyalin runtime Tomcat dan JRE mandiri
COPY --chown=ContainerUser:ContainerUser ./dist/tomcat C:/app/tomcat
COPY --chown=ContainerUser:ContainerUser ./dist/jre C:/app/jre

# Menjalankan runtime dengan akun non-admin
USER ContainerUser

EXPOSE 8080 9404
ENTRYPOINT ["C:\\app\\jre\\bin\\java.exe", "-jar", "C:\\app\\tomcat\\bin\\bootstrap.jar"]
CMD ["start"]
```

---

## 💡 Pelajaran Praktis & Mitigasi Batasan Windows Containers (SRE Best Practices)

Meskipun keunggulannya sangat signifikan, migrasi ke Windows Containers bukan tanpa tantangan. Ada tiga aturan rekayasa spesifik Windows yang wajib diotomasi agar tidak menimbulkan masalah baru di produksi.

### 1. Menjinakkan Batasan *Strict Kernel Matching* LTSC

Berbeda dengan Linux yang memiliki stabilitas antarmuka syscall kernel (Linux Kernel ABI), kontainer Windows dalam mode **Process Isolation** (`--isolation=process`) menuntut **kecocokan 100% antara nomor build kernel host dan base image kontainer**.

| Versi Host OS Windows Server | Nomor Build NT Kernel | Wajib Base Image NanoServer | Status Kompatibilitas |
| :--- | :--- | :--- | :--- |
| **Windows Server 2019** | `10.0.17763` | `mcr.microsoft.com/windows/nanoserver:1809` | ✅ Process Isolation Native |
| **Windows Server 2022** | `10.0.20348` | `mcr.microsoft.com/windows/nanoserver:ltsc2022` | ✅ Process Isolation Native |
| **Windows Server 2025** | `10.0.26100` | `mcr.microsoft.com/windows/nanoserver:ltsc2025` | ✅ Process Isolation Native |

> [!WARNING]
> Menjalankan container `nanoserver:ltsc2022` di atas host Windows Server 2019 dengan *Process Isolation* akan langsung gagal dengan error `hcsshim::CreateComputeSystem: The container operating system does not match the host operating system`.

**Mitigasi Otomasi:**  
Gunakan fakta Ansible (`ansible_kernel`) di pipeline deployment untuk menentukan tag base image secara dinamis:

```yaml
# Cuplikan Playbook Ansible Fleet Provisioning
- name: Tentukan Base Image Windows Container Berdasarkan Kernel Host
  ansible.builtin.set_fact:
    windows_base_image: >-
      {{
        'mcr.microsoft.com/windows/nanoserver:1809' if ('17763' in ansible_kernel)
        else ('mcr.microsoft.com/windows/nanoserver:ltsc2025' if ('26100' in ansible_kernel)
        else 'mcr.microsoft.com/windows/nanoserver:ltsc2022')
      }}
```

### 2. Aturan "Zero `/tmp`" & Standardisasi Storage (`TM-ADR-0030`)

Banyak library Java servlet dan Tomcat wrapper mengasumsikan keberadaan path Unix `/tmp` untuk menampung file upload sementara atau *scratch buffer*. Di Windows NanoServer, path `/tmp` tidak ada dan akan memicu `java.io.IOException: The system cannot find the path specified`.

**Mitigasi:**  
Selalu deklarasikan parameter JVM `java.io.tmpdir` secara eksplisit menuju path Windows valid (misal `C:\temp`), dan pastikan folder tersebut telah dibuat dengan izin tulis bagi `ContainerUser`:

```bash
# Tambahkan pada argumen JVM Tomcat di entrypoint container:
-Djava.io.tmpdir=C:\temp
```

### 3. Otomatisasi Izin NTFS DACL untuk Bind Mount (`TM-ADR-0031`)

Ketika me-mount direktori host Windows ke dalam container (misalnya untuk menyimpan file bukti insiden spool atau log persisten), kontainer sering gagal menulis dengan error `Access is Denied`. Hal ini terjadi karena akun `ContainerUser` di dalam kontainer menggunakan Security Identifier (SID) terisolasi: **`S-1-5-93-2-1`**.

**Mitigasi:**  
Sebelum kontainer dijalankan, pipeline otomasi host (Ansible atau PowerShell setup script) wajib memberikan izin modifikasi pada folder mount host menggunakan utility `icacls`:

```powershell
# Memberikan izin NTFS eksplisit kepada ContainerUser sebelum container dinyalakan
$mountPath = "C:\tm-data\spool"
icacls $mountPath /grant "*S-1-5-93-2-1:(OI)(CI)M" /T /Q
```

---

## 📋 Kesimpulan & Matriks Keputusan Migrasi

Keputusan antara mempertahankan Windows Service tradisional atau beralih ke Windows Containers bukanlah soal mengikuti tren teknologi, melainkan mitigasi risiko operasional nyata di skala enterprise.

### Matriks Evaluasi Rekayasa

| Kriteria Evaluasi | Windows Service Tradisional | Windows Containers (NanoServer) |
| :--- | :--- | :--- |
| **Isolasi Memori Kernel** | ❌ Rentan kebocoran memori host (*kuras Non-Paged Pool*) | ✅ Dibatasi *Windows Job Objects* & JVM *container-aware* |
| **Keandalan Siklus Hidup** | ❌ Risiko kebuntuan status `STOP_PENDING` pada SCM | ✅ *Grace period* & *hard kill* deterministik via Named Pipe |
| **Prinsip Least Privilege** | ❌ Kerap dipaksa memakai akun sakti `NT AUTHORITY\SYSTEM` | ✅ Berjalan di bawah akun non-admin `ContainerUser` |
| **Immutability & Packaging** | ❌ Rawan *environment drift* akibat instalasi JRE di host | ✅ Image mandiri, identik dan teruji di seluruh node fleet |
| **Portabilitas Multi-OS** | ❌ Skrip operasional Windows eksklusif | ✅ Selaras dengan pipeline orkestrasi OCI / Linux |
| **Kompleksitas Setup Awal** | 🟢 Sederhana (cukup installer MSI / `service.bat`) | 🟡 Memerlukan instalasi Docker Engine & otomasi DACL |
| **Keterikatan Kernel** | 🟢 Bebas mengikuti pembaruan patch kernel host | ⚠️ Wajib *Strict Kernel Matching* LTSC (Process Isolation) |

### Checklist Kapan Harus Migrasi

Pertimbangkan untuk segera bermigrasi ke **Windows Containers** jika sistem Anda mengalami salah satu dari kondisi berikut:
- [x] Sering mengalami insiden `STOP_PENDING` yang membutuhkan intervensi manual `taskkill` di produksi.
- [x] Host Windows menjalankan beberapa aplikasi dan sering mengalami konflik versi JRE atau variabel `PATH`.
- [x] Tim kepatuhan keamanan (*security compliance*) melarang penggunaan akun `LocalSystem` untuk aplikasi web.
- [x] Anda ingin menyatukan pipeline CI/CD Jenkins dan observabilitas telemetri (Prometheus/JMX Exporter) dengan pola yang simetris antara fleet Linux dan Windows.

Sebaliknya, **tetap gunakan Windows Service tradisional** hanya jika:
- Beban kerja Anda membutuhkan komponen GUI Windows desktop (*GDI/User32 subsystem*).
- Tim belum memiliki infrastruktur Docker Engine / container runtime di host Windows Server dan beban kerja dijadwalkan untuk segera dipensiunkan (*end-of-life*).
