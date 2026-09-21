+++
title = "Forensik Kontainer Real-Time di Production: Menangkap Momen Crash Menggunakan Golang, Socket API, dan Atomic Spool"
date = "2026-09-21T07:50:00+07:00"
draft = false
summary = "Membedah arsitektur forensik kontainer modern di production: mengapa interval scrape Prometheus gagal menangkap momen crash fatal OOMKilled atau segfault saat auto-restart aktif, bagaimana Golang dan Container Engine Socket API (Podman, Docker, Windows Named Pipes) menangkap point-in-time evidence milidetik terminasi, serta implementasi zero-dependency tooling melalui tm-agent dan tmctl."
author = "Eddy Wiyatno"
categories = ["DevOps", "Golang"]
tags = ["golang", "devops", "docker", "podman", "sre", "observability", "systems-programming"]
series = ["Enterprise Observability & Systems Engineering"]
toc = true
showSummary = true
+++

## 📌 Ringkasan Eksekutif (TL;DR)

Mengoperasikan beban kerja berbasis kontainer di lingkungan produksi skala enterprise selalu dihadapkan pada dilema observabilitas yang pelik: **kecepatan pemulihan layanan (*Mean Time to Recovery* — MTTR) berbanding terbalik dengan kemampuan investigasi akar masalah (*Root Cause Analysis* — RCA)**. Penggunaan kebijakan *auto-restart* (seperti `restart: unless-stopped` atau `restartPolicy: Always`) memang menjamin ketersediaan aplikasi, namun secara bersamaan melenyapkan seluruh bukti forensik in-memory seketika saat proses mengalami crash fatal (seperti *Out-Of-Memory* `exit 137` atau *Segmentation Fault* `exit 139`).

Di sisi lain, mekanisme pemantauan berbasis tarikan terjadwal (*scheduled pull telemetry*) seperti **Prometheus scrape loop** (dengan interval standar 15 hingga 60 detik) memiliki *blind spot* temporal yang lebar. Jika sebuah kontainer mengalami lonjakan memori, terbunuh oleh Linux OOM Killer, lalu dihidupkan kembali oleh container runtime dalam rentang 3 detik, Prometheus scrape berikutnya hanya akan mencatat kontainer dalam status `UP` dengan PID baru. Bagi tim SRE, insiden ini tampak sebagai "gangguan misterius" (*ghost crash*) di mana keluhan pengguna masuk namun metrik telemetri terlihat normal.

Untuk mengatasi dilema ini, saya merancang dan mengimplementasikan arsitektur pengumpul bukti forensik instan berbasis **Container Engine Socket API** dengan kakas sistem berbahasa **Go (Golang)**:
1. **`tm-agent` (Passive Background Daemon):** Agen ber-footprint memori ultra-rendah (< 15 MB RAM) yang berlangganan langsung ke *event stream* soket container engine (Unix Socket Linux maupun Windows Named Pipes) secara non-blocking, menangkap snapshot status kontainer pada milidetik yang sama saat sinyal terminasi dipancarkan.
2. **Normalized Evidence Spooling:** Mengisolasi data forensik ke direktori spool lokal dengan pengerasan izin ketat (`0700` untuk direktori, `0600` untuk berkas JSON) serta pola penulisan atomik (*two-stage atomic write rename*) untuk mengeliminasi *race condition* pembacaan oleh mesin analisis `diagnostic-service`.
3. **`tmctl` (Unified Cross-Platform Operator CLI):** Kakas biner statis tunggal (*single static binary*) lintas OS yang menyamarkan disparitas Docker dan Podman, sekaligus mengubah skrip automasi Ansible menjadi *Thin Declarative Orchestrator*.

Artikel teknis ini membedah prinsip arsitektur, tantangan rekayasa sistem multi-OS, serta implementasi kode Go di balik sistem forensik kontainer real-time ini.

---

## 🌍 Dilema Forensik Kontainer di Production: Tragedi "Ghost Crash" & Auto-Restart

Dalam rekayasa keandalan sistem (*Site Reliability Engineering*), investigasi kegagalan proses aplikasi mengandalkan tiga artefak utama: kode keluar proses (*exit code*), sinyal terminasi kernel (*OS termination signals*), dan rekaman telemetri sesaat sebelum kegagalan (*pre-crash snapshot*). Namun, dalam arsitektur kontainer modern, karakteristik *ephemeral* dan otomasi orkestrasi justru menjadi musuh utama investigasi forensik.

{{< mermaid >}}
flowchart TD
    subgraph TIMELINE["Garis Waktu Insiden Kontainer (15 Detik Scrape Window)"]
        direction LR
        T0["Detik 00:00<br/>Prometheus Scrape #1<br/>Status: <b>UP (PID 1024)</b><br/>Memory: 450 MB"]
        T3["Detik 00:03<br/>Memory Leak Spike<br/>Memory: 2048 MB<br/><b>Kernel OOM Killer!</b>"]
        T4["Detik 00:04<br/>Container Died<br/>Exit Code: <b>137</b><br/>In-Memory State Lenyap"]
        T6["Detik 00:06<br/>Engine Auto-Restart<br/>Status: <b>Starting</b><br/>New Process PID 4096"]
        T15["Detik 00:15<br/>Prometheus Scrape #2<br/>Status: <b>UP (PID 4096)</b><br/>Memory: 380 MB"]

        T0 --> T3 --> T4 --> T6 --> T15
    end

    subgraph BLINDSPOT["Dampak Pada Observabilitas"]
        T4 -.->|Event Terlewatkan| GAP["Blind Spot Prometheus (15 Detik)<br/>Tidak Tercatat di Time-Series Metrics"]
        T15 -.->|Kondisi Semu| ILLUSION["Dashboard Hijau (False Normal)<br/>Log Heap Dump Hilang"]
    end
{{< /mermaid >}}

