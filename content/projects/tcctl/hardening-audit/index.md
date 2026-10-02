+++
title = "tcctl hardening & va — Static CIS Benchmark 9 Rules & Trivy Vulnerability Auditor"
date = "2026-09-25T23:50:00+07:00"
draft = false
summary = "Bedah arsitektur modul hardening dan vulnerability assessment (VA) tcctl: mesin audit statis 9 aturan CIS Benchmark untuk XML konfigurasi Tomcat, penegakan isolasi non-root ContainerUser, dan integrasi scanner Trivy sebagai quality gate deterministik."
author = "Eddy Wiyatno"
categories = ["Security", "DevSecOps", "Compliance"]
tags = ["tcctl", "security", "cis-benchmark", "trivy", "hardening", "tomcat", "windows-containers", "compliance"]
series = ["Apache Tomcat Enterprise Platform"]
toc = true
showSummary = true
+++

{{< lead >}}
**Offline Static XML AST Analyzer & Container Security Quality Gate**

Modul `tcctl hardening` dan `tcctl va` menyematkan kemampuan tata kelola keamanan proaktif langsung ke dalam biner operator. Melalui audit statis 9 aturan CIS Benchmark untuk berkas konfigurasi Tomcat dan pemindaian kerentanan image via Trivy, modul ini memastikan beban kerja bebas dari celah keamanan sebelum mencapai runtime produksi.
{{< /lead >}}

---

## 💡 Motivasi Rekayasa: Mengapa Konfigurasi Bawaan Tomcat Berbahaya?

Instalasi Apache Tomcat standar dirancang untuk kemudahan pengembang lokal, bukan untuk standar ketat pertahanan berlapis di lingkungan perbankan atau cloud enterprise. Menjalankan konfigurasi bawaan di dalam kontainer Windows atau Linux membuka celah eksploitasi serius:

1. **Port Shutdown Server Terbuka (`port="8005"`):**  
   Secara default, Tomcat mendengarkan perintah `SHUTDOWN` melalui port TCP lokal. Siapa pun di jaringan kontainer internal yang dapat mengirimkan string tersebut dapat mematikan runtime Tomcat secara instan.
2. **Penyusupan Informasi melalui Versi Server (*Banner Leaking*):**  
   Header HTTP seperti `Server: Apache-Coyote/1.1` atau `Server: Apache Tomcat/9.0.x` secara eksplisit memberitahukan versi runtime kepada penyerang, mempermudah identifikasi CVE publik.
3. **Eskalasi Hak Akses Host melalui `ContainerAdministrator`:**  
   Pada Windows Containers, menjalankan kontainer sebagai administrator memberikan akses baca-tulis tak terbatas ke seluruh filesystem host yang terikat (*bind mount*), meniadakan konsep isolasi tenant.
4. **Ketiadaan Cookie Security Flags:**  
   Session ID (`JSESSIONID`) yang dikirimkan tanpa flag `Secure` dan `HttpOnly` rentan disadap via Man-In-The-Middle (MITM) atau dicuri melalui serangan Cross-Site Scripting (XSS).

---

## 📊 Matriks 9 Aturan CIS Benchmark Tomcat (`tcctl hardening`)

`tcctl hardening` melakukan inspeksi berbasis *Abstract Syntax Tree (AST)* XML terhadap berkas `server.xml`, `web.xml`, dan `context.xml` secara luring (*offline*) tanpa memerlukan runtime Tomcat menyala:

| Kode Aturan | Target Berkas | Standar Evaluasi CIS Benchmark | Aksi Rekomendasi / Fix |
| :--- | :--- | :--- | :--- |
| **`CIS-TC-01`** | `server.xml` | Nonaktifkan port shutdown (`Server port="-1"`) | Mengubah port shutdown ke `-1` |
| **`CIS-TC-02`** | `server.xml` | Sembunyikan server banner (`xpoweredBy="false"`, `server="Secure"`) | Menyuntikkan atribut sanitasi header |
| **`CIS-TC-03`** | `context.xml` | Nonaktifkan symlink resource (`allowLinking="false"`) | Mencegah path traversal di luar docBase |
| **`CIS-TC-04`** | `web.xml` | Tegakkan `HttpOnly` flag pada session cookies | Menambahkan konfigurasi `<http-only>true</http-only>` |
| **`CIS-TC-05`** | `web.xml` | Tegakkan `Secure` flag pada session cookies | Menambahkan konfigurasi `<secure>true</secure>` |
| **`CIS-TC-06`** | `web.xml` | Aktifkan `HttpHeaderSecurityFilter` (HSTS, Anti-Clickjacking) | Mendaftarkan filter dan mapping keamanan HTTP |
| **`CIS-TC-07`** | `conf/` | Batasi izin berkas konfigurasi host bind-mount (`:ro`) | Penegakan read-only mount pada runtime engine |
| **`CIS-TC-08`** | `Dockerfile` | Larang eksekusi akun `ContainerAdministrator` / `root` | Wajib mendefinisikan `USER ContainerUser` |
| **`CIS-TC-09`** | `server.xml` | Nonaktifkan SSL/TLS protokol lemah (SSLv3, TLS 1.0, TLS 1.1) | Mengunci konfigurasi hanya TLSv1.2 dan TLSv1.3 |

