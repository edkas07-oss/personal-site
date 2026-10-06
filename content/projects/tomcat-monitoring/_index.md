+++
title = "tmctl"
description = "Monitoring dan diagnostik otonom Apache Tomcat: telemetri 0-agent, triase otomatis JVM, notifikasi berjenjang, dan pengamanan bukti forensik."
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
<p class="ew-hero__eyebrow">Proyek Rekayasa · tmctl</p>
<h1 class="ew-pagehero__title">tmctl: Monitoring &amp; Diagnostik Otonom Apache Tomcat</h1>
<p class="ew-lead">Tool CLI observabilitas dan diagnostik otonom untuk runtime JVM Tomcat. Menyediakan visibilitas performa real-time, triase otomatis saat terjadi anomali, dan investigasi insiden tanpa beban agen tambahan.</p>
</div>

<div class="ew-section">
<div class="ew-section__head"><h2 class="ew-h2">Kemampuan Utama</h2><p class="ew-lead">Klik setiap kartu untuk melihat visualisasi alur perbandingan kendala operasional konvensional dan solusi rekayasa yang dihadirkan tmctl.</p></div>
<div class="ew-grid-2">
<div class="ew-panel ew-panel--interactive" role="button" tabindex="0" data-modal="modal-telemetry" aria-haspopup="dialog">
<span class="ew-panel__tag">Observabilitas Tanpa Agen</span>
<h3 class="ew-panel__title">Telemetri Real-Time Ringan (0 Agent Overhead)</h3>
<p class="ew-panel__text">Mengambil metrik heap memory, thread pool, CPU, dan garbage collection secara langsung via soket runtime lokal tanpa membebani JVM dengan Java agent atau daemon pihak ketiga.</p>
<span class="ew-panel__hint">Lihat Masalah &amp; Solusi →</span>
</div>

<div class="ew-panel ew-panel--interactive" role="button" tabindex="0" data-modal="modal-diagnostic" aria-haspopup="dialog">
<span class="ew-panel__tag">Diagnostik Otonom</span>
<h3 class="ew-panel__title">Deteksi Anomali &amp; Triase Insiden Otomatis</h3>
<p class="ew-panel__text">Mendeteksi GC thrashing, thread deadlock, dan lonjakan memori OOM secara otomatis, serta menghasilkan laporan triase teknis instan tanpa perlu login manual ke server.</p>
<span class="ew-panel__hint">Lihat Masalah &amp; Solusi →</span>
</div>

<div class="ew-panel ew-panel--interactive" role="button" tabindex="0" data-modal="modal-alerting" aria-haspopup="dialog">
<span class="ew-panel__tag">Notifikasi Cerdas</span>
<h3 class="ew-panel__title">Dual-Alert Strategy untuk Tim L1/L2 &amp; L3</h3>
<p class="ew-panel__text">Menyampaikan ringkasan status operasional cepat untuk tim NOC / Helpdesk L1/L2, serta lampiran data forensik mendalam dan rekomendasi triase untuk tim SRE / Backend L3.</p>
<span class="ew-panel__hint">Lihat Masalah &amp; Solusi →</span>
</div>

<div class="ew-panel ew-panel--interactive" role="button" tabindex="0" data-modal="modal-remediation" aria-haspopup="dialog">
<span class="ew-panel__tag">Remediasi Aman</span>
<h3 class="ew-panel__title">Isolasi Traffic &amp; Pengamanan Bukti Forensik</h3>
<p class="ew-panel__text">Mengisolasi aliran traffic dari kontainer bermasalah dan mengambil snapshot dump forensik (heap &amp; thread dump) secara aman sebelum restart dilakukan, menjaga bukti akar masalah.</p>
<span class="ew-panel__hint">Lihat Masalah &amp; Solusi →</span>
</div>
</div>
</div>