### 1. Keterbatasan Scrape Interval Prometheus (Pull-Model Latency)

Prometheus mendominasi ekosistem observabilitas modern melalui arsitektur *pull metrics*. Prometheus server melakukan HTTP GET request berkala ke *endpoint* target (misalnya `/metrics` pada JMX Exporter atau cAdvisor) berdasarkan `scrape_interval` yang umumnya dikonfigurasi antara 15 hingga 60 detik demi menjaga beban komputasi dan kapasitas penyimpanan *Time-Series Database* (TSDB).

Kelemahan fatal dari pendekatan berbasis interval ini muncul ketika kegagalan terjadi di antara dua siklus penarikan (*scrape window gap*):
- **OOMKilled (`exit 137` / `SIGKILL`):** Ketika kontainer melanggar batas memori cgroup (`memory.max`), Linux kernel OOM Killer langsung mengirimkan sinyal `SIGKILL` (sinyal 9) ke proses utama kontainer ($128 + 9 = 137$). Sinyal `SIGKILL` tidak dapat ditangkap (*unhandlable*), dicegat, atau diabaikan oleh aplikasi. Aplikasi mati seketika tanpa sempat menulis pesan error ke log disk.
- **Segmentation Fault (`exit 139` / `SIGSEGV`):** Kerusakan pointer native memory pada JVM atau runtime C/Go memicu `SIGSEGV` ($128 + 11 = 139$), meruntuhkan proses dalam hitungan mikrodetik.
- **The Blind Spot:** Jika kontainer mati pada detik ke-3 dan berhasil restart pada detik ke-6, maka saat Prometheus melakukan scraping pada detik ke-15, kontainer berada dalam kondisi sehat dengan penggunaan memori normal. Metrik `up` tetap bernilai `1`, dan lonjakan memori 2 GB di detik ke-3 tidak pernah tercatat di TSDB.

### 2. Pedang Bermata Dua Kebijakan Auto-Restart

Untuk meminimalkan *downtime*, administrator sistem hampir selalu menyematkan konfigurasi *restart policy*:
```yaml
restart: unless-stopped
```
Ketika proses kontainer berhenti secara tidak wajar, daemon container engine (Docker atau Podman) segera membuat *fresh container environment*:
1. **Namespace & Memory State Direset:** Struktur memori lama dibebaskan oleh kernel. Seluruh *ephemeral state* (seperti JVM heap buffer, koneksi soket aktif, dan in-memory cache) musnah.
2. **File Descriptors Musnah:** Pipa komunikasi dan berkas temporer yang belum di-flush ke storage persisten hilang.
3. **Pemberitahuan Semu:** Pada dashboard SRE, waktu uptime kontainer ter-reset, namun tanpa korelasi langsung ke penyebab awal. Tim operasional hanya menyadari adanya insiden ketika transaksi bisnis gagal atau pengguna komplain mengenai *intermittent gateway timeout* (HTTP 502/504).

### 3. Kebutuhan *Point-in-Time Evidence Capture*

Satu-satunya cara menangkap akar masalah crash kontainer adalah dengan menerapkan **Point-in-Time Evidence Capture**: mekanisme penangkapan bukti diagnostik yang dipicu oleh *event* kernel/runtime, bukan oleh waktu polling. 

Sistem penangkap bukti harus:
- Terhubung langsung ke antarmuka event internal container engine (*event bus*).
- Menangkap snapshot status kontainer (status `State.OOMKilled`, `State.ExitCode`, `State.FinishedAt`) pada **milidetik yang sama** saat sinyal terminasi dipancarkan.
- Bekerja secara independen dari proses kontainer yang sedang sekarat (tidak mengandalkan script di dalam kontainer itu sendiri).
- Menyimpan bukti ke media persisten sebelum container engine melancarkan siklus restart.

---

## ⚙️ Mengapa Memilih Golang untuk Tooling Operator & Agent: Analisis TM-ADR-0027

Keputusan arsitektur untuk membangun kakas operator terpadu (`tmctl`) dan daemon pengumpul event (`tm-agent`) dalam bahasa Go secara resmi didokumentasikan dalam [TM-ADR-0027](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0027/) (*Adopt Container Engine Socket API and Unified Cross-Platform Tooling for Multi-OS Orchestration*).

{{< mermaid >}}
flowchart LR
    subgraph LEGACY["Legacy Approach (Fragile & Linux-Centric)"]
        BASH["Bash Scripts (*.sh)<br/>awk, sed, grep, cut"]
        INTERP["Python / Node.js Runtime<br/>(Heavy dependencies on target host)"]
        SYS["systemd --user coupling<br/>(Fails on Windows Server)"]
    end

    subgraph MODERN["Modern Architecture: TM-ADR-0027 (Golang)"]
        TMCTL["tmctl (Operator CLI)<br/>Single Static Binary"]
        TMAGENT["tm-agent (Event Daemon)<br/>Cross-Platform Background Listener"]
        SOCKET["Direct Container Engine API<br/>Unix Socket & Windows Named Pipe"]
    end

    LEGACY -->|Refactored To| MODERN
{{< /mermaid >}}