---

## 🏛️ Pipeline Evaluasi Keamanan & Scanning

Alur verifikasi keamanan bekerja sebagai gerbang kualitas (*quality gate*) terintegrasi dalam pipeline rilis:

{{< mermaid >}}
flowchart TD
    %% Styling Classes
    classDef check fill:#0f172a,stroke:#38bdf8,stroke-width:1.5px,color:#38bdf8;
    classDef pass fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#ffffff;
    classDef fail fill:#881337,stroke:#f43f5e,stroke-width:1.5px,color:#ffffff;

    CONF["Direktori Konfigurasi Tomcat<br/>(conf/server.xml, web.xml)"] --> AST["1. tcctl hardening audit<br/>(Offline XML AST Engine)"]:::check
    
    AST --> EVAL{"2. CIS 9-Rules Compliance Evaluation"}
    
    EVAL -- "Ditemukan Pelanggaran (FAIL)" --> GEN["3. Tampilkan Pelanggaran & JSON Report<br/>Opsi: tcctl hardening fix"]:::fail
    EVAL -- "100% Compliant (PASS)" --> TRIVY["4. tcctl va scan<br/>(Trivy CVE & Vulnerability Scan)"]:::check
    
    TRIVY --> CVE_CHECK{"5. Severity Threshold Check<br/>(Toleransi: 0 Critical / 0 High)"}
    
    CVE_CHECK -- "Melebihi Batas Toleransi" --> BLOCK["6. Blokir Deployment & Export SARIF/JSON"]:::fail
    CVE_CHECK -- "Lolos Threshold" --> GATE_PASS["7. Quality Gate Terpenuhi: Lanjut ke tcctl deploy"]:::pass
{{< /mermaid >}}

---

## 🔒 Isolasi Runtime: ContainerUser & Read-Only XML

Sesuai dokumen arsitektur [TC-ADR-0009](file:///home/eddywiyatno/git/devops-handbook/docs/projects/tomcat/engineering-journal/platform-foundation-and-hardening/TN-006-standardize-enterprise-drive-separation-docker-data-root-and-host-bind-mount-hierarchy.md), mitigasi eskalasi hak akses diwujudkan melalui dua pilar wajib:

### 1. Eliminasi Privilese Administrator
Image Windows Containers (`nanoserver` atau `servercore`) dikunci agar berjalan menggunakan akun bawaan Windows `ContainerUser`. Hal ini memastikan bahwa proses Java tidak dapat mengubah file sistem internal Windows atau memodifikasi registry host.

### 2. Immutability Konfigurasi Runtime
Seluruh direktori `conf/` yang di-mount dari host ke kontainer diatur dengan flag `:ro` (*Read-Only*). Jika aplikasi Java dieksploitasi melalui celah *Remote Code Execution (RCE)*, penyerang tidak dapat mengubah file `tomcat-users.xml`, `server.xml`, atau menanam backdoor persistent pada konfigurasi Tomcat.

---

## 💻 Panduan Eksekusi CLI

### 1. Menjalankan Audit Kepatuhan CIS
```bash
# Melakukan audit statis pada direktori conf instance Tomcat
tcctl hardening audit --conf C:/tomcats/payment-service/conf

# Menghasilkan laporan kepatuhan dalam format JSON untuk integrasi SIEM
tcctl hardening audit --conf /opt/tomcats/conf --json report-cis.json
```

### 2. Remediasi Otomatis Berkas Konfigurasi
```bash
# Menerapkan patch otomatis CIS Benchmark pada server.xml dan web.xml
tcctl hardening fix --conf C:/tomcats/payment-service/conf --backup
```

### 3. Pemindaian Kerentanan Image Kontainer (Trivy VA)
```bash
# Menjalankan pemindaian kerentanan CVE pada base image Tomcat
tcctl va scan \
  --image myregistry.local/tomcat-nanoserver:9.0.95 \
  --severity CRITICAL,HIGH \
  --exit-code-on-fail
```

---

## 🔗 Keterkaitan dengan Modul Lain

* [**tcctl deploy**]({{< relref "staging-rollout" >}}): Menolak melakukan deployment jika direktori `conf/` belum lolos audit CIS Benchmark atau jika image mengandung kerentanan kategori *Critical*.
* [**tcctl gitops**]({{< relref "gitops-reconciler" >}}): Mengevaluasi kepatuhan konfigurasi yang ditarik dari repositori Git sebelum memicu proses rollout kontainer secara otonom.
