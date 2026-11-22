#!/usr/bin/env python3
import subprocess
import shutil
import socket
import sys

def check_command(cmd):
    return shutil.which(cmd) is not None

def check_port(host, port, timeout=1.0):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

def main():
    print("=== Vespa Environment Preflight ===")
    
    docker_ok = check_command("docker")
    vespa_cli_ok = check_command("vespa")
    python_ok = sys.version_info >= (3, 9)
    
    print(f"Docker CLI available: {docker_ok}")
    print(f"Vespa CLI available: {vespa_cli_ok}")
    print(f"Python >= 3.9: {python_ok} ({sys.version.split()[0]})")
    
    port_8080 = check_port("127.0.0.1", 8080)
    port_19071 = check_port("127.0.0.1", 19071)
    
    print(f"Vespa Data Plane (Port 8080): {'LISTENING (Active)' if port_8080 else 'FREE (Ready to bind)'}")
    print(f"Vespa Control Plane (Port 19071): {'LISTENING (Active)' if port_19071 else 'FREE (Ready to bind)'}")
    
    print("Preflight check complete.")

if __name__ == '__main__':
    main()