Sebelum adopsi Go, platform pemantauan mengandalkan skrip Bash imperatif (`scripts/deploy-*.sh`, `src/collector.sh`) yang memanggil subshell `podman events` dan utilitas POSIX standar (`sed`, `awk`, `jq`). Pola warisan ini menimbulkan hambatan besar di lingkungan enterprise hybrid:
1. **Linux & Systemd Lock-in:** Skrip Bash tidak dapat berjalan di Windows Server tanpa lapisan kompatibilitas berat seperti WSL2 atau Git Bash.
2. **Kerapuhan String Parsing:** Mem-parsing keluaran teks terminal kontainer sangat rentan terhadap perubahan format antar versi container engine.
3. **Ansible Script Wrapper Antipattern:** Role automasi Ansible terpaksa membungkus eksekusi skrip shell (`ansible.builtin.shell: bash scripts/deploy.sh`), menghancurkan idempotenitas dan portabilitas lintas OS.

Adopsi Golang memecahkan masalah ini melalui tiga keunggulan teknis fundamental:

### 1. Zero-Dependency Footprint (Bebas Runtime Tambahan)

Target server produksi enterprise berada dalam pengawasan kepatuhan keamanan yang ketat (*hardening baseline*). Memasang interpreter seperti Python (bersama virtualenv dan modul C-extension), Node.js (bersama ribuan berkas `node_modules`), atau Java JRE pada setiap target host hanya untuk menjalankan skrip pemantauan adalah pelanggaran terhadap prinsip minimalitas permukaan serangan (*attack surface reduction*).

Golang mengompilasi seluruh dependensi ke dalam **single static binary** (`CGO_ENABLED=0`). Biner `tmctl` dan `tm-agent` dapat langsung disalin (*drop-in binary*) ke direktori host (`~/.local/bin` atau `C:\Program Files\tmctl`) dan dieksekusi seketika tanpa memerlukan pustaka dinamis atau interpreter eksternal.

### 2. Kompilasi Silang Sejati (Linux ELF & Windows Standalone `.exe`)

Dukungan *cross-compilation* kelas satu pada toolchain Go memungkinkan pembangunan biner Linux (ELF 64-bit) dan Windows Server (`.exe`) dari lingkungan CI/CD manapun:
```bash
# Kompilasi Linux AMD64 static binary
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/linux_amd64/tm-agent ./cmd/tm-agent

# Kompilasi Windows AMD64 native executable
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o bin/windows_amd64/tm-agent.exe ./cmd/tm-agent
```
Biner hasil kompilasi memiliki efisiensi sumber daya yang ekstrem:
- **Ukuran Biner:** Kurang dari 12 MB (termasuk seluruh pustaka JSON schema validator dan HTTP client).
- **Konsumsi Memori (RSS):** Stabil di bawah **12–15 MB RAM**.
- **CPU Footprint:** Nyaris 0% saat idle, melonjak kurang dari 0.5% selama durasi milidetik penulisan snapshot event.

### 3. Dukungan First-Class Concurrency (Goroutines & Channels)

Memantau *event stream* soket memerlukan operasi I/O asinkron yang tidak boleh memblokir tugas pemeliharaan sistem. Golang menyediakan primitif konkurensi native yang elegan:
- **Goroutines:** Streaming soket dijalankan dalam satu goroutine ringan (~2 KB stack size) yang membaca HTTP chunked response tanpa henti.
- **Channels:** Event yang diterima disalurkan melalui antrean berpenyangga (*buffered channel* `chan EventMessage`) untuk memisahkan kecepatan penerimaan event dari kecepatan penulisan disk.
- **Context & Multiplexing (`select`):** Penanganan sinyal penghentian OS (`SIGTERM`, `SIGINT`), interval *housekeeping retention*, dan streaming event dapat di-multiplexing secara bersih tanpa ancaman *thread starvation* atau *deadlock*.

---

## 🔌 Multi-Engine Socket Abstraction (Podman, Docker & Windows Named Pipes)

Salah satu tantangan rekayasa terbesar dalam mengelola infrastruktur kontainer enterprise adalah heterogenitas mesin eksekusi. Sebagaimana dirumuskan dalam [TM-ADR-0026](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0026/) (*Adopt Adaptive Multi-Engine Container Runtime Portability for Podman and Docker Environments*), platform harus mampu berjalan tanpa gesekan di atas berbagai varian container runtime:

| Sistem Operasi | Container Engine | Antarmuka Transport | Karakteristik Jalur Soket |
| :--- | :--- | :--- | :--- |
| **Linux (RHEL / Rocky)** | Rootless Podman | Unix Domain Socket | `/run/user/<UID>/podman/podman.sock` (Isolasi sesi pengguna) |
| **Linux (Ubuntu / Debian)** | Docker CE / EE | Unix Domain Socket | `/var/run/docker.sock` (Root daemon) |
| **Linux (Containerd / Rootless)**| Rootless Docker | Unix Domain Socket | `/run/user/<UID>/docker.sock` |
| **Windows Server 2022/2025** | Docker Engine | Windows Named Pipe | `\\.\pipe\docker_engine` (IPC Windows Native) |

### 1. Deteksi Runtime Adaptif di `tm-agent`

Alih-alih memaksa operator menyetel konfigurasi jalur soket secara manual di setiap host, `tm-agent` mengimplementasikan algoritma deteksi adaptif berbasis probing filesystem dan UID sesi pengguna:

