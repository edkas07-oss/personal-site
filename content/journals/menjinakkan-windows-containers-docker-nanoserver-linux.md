+++
title = "Menjinakkan Windows Containers: Menjalankan Monitoring Stack di Windows Docker NanoServer & Linux Tanpa Ganti Kode"
date = "2026-09-21T06:08:00+07:00"
draft = false
summary = "Panduan mendalam menjinakkan Windows Containers di lingkungan enterprise: strategi menjalankan kontainer secara simetris di Windows Docker NanoServer dan Linux tanpa mengubah basis kode. Mengupas tuntas tantangan kernel matching LTSC, pembatasan hak akses non-admin ContainerUser, otomatisasi DACL NTFS, serta standardisasi storage multi-OS."
author = "Eddy Wiyatno"
categories = ["DevOps", "Infrastructure"]
tags = ["windows-containers", "docker", "nanoserver", "devops", "sre", "security", "powershell"]
series = ["Enterprise Observability & Multi-OS Architecture"]
toc = true
showSummary = true
aliases = ["/articles/menjinakkan-windows-containers-docker-nanoserver-linux/"]
+++

## 📌 Ringkasan Eksekutif (TL;DR)

Di banyak organisasi enterprise, infrastruktur TI tidak pernah seragam (*homogeneous*). Aplikasi mission-critical, sistem ERP, dan middleware Apache Tomcat berumur belasan tahun sering kali berjalan di atas ekosistem **Windows Server**, sementara inovasi *observability stack* modern (Prometheus, Alertmanager, Node.js diagnostic engine, dan Go daemons) hampir seluruhnya dirancang dengan asumsi lingkungan **Linux/POSIX**.

Pendekatan umum yang sering diambil tim infrastruktur biasanya terbagi menjadi dua kompromi yang sama-sama buruk:
1. **Memaksakan emulasi Linux (WSL2 / Docker Desktop) di Windows Server produksi**, yang membawa ketidakstabilan kernel virtual, konsumsi memori tinggi, dan tidak didukung secara resmi untuk beban kerja *production*.
2. **Melakukan *forking* basis kode (*dual-codebase antipattern*)**, membuat versi skrip monitoring khusus Windows yang berujung pada desinkronisasi logika deteksi dan beban pemeliharaan ganda (*maintenance nightmare*).

