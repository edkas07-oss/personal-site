+++
title = "tcctl"
tagline = "Universal Operator CLI for Apache Tomcat Enterprise"
version = "v1.0.0"
status = "Community Edition"
license = "Proprietary (Free for Lab Use)"
weight = 1
summary = "Single static CLI tool untuk manajemen lifecycle container, CIS hardening, konfigurasi TLS PKCS#12 & PEM, host bind-mount (conf:ro), tuning memori JVM dinamis (bin/setenv), dan orkestrasi GitOps di Linux & Windows Server."
tags = ["Go 1.26+ Static", "Zero Runtime Dependencies", "Community Edition", "Windows Server (Docker)", "Linux (Podman)"]
project_url = "/projects/tcctl/"
project_label = "Platform Blueprint & 7 Pilar"
guide_url = "/how-to/deploy-tomcat-container-windows-server-tcctl/"
guide_label = "Panduan Deploy Tomcat"
repo_url = "https://github.com/edkas07-oss/tcctl"

[[downloads]]
os = "Windows Server (Zip Archive)"
icon = "🪟"
file = "tcctl-v1.0.0-windows-amd64.zip"
arch = "x86_64 / amd64"
size = "~3.4 MB"
url = "https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl-v1.0.0-windows-amd64.zip"
cmd = "Invoke-WebRequest -Uri \"https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl.exe\" -OutFile tcctl.exe"

[[downloads]]
os = "Enterprise Linux (Tarball)"
icon = "🐧"
file = "tcctl-v1.0.0-linux-amd64.tar.gz"
arch = "x86_64 / amd64"
size = "~3.3 MB"
url = "https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl-v1.0.0-linux-amd64.tar.gz"
cmd = "curl -fsSL \"https://github.com/edkas07-oss/tcctl/releases/latest/download/tcctl\" -o /usr/local/bin/tcctl && chmod +x /usr/local/bin/tcctl"
+++