```go
// Cuplikan dari: tm-agent/internal/engine/client.go
func DetectSocket(preferredEngine, explicitPath string) (engineType, socketPath string, err error) {
	if explicitPath != "" {
		if preferredEngine == "" {
			preferredEngine = "podman"
		}
		return preferredEngine, explicitPath, nil
	}

	// 1. Deteksi Lingkungan Windows Named Pipe
	if runtime.GOOS == "windows" {
		namedPipe := `\\.\pipe\docker_engine`
		return "docker", namedPipe, nil
	}

	// 2. Probing Kandidat Soket di Linux / POSIX berdasarkan UID Aktif
	uid := os.Getuid()
	candidates := []struct {
		engine string
		path   string
	}{
		{"podman", fmt.Sprintf("/run/user/%d/podman/podman.sock", uid)},
		{"podman", fmt.Sprintf("/var/run/user/%d/podman/podman.sock", uid)},
		{"docker", fmt.Sprintf("/run/user/%d/docker.sock", uid)},
		{"docker", fmt.Sprintf("/var/run/user/%d/docker.sock", uid)},
		{"podman", "/run/podman/podman.sock"},
		{"docker", "/var/run/docker.sock"},
		{"docker", "/run/docker.sock"},
	}

	for _, c := range candidates {
		if preferredEngine != "" && c.engine != preferredEngine {
			continue
		}
		// Pastikan file ada dan benar-benar bertipe Socket
		if fi, err := os.Stat(c.path); err == nil && (fi.Mode()&os.ModeSocket != 0) {
			return c.engine, c.path, nil
		}
	}

	if preferredEngine == "docker" {
		return "docker", "/var/run/docker.sock", nil
	}
	return "podman", fmt.Sprintf("/run/user/%d/podman/podman.sock", uid), nil
}
```

Algoritma di atas memverifikasi bitmask `fi.Mode() & os.ModeSocket != 0`, memastikan bahwa berkas yang ditemukan benar-benar soket komunikasi aktif, bukan berkas biasa atau symlink yang rusak (*dangling pointer*).

### 2. Abstraksi Transport Layer Multi-OS

Container Engine API menggunakan protokol berbasis REST HTTP di atas lapisan transport IPC (Inter-Process Communication). Di Linux, transport IPC adalah Unix Domain Socket; di Windows, transport IPC adalah Named Pipe.

Golang menyelesaikan perbedaan ini menggunakan fitur **Build Tags**:

#### Implementasi Linux / Unix (`socket_unix.go`):
```go
//go:build !windows
package engine

import (
	"context"
	"net"
	"net/http"
	"strings"
)

func createTransport(socketPath string) (*http.Transport, error) {
	cleanPath := strings.TrimPrefix(socketPath, "unix://")
	return &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", cleanPath)
		},
	}, nil
}
```