Solusi rekayasa yang kami terapkan pada platform [`tomcat-monitoring`](https://github.com/edkas07-oss/tomcat-monitoring) adalah mewujudkan paradigma **True Dual-Symmetry**: menjalankan citra kontainer native di kedua sistem operasi (**Windows Docker NanoServer** dan **Linux Container Engine**) dengan kode aplikasi, kontrak telemetri, skema database, dan aturan diagnostik yang **100% identik tanpa perubahan logika aplikasi**.

Artikel mendalam ini membedah solusi teknis nyata dalam menaklukkan friksi container Windows di level produksi:
- Menangani pembatasan mutlak **Kernel Matching Constraint** pada Windows Server LTSC (2019 vs 2022 vs 2025).
- Menegakkan prinsip keamanan *Least Privilege* menggunakan akun non-admin **`ContainerUser`** tanpa terkena petaka *Access Denied* pada *named volumes* dan *bind mounts*.
- Mengotomatiskan pemberian izin **NTFS Access Control Lists (ACLs)** granular melalui automasi PowerShell dan Ansible merujuk pada standar [`TM-ADR-0031`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0031/).
- Mengisolasi penyimpanan data melalui **Two-Tier Storage Architecture** dan menegakkan aturan keras **"Zero `/tmp`"** merujuk pada standar [`TM-ADR-0030`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0030/).
- Menyamarkan disparitas sistem operasi bagi tim SRE menggunakan kakas CLI operator terpadu berbasis Go, **`tmctl`**, merujuk pada standar [`TM-ADR-0027`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0027/).

---

## 🌍 Real-World Dilemma Enterprise: Mengapa Dual-Symmetry Krusial?

Dalam operasional enterprise skala besar, migrasi penuh seluruh beban kerja ke Linux sering kali tidak realistis. Ribuan aplikasi Java/Tomcat masih terikat erat dengan Windows Server karena dependensi Active Directory (Kerberos/SPNEGO), integrasi *shared storage* CIFS/SMB lokal, panggilan native COM/OLE, atau perjanjian lisensi korporasi jangka panjang.

Di sisi lain, platform *observability* modern seperti Prometheus TSDB, Alertmanager, dan sistem analisis otomatis mengandalkan asumsi POSIX yang mendarah daging:
- Manajemen hak akses file berbasis oktal (`0700`, `0600`, `0400`).
- Semantik pengguna berbasis numeric UID/GID (`chown -R 1000:1000`).
- Ketersediaan direktori temporer global `/tmp`.
- Keberadaan syscall Unix sockets untuk orkestrasi siklus hidup container.

{{< mermaid >}}
flowchart TD
    subgraph ENTERPRISE_REALITY["Realitas Heterogen Enterprise"]
        WIN["Windows Server Fleet<br/>(Tomcat Legacy, Active Directory, NTFS)"]
        LIN["Linux Server Fleet<br/>(Microservices, POSIX, Cloud Native)"]
    end

    subgraph UNSUSTAINABLE_APPROACHES["Kompromi yang Gagal di Produksi"]
        A1["WSL2 / Docker Desktop di Server<br/>(Virtualization Overhead & Unstable Daemon)"]
        A2["Codebase Forking (.bat / .ps1 khusus)<br/>(Fitur Desinkronisasi & Double Maintenance)"]
        A3["Mengabaikan Windows Node<br/>(Black Box Monitoring & Blindspot Operasional)"]
    end

    subgraph TARGET_GOAL["Arsitektur True Dual-Symmetry"]
        CORE["Single Application Codebase<br/>(Node.js Diagnostic, Prometheus, Go daemons)"]
        WIN_NANO["Windows Docker NanoServer<br/>(Process Isolation Native)"]
        LIN_OCI["Linux OCI Containers<br/>(Podman / Docker Native)"]
    end

    WIN -.-> UNSUSTAINABLE_APPROACHES
    WIN ==> TARGET_GOAL
    LIN ==> TARGET_GOAL
    CORE --> WIN_NANO
    CORE --> LIN_OCI
{{< /mermaid >}}

Jika tim rekayasa memilih *forking* kode (membuat engine diagnostik versi Windows dan versi Linux secara terpisah), biaya pemeliharaannya sangat mahal: setiap penambahan metrik, perubahan aturan deteksi kegagalan JVM, atau pembaruan *security patch* harus diimplementasikan dan diuji dua kali.

Tantangan sejatinya adalah: **Bagaimana menyerap seluruh disparitas sistem operasi di lapisan packaging (Containerfile/Dockerfile) dan otomasi host (Ansible/PowerShell), sehingga kode inti aplikasi tidak pernah tahu apakah ia sedang dieksekusi di atas kernel Linux atau Windows NT?**

---

## 🧱 Anatomi Tantangan Windows Docker NanoServer

Menjalankan kontainer berbasis Linux di host Linux adalah hal wajar karena primitif kernel seperti *cgroups* dan *namespaces* sudah matang selama puluhan tahun. Namun, menjalankan kontainer native di Windows Server menghadirkan serangkaian jebakan arsitektural yang fundamental.

### 1. The Kernel Matching Constraint: Batas Keras Versi LTSC

Pada ekosistem Linux, antarmuka biner kernel (*Linux Kernel ABI*) menjamin *backward compatibility*. Anda dapat mengeksekusi container berbasis Debian 10 atau Alpine Linux di atas host bermesin kernel Linux 5.15 maupun 6.8 tanpa masalah.

Pada Windows Containers dengan **Process Isolation**, aturan tersebut tidak berlaku. Kontainer Windows tidak memvirtualisasikan kernel; DLL *user-mode* di dalam kontainer (seperti `ntdll.dll`, `kernel32.dll`) berkomunikasi langsung dengan host kernel Windows NT melalui syscall privat yang berubah di setiap *major build* Windows Server.

> [!WARNING]
> Windows Container beroperasi dengan aturan pencocokan kernel yang sangat ketat (*Strict Kernel Matching*). Versi base image container wajib cocok secara presisi dengan nomor build kernel sistem operasi host.

| Host Operating System | NT Kernel Build | Wajib Base Image NanoServer | Kompatibilitas Process Isolation |
| :--- | :---: | :--- | :---: |
| **Windows Server 2019** | `10.0.17763` | `mcr.microsoft.com/windows/nanoserver:1809` | ✅ Native (Build 17763) |
| **Windows Server 2022** | `10.0.20348` | `mcr.microsoft.com/windows/nanoserver:ltsc2022` | ✅ Native (Build 20348) |
| **Windows Server 2025** | `10.0.26100` | `mcr.microsoft.com/windows/nanoserver:ltsc2025` | ✅ Native (Build 26100) |

Jika Anda mencoba menjalankan container berbasis `nanoserver:ltsc2022` di atas host Windows Server 2019 dengan *Process Isolation*, Docker daemon akan langsung melempar error fatal:

```text
docker: Error response from daemon: container <hash> encountered an error during 
hcsshim::CreateComputeSystem: The container operating system does not match the host operating system.
```

Untuk mengatasi hal ini dalam alur otomasi fleet, pipeline Ansible kami mendeteksi build kernel host secara dinamis menggunakan variabel `ansible_kernel`:

```yaml
# Cuplikan: roles/role_container_stack/defaults/main.yml
stack_windows_base_image: >-
  {{
    'mcr.microsoft.com/windows/nanoserver:1809' if ((ansible_kernel | default('')) is search('17763'))
    else ('mcr.microsoft.com/windows/nanoserver:ltsc2025' if ((ansible_kernel | default('')) is search('26100'))
    else 'mcr.microsoft.com/windows/nanoserver:ltsc2022')
  }}
```

### 2. Mode Isolasi: Process Isolation vs Hyper-V Isolation

Windows Server menyediakan dua mekanisme isolasi kontainer:

1. **Process Isolation (`--isolation=process`):** Seluruh container berbagi kernel host yang sama. Tingkat konsumsi memori sangat hemat (serupa dengan Linux container), waktu *spin-up* berada di kisaran ratusan milidetik, dan I/O disk berjalan dengan performa native. Namun, mode ini menuntut kecocokan build kernel 100%.
2. **Hyper-V Isolation (`--isolation=hyperv`):** Setiap container dibungkus di dalam mesin virtual mikro (*lightweight utility VM*) dengan kernel Windows sendiri. Mode ini memungkinkan eksekusi container yang berbeda versi build dari host, namun membawa overhead CPU/RAM yang signifikan dan *startup latency* lambat. Lebih krusial lagi, Hyper-V isolation membutuhkan fitur *Nested Virtualization* yang sering kali dinonaktifkan secara default pada instans cloud enterprise (seperti AWS EC2 Nitro standar).

{{< mermaid >}}
flowchart LR
    subgraph PROCESS_ISO["Process Isolation (Pilihan Produksi)"]
        H_K1["Host Windows NT Kernel"]
        C1["Container 1 (ContainerUser)"] --> H_K1
        C2["Container 2 (ContainerUser)"] --> H_K1
    end

    subgraph HYPERV_ISO["Hyper-V Isolation (Overhead Tinggi)"]
        H_K2["Host Windows NT Kernel"]
        subgraph UVM1["Utility VM 1"]
            K1["Dedicated Kernel"] --> C3["Container 3"]
        end
        subgraph UVM2["Utility VM 2"]
            K2["Dedicated Kernel"] --> C4["Container 4"]
        end
        UVM1 --> H_K2
        UVM2 --> H_K2
    end
{{< /mermaid >}}

Dalam arsitektur *high-performance monitoring*, **Process Isolation adalah keharusan mutlak**. Membakar ratusan megabyte RAM hanya untuk *utility VM* per komponen pemantauan akan membebani server aplikasi target.

### 3. Jebakan Non-Admin `ContainerUser` & *Permission Denied*

NanoServer hadir dengan dua akun pengguna bawaan:
- **`ContainerAdministrator`** (SID: `S-1-5-93-2-1`): Pengguna dengan hak administratif penuh.
- **`ContainerUser`** (SID: `S-1-5-93-2-2`): Akun dengan hak terbatas (*unprivileged*).

Banyak praktisi yang frustrasi menghadapi masalah izin di Windows containers mengambil jalan pintas berbahaya: menambahkan instruksi `USER ContainerAdministrator` di Dockerfile atau menambahkan flag `--user ContainerAdministrator` saat runtime.

> [!CAUTION]
> Menjalankan container Windows sebagai `ContainerAdministrator` di lingkungan produksi adalah **pelanggaran fatal standar keamanan** (CIS Docker Benchmark & NIST SP 800-190). Jika container mengalami kompromi akibat celah aplikasi, penyerang memiliki hak administratif untuk merusak host atau membobol isolasi container.

Namun, ketika kita dengan disiplin mempertahankan prinsip *least privilege* menggunakan `ContainerUser`, engine Docker Windows memperlihatkan perilaku bawaan yang menjebak:
Ketika Docker membuat direktori *named volume* baru di host (berlokasi di `C:\ProgramData\docker\volumes\<volume_name>\_data`), Access Control List (DACL) bawaan yang diterapkan NTFS **hanya memberikan izin ke `BUILTIN\Administrators` dan `NT AUTHORITY\SYSTEM`**.

Akun `ContainerUser` tidak berada di dalam grup Administrator host. Hasilnya adalah crash loop instan saat container boot:

```text
# Kegagalan runtime Prometheus TSDB:
err="open C:\\prometheus\\data\\queries.active: Access is denied." panic: Unable to create mmap-ed active query log

# Kegagalan runtime Mailpit SQLite:
level=fatal msg="[db] open C:\data\mailpit.db: Access is denied."
```

Inilah akar masalah yang diselesaikan secara definitif oleh keputusan arsitektur [`TM-ADR-0031`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0031/).

### 4. Misteri `netapi32.dll` pada Binary Go & Ekosistem Node.js

NanoServer dirancang sangat ramping (ukuran unduh terkompresi hanya ~100-250 MB). Untuk mencapai ukuran sekecil itu, ribuan pustaka DLL Win32 bawaan sistem operasi yang dianggap tidak esensial dibuang oleh Microsoft.

Hal ini memicu bug tersembunyi pada biner Go yang dikompilasi secara statically-linked untuk Windows (seperti `prometheus.exe`, `alertmanager.exe`, `mailpit.exe`, dan `tm-agent.exe`). Go standard library pada package `os/user` memanggil API Windows `NetUserGetInfo` untuk menyelesaikan informasi identitas user aktif. Panggilan fungsi ini bertumpu pada **`netapi32.dll`**.

Ketika biner Go dieksekusi di dalam NanoServer murni tanpa DLL tersebut, proses akan langsung mengalami *abnormal termination* atau *panic* saat container dijalankan:

```text
The code execution cannot proceed because netapi32.dll was not found. 
Reinstalling the program may fix this problem.
```

Solusi rekayasa kami adalah menyalin `netapi32.dll` dari direktori `C:\Windows\System32\` host ke dalam build context image kontainer Windows, memastikan bahwa seluruh biner Go dapat memanggil fungsi sistem dengan normal tanpa perlu beralih ke base image `windowsservercore` yang berukuran raksasa (> 3 GB).

Sementara di sisi Node.js (`tomcat-diagnostic-service`), kami menetapkan standar **Node.js 22 LTS (`node-v22.14.0-win-x64`)**. Mengapa? Node.js versi 22 memperkenalkan modul bawaan resmi **`node:sqlite` (`DatabaseSync`)**. Dengan modul bawaan ini, kami mengeliminasi kebutuhan pustaka SQLite pihak ketiga berbasis C++ native (seperti `better-sqlite3` yang mewajibkan instalasi `node-gyp`, Python, dan Visual C++ Build Tools berukuran 4 GB di dalam container image). Hasilnya, container NanoServer tetap ultra-ramping dan proses build berjalan deterministik.

---

## 🔐 Mengatur NTFS Access Control Lists (ACLs) Secara Otomatis (TM-ADR-0031)

Pada sistem operasi Linux, menetapkan isolasi keamanan file dapat dilakukan secara intuitif melalui perintah POSIX standar:

```bash
# Pola izin Linux POSIX
chmod 0700 /opt/tm_home/spool
chmod 0400 /opt/tm_home/secrets/bearer-token
chown -R 1000:1000 /var/lib/docker/volumes/prometheus_data/_data
```

Namun, di Windows Server, perintah `chmod` dan `chown` tidak memiliki makna fungsional. Filesystem NTFS bekerja menggunakan **Security Descriptors**, **Security Identifiers (SID)**, dan **Discretionary Access Control Lists (DACL)** yang jauh lebih kompleks.

### Membedah Pewarisan NTFS: (OI)(CI)(M)

Untuk menjamin bahwa akun `ContainerUser` di dalam kontainer dapat membaca dan menulis ke direktori volume tanpa menjadikannya Administrator, kita harus memberikan hak akses ke grup **`BUILTIN\Users`** (SID: `S-1-5-32-545`) pada level host NTFS.

Setiap aturan hak akses (*Access Control Entry* — ACE) pada NTFS memiliki *inheritance flags*:
- **`OI` (*Object Inherit*):** Berkas di dalam direktori akan mewarisi aturan hak akses ini.
- **`CI` (*Container Inherit*):** Subdirektori baru di dalam folder ini akan mewarisi aturan hak akses ini.
- **`M` (*Modify*):** Hak untuk membaca (*Read*), menulis (*Write*), mengeksekusi (*Execute*), dan menghapus (*Delete*) file atau subdirektori.

> [!IMPORTANT]
> Mengapa kita memberikan hak **`Modify` (`M`)** dan menolak keras **`FullControl` (`F`)**?  
> Hak `FullControl` mengizinkan pemegang hak untuk **mengubah kepemilikan file (*Take Ownership*)** dan **mengubah daftar hak akses (*Change Permissions / DACL*)**. Jika sebuah container dikompromi, penyerang yang memegang hak `FullControl` dapat mengunci administrator host dari direktori tersebut. Dengan membatasi izin hanya pada level `Modify`, container memiliki kebebasan penuh mengelola datanya tanpa risiko merusak postur keamanan host.

### Matriks Pemetaan POSIX ke Windows NTFS ACL

Berdasarkan keputusan resmi [`TM-ADR-0031`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0031/), kami menetapkan matriks konversi izin lintas OS sebagai berikut:

| Kebutuhan Data | Linux POSIX | Windows Target Path | Aturan NTFS ACL (DACL) | Justifikasi Keamanan |
| :--- | :---: | :--- | :--- | :--- |
| **Named Volumes** (Prometheus TSDB, SQLite) | `0700` (`chown container-user`) | `C:\ProgramData\docker\volumes\<name>\_data` | `BUILTIN\Users:(OI)(CI)(M)` | Container non-admin bebas membuat WAL chunks dan file DB tanpa hak edit ACL. |
| **Inter-Process Event Spool** | `0700` (`rw- --- ---`) | `C:\tm_home\spool` | `BUILTIN\Users:(OI)(CI)(M)` | `tm-agent` dan `diagnostic-service` dapat menulis dan merotasi file event JSON. |
| **Declarative Config** | `0644` (`rw- r-- r--`) | `C:\tm_home\config` | `BUILTIN\Users:(OI)(CI)(RX)` | Container hanya diperbolehkan membaca file YAML/JSON, dilarang memodifikasi konfigurasi saat runtime. |
| **Secret Tokens & TLS Keys** | `0400` (`r-- --- ---`) | `C:\tm_home\secrets` & `C:\tm_home\tls` | `BUILTIN\Users:(OI)(CI)(RX)` (Restricted) | Private key dan bearer token dimount `:ro` dan hanya dapat dibaca oleh proses monitoring. |

### Automasi PowerShell & Task Ansible

Untuk mengeliminasi kesalahan konfigurasi manual oleh administrator, manipulasi ACL diotomatiskan sepenuhnya pada playbook Ansible host preparation menggunakan pustaka .NET Framework `System.Security.AccessControl`:

```powershell
# Cuplikan Skrip PowerShell Automasi ACL Named Volumes & Host Bind Mounts
$volumes = @('prometheus_data', 'alertmanager_data', 'mailpit_data', 'spool_data', 'diagnostic_data', 'tomcat_logs')

foreach ($vol in $volumes) {
    $path = "C:\ProgramData\docker\volumes\${vol}\_data"
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
    
    $acl = Get-Acl -Path $path
    $hasUserRule = $false
    
    # Audit apakah BUILTIN\Users sudah memiliki hak Modify
    foreach ($acc in $acl.Access) {
        if ($acc.IdentityReference.Value -eq "BUILTIN\Users" -and 
           ($acc.FileSystemRights.ToString() -match "Modify|FullControl")) {
            $hasUserRule = $true
            break
        }
    }
    
    # Terapkan granular least-privilege Modify rule jika belum ada
    if (-not $hasUserRule) {
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            "BUILTIN\Users",
            "Modify",
            "ContainerInherit,ObjectInherit",
            "None",
            "Allow"
        )
        $acl.AddAccessRule($rule)
        Set-Acl -Path $path -AclObject $acl
        Write-Output "Applied (OI)(CI)M ACL for BUILTIN\Users on $path"
    }
}
```

Bagi operator yang melakukan verifikasi mandiri via Command Prompt / PowerShell, perintah padanan native menggunakan utilitas biner Windows `icacls.exe` adalah:

```cmd
:: Terapkan hak Modify dengan pewarisan penuh ke seluruh subitem secara rekursif
icacls "C:\ProgramData\docker\volumes\prometheus_data\_data" /grant:r "BUILTIN\Users:(OI)(CI)(M)" /T /C
icacls "C:\tm_home\spool" /grant:r "BUILTIN\Users:(OI)(CI)(M)" /T /C

