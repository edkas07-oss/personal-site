+++
title = "tcctl"
description = "Otomasi rilis dan deployment Apache Tomcat: update zero-downtime, audit kepatuhan CIS Benchmark, dan proteksi konfigurasi GitOps."
layout = "landing"
showDate = false
showAuthor = false
showReadingTime = false
showWordCount = false
showTableOfContents = false
showPagination = false
showBreadcrumbs = true
[cascade]
layout = "landing"
showDate = false
showAuthor = false
showReadingTime = false
showWordCount = false
showTableOfContents = false
showPagination = false
showBreadcrumbs = true
+++

<div class="ew-pagehero">
<p class="ew-hero__eyebrow">Proyek Rekayasa · tcctl</p>
<h1 class="ew-pagehero__title">tcctl: Otomasi Rilis &amp; Deployment Apache Tomcat</h1>
<p class="ew-lead">Otomasi rilis aplikasi tanpa downtime, penegakan standar keamanan CIS Benchmark, dan perlindungan konfigurasi Tomcat dari perubahan manual di Windows Server dan Linux.</p>
</div>

<div class="ew-section">
<div class="ew-section__head"><h2 class="ew-h2">Kemampuan Utama</h2><p class="ew-lead">Klik setiap kartu untuk melihat visualisasi alur perbandingan kendala operasional konvensional dan solusi rekayasa yang dihadirkan tcctl.</p></div>
<div class="ew-grid-2">
<div class="ew-panel ew-panel--interactive" role="button" tabindex="0" data-modal="modal-staging" aria-haspopup="dialog">
<span class="ew-panel__tag">Zero-Downtime</span>
<h3 class="ew-panel__title">Rilis Staging &amp; Rolling Update Aman</h3>
<p class="ew-panel__text">Rilis aplikasi melalui port staging untuk memastikan sistem siap melayani traffic sebelum dialihkan ke port produksi, dilengkapi rollback otomatis jika aplikasi gagal start.</p>
<span class="ew-panel__hint">Lihat Masalah &amp; Solusi →</span>
</div>

<div class="ew-panel ew-panel--interactive" role="button" tabindex="0" data-modal="modal-gitops" aria-haspopup="dialog">
<span class="ew-panel__tag">Tata Kelola GitOps</span>
<h3 class="ew-panel__title">Sinkronisasi Konfigurasi &amp; Proteksi Drift</h3>
<p class="ew-panel__text">Menjaga konsistensi konfigurasi server dengan repositori Git serta mengunci file konfigurasi (<code>conf:ro</code>) agar tidak dapat diubah sembarangan di server produksi.</p>
<span class="ew-panel__hint">Lihat Masalah &amp; Solusi →</span>
</div>

<div class="ew-panel ew-panel--interactive" role="button" tabindex="0" data-modal="modal-security" aria-haspopup="dialog">
<span class="ew-panel__tag">Keamanan &amp; Audit</span>
<h3 class="ew-panel__title">Kepatuhan CIS Benchmark &amp; Pemindaian CVE</h3>
<p class="ew-panel__text">Memastikan konfigurasi kontainer memenuhi 9 aturan standar keamanan CIS Benchmark, berjalan dengan user non-root, serta terintegrasi pemindaian kerentanan image.</p>
<span class="ew-panel__hint">Lihat Masalah &amp; Solusi →</span>
</div>

<div class="ew-panel ew-panel--interactive" role="button" tabindex="0" data-modal="modal-platform" aria-haspopup="dialog">
<span class="ew-panel__tag">Multi-Platform</span>
<h3 class="ew-panel__title">Dukungan Penuh Linux &amp; Windows Server</h3>
<p class="ew-panel__text">Dapat berjalan langsung di Windows Server (Docker Engine) dan Enterprise Linux (Podman), tanpa perlu instalasi interpreter atau runtime tambahan.</p>
<span class="ew-panel__hint">Lihat Masalah &amp; Solusi →</span>
</div>
</div>
</div>