#### Implementasi Windows Named Pipe (`socket_windows.go`):
Pada Windows, panggilan fungsi API Win32 `CreateFile` / `ConnectNamedPipe` dibungkus menggunakan pustaka native `go-winio`:
```go
//go:build windows
package engine

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"

	winio "github.com/Microsoft/go-winio"
)

func createTransport(socketPath string) (*http.Transport, error) {
	pipePath := socketPath
	if !strings.HasPrefix(pipePath, `\\.\pipe\`) && !strings.HasPrefix(pipePath, `//./pipe/`) {
		pipePath = `\\.\pipe\docker_engine`
	}

	return &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			conn, err := winio.DialPipeContext(ctx, pipePath)
			if err == nil {
				return conn, nil
			}
			// Fallback ke port TCP loopback lokal jika named pipe tidak merespon
			var d net.Dialer
			d.Timeout = 1 * time.Second
			return d.DialContext(ctx, "tcp", "127.0.0.1:2375")
		},
	}, nil
}
```

### 3. Streaming Event Real-Time Non-Blocking

Begitu koneksi transport terbentuk, `tm-agent` mengirimkan permintaan HTTP streaming ke endpoint container engine:
```http
GET /events?filters={"type":["container"],"container":["tomcat-jmx-exporter"]} HTTP/1.1
Host: localhost
```

Mesin kontainer merespons dengan HTTP chunked stream tanpa batas waktu (*infinite stream*). Setiap kali status kontainer berubah, sebuah baris JSON dipancarkan secara instan. Loop pembacaan di dalam `tm-agent` mem-parsing stream baris demi baris menggunakan `bufio.NewReader`, memfilter event krusial (`died`, `oom`, `kill`, `stop`, `restart`), dan memicu perekaman snapshot tanpa jeda waktu.

---

## 🔒 Keamanan Spool Forensik: Atomic Write & Hardening (TM-ADR-0008)

Dalam sistem yang memproses data diagnostik insiden, arsitektur penyimpanan bukti (*evidence storage*) harus memenuhi dua kriteria kritis: **integritas konsumsi data** dan **keamanan hak akses**. Keputusan arsitektur ini ditetapkan dalam [TM-ADR-0008](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0008/) (*Restricted Host Event Collector with Normalized Evidence Spool*).

{{< mermaid >}}
flowchart TD
    subgraph DANGER["Antipattern Berbahaya: Socket Mount Langsung"]
        CONTAINER_A["Diagnostic Service Container"]
        HOST_SOCK["Host Container Socket<br/>/var/run/docker.sock"]
        CONTAINER_A ==>|Full Read/Write Access| HOST_SOCK
        HOST_SOCK -.->|Privilege Escalation!| PWN["Potensi Root Host Takeover"]
    end

    subgraph SECURE["Pola Aman: TM-ADR-0008 (One-Way Boundary)"]
        AGENT["tm-agent (Host Process / Daemon)"]
        SPOOL[("Normalized Evidence Spool<br/>Dir: 0700 | File: 0600<br/>Atomic Write: tmp to json")]
        DS["Diagnostic Service Container<br/>(Unprivileged User node:node)"]

        AGENT -->|Writes JSON Evidence| SPOOL
        SPOOL -->|Mount Volume :ro,z (Read-Only)| DS
    end
{{< /mermaid >}}

### 1. Bahaya Fatal Mounting Engine Socket Langsung ke Container

Sebuah antipattern yang sering ditemukan pada implementasi Docker pemula adalah me-mount soket host secara langsung ke dalam kontainer analitik:
```bash
# ANTIPATTERN BERBAHAYA! JANGAN DILAKUKAN DI PRODUCTION!
docker run -v /var/run/docker.sock:/var/run/docker.sock diagnostic-service
```
Memberikan akses soket Docker ke dalam kontainer sama saja dengan memberikan hak akses administratif **root host tanpa batas**. Siapa pun yang berhasil mengeksploitasi celah keamanan aplikasi web di dalam `diagnostic-service` dapat mengirim perintah API ke soket untuk membuat kontainer privileged baru dengan bind mount `/` ke root filesystem host, membobol seluruh server dalam hitungan detik.

Sebagai solusinya, [TM-ADR-0008](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0008/) menetapkan prinsip **One-Way Communication Boundary**:
- Hanya `tm-agent` (proses host non-root atau agen lokal berizin khusus) yang berhak berkomunikasi dengan soket engine.
- Hasil pengamatan dinormalisasi menjadi berkas JSON skema kanonikal (`event-record-v1.schema.json`) dan diletakkan pada direktori *spool*.
- Kontainer `diagnostic-service` **hanya membaca** berkas dari direktori spool tersebut melalui bind mount bertanda baca-saja (`--volume "${SPOOL_DIR}:/run/tomcat-diagnostic/spool:ro,z"`). Tidak ada jalur interaksi terbalik dari kontainer diagnostik ke host engine.

### 2. Pengerasan Izin Berkas (*Permission Hardening*: `0700` & `0600`)

Data forensik berisi informasi sensitif mengenai topologi infrastruktur, nama kontainer, argumen eksekusi, serta kode status proses. Untuk mencegah kebocoran informasi (*information disclosure*) ke pengguna unprivileged atau proses lain di server host:
- **Direktori Spool diatur ke mode `0700` (`drwx------`):** Hanya pemilik proses `tm-agent` yang dapat membaca, menulis, atau menjelajahi direktori tersebut.
- **Berkas Bukti diatur ke mode `0600` (`-rw-------`):** Pengguna lain tidak memiliki izin baca terhadap rekaman bukti forensik.

### 3. Pola Penulisan Atomik (*Two-Stage Atomic Write Pattern*)

Masalah klasik dalam komunikasi antar-proses berbasis berkas (*file-based IPC*) adalah **Race Condition**: apa yang terjadi jika `diagnostic-service` membaca berkas bukti saat `tm-agent` baru selesai menulis setengah bagian dari berkas JSON tersebut?
Hasilnya adalah kegagalan *JSON syntax parsing* (`Unexpected end of JSON input`), yang dapat menggagalkan analisis insiden.

Untuk menggaransi integritas data 100%, `tm-agent` menerapkan pola penulisan atomik:

```go
// Cuplikan dari: tm-agent/internal/spool/writer.go
func WriteRecord(spoolDir string, record *schema.EventRecord, maxBytes int64) (string, error) {
	if err := EnsureSpoolDir(spoolDir); err != nil {
		return "", err
	}

	// 1. Validasi kepatuhan skema data kanonikal
	if err := schema.ValidateRecord(record); err != nil {
		return "", fmt.Errorf("invalid event record: %w", err)
	}

	data, err := record.MarshalIndent()
	if err != nil {
		return "", fmt.Errorf("failed to marshal event record: %w", err)
	}

	// 2. Batasi batas maksimum payload (16 KiB Memory Guard)
	if maxBytes > 0 && int64(len(data)) > maxBytes {
		return "", fmt.Errorf("payload exceeds limit of %d bytes", maxBytes)
	}

	timestamp := time.Now().UnixNano()
	tmpFile := filepath.Join(spoolDir, fmt.Sprintf("%d_%s.tmp", timestamp, record.Type))
	finalFile := filepath.Join(spoolDir, fmt.Sprintf("%d_%s.json", timestamp, record.Type))

	// 3. TAHAP 1: Tulis seluruh data ke berkas temporer (.tmp) dengan mode 0600
	if err := os.WriteFile(tmpFile, data, 0600); err != nil {
		return "", fmt.Errorf("failed to write temporary file: %w", err)
	}
	_ = os.Chmod(tmpFile, 0600)

	// 4. TAHAP 2: Rename atomik (.tmp -> .json)
	if err := os.Rename(tmpFile, finalFile); err != nil {
		_ = os.Remove(tmpFile)
		return "", fmt.Errorf("failed to atomically rename %s to %s: %w", tmpFile, finalFile, err)
	}

	_ = os.Chmod(finalFile, 0600)
	return finalFile, nil
}
```

#### Mengapa `os.Rename` Bersifat Atomik?
Pada level kernel sistem operasi (POSIX `rename()` syscall dan Win32 `MoveFileEx` dengan `MOVEFILE_REPLACE_EXISTING`), operasi *rename* pada sistem berkas yang sama (*same filesystem partition*) tidak memindahkan data blok pada disk. Kernel hanya memperbarui penunjuk direktori (*directory metadata inode pointer*). 

Bagi proses pembaca (`diagnostic-service`), berkas berekstensi `.json` **tidak pernah tampak dalam kondisi setengah jadi**. Berkas hanya akan muncul di direktori saat seluruh isi data sudah ditulis lengkap dan aman pada disk.

### 4. Tata Kelola Retensi & Pencegahan Kehabisan Inode (Bounded Spool)

Jika sebuah kontainer mengalami siklus *crash flapping* ratusan kali dalam satu jam, direktori spool berisiko menghabiskan kuota *inode* atau kapasitas disk server. Untuk mencegah dampak operasional sekunder ini, `tm-agent` menegakkan aturan kuota ketat (*Capacity & Retention Governance*):

| Parameter Retensi | Nilai Default | Logika Pembersihan (*Pruning Logic*) |
| :--- | :---: | :--- |
| **`MAX_SPOOL_AGE_HOURS`** | `24` Jam | Seluruh berkas `.json` yang berumur lebih dari 24 jam otomatis dihapus pada saat startup dan setiap siklus housekeeping berkala. |
| **`MAX_SPOOL_FILES`** | `1000` Berkas | **FIFO Pruning:** Jika jumlah berkas `.json` melebihi 1000, berkas tertua (berdasarkan urutan waktu timestamp nanodetik pada nama berkas) dihapus terlebih dahulu. |
| **`STALE_TMP_AGE_MINUTES`** | `60` Menit | **Sanitasi File Yatim:** Berkas `.tmp` yang tertinggal lebih dari 60 menit (misal akibat crash host saat proses I/O) dibersihkan otomatis. |
| **`MAX_RECORD_BYTES`** | `16384` Bytes (16 KiB) | Menolak pencatatan jika ukuran record melebihi 16 KiB demi mencegah kehabisan memori (*OOM defense*). |

Selain itu, seluruh direktori spool wajib mengikuti kebijakan **Zero `/tmp`**: bukti disimpan pada jalur persisten `${HOME}/.local/share/tomcat-monitoring/spool` di Linux atau `C:\tm_home\spool` di Windows, menjamin data tidak terhapus oleh utilitas otomatis pembersih `/tmp` OS.

---

## 🤝 Sinergi `tm-agent` (Passive Listener) & `tmctl` (Active Operator CLI)

Arsitektur platform membedakan secara tegas antara tugas pemantauan pasif dan eksekusi operasional aktif:

{{< mermaid >}}
flowchart TD
    subgraph CONTROL["Control Plane & Operations"]
        SRE["SRE / DevOps Engineer"]
        ANSIBLE["Ansible Playbook / CI Runner"]
        TMCTL["tmctl (Go CLI)<br/>Active Operator Tooling"]

        SRE -->|CLI Commands| TMCTL
        ANSIBLE -->|Idempotent Execution| TMCTL
    end

    subgraph RUNTIME_HOST["Target Host (Linux / Windows)"]
        TMAGENT["tm-agent (Go Daemon)<br/>Passive Event Listener<br/>(systemd unit / Windows Service)"]
        ENGINE["Container Engine Socket<br/>(Podman / Docker)"]
        SPOOL[("Spool Directory<br/>(0700 / 0600)")]
        DS["diagnostic-service Container"]

        TMCTL ==>|Deploy / Status / Clean| ENGINE
        ENGINE -.->|Continuous Event Stream| TMAGENT
        TMAGENT -->|Atomic Evidence Ingestion| SPOOL
        SPOOL -.->|Correlate Incident| DS
    end
{{< /mermaid >}}

### 1. Pembagian Peran Komponen

- **`tm-agent` (Passive Listener):**
  - Berjalan sebagai layanan latar belakang (*background service*): dikelola oleh `systemd --user` di Linux atau didaftarkan sebagai Windows Service.
  - Bersifat reaktif (*event-driven*): tidak menerima input dari terminal, tidak melayani permintaan HTTP masuk, hanya fokus mendengarkan socket container engine dan menuliskan bukti jika terjadi anomali siklus hidup.
- **`tmctl` (Active Operator CLI):**
  - Berjalan secara on-demand dipanggil oleh operator SRE atau runner CI/CD.
  - Mengelola siklus hidup stack aplikasi melalui antarmuka perintah terpadu lintas OS:
    - `tmctl stack deploy --target tomcat --env production`: Menerapkan konfigurasi kontainer secara deklaratif.
    - `tmctl stack status`: Menampilkan tabel status kesehatan kontainer, port bindings, dan pemanfaatan memori.
    - `tmctl stack clean --all`: Membersihkan kontainer dan named volume yang tidak digunakan.
    - `tmctl rules ingest custom-rulepack.json`: Menyuntikkan aturan diagnostik baru ke Diagnostic Service.
    - `tmctl validate`: Memvalidasi kepatuhan skema konfigurasi dan layout repositori.

### 2. Transformasi Ansible Menjadi *Thin Declarative Orchestrator*

Sebelum adopsi `tmctl` dan `tm-agent`, playbook Ansible dipenuhi oleh ratusan baris logika imperatif dan pengecekan OS:
```yaml
# POLA LAMA YANG RAPUH (Ansible Script Wrapper Antipattern):
- name: Deploy container stack
  ansible.builtin.shell: bash scripts/deploy-tomcat.sh
  when: ansible_os_family != "Windows"

