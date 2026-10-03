+++
title = "tmctl"
tagline = "Unified Cross-Platform Operator CLI for Tomcat Monitoring"
version = "v1.0.0"
status = "Community Edition"
license = "Proprietary (Free for Lab Use)"
weight = 2
summary = "Single static CLI operator untuk orkestrasi kontainer monitoring Tomcat (JMX Exporter, Prometheus, Alertmanager, Diagnostic), manajemen aturan diagnostik runtime, dan kepatuhan platform di Linux & Windows Server."
tags = ["Go 1.23+ Static", "Zero Runtime Dependencies", "Community Edition", "Windows Server (Docker)", "Linux (Podman)"]
project_url = "/projects/tomcat-monitoring/tmctl/"
project_label = "Bedah Arsitektur tmctl"
guide_url = "/how-to/build-tomcat-jmx-nanoserver-image/"
guide_label = "Panduan Build Image JMX"
repo_url = "https://github.com/edkas07-oss/tmctl"

[[downloads]]
os = "Windows Server (Zip Archive)"
icon = "🪟"
file = "tmctl-v1.0.0-windows-amd64.zip"
arch = "x86_64 / amd64"
size = "~2.8 MB"
url = "https://github.com/edkas07-oss/tmctl/releases/latest/download/tmctl-v1.0.0-windows-amd64.zip"
cmd = "Invoke-WebRequest -Uri \"https://github.com/edkas07-oss/tmctl/releases/latest/download/tmctl.exe\" -OutFile tmctl.exe"

[[downloads]]
os = "Enterprise Linux (Tarball)"
icon = "🐧"
file = "tmctl-v1.0.0-linux-amd64.tar.gz"
arch = "x86_64 / amd64"
size = "~2.7 MB"
url = "https://github.com/edkas07-oss/tmctl/releases/latest/download/tmctl-v1.0.0-linux-amd64.tar.gz"
cmd = "curl -fsSL \"https://github.com/edkas07-oss/tmctl/releases/latest/download/tmctl\" -o /usr/local/bin/tmctl && chmod +x /usr/local/bin/tmctl"
+++