:: Terapkan hak Read & Execute untuk file rahasia dan konfigurasi
icacls "C:\tm_home\config" /grant:r "BUILTIN\Users:(OI)(CI)(RX)" /T /C
icacls "C:\tm_home\secrets" /grant:r "BUILTIN\Users:(OI)(CI)(RX)" /T /C
```

Dengan injeksi ACL terstruktur ini, container NanoServer yang berjalan dengan akun `ContainerUser` dapat langsung melakukan *read/write* ke volume tanpa pernah menerima error *Access is denied*, sementara integritas host OS tetap terlindungi 100%.

---

## 💾 Arsitektur Two-Tier Storage & Aturan "Zero `/tmp`" (TM-ADR-0030)

Salah satu kebiasaan buruk dalam rekayasa aplikasi multi-OS adalah memperlakukan folder temporer sistem (`/tmp` di Linux atau `C:\Windows\Temp` di Windows) sebagai tempat penyimpanan data sementara (*scratchpad*).

### Bahaya Fatal Menggunakan Direktori Temporer Bersama:
1. **Disk Bloat & Space Exhaustion:** File snapshot diagnostik, dump heap memory, dan log aktif yang ditulis ke `/tmp` cepat membengkak dan menghabiskan partisi root OS.
2. **Permission Leakage & Tampering:** Pada environment multi-user atau multi-container, folder temporer publik rentan terhadap manipulasi symlink dan kebocoran data sensitif (*insecure world-writable directory*).
3. **Container Ephemerality Trap:** Menulis state ke dalam filesystem layer container melanggar prinsip *stateless container lifecycle*; ketika container di-restart atau di-recreate akibat crash, seluruh histori diagnostik lenyap seketika.

Oleh karena itu, arsitektur kami memberlakukan aturan keras: **"Zero `/tmp` Policy"**. Tidak ada satu pun komponen monitoring yang diizinkan menulis data kerja ke direktori temporer sistem host maupun container.

Sebagai gantinya, kami merancang **Two-Tier Storage Architecture** yang diresmikan dalam keputusan [`TM-ADR-0030`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0030/).

{{< mermaid >}}
flowchart TB
    subgraph TIER1["Tier 1: High-I/O Named Volumes (Container Engine Subsystem)"]
        direction TB
        V1[("prometheus_data<br/>TSDB chunks, WAL, mmap")]
        V2[("diagnostic_data<br/>SQLite diagnostic.db & WAL")]
        V3[("alertmanager_data<br/>Silences & notification state")]
        V4[("mailpit_data<br/>SMTP mail storage SQLite")]
    end

    subgraph TIER2["Tier 2: Host Control Plane (tm_home Workspace)"]
        direction TB
        H1["config/ (:ro bind)<br/>YAML, JSON declaration"]
        H2["secrets/ (:ro bind)<br/>Bearer tokens, Passwords (0400)"]
        H3["tls/ & jmx-tls/ (:ro bind)<br/>Certs, Keys, Keystore.p12"]
        H4["spool/ (:rw bind)<br/>Atomic event snapshot buffer (0700)"]
        H5["bin/ & scripts/ (Host Only)<br/>tmctl CLI, verify test suites"]
    end

    subgraph RUNTIME["Multi-OS Workloads (NanoServer & Linux)"]
        PROM["Prometheus (:9090)"]
        DS["Diagnostic Service (:8443)"]
        AGENT["tm-agent (Event Collector)"]
    end

    V1 <== Native Block I/O ==> PROM
    V2 <== Native SQLite Lock ==> DS
    H1 -.->|Read Only Mount| PROM
    H1 -.->|Read Only Mount| DS
    H2 -.->|Read Only Mount| DS
    AGENT ==>|Atomic Write .tmp to .json| H4
    H4 -.->|Read & Ingest| DS
{{< /mermaid >}}

### 1. Tier 1: Container Engine Named Volumes (Database Ber-I/O Tinggi)
Tier ini dialokasikan khusus untuk penyimpanan data stateful yang membutuhkan throughput disk tinggi, operasi *memory-mapped file* (mmap), dan penanganan penguncian file database (*file locking*) yang agresif:
- **Prometheus TSDB Chunks & WAL (`prometheus_data`)**
- **SQLite Database Diagnostic Engine (`diagnostic_data`)**
- **Alertmanager State Engine (`alertmanager_data`)**
- **Mailpit Testing Store (`mailpit_data`)**

**Mengapa Named Volumes, bukan Host Directory Bind-Mount?**
Pada Windows Server, melakukan bind mount direktori host biasa (`C:\MyData`) ke dalam container Windows sering kali memicu hambatan performa akibat lapisan translasi virtualisasi filesystem, serta rentan terhadap *file locking collision* antara proses host (seperti Windows Defender / antivirus scan) dan engine database. 

Dengan mempercayakan database ke *Container Engine Named Volumes* (`C:\ProgramData\docker\volumes\...` di Windows atau storage subsystem Podman/Docker di Linux), engine kontainer mengontrol penuh alokasi blok penyimpanan secara native, menjamin performa maksimal dan integritas atomik ACID SQLite.

### 2. Tier 2: Host Workspace Directory (`tm_home`)
Tier ini adalah ruang kerja terstandarisasi di sisi host yang mengadopsi konvensi ekosistem Java/Tomcat (`CATALINA_HOME`, `JAVA_HOME`). Direktori default berada di:
- **`C:\tm_home`** pada Windows Server.
- **`/opt/tm_home`** pada Linux Server.

Hierarki internal `tm_home` diatur secara ketat:
```text
tm_home/                                        # Root Home Workspace
├── config/                                     # [Bind-Mount ro] Konfigurasi deklaratif komponen
│   ├── alertmanager/                           # alertmanager.yml & routes
│   ├── diagnostic-service/                     # application.json, targets.json
│   ├── prometheus/                             # prometheus.yml, alert rules
│   └── rules/                                  # Rulepack catalog JSON (20 decision branches)
├── spool/                                      # [Bind-Mount rw] Inter-container event buffer (0700 / Modify)
├── tls/ & jmx-tls/                             # [Bind-Mount ro] X.509 Certs, Keys, Keystore PKCS12
├── secrets/                                    # [Bind-Mount ro] Kredensial & bearer tokens
├── bin/                                        # [Host Only] Tooling operator (tmctl.exe / tmctl)
└── scripts/                                    # [Host Only] Skrip operasional verifikasi & testing
```

### Fleksibilitas Multi-Drive Enterprise
Di server produksi, partisi sistem operasi (`C:\` di Windows atau `/` di Linux) biasanya memiliki kuota terbatas. Seluruh arsitektur `tm_home` dirancang sepenuhnya modular dan dapat dialokasikan ke partisi disk terpisah (misalnya partisi performa tinggi `D:\tm_home` atau `/data/tm_home`) hanya dengan mengubah satu baris konfigurasi inventori Ansible:

```ini
# inventories/enterprise-matrix.ini
[windows_nodes:vars]
tm_root_dir=D:\tm_home
project_root=D:\tm_home
spool_dir=D:\tm_home\spool