- name: Deploy container stack on Windows
  ansible.windows.win_command: powershell.exe -File scripts/deploy-tomcat.ps1
  when: ansible_os_family == "Windows"
```

Dengan biner Go `tmctl`, peran Ansible direfaktor menjadi **Thin Orchestrator**:
1. Ansible hanya bertanggung jawab mengantarkan biner statis `tmctl` dan `tm-agent` ke host target.
2. Ansible mendaftarkan service unit `tm-agent` ke systemd (Linux) atau service manager (Windows).
3. Ansible memanggil perintah standar `tmctl stack deploy` tanpa perlu memedulikan sintaks shell lokal host.

Hal ini menghilangkan duplikasi skrip imperatif, menjamin determinisme deployment, dan mengeliminasi bug akibat perbedaan interpretasi karakter *line-ending* (`CRLF` vs `LF`) antar sistem operasi.

---

## 📊 Diagram Alur Arsitektur Forensik & Siklus Hidup Event

Diagram berikut menggambarkan alur terintegrasi sejak kontainer mengalami crash hingga bukti forensik diproses oleh mesin diagnosis:

{{< mermaid >}}
sequenceDiagram
    autonumber
    participant K as Linux Kernel
    participant E as Container Engine
    participant A as tm-agent
    participant S as Atomic Spool
    participant D as Diagnostic Service
    participant N as SRE Notification

    Note over K,E: 1. Fase Terminasi Fatal (Milidetik 00:00)
    K->>E: cgroup memory limit exceeded -> OOM Killer sends SIGKILL
    E->>E: Mark container state: OOMKilled=true, ExitCode=137
    
    Note over E,A: 2. Fase Event Streaming
    E-->>A: HTTP Chunked Stream: Event oom (tomcat-jmx-exporter)
    E-->>A: HTTP Chunked Stream: Event died (ExitCode 137)
    
    Note over A,S: 3. Fase Snapshot & Atomic Spool
    activate A
    A->>E: GET /containers/tomcat-jmx-exporter/json (Inspect)
    E-->>A: Detailed State JSON (State, OOMKilled, FinishedAt)
    A->>S: Write temporary file: timestamp_runtime_oom.tmp (mode 0600)
    A->>S: Verify size <= 16 KiB and os.Rename to json
    A->>S: Run FIFO Pruning (Purge older than 24h, Keep <= 1000 files)
    deactivate A

    Note over E: 4. Fase Pemulihan Otomatis
    E->>E: Trigger restart policy (Spawn new container PID 5521)

    Note over D,N: 5. Fase Investigasi Korelasi
    D->>D: Receive Webhook Alert from Alertmanager
    D->>S: ReadBoundedFile from Spool (ro,z mount)
    D->>D: Correlate Evidence: ExitCode 137 + OOMKilled true within Window
    D->>N: Dispatch Incident Report: Tomcat Crash Confirmed (OOMKilled)
{{< /mermaid >}}

---

## 💻 Cuplikan Kode Arsitektur Inti (Go Implementation Deep Dive)

Berikut adalah implementasi nyata dari komponen-komponen utama pada repositori [`tm-agent`](https://github.com/eddywiyatno/tm-agent):

### 1. Loop Event Stream Multiplexing & Auto-Reconnect (`collector.go`)

Loop utama `tm-agent` mengelola siklus koneksi streaming, penanganan sinyal graceful shutdown, dan periodik housekeeping:

```go
// Cuplikan dari: tm-agent/internal/collector/collector.go
func (c *Collector) Run(ctx context.Context) error {
	termutil.PrintInfo("Starting tm-agent Event Collector Daemon")
	
	// Inisialisasi direktori spool dengan izin aman 0700
	if err := spool.EnsureSpoolDir(c.cfg.SpoolDir); err != nil {
		return fmt.Errorf("failed to initialize spool directory: %w", err)
	}

	// Housekeeping ticker setiap 10 menit
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			termutil.PrintInfo("tm-agent shutting down gracefully")
			return nil
		default:
		}

		// Berlangganan ke stream event socket container engine
		eventCh, errCh := c.engineClient.StreamEvents(ctx, c.cfg.TargetContainer)

	streamLoop:
		for {
			select {
			case <-ctx.Done():
				return nil

			case <-ticker.C:
				// Pembersihan berkas kadaluarsa dan kuota kapasitas
				r, _ := spool.PruneSpool(c.cfg.SpoolDir, c.cfg.MaxSpoolAgeHours, c.cfg.MaxSpoolFiles, c.cfg.StaleTmpAgeMinutes)
				if r != nil && (r.StaleTmpPruned > 0 || r.StaleJsonPruned > 0 || r.QuotaPruned > 0) {
					termutil.PrintInfo("Housekeeping: %d tmp, %d expired json, %d quota pruned",
						r.StaleTmpPruned, r.StaleJsonPruned, r.QuotaPruned)
				}

			case ev, ok := <-eventCh:
				if !ok {
					break streamLoop // Soket terputus, putus inner loop untuk reconnect
				}

				action := strings.ToLower(ev.GetAction())
				containerName := ev.GetContainerName()

				// Filter target kontainer dan event siklus hidup yang relevan
				if (containerName == "" || containerName == c.cfg.TargetContainer) && relevantActions[action] {
					termutil.PrintInfo("Event received: container=%s action=%s -> capturing snapshot", c.cfg.TargetContainer, action)
					wFiles, sErr := c.RecordSnapshot(ctx)
					if sErr != nil {
						termutil.PrintWarning("Failed to capture snapshot: %v", sErr)
					} else {
						termutil.PrintSuccess("Evidence snapshot written: %d records", len(wFiles))
					}
				}

			case sErr, ok := <-errCh:
				if ok && sErr != nil {
					termutil.PrintWarning("Event stream error: %v", sErr)
				}
				break streamLoop
			}
		}

		// Backoff sebelum mencoba rekoneksi ke socket engine
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(3 * time.Second):
			termutil.PrintInfo("Reconnecting to container engine socket...")
		}
	}
}
```

### 2. Pembacaan Spool Bounded di Sisi Konsumen (`collector-spool-adapter.js`)

Pada sisi `diagnostic-service`, pembacaan berkas spool dilakukan secara defensif untuk mencegah eksploitasi berkas raksasa:

```javascript
// Cuplikan dari: tomcat-diagnostic-service/src/adapters/collector-spool-adapter.js
import { readdirSync } from "node:fs";
import { readBoundedFile } from "./bounded-file-reader.js";
import { createEvidence, withinWindow } from "../domain/evidence.js";