<!-- Modal 1: Telemetri Tanpa Agen -->
<div id="modal-telemetry" class="ew-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="title-telemetry">
<div class="ew-modal-window">
<button type="button" class="ew-modal-close-btn" aria-label="Tutup" data-close-modal>&times;</button>
<div class="ew-modal-header">
<span class="ew-modal-tag">Observabilitas Tanpa Agen</span>
<h3 id="title-telemetry" class="ew-modal-title">Telemetri Real-Time Ringan (0 Agent Overhead)</h3>
</div>
<div class="ew-modal-body">
<div class="ew-diag-wrap">
  <div class="ew-diag-track ew-diag-track--bad">
    <div class="ew-diag-badge ew-diag-badge--bad">🔴 Tanpa tmctl (Heavy Java Agent / APM)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">📦</span>
        <span class="ew-diag-node__title">Heavy APM Agent</span>
        <span class="ew-diag-node__desc">Bytecode injection</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">📈</span>
        <span class="ew-diag-node__title">Resource Spike</span>
        <span class="ew-diag-node__desc">+15-20% RAM/CPU</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">⚠️</span>
        <span class="ew-diag-node__title">GC Pause Meningkat</span>
        <span class="ew-diag-node__desc">Latensi aplikasi naik</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">💥</span>
        <span class="ew-diag-node__title">Resiko Stabilitas</span>
        <span class="ew-diag-node__desc">Overhead di produksi</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--bad">
      <span>⚠️ Dampak: Monitoring justru membebani kapasitas server dan menambah latensi transaksi.</span>
    </div>
  </div>

  <div class="ew-diag-track ew-diag-track--good">
    <div class="ew-diag-badge ew-diag-badge--good">🟢 Dengan tmctl (Direct Local Socket Inspection)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🔌</span>
        <span class="ew-diag-node__title">Local Socket</span>
        <span class="ew-diag-node__desc">IPC Unix / Named Pipe</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">⚡</span>
        <span class="ew-diag-node__title">Direct Read</span>
        <span class="ew-diag-node__desc">0 bytecode injection</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🛡️</span>
        <span class="ew-diag-node__title">Zero JVM Load</span>
        <span class="ew-diag-node__desc">&lt;0.5% CPU overhead</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">📊</span>
        <span class="ew-diag-node__title">Metrik Presisi</span>
        <span class="ew-diag-node__desc">Real-time &amp; aman</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--good">
      <span>✓ Manfaat: Visibilitas mendalam tanpa mengorbankan performa aplikasi maupun stabilitas runtime JVM.</span>
    </div>
  </div>
</div>
</div>
<div class="ew-modal-footer">
<button type="button" class="ew-btn ew-btn--ghost" data-close-modal>Tutup</button>
</div>
</div>
</div>

<!-- Modal 2: Diagnostik Otonom -->
<div id="modal-diagnostic" class="ew-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="title-diagnostic">
<div class="ew-modal-window">
<button type="button" class="ew-modal-close-btn" aria-label="Tutup" data-close-modal>&times;</button>
<div class="ew-modal-header">
<span class="ew-modal-tag">Diagnostik Otonom</span>
<h3 id="title-diagnostic" class="ew-modal-title">Deteksi Anomali &amp; Triase Insiden Otomatis</h3>
</div>
<div class="ew-modal-body">
<div class="ew-diag-wrap">
  <div class="ew-diag-track ew-diag-track--bad">
    <div class="ew-diag-badge ew-diag-badge--bad">🔴 Tanpa tmctl (Investigasi Manual di Host)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🚨</span>
        <span class="ew-diag-node__title">Aplikasi Hang</span>
        <span class="ew-diag-node__desc">Alert umum / komplain</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">🔑</span>
        <span class="ew-diag-node__title">SSH Manual</span>
        <span class="ew-diag-node__desc">Akses server darurat</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">⌨️</span>
        <span class="ew-diag-node__title">Perintah Jstack/Jcmd</span>
        <span class="ew-diag-node__desc">Diagnosa manual rumit</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">⏳</span>
        <span class="ew-diag-node__title">MTTR &gt; 60 Menit</span>
        <span class="ew-diag-node__desc">Investigasi lambat</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--bad">
      <span>⚠️ Dampak: Pemulihan insiden memakan waktu panjang dan rentan kesalahan analisis saat situasi darurat.</span>
    </div>
  </div>

  <div class="ew-diag-track ew-diag-track--good">
    <div class="ew-diag-badge ew-diag-badge--good">🟢 Dengan tmctl (Autonomous Triage Engine)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🧠</span>
        <span class="ew-diag-node__title">Deteksi Anomali</span>
        <span class="ew-diag-node__desc">Deadlock / GC Thrash</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">📸</span>
        <span class="ew-diag-node__title">Auto Capture</span>
        <span class="ew-diag-node__desc">Snapshot stack trace</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">📋</span>
        <span class="ew-diag-node__title">Analisis Otonom</span>
        <span class="ew-diag-node__desc">Triase akar masalah</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">⚡</span>
        <span class="ew-diag-node__title">Laporan Instan</span>
        <span class="ew-diag-node__desc">MTTR turun drastis</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--good">
      <span>✓ Manfaat: Tim engineering langsung menerima rangkuman penyebab insiden tanpa perlu investigasi manual dari nol.</span>
    </div>
  </div>
</div>
</div>
<div class="ew-modal-footer">
<button type="button" class="ew-btn ew-btn--ghost" data-close-modal>Tutup</button>
</div>
</div>
</div>