[linux_nodes:vars]
tm_root_dir=/data/tm_home
project_root=/data/tm_home
```

### Pure Container Logging Engine Model (12-Factor App XI)
Sejalan dengan prinsip modern *12-Factor App Factor XI (Logs as Event Streams)*, arsitektur ini **mengeliminasi direktori `logs/` statis di host**. 

Tidak ada file log berputar (*log rotation*) yang mengotori filesystem host. Seluruh log aplikasi (Prometheus, Alertmanager, Diagnostic Engine, Mailpit) dipancarkan langsung ke aliran `stdout` dan `stderr` kontainer. Tim SRE melakukan inspeksi log langsung melalui antarmuka universal:

```powershell
# Inspeksi log real-time di Windows maupun Linux
docker logs diagnostic-service --tail 50 -f
docker logs prometheus --tail 50
```

---

## 🔍 Perbandingan Implementasi: Linux Containerfile vs Windows Dockerfile

Kunci keberhasilan paradigma *True Dual-Symmetry* terletak pada kemampuan menyusun Dockerfile yang mematuhi standar kontrak yang sama persis tanpa memaksa modifikasi pada kode sumber aplikasi.

Mari kita bandingkan implementasi nyata pada komponen **Tomcat Diagnostic Service** dan **Prometheus TSDB**:

### 1. Komparasi Dockerfile: Diagnostic Service

Perhatikan bagaimana kedua Dockerfile di bawah mengeksekusi biner yang sama (`src/main.js`) dan membaca argumen konfigurasi yang simetris, namun mengadaptasi runtime dasar masing-masing OS:

````carousel
```dockerfile
# ==============================================================================
# Linux Containerfile: docker/linux/diagnostic-service.Dockerfile
# Architecture Reference: TM-ADR-0026 & TM-ADR-0031
# ==============================================================================
ARG BASE_IMAGE=docker.io/library/node:22-alpine
FROM ${BASE_IMAGE}

