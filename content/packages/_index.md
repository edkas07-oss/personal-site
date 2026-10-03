+++
title = "Packages & Tools"
description = "Distribusi resmi standalone static binary untuk tooling operator platform engineering, runtime governance, dan enterprise observability."
cascade = { showDate = false, showAuthor = false }
+++

> [!NOTE]
> **Filosofi Distribusi & Edisi Komunitas:**  
> Seluruh paket biner di bawah ini didistribusikan sebagai **Community Edition (Freeware)** untuk keperluan pengujian mandiri (*developer workstation*), standardisasi lab internal, dan riset platform engineering tanpa transaksi komersial.

---

### 🏛️ Matriks Kapabilitas: Community vs Enterprise Architecture

Untuk memberikan gambaran batasan antara pengujian mandiri (*Community Lab*) dan implementasi tata kelola skala korporasi (*High-Availability Enterprise*):

| Dimensi Fitur | Community Edition (Bebas Unduh) | Enterprise Blueprint (Arsitektur Lanjutan) |
| :--- | :--- | :--- |
| **Lingkup Beban Kerja** | Single Host / Local Container Workstation (Podman & Docker) | Multi-Node Clustered Fleet & Distributed Hosts |
| **Governance & Hardening** | Standar CIS Benchmark Audit (v10/v9) via CLI stdout + JSON | Dynamic Policy-as-Code & Centralized SIEM Ingestion |
| **Format Dokumen Audit** | Teks Terminal ANSI & JSON Artifact | **Dokumen Kepatuhan Formal (Signed PDF / OJK / PCI-DSS)** |
| **TLS & PKCS#12 Automation** | Local Keystore & Truststore Automated Generation | Enterprise HashiCorp Vault / Cloud HSM Integration |
| **Observability & Diagnostics** | Prometheus, Alertmanager, Telegraf Single Stack | Autonomous AI Diagnostic Engine & Dynamic Rulepacks |
| **Deployment Mode** | Direct CLI Orchestration & Local Pull-Based GitOps | Centralized Distributed GitOps & Zero-Downtime Blue/Green Fleet |
| **Model Distribusi** | Free Standalone Binary (.tar.gz / .zip) | Architecture Advisory, Whitepaper & Custom Engineering |

---

### 🛡️ Disclaimer Independensi Riset & Hak Cipta

Seluruh arsitektur, *blueprint*, dan *operator tooling* yang dipublikasikan di portal ini dirancang dan diverifikasi secara independen di lingkungan laboratorium rekayasa personal. Biner publik disediakan secara cuma-cuma untuk evaluasi teknis.

> [!TIP]
> **Kebutuhan Konsultasi Arsitektur Enterprise:**  
> Untuk diskusi arsitektur tingkat lanjut, integrasi multi-cluster, kustomisasi *rulepack* diagnostik AI, atau adopsi tata kelola enterprise, silakan terhubung melalui halaman **[Contact / Inquiries]({{< relref "contact" >}})**.