<!-- Modal 3: Notifikasi Cerdas -->
<div id="modal-alerting" class="ew-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="title-alerting">
<div class="ew-modal-window">
<button type="button" class="ew-modal-close-btn" aria-label="Tutup" data-close-modal>&times;</button>
<div class="ew-modal-header">
<span class="ew-modal-tag">Notifikasi Cerdas</span>
<h3 id="title-alerting" class="ew-modal-title">Dual-Alert Strategy untuk Tim L1/L2 &amp; L3</h3>
</div>
<div class="ew-modal-body">
<div class="ew-diag-wrap">
  <div class="ew-diag-track ew-diag-track--bad">
    <div class="ew-diag-badge ew-diag-badge--bad">🔴 Tanpa tmctl (Alert Flood &amp; Minim Konteks)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">📧</span>
        <span class="ew-diag-node__title">Email Generik</span>
        <span class="ew-diag-node__desc">"Server Down" saja</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">🌊</span>
        <span class="ew-diag-node__title">Alert Fatigue</span>
        <span class="ew-diag-node__desc">Ratusan spam email</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">❓</span>
        <span class="ew-diag-node__title">Eskalasi Buta</span>
        <span class="ew-diag-node__desc">L1 bingung tujuan</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">😫</span>
        <span class="ew-diag-node__title">Respon Terhambat</span>
        <span class="ew-diag-node__desc">Koordinasi lambat</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--bad">
      <span>⚠️ Dampak: Notifikasi yang membingungkan memperlambat respons dan mengaburkan prioritas penanganan insiden.</span>
    </div>
  </div>

  <div class="ew-diag-track ew-diag-track--good">
    <div class="ew-diag-badge ew-diag-badge--good">🟢 Dengan tmctl (Dual-Tier Smart Alerting)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🎯</span>
        <span class="ew-diag-node__title">Filter Cerdas</span>
        <span class="ew-diag-node__desc">Deteksi anomali nyata</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">📨</span>
        <span class="ew-diag-node__title">L1/L2 Alert</span>
        <span class="ew-diag-node__desc">Status &amp; dampak layanan</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">＋</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🔬</span>
        <span class="ew-diag-node__title">L3 Deep Report</span>
        <span class="ew-diag-node__desc">Stack trace &amp; triase</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🚀</span>
        <span class="ew-diag-node__title">Aksi Cepat</span>
        <span class="ew-diag-node__desc">Eskalasi tepat sasaran</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--good">
      <span>✓ Manfaat: Setiap level tim menerima informasi proporsional sehingga mitigasi insiden berlangsung cepat dan terarah.</span>
    </div>
  </div>
</div>
</div>
<div class="ew-modal-footer">
<button type="button" class="ew-btn ew-btn--ghost" data-close-modal>Tutup</button>
</div>
</div>
</div>