LABEL maintainer="Eddy Wiyatno" \
      description="Linux Container for Tomcat Diagnostic Service"

WORKDIR /app
COPY package*.json /app/
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund 2>/dev/null || true

COPY src /app/src
COPY config /app/config
COPY migrations /app/migrations

# Inisialisasi direktori data dan jalankan sebagai unprivileged user (node:node)
RUN mkdir -p /var/lib/tomcat-diagnostic && chown -R node:node /var/lib/tomcat-diagnostic /app

USER node
EXPOSE 8443

CMD ["node", "src/main.js", "--config", "/opt/tm_home/config/diagnostic-service/application.json"]
```
<!-- slide -->
```dockerfile
# ==============================================================================
# Windows Dockerfile: docker/windows/diagnostic-service.Dockerfile
# Architecture Reference: TM-ADR-0026, TM-ADR-0030 & TM-ADR-0031
# ==============================================================================
ARG BASE_IMAGE=mcr.microsoft.com/windows/nanoserver:ltsc2022
FROM ${BASE_IMAGE}

LABEL maintainer="Eddy Wiyatno" \
      description="Windows Container for Tomcat Diagnostic Service"

# Salin helper DLL yang dibutuhkan Go/Node networking di NanoServer
COPY netapi32.dll C:/Windows/System32/

