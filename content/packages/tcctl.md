+++
title = "tcctl"
tagline = "Universal Operator CLI for Apache Tomcat Enterprise"
version = "v1.0.0"
status = "Latest Stable"
license = "Apache 2.0"
weight = 1
summary = "Single static CLI tool untuk manajemen lifecycle container, CIS hardening, konfigurasi TLS PKCS#12 & PEM, host bind-mount (conf:ro), dan orkestrasi GitOps di Linux & Windows Server."
tags = ["Go 1.23+ Static", "Zero Runtime Dependencies", "Windows Server (Docker)", "Linux (Podman)"]
guide_url = "/how-to/deploy-tomcat-container-windows-server-tcctl/"
guide_label = "Panduan Deploy Tomcat & tcctl"
repo_url = "https://github.com/edkas07-oss/tcctl"

[[downloads]]
os = "Windows Server"
icon = "🪟"
file = "tcctl.exe"
arch = "x86_64 / amd64"
size = "~8.0 MB"
url = "https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl.exe"
cmd = "Invoke-WebRequest -Uri \"https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl.exe\" -OutFile tcctl.exe"

[[downloads]]
os = "Enterprise Linux"
icon = "🐧"
file = "tcctl"
arch = "x86_64 / amd64"
size = "~7.7 MB"
url = "https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl"
cmd = "curl -fsSL \"https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl\" -o /usr/local/bin/tcctl && chmod +x /usr/local/bin/tcctl"
+++
