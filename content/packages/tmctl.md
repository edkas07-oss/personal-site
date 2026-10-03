+++
title = "tmctl"
tagline = "Unified Cross-Platform Operator CLI for Tomcat Monitoring"
version = "v1.0.0"
status = "Community Edition"
license = "Proprietary Freeware (Lab & Personal Use)"
weight = 2
summary = "Single static CLI operator untuk orkestrasi kontainer monitoring Tomcat (JMX Exporter, Prometheus, Alertmanager, Diagnostic), manajemen aturan diagnostik runtime, dan kepatuhan platform di Linux & Windows Server."
tags = ["Go 1.23+ Static", "Zero Runtime Dependencies", "Community Edition", "Windows Server (Docker)", "Linux (Podman)"]
guide_url = "/how-to/build-tomcat-jmx-nanoserver-image/"
guide_label = "Panduan Build Image JMX"
repo_url = "https://github.com/edkas07-oss/tmctl"
checksum_url = "/downloads/tmctl/sha256sums.txt"

[[downloads]]
os = "Windows Server (Zip Archive)"
icon = "🪟"
file = "tmctl-v1.0.0-windows-amd64.zip"
arch = "x86_64 / amd64"
size = "~3.8 MB"
sha256 = "3b6b347c2d03972dc443d517719196d7249d353ee775d2f5715e31f31482f97c"
url = "/downloads/tmctl/tmctl-v1.0.0-windows-amd64.zip"
cmd = "Invoke-WebRequest -Uri \"https://eddywiyatno.my.id/downloads/tmctl/tmctl.exe\" -OutFile tmctl.exe"

[[downloads]]
os = "Enterprise Linux (Tarball)"
icon = "🐧"
file = "tmctl-v1.0.0-linux-amd64.tar.gz"
arch = "x86_64 / amd64"
size = "~3.7 MB"
sha256 = "be2f2d83f536aa9ea01e88ada9702a0c3bfc768ebc04c727a5703b91399287e4"
url = "/downloads/tmctl/tmctl-v1.0.0-linux-amd64.tar.gz"
cmd = "curl -fsSL \"https://eddywiyatno.my.id/downloads/tmctl/tmctl\" -o /usr/local/bin/tmctl && chmod +x /usr/local/bin/tmctl"
+++