<!-- Modal 1: Staging & Rolling Update -->
<div id="modal-staging" class="ew-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="title-staging">
<div class="ew-modal-window">
<button type="button" class="ew-modal-close-btn" aria-label="Tutup" data-close-modal>&times;</button>
<div class="ew-modal-header">
<span class="ew-modal-tag">Zero-Downtime Deployment</span>
<h3 id="title-staging" class="ew-modal-title">Rilis Staging &amp; Rolling Update Aman</h3>
</div>
<div class="ew-modal-body">
<div class="ew-diag-wrap">
  <div class="ew-diag-track ew-diag-track--bad">
    <div class="ew-diag-badge ew-diag-badge--bad">🔴 Tanpa tcctl (Alur Konvensional)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">📤</span>
        <span class="ew-diag-node__title">Deploy Langsung</span>
        <span class="ew-diag-node__desc">Port live (:8080)</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">💥</span>
        <span class="ew-diag-node__title">Startup Error</span>
        <span class="ew-diag-node__desc">DB lock / app crash</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">⛔</span>
        <span class="ew-diag-node__title">502 Bad Gateway</span>
        <span class="ew-diag-node__desc">Layanan down total</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">⏳</span>
        <span class="ew-diag-node__title">Rollback Manual</span>
        <span class="ew-diag-node__desc">MTTR ~45 menit</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--bad">
      <span>⚠️ Dampak: Transaksi pengguna terputus mendadak &amp; SLA layanan terlanggar.</span>
    </div>
  </div>

  <div class="ew-diag-track ew-diag-track--good">
    <div class="ew-diag-badge ew-diag-badge--good">🟢 Dengan tcctl (Otomasi Terproteksi)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🧪</span>
        <span class="ew-diag-node__title">Staging Deploy</span>
        <span class="ew-diag-node__desc">Port isolasi (:9080)</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🩺</span>
        <span class="ew-diag-node__title">Health Probing</span>
        <span class="ew-diag-node__desc">Deep validation</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">⚡</span>
        <span class="ew-diag-node__title">Atomic Cutover</span>
        <span class="ew-diag-node__desc">Switch port :8080</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🚀</span>
        <span class="ew-diag-node__title">Zero Downtime</span>
        <span class="ew-diag-node__desc">0 ms interupsi</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--good">
      <span>✓ Manfaat: Rilis aman 100%, otomatis rollback dalam hitungan detik jika inisialisasi gagal.</span>
    </div>
  </div>
</div>
</div>
<div class="ew-modal-footer">
<button type="button" class="ew-btn ew-btn--ghost" data-close-modal>Tutup</button>
</div>
</div>
</div>

<!-- Modal 2: Tata Kelola GitOps -->
<div id="modal-gitops" class="ew-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="title-gitops">
<div class="ew-modal-window">
<button type="button" class="ew-modal-close-btn" aria-label="Tutup" data-close-modal>&times;</button>
<div class="ew-modal-header">
<span class="ew-modal-tag">Tata Kelola GitOps</span>
<h3 id="title-gitops" class="ew-modal-title">Sinkronisasi Konfigurasi &amp; Proteksi Drift</h3>
</div>
<div class="ew-modal-body">
<div class="ew-diag-wrap">
  <div class="ew-diag-track ew-diag-track--bad">
    <div class="ew-diag-badge ew-diag-badge--bad">🔴 Tanpa tcctl (Perubahan Manual)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🛠️</span>
        <span class="ew-diag-node__title">Edit di Server</span>
        <span class="ew-diag-node__desc">SSH / server.xml</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">⚠️</span>
        <span class="ew-diag-node__title">Config Drift</span>
        <span class="ew-diag-node__desc">Tidak di-commit Git</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">🔄</span>
        <span class="ew-diag-node__title">Deploy Ulang</span>
        <span class="ew-diag-node__desc">Setelan darurat hilang</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">💥</span>
        <span class="ew-diag-node__title">Insiden Berulang</span>
        <span class="ew-diag-node__desc">Audit trail nihil</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--bad">
      <span>⚠️ Dampak: Parameter server tidak seragam antar node &amp; sulit diinvestigasi.</span>
    </div>
  </div>

  <div class="ew-diag-track ew-diag-track--good">
    <div class="ew-diag-badge ew-diag-badge--good">🟢 Dengan tcctl (Tata Kelola GitOps)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🐙</span>
        <span class="ew-diag-node__title">Git Repository</span>
        <span class="ew-diag-node__desc">Single source of truth</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🔒</span>
        <span class="ew-diag-node__title">conf:ro Mode</span>
        <span class="ew-diag-node__desc">Terkunci read-only</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🤖</span>
        <span class="ew-diag-node__title">GitOps Sync</span>
        <span class="ew-diag-node__desc">Rekonsiliasi otomatis</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">✅</span>
        <span class="ew-diag-node__title">100% Konsisten</span>
        <span class="ew-diag-node__desc">Riwayat audit jelas</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--good">
      <span>✓ Manfaat: Mencegah modifikasi sembarangan &amp; konfigurasi selalu identik di semua server.</span>
    </div>
  </div>