<!-- Modal 4: Remediasi Aman -->
<div id="modal-remediation" class="ew-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="title-remediation">
<div class="ew-modal-window">
<button type="button" class="ew-modal-close-btn" aria-label="Tutup" data-close-modal>&times;</button>
<div class="ew-modal-header">
<span class="ew-modal-tag">Remediasi Aman</span>
<h3 id="title-remediation" class="ew-modal-title">Isolasi Traffic &amp; Pengamanan Bukti Forensik</h3>
</div>
<div class="ew-modal-body">
<div class="ew-diag-wrap">
  <div class="ew-diag-track ew-diag-track--bad">
    <div class="ew-diag-badge ew-diag-badge--bad">🔴 Tanpa tmctl (Blind Restart / Hilang Bukti)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">⛔</span>
        <span class="ew-diag-node__title">Tomcat Macet</span>
        <span class="ew-diag-node__desc">Request gagal masuk</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">🔄</span>
        <span class="ew-diag-node__title">Blind Restart</span>
        <span class="ew-diag-node__desc">Restart paksa mendadak</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node ew-diag-node--alert">
        <span class="ew-diag-node__icon">💨</span>
        <span class="ew-diag-node__title">Bukti Menguap</span>
        <span class="ew-diag-node__desc">Dump memori hilang</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--bad">→</span>
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">💥</span>
        <span class="ew-diag-node__title">Insiden Berulang</span>
        <span class="ew-diag-node__desc">Akar masalah tak tuntas</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--bad">
      <span>⚠️ Dampak: Masalah performa terus berulang di kemudian hari karena bukti analisis hilang saat restart darurat.</span>
    </div>
  </div>

  <div class="ew-diag-track ew-diag-track--good">
    <div class="ew-diag-badge ew-diag-badge--good">🟢 Dengan tmctl (Safe Drain &amp; Forensic Capture)</div>
    <div class="ew-diag-flow">
      <div class="ew-diag-node">
        <span class="ew-diag-node__icon">🛡️</span>
        <span class="ew-diag-node__title">Traffic Drain</span>
        <span class="ew-diag-node__desc">Isolasi node aman</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">💾</span>
        <span class="ew-diag-node__title">Forensic Snap</span>
        <span class="ew-diag-node__desc">Dump heap &amp; threads</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🔄</span>
        <span class="ew-diag-node__title">Clean Restart</span>
        <span class="ew-diag-node__desc">Layanan pulih lancar</span>
      </div>
      <span class="ew-diag-arrow ew-diag-arrow--good">→</span>
      <div class="ew-diag-node ew-diag-node--success">
        <span class="ew-diag-node__icon">🔍</span>
        <span class="ew-diag-node__title">RCA Akurat</span>
        <span class="ew-diag-node__desc">Perbaikan permanen</span>
      </div>
    </div>
    <div class="ew-diag-takeaway ew-diag-takeaway--good">
      <span>✓ Manfaat: Layanan kembali normal dengan cepat sementara tim pengembang memiliki data lengkap untuk perbaikan menyeluruh.</span>
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
<div class="ew-section__head"><h2 class="ew-h2">Alur Penggunaan CLI</h2><p class="ew-lead">Perintah ringkas yang dirancang untuk kecepatan respons insiden teknis di level host.</p></div>
<p class="ew-code-label">1. Pemeriksaan Status &amp; Metrik JVM Real-Time</p>
<pre class="ew-code">tmctl status --target tomcat-prod-01 --metrics jvm,threads,gc</pre>
<p class="ew-code-label">2. Diagnostik Otonom &amp; Ekspor Laporan Triase Insiden</p>
<pre class="ew-code">tmctl triage --container tomcat-prod-01 --export-report</pre>
<p class="ew-code-label">3. Isolasi Traffic Masuk &amp; Pengambilan Bukti Forensik</p>
<pre class="ew-code">tmctl isolate --container tomcat-prod-01 --drain-traffic --capture-dump</pre>
</div>

<div class="ew-section">
<div class="ew-section__head"><h2 class="ew-h2">Skenario Implementasi</h2></div>
<div class="ew-grid-2">
<div class="ew-panel"><h3 class="ew-panel__title">Investigasi Penurunan Performa Tanpa Error Log</h3><p class="ew-panel__text">Saat aplikasi mengalami lonjakan latensi tanpa pesan error jelas, tmctl membantu tim on-call memastikan apakah penyebabnya saturasi thread pool atau pause time GC yang tinggi sebelum mengambil tindakan mitigasi.</p></div>
<div class="ew-panel"><h3 class="ew-panel__title">Post-Mortem &amp; Analisis Akar Masalah (RCA)</h3><p class="ew-panel__text">Menghilangkan kebiasaan restart buta yang memusnahkan bukti forensik. Dump memori dan histori metrik diamankan secara otomatis untuk analisis pasca-insiden oleh tim engineering.</p></div>
</div>
</div>

<div class="ew-section">
<div class="ew-section__head"><h2 class="ew-h2">Arsitektur Diagnostik</h2></div>
<div class="ew-steps">
<div class="ew-step"><p class="ew-step__title">Eksekusi Mandiri</p><p class="ew-step__text">Dijalankan langsung di server host tanpa memerlukan runtime Java tambahan di tingkat sistem operasi.</p></div>
<div class="ew-step"><p class="ew-step__title">Koneksi IPC Langsung</p><p class="ew-step__text">Membaca status runtime kontainer dan telemetri JVM melalui soket lokal (Unix Socket / Windows Named Pipe).</p></div>
<div class="ew-step"><p class="ew-step__title">Laporan &amp; Bukti Terisolasi</p><p class="ew-step__text">Laporan triase instan dan berkas snapshot dump disimpan di lokasi terisolasi untuk evaluasi tim engineering.</p></div>
</div>
</div>

<div class="ew-section">
<div class="ew-section__head"><h2 class="ew-h2">Dukungan Platform</h2></div>
<div class="ew-platform-strip"><span class="ew-fs-badge ew-fs--blue">Windows Server (Docker Engine)</span><span class="ew-fs-badge ew-fs--blue">Enterprise Linux (Podman / Docker)</span><span class="ew-fs-badge ew-fs--slate">Tanpa Dependensi Runtime</span></div>
<p class="ew-lead" style="margin-top:1rem;">Dirancang khusus untuk sistem rekayasa observabilitas multi-OS yang mengedepankan isolasi non-destruktif dan penegakan keandalan performa JVM jangka panjang.</p>
</div>
