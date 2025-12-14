
import os
import sys

print(f"Python: {sys.executable}")
print(f"CWD: {os.getcwd()}")
print("Environment Variables related to VSPHERE:")
for key, value in os.environ.items():
    if "VSPHERE" in key:
        print(f"{key}: {'*' * len(value) if value else 'None'}")
