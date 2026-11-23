#!/usr/bin/env python3
import os
import shutil
import socket
import urllib.request
import json

def check_env():
    pk = os.getenv("LANGFUSE_PUBLIC_KEY")
    sk = os.getenv("LANGFUSE_SECRET_KEY")
    host = os.getenv("LANGFUSE_HOST", "http://localhost:3000")
    
    print("=== Langfuse Preflight Diagnostics ===")
    print(f"Target Host: {host}")
    print(f"Public Key configured: {bool(pk)} ({pk[:8]}... if pk else 'None')")
    print(f"Secret Key configured: {bool(sk)} (sk-lf-***)")
    
    docker_ok = shutil.which("docker") is not None
    print(f"Docker available: {docker_ok}")
    
    # Check host connectivity
    try:
        req = urllib.request.Request(f"{host.rstrip('/')}/api/public/health", headers={"User-Agent": "langfuse-preflight"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"Langfuse Server Health: OK ({data})")
    except Exception as e:
        print(f"Langfuse Server Health: Unreachable or offline ({e})")
        print("  -> To launch local stack: docker compose -f docker-compose.yml up -d")

if __name__ == '__main__':
    check_env()
