+++
title = "tmctl"
tagline = "Unified Cross-Platform Operator CLI for Tomcat Monitoring"
version = "v1.0.0"
status = "Latest Stable"
license = "Apache 2.0"
weight = 2
summary = "Single static CLI operator untuk orkestrasi siklus hidup kontainer monitoring Tomcat (JMX Exporter, Prometheus, Alertmanager, Diagnostic Service), manajemen aturan diagnostik runtime, dan kepatuhan platform di Linux & Windows Server."
tags = ["Go 1.23+ Static", "Zero Runtime Dependencies", "Windows Server (Docker)", "Linux (Podman)"]
project_url = "/projects/tomcat-monitoring/tmctl/"
project_label = "Bedah Arsitektur tmctl"
guide_url = "/how-to/build-tomcat-jmx-nanoserver-image/"
guide_label = "Panduan Build Image Tomcat JMX"
repo_url = "https://github.com/edkas07-oss/tmctl"

[[downloads]]
os = "Windows Server"
icon = "🪟"
file = "tmctl.exe"
arch = "x86_64 / amd64"
size = "~6.0 MB"
url = "https://github.com/edkas07-oss/tmctl/releases/latest/download/tmctl.exe"
cmd = "Invoke-WebRequest -Uri \"https://github.com/edkas07-oss/tmctl/releases/latest/download/tmctl.exe\" -OutFile tmctl.exe"

[[downloads]]
os = "Enterprise Linux"
icon = "🐧"
file = "tmctl"
arch = "x86_64 / amd64"
size = "~5.7 MB"
url = "https://github.com/edkas07-oss/tmctl/releases/latest/download/tmctl"
cmd = "curl -fsSL \"https://github.com/edkas07-oss/tmctl/releases/latest/download/tmctl\" -o /usr/local/bin/tmctl && chmod +x /usr/local/bin/tmctl"
+++