# Salin runtime Node.js 22 LTS portable (Zero Visual C++ dependencies)
WORKDIR C:/node
COPY node.exe C:/node/node.exe

# Salin source code aplikasi diagnostik (Identik dengan versi Linux)
WORKDIR C:/app
COPY package.json package-lock.json C:/app/
COPY node_modules C:/app/node_modules/
COPY src C:/app/src/
COPY config C:/app/config/
COPY migrations C:/app/migrations/

ENV NODE_ENV=production
EXPOSE 8443

# Dieksekusi secara otomatis di bawah akun non-admin ContainerUser
ENTRYPOINT ["C:/node/node.exe", "C:/app/src/main.js", "--config", "C:/tm_home/config/diagnostic-service/application.json"]
```
````

### 2. Komparasi Dockerfile: Prometheus TSDB

Pada komponen Prometheus, kita melihat bagaimana biner Go dieksekusi secara native di Windows NanoServer dengan isolasi volume yang identik dengan Linux:

````carousel
```dockerfile
# ==============================================================================
# Linux Containerfile: docker/linux/prometheus.Dockerfile
# ==============================================================================
ARG BASE_IMAGE=docker.io/prom/prometheus:v2.54.1
FROM ${BASE_IMAGE}

LABEL maintainer="Eddy Wiyatno" \
      description="Linux Container for Prometheus TSDB"

EXPOSE 9090

ENTRYPOINT ["/bin/prometheus", \
            "--config.file=/opt/tm_home/config/prometheus/prometheus.yml", \
            "--storage.tsdb.path=/prometheus/data", \
            "--web.listen-address=0.0.0.0:9090", \
            "--web.enable-lifecycle"]
```
<!-- slide -->
```dockerfile
# ==============================================================================
# Windows Dockerfile: docker/windows/prometheus.Dockerfile
# ==============================================================================
ARG BASE_IMAGE=mcr.microsoft.com/windows/nanoserver:ltsc2022
FROM ${BASE_IMAGE}

LABEL maintainer="Eddy Wiyatno" \
      description="Windows Container for Prometheus Monitoring TSDB"

# Menyuntikkan netapi32.dll agar fungsi os/user.Current() Go tidak crash
COPY netapi32.dll C:/Windows/System32/

WORKDIR C:/prometheus
COPY prometheus.exe C:/prometheus/prometheus.exe
COPY promtool.exe C:/prometheus/promtool.exe

EXPOSE 9090
VOLUME ["C:/etc/prometheus", "C:/prometheus/data"]

# Dieksekusi dengan konfigurasi parameter yang setara dengan Linux
ENTRYPOINT ["C:/prometheus/prometheus.exe", \
            "--config.file=C:/etc/prometheus/prometheus.yml", \
            "--storage.tsdb.path=C:/prometheus/data", \
            "--web.listen-address=0.0.0.0:9090", \
            "--web.enable-lifecycle"]
```
````

### Alur Eksekusi Container di Host (Ansible Orchestration)

Ketika Ansible mengeksekusi task deployment pada node Windows Server, perintah `docker run` memetakan *Two-Tier Storage* secara presisi:

```yaml
# Cuplikan: roles/role_container_stack/tasks/windows/diagnostic_service.yml
- name: Run Diagnostic Service container on Windows host
  ansible.windows.win_command: >
    docker run -d
    --name diagnostic-service
    --hostname diagnostic-service
    --network monitoring_net
    -p 8443:8443
    -v {{ project_root }}\config\diagnostic-service:C:\tm_home\config\diagnostic-service
    -v {{ project_root }}\secrets:C:\tm_home\secrets
    -v {{ project_root }}\tls:C:\tm_home\tls
    -v {{ project_root }}\spool:C:\tm_home\spool
    -v diagnostic_data:C:\var\lib\tomcat-diagnostic
    --restart unless-stopped
    diagnostic-service-win:latest