export function readCollectorSpool(target, window, { maxFiles = 200 } = {}) {
  if (!target.collectorSpool) return [];
  const records = [];

  // Filter hanya berkas .json, urutkan leksikografis (kronologis), ambil 200 berkas terbaru
  const files = readdirSync(target.collectorSpool)
    .filter((item) => item.endsWith(".json"))
    .sort()
    .slice(-maxFiles);

  for (const name of files) {
    try {
      // Baca dengan batas keras 16 KiB dan 200 baris
      const file = readBoundedFile(target.collectorSpool, name, { maxBytes: 16 * 1024, maxLines: 200 });
      if (file.truncated) continue; // Abaikan berkas jika tidak wajar

      const record = JSON.parse(file.text);
      const evidence = createEvidence({
        source: "collector",
        type: record.type,
        targetId: record.target_id,
        generation: record.generation,
        observedAt: record.observed_at,
        collectedAt: window.collectedAt,
        status: record.status,
        strength: record.strength,
        value: record.value,
        redacted: Boolean(record.redacted)
      });

      // Filter hanya bukti yang berada dalam rentang waktu insiden (observation window)
      if (withinWindow(evidence, { ...window, targetId: target.targetId })) {
        records.push(evidence);
      }
    } catch {
      continue; // Lewati berkas korup tanpa menghentikan worker diagnostik
    }
  }

  return records;
}
```

---

## 🏁 Kesimpulan & Rekomendasi Praktik Terbaik SRE

Menggabungkan kecepatan pemulihan layanan (*High Availability*) dengan kedalaman forensik (*Observability Depth*) bukanlah hal yang mustahil. Dengan memahami batasan model *pull metrics* Prometheus dan memanfaatkan **Container Engine Socket API** secara tepat, kita dapat menangkap momen kegagalan sistem pada skala milidetik sebelum bukti tersebut musnah oleh siklus *auto-restart*.

### 4 Rekomendasi Utama untuk Tim Platform & SRE:

1. **Jangan Pernah Mengandalkan Metrik Terjadwal untuk Mendiagnosis Crash Fatal:**
   Scrape interval 15 atau 30 detik dirancang untuk agregasi tren performa, bukan untuk forensik *real-time*. Gunakan *event-driven stream listener* untuk menangkap status terminasi kernel dan exit codes.
2. **Terapkan Prinsip One-Way Boundary:**
   Jangan pernah me-mount socket Docker/Podman langsung ke kontainer analitik aplikasi. Gunakan agen host berizin rendah (`tm-agent`) untuk memproses event dan mengeksposnya melalui berkas spool baca-saja (*read-only volume*).
3. **Wajibkan Pola Two-Stage Atomic Write:**
   Dalam arsitektur *file-based IPC*, hindari menulis langsung ke berkas tujuan akhir. Tuliskan data ke berkas `.tmp` terlebih dahulu, lalu panggil `rename` sistem berkas untuk mencegah *race condition* pembacaan data parsial.
4. **Adopsi Single Static Binary untuk Host Tooling:**
   Hilangkan ketergantungan pada runtime interpreter eksternal (Python, Node.js, atau skrip Bash yang rumit) di host produksi. Bangun kakas SRE Anda menggunakan bahasa terkompilasi seperti **Golang** demi konsumsi memori rendah, kecepatan eksekusi, dan kemudahan deployment multi-OS.

---

### 📚 Referensi Resmi Arsitektur (DevOps Handbook):
- [TM-ADR-0027: Adopt Container Engine Socket API and Unified Cross-Platform Tooling](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0027/)
- [TM-ADR-0008: Use a Restricted Host Event Collector with a Normalized Evidence Spool](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0008/)
- [TM-ADR-0026: Adopt Adaptive Multi-Engine Container Runtime Portability for Podman and Docker](https://edkas07-oss.github.io/devops-handbook/adr/tomcat-monitoring/adr-records/TM-ADR-0026/)