</div>
</div>
<div class="ew-modal-footer">
<button type="button" class="ew-btn ew-btn--ghost" data-close-modal>Tutup</button>
</div>
</div>
</div>

<!-- Modal 3: Keamanan & Audit -->
<div id="modal-security" class="ew-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="title-security">
<div class="ew-modal-window">
<button type="button" class="ew-modal-close-btn" aria-label="Tutup" data-close-modal>&times;</button>
<div class="ew-modal-header">
<span class="ew-modal-tag">Keamanan &amp; Kepatuhan</span>
<h3 id="title-security" class="ew-modal-title">Kepatuhan CIS Benchmark &amp; Pemindaian CVE</h3>
</div>
<div class="ew-modal-body">
<div class="ew-diag-wrap">
  <div class="ew-diag-track ew-diag-track--bad">
    <div class="ew-diag-badge ew-diag-badge--bad">🔴 Tanpa tcctl (Baseline Rentan)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🔓</span>
        <span class="ew-diag-node__title">Root Privilege</span>
        <span class="ew-diag-node__desc">Default administrator</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">⚠️</span>
        <span class="ew-diag-node__title">Port Shutdown</span>
        <span class="ew-diag-node__desc">Port 8005 terbuka</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">❓</span>
        <span class="ew-diag-node__title">CVE Image</span>
        <span class="ew-diag-node__desc">Tanpa scan otomatis</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">❌</span>
        <span class="ew-diag-node__title">Temuan Audit</span>
        <span class="ew-diag-node__desc">Audit manual berminggu-minggu</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--bad">
      <span>⚠️ Dampak: Risiko celah keamanan tinggi &amp; tidak memenuhi regulasi OJK / PCI-DSS.</span>
    </div>
  </div>

  <div class="ew-diag-track ew-diag-track--good">
    <div class="ew-diag-badge ew-diag-badge--good">🟢 Dengan tcctl (Hardening Otomatis)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🛡️</span>
        <span class="ew-diag-node__title">Non-Root User</span>
        <span class="ew-diag-node__desc">ContainerUser/tcuser</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🔒</span>
        <span class="ew-diag-node__title">9 Aturan CIS</span>
        <span class="ew-diag-node__desc">Hardening otomatis</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🔍</span>
        <span class="ew-diag-node__title">Trivy CVE Scan</span>
        <span class="ew-diag-node__desc">Deteksi celah pra-rilis</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">📋</span>
        <span class="ew-diag-node__title">Siap Audit</span>
        <span class="ew-diag-node__desc">Bukti kepatuhan instan</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--good">
      <span>✓ Manfaat: Keamanan kontainer terstandardisasi &amp; lolos audit regulasi perbankan.</span>
    </div>
  </div>
</div>
</div>
<div class="ew-modal-footer">
<button type="button" class="ew-btn ew-btn--ghost" data-close-modal>Tutup</button>
</div>
</div>
</div>

<!-- Modal 4: Multi-Platform -->
<div id="modal-platform" class="ew-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="title-platform">
<div class="ew-modal-window">
<button type="button" class="ew-modal-close-btn" aria-label="Tutup" data-close-modal>&times;</button>
<div class="ew-modal-header">
<span class="ew-modal-tag">Multi-Platform</span>
<h3 id="title-platform" class="ew-modal-title">Dukungan Penuh Linux &amp; Windows Server</h3>
</div>
<div class="ew-modal-body">
<div class="ew-diag-wrap">
  <div class="ew-diag-track ew-diag-track--bad">
    <div class="ew-diag-badge ew-diag-badge--bad">🔴 Tanpa tcctl (Skrip Terfragmentasi)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🪟</span>
        <span class="ew-diag-node__title">PowerShell</span>
        <span class="ew-diag-node__desc">Windows Server</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">≠</span>
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🐧</span>
        <span class="ew-diag-node__title">Bash Script</span>
        <span class="ew-diag-node__desc">Enterprise Linux</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">🧩</span>
        <span class="ew-diag-node__title">Modul Runtime</span>
        <span class="ew-diag-node__desc">Beda versi tiap host</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">😫</span>
        <span class="ew-diag-node__title">Overhead Tinggi</span>
        <span class="ew-diag-node__desc">Rawan human error</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--bad">
      <span>⚠️ Dampak: Pemeliharaan skrip ganda &amp; alur deployment berbeda antar OS.</span>
    </div>
  </div>

  <div class="ew-diag-track ew-diag-track--good">
    <div class="ew-diag-badge ew-diag-badge--good">🟢 Dengan tcctl (Single Executable)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">📦</span>
        <span class="ew-diag-node__title">1 Biner Go</span>
        <span class="ew-diag-node__desc">Tanpa runtime tambahan</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🪟</span>
        <span class="ew-diag-node__title">Windows Docker</span>
        <span class="ew-diag-node__desc">Sintaks identik</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">＝</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🐧</span>
        <span class="ew-diag-node__title">Linux Podman</span>
        <span class="ew-diag-node__desc">Sintaks identik</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🎯</span>
        <span class="ew-diag-node__title">1 Standar CI/CD</span>
        <span class="ew-diag-node__desc">Operasional ringkas</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--good">
      <span>✓ Manfaat: Alur rilis 100% konsisten lintas OS tanpa perlu memelihara skrip terpisah.</span>
    </div>
  </div>