```

---

## 🛠️ Unifikasi Tooling: Operator CLI `tmctl` & Agen `tm-agent` (TM-ADR-0027)

Bahkan jika kontainer dapat berjalan simetris di kedua OS, friksi operasional sering kali berpindah ke tim SRE: operator Linux terbiasa dengan skrip Bash (`deploy.sh`, `validate.sh`), sedangkan operator Windows harus menghafal perintah PowerShell (`deploy.ps1`, `validate.ps1`). Perbedaan sintaksis, penanganan *line endings* (`LF` vs `CRLF`), dan mekanisme subshell selalu menjadi sumber kegagalan otomasi CI/CD.

Berdasarkan keputusan arsitektur [`TM-ADR-0027: Adopt Container Engine Socket API and Unified Cross-Platform Tooling`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0027/), kami menghentikan ketergantungan pada skrip shell imperatif di target host dan membangun satu biner terpadu berbasis Go: **`tmctl`**.

{{< mermaid >}}
flowchart LR
    subgraph SRE_TEAM["Operator / CI/CD Pipeline"]
        DEV["SRE on Linux Workstation"]
        WIN_OP["Operator on Windows Server"]
        JENKINS["Jenkins Automation Runner"]
    end

    subgraph UNIFIED_BINARY["Unified Tooling (Single Static Go Binary)"]
        TMCTL_LIN["tmctl (Linux ELF)"]
        TMCTL_WIN["tmctl.exe (Windows PE)"]
    end

    subgraph SOCKET_LAYER["Universal Container Socket API"]
        SOCK_UNIX["Unix Socket: /var/run/docker.sock"]
        SOCK_PIPE["Named Pipe: \\\\.\\pipe\\docker_engine"]
    end

    subgraph FLEET["Running Container Stack"]
        C_FLEET["Tomcat, Prometheus, Diagnostic, Alertmanager"]
    end

    DEV -->|tmctl stack deploy| TMCTL_LIN
    WIN_OP -->|tmctl.exe stack deploy| TMCTL_WIN
    JENKINS --> TMCTL_LIN
    JENKINS --> TMCTL_WIN

    TMCTL_LIN ==> SOCK_UNIX
    TMCTL_WIN ==> SOCK_PIPE
    SOCK_UNIX --> C_FLEET
    SOCK_PIPE --> C_FLEET
{{< /mermaid >}}

### Mengapa Go dan Container Engine Socket API?
1. **Single Static Binary Tanpa Ketergantungan Eksternal:** Biner Go tidak membutuhkan instalasi runtime Node.js, Python, atau interpreter Bash di server target. Ukuran memori saat eksekusi sangat kecil (< 15 MB RAM).
2. **Abstraksi Soket Universal:** Alih-alih mengeksekusi perintah CLI `docker` atau `podman` lewat shell anak (*child process spawning*), `tmctl` berbicara langsung ke **Container Engine REST API**:
   - Di Linux: Berkomunikasi via Unix Domain Socket (`/var/run/docker.sock` atau `/run/user/<uid>/podman/podman.sock`).
   - Di Windows: Berkomunikasi via Windows Named Pipe (`\\.\pipe\docker_engine`).
3. **Penyatuan Pengalaman SRE (*Developer & SRE Experience*):** Operator di kedua sistem operasi menjalankan perintah yang 100% sama persis:

```bash
# Perintah seragam di Linux (Bash) dan Windows (PowerShell/CMD):
tmctl stack deploy --env lab
tmctl stack status
tmctl rules ingest catalog/tomcat-oom-rules.json
tmctl validate
```

Di samping `tmctl`, kami juga memodernisasi daemon penangkap event kontainer menjadi **`tm-agent`** (ditulis dalam bahasa Go). Agen ini berlangganan langsung ke *event stream* Docker socket (`GET /events`), mendeteksi siklus hidup kontainer Tomcat (`died`, `oom`, `restart`), memformat data snapshot sesuai skema kanonikal `event-record-v1.schema.json`, dan melakukan penulisan atomik (`.tmp` $\rightarrow$ `.json`) ke dalam direktori `tm_home/spool/` yang aman.

---

## 📋 Checklist Kesiapan Produksi (Production Readiness Checklist)

Sebelum meluncurkan Windows Containers ke lingkungan produksi enterprise, gunakan checklist verifikasi rekayasa berikut untuk memastikan keandalan sistem:

| Area Evaluasi | Parameter Verifikasi | Status Wajib | Metode Validasi |
| :--- | :--- | :---: | :--- |
| **Kernel Matching** | Versi build NanoServer identik dengan build Windows Server host. | 🔴 Wajib Mutlak | Bandingkan `(Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").CurrentBuild` dengan tag image base. |
| **Isolation Mode** | Mode isolasi tervalidasi sebagai `Process Isolation`. | 🔴 Wajib Mutlak | Jalankan `docker run --isolation=process ...` dan pastikan tidak jatuh ke Hyper-V fallback. |
| **Least Privilege** | Container dieksekusi di bawah akun `ContainerUser` (Bukan Administrator). | 🔴 Wajib Mutlak | Inspeksi `docker exec <id> whoami` $\rightarrow$ Wajib merespons `ContainerUser`. |
| **NTFS DACL Audit** | Direktori named volumes `_data` memiliki ACE `BUILTIN\Users:(OI)(CI)(M)`. | 🔴 Wajib Mutlak | Jalankan `icacls "C:\ProgramData\docker\volumes\<name>\_data"` di PowerShell host. |
| **DLL Dependencies** | File `netapi32.dll` telah diinjeksi ke dalam NanoServer base context. | 🟡 Kritis | Pastikan biner Go (`prometheus.exe`, `tm-agent.exe`) dapat boot tanpa DLL load error. |
| **Storage Segregation** | Database Tier 1 berada di Named Volumes, `tm_home` berada di partisi data non-sistem (misal `D:\tm_home`). | 🟢 Rekomendasi | Periksa kapasitas disk drive via `Get-PSDrive`. |
| **Zero `/tmp` Audit** | Tidak ada konfigurasi atau kode yang mereferensikan `/tmp` atau `C:\Windows\Temp`. | 🔴 Wajib Mutlak | Jalankan audit statis `grep -rn "/tmp" config/ src/`. |
| **Readiness Probing** | Endpoint HTTP/HTTPS merespons status `UP` secara deterministik. | 🔴 Wajib Mutlak | Probe `https://127.0.0.1:8443/health/live` (200 OK) dan `http://127.0.0.1:9090/-/ready` (200 OK). |

---

## 🚀 Bukti Verifikasi Lapangan (Live Multi-Node Fleet)

Penerapan standar arsitektur [`TM-ADR-0030`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0030/) dan [`TM-ADR-0031`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0031/) telah diuji dan divalidasi secara nyata pada klaster pengujian hybrid di AWS EC2 (*Amazon Linux 2023* dan *Windows Server 2022 Datacenter*):

```text
================================================================================
MULTI-OS FLEET LIVE VERIFICATION REPORT
Generated at: 2026-09-18T10:45:00Z
================================================================================

[+] TARGET NODE 1: Windows Server 2022 Datacenter (AWS EC2 / 184.194.25.77)
    - OS Build: 10.0.20348 (LTSC 2022)
    - Container Engine: Docker Engine 26.1.4 (OSType: windows, Isolation: process)
    - Container User Identity: ContainerUser (Non-Admin / SID S-1-5-93-2-2)
    - Storage Model: Two-Tier (C:\tm_home Workspace + Named Engine Volumes)
    
    Container Fleet Status:
    ✔ diagnostic-service-win:latest    Up (0.0.0.0:8443->8443)   Health: 200 OK (https://172.22.229.173:8443/health/live)
    ✔ prometheus-win:latest            Up (0.0.0.0:9090->9090)   Health: 200 OK (http://172.22.237.18:9090/-/ready)
    ✔ mailpit-win:latest               Up (0.0.0.0:8025->8025)   Health: 200 OK (http://172.22.229.10:8025/api/v1/messages)
    ✔ alertmanager-win:latest          Up (0.0.0.0:9093->9093)   Health: 200 OK
    ✔ tm-agent-win:latest              Up (Event Stream Listening to \\.\pipe\docker_engine)

[+] TARGET NODE 2: Amazon Linux 2023 (AWS EC2 / 3.82.132.6)
    - OS Kernel: Linux 6.1.100-111.176.amzn2023.x86_64
    - Container Engine: Podman 4.9.4-rhel (OSType: linux, Rootless Mode)
    - Storage Model: Two-Tier (/opt/tm_home Workspace + Podman Named Volumes)
    
    Container Fleet Status:
    ✔ tomcat-diagnostic-service:latest Up (0.0.0.0:8443->8443)   Health: 200 OK (https://127.0.0.1:8443/health/live)
    ✔ prometheus:1.0.0                 Up (0.0.0.0:9090->9090)   Health: 200 OK (http://127.0.0.1:9090/-/ready)
    ✔ alertmanager:1.0.0               Up (0.0.0.0:9093->9093)   Health: 200 OK
    ✔ mailpit:v1.31.0                  Up (0.0.0.0:8025->8025)   Health: 200 OK
    ✔ tomcat-jmx-exporter:1.0.0        Up (0.0.0.0:9404->9404)   Health: 200 OK (TLS Enabled)

[RESULT]: 100% OPERATIONAL SYMMETRY ACHIEVED ACROSS BOTH OPERATING SYSTEMS.
```

---

## 🏁 Kesimpulan & Rekomendasi Arsitektur

Menjalankan stack pemantauan modern di Windows Containers sering kali dianggap sebagai rute yang penuh duri dan dihindari oleh banyak praktisi infrastruktur. Namun, studi kasus rekayasa ini membuktikan bahwa dengan disiplin arsitektur yang tepat, **Windows Docker NanoServer dapat dijinakkan sepenuhnya**:

1. **Abstraksikan Sistem Operasi di Level Packaging:** Pertahankan basis kode aplikasi Anda murni dan agnostik terhadap sistem operasi. Biarkan Dockerfile dan build matrix yang menyerap perbedaan pustaka sistem atau dependensi biner.
2. **Kuasai NTFS Access Control Lists:** Jangan pernah menyerah pada godaan menjalankan container sebagai Administrator. Terapkan hak akses granular `BUILTIN\Users:(OI)(CI)(M)` pada direktori volume untuk menjamin kepatuhan *Least Privilege*.
3. **Terapkan Two-Tier Storage & Singkirkan `/tmp`:** Pisahkan database ber-I/O tinggi ke dalam Named Volumes engine, dan standarisasikan seluruh kontrol plane konfigurasi ke dalam ruang kerja yang terstruktur (`tm_home`).
4. **Unifikasi Pengalaman SRE dengan Go:** Gunakan kakas CLI berbasis Go seperti `tmctl` yang berinteraksi langsung ke Container Engine Socket API untuk menghapus disparitas antarmuka antara PowerShell dan Bash.

### Referensi Resmi Arsitektur (DevOps Handbook):
- 📘 [`TM-ADR-0030: Standardize Host Workspace Directory to tm_home, Two-Tier Storage Architecture, Parameterized Drive Mounting, and Pure Container Logging Model`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0030/)
- 📘 [`TM-ADR-0031: Granular Least-Privilege NTFS Volume Access Controls for Non-Admin Windows Containers, Configuration Namespace Alignment, and Diagnostic Runtime Integrity`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0031/)
- 📘 [`TM-ADR-0027: Adopt Container Engine Socket API and Unified Cross-Platform Tooling for Multi-OS Orchestration`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0027/)
- 📘 [`TM-ADR-0026: Multi-Engine Container Portability (Docker & Podman)`](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0026/)
- 📦 Repositori Implementasi: [github.com/edkas07-oss/tomcat-monitoring](https://github.com/edkas07-oss/tomcat-monitoring)
