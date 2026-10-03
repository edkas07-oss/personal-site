+++
title = "tcctl"
tagline = "Universal Operator CLI for Apache Tomcat Enterprise"
version = "v1.0.0"
status = "Community Edition"
license = "Proprietary Freeware (Lab & Personal Use)"
weight = 1
summary = "Single static CLI tool untuk manajemen lifecycle container, CIS hardening, konfigurasi TLS PKCS#12 & PEM, host bind-mount (conf:ro), tuning memori JVM dinamis (bin/setenv), dan orkestrasi GitOps di Linux & Windows Server."
tags = ["Go 1.26+ Static", "Zero Runtime Dependencies", "Community Edition", "Windows Server (Docker)", "Linux (Podman)"]
guide_url = "/how-to/deploy-tomcat-container-windows-server-tcctl/"
guide_label = "Panduan Deploy Tomcat"
repo_url = "https://github.com/edkas07-oss/tcctl"
checksum_url = "/downloads/tcctl/sha256sums.txt"

[[downloads]]
os = "Windows Server (Zip Archive)"
icon = "🪟"
file = "tcctl-v1.0.0-windows-amd64.zip"
arch = "x86_64 / amd64"
size = "~3.4 MB"
sha256 = "f981684ab2dd31b7269831d01ae53d6c0402ee1a7b419e350fbbbdb13f5f32cf"
url = "/downloads/tcctl/tcctl-v1.0.0-windows-amd64.zip"
cmd = "Invoke-WebRequest -Uri \"https://eddywiyatno.my.id/downloads/tcctl/tcctl.exe\" -OutFile tcctl.exe"

[[downloads]]
os = "Enterprise Linux (Tarball)"
icon = "🐧"
file = "tcctl-v1.0.0-linux-amd64.tar.gz"
arch = "x86_64 / amd64"
size = "~3.3 MB"
sha256 = "3e7e804e257be0316ef99ef810c2d8773e2b55b4e8a5b90934d959454f6364e4"
url = "/downloads/tcctl/tcctl-v1.0.0-linux-amd64.tar.gz"
cmd = "curl -fsSL \"https://eddywiyatno.my.id/downloads/tcctl/tcctl\" -o /usr/local/bin/tcctl && chmod +x /usr/local/bin/tcctl"
+++