</div>
</div>
<div class="ew-modal-footer">
<button type="button" class="ew-btn ew-btn--ghost" data-close-modal>Tutup</button>
</div>
</div>
</div>

<div class="ew-section">
<div class="ew-section__head"><h2 class="ew-h2">Alur Penggunaan CLI</h2><p class="ew-lead">Perintah ringkas yang mudah dijalankan langsung maupun diintegrasikan ke dalam pipeline CI/CD.</p></div>
<p class="ew-code-label">1. Rilis Aplikasi pada Port Staging dengan Validasi Otomatis</p>
<pre class="ew-code">tcctl deploy --image tomcat:10-jdk17 --staging-port 9080 --live-port 8080</pre>
<p class="ew-code-label">2. Audit Konfigurasi Terhadap Standar CIS Benchmark</p>
<pre class="ew-code">tcctl va audit --conf /opt/tomcat/conf</pre>
<p class="ew-code-label">3. Sinkronisasi Konfigurasi dari Repositori Git</p>
<pre class="ew-code">tcctl gitops sync --repo https://git.internal/tomcat-baseline --interval 5m</pre>
</div>

<div class="ew-section">
<div class="ew-section__head"><h2 class="ew-h2">Skenario Implementasi</h2></div>
<div class="ew-grid-2">
<div class="ew-panel"><h3 class="ew-panel__title">Mencegah Kegagalan Rilis di Server Produksi</h3><p class="ew-panel__text">Memastikan traffic pengguna hanya dialihkan setelah versi aplikasi terbaru terbukti sehat di port staging, menjaga layanan tetap berjalan lancar tanpa interupsi.</p></div>
<div class="ew-panel"><h3 class="ew-panel__title">Kesiapan Audit Keamanan &amp; Regulasi</h3><p class="ew-panel__text">Menyediakan bukti kepatuhan otomatis melalui audit CIS Benchmark dan riwayat pemindaian kerentanan untuk kebutuhan audit kepatuhan industri perbankan dan finansial.</p></div>
</div>
</div>

<div class="ew-section">
<div class="ew-section__head"><h2 class="ew-h2">Arsitektur Operasional</h2></div>
<div class="ew-steps">
<div class="ew-step"><p class="ew-step__title">Eksekusi Mandiri</p><p class="ew-step__text">Dijalankan langsung di server host atau dipanggil otomatis dari runner CI/CD (GitLab CI, GitHub Actions, Jenkins).</p></div>
<div class="ew-step"><p class="ew-step__title">Manajemen Kontainer</p><p class="ew-step__text">Terhubung langsung dengan Docker Engine pada Windows Server atau Podman pada Enterprise Linux.</p></div>
<div class="ew-step"><p class="ew-step__title">Proteksi Konfigurasi</p><p class="ew-step__text">File konfigurasi dipasang dalam mode read-only dan disinkronkan secara teratur dari repositori Git.</p></div>
</div>
</div>

<div class="ew-section">
<div class="ew-section__head"><h2 class="ew-h2">Dukungan Platform</h2></div>
<div class="ew-platform-strip"><span class="ew-fs-badge ew-fs--blue">Windows Server (Docker Engine)</span><span class="ew-fs-badge ew-fs--blue">Enterprise Linux (Podman / Docker)</span><span class="ew-fs-badge ew-fs--slate">Tanpa Dependensi Runtime</span></div>
<p class="ew-lead" style="margin-top:1rem;">Didesain sebagai kakas biner statis mandiri dalam bahasa Go untuk memberikan performa deterministik dan keseragaman manajemen rilis di berbagai klaster host server.</p>
</div>
