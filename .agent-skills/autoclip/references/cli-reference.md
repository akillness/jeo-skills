# AutoClip — CLI Reference and Commands

AutoClip exposes all functionality through a unified command-line interface.

## Primary Commands

### 1. Diagnostic and Health Check
```bash
autoclip doctor
```
Inspects:
- Python runtime version (requires 3.11 or 3.12, rejects 3.13)
- FFmpeg and FFprobe binary availability
- `libass` and `libx264` codec support in FFmpeg
- GPU acceleration availability (CTranslate2 CUDA on Linux, CPU/Metal on Apple Silicon)
- Model providers and OS keyring storage status

### 2. Run Ingestion and Clipping
```bash
autoclip clip <url-or-file> [options]
```
Options:
- `--style <name>`: Caption preset (`bold_pop`, `karaoke_fill`, `clean_lower`, `boxed`). Default: `bold_pop`.
- `--aspect <ratio>`: Aspect ratio (`9:16`, `1:1`, `16:9`). Default: `9:16`.
- `--model <name>`: LLM model override for highlight selection.
- `--min-duration <sec>`: Minimum clip length (default: 15s).
- `--max-duration <sec>`: Maximum clip length (default: 60s).
- `--count <num>`: Target number of clips to export.

### 3. Review Web Server
```bash
autoclip serve [--port 8000] [--host 127.0.0.1]
```
Starts the local review web application. Review generated clips, edit transcript words, tweak crop bounding boxes, and re-export.

### 4. Job Management
```bash
# List recent clipping jobs
autoclip jobs

# Show status and logs for a specific job
autoclip jobs inspect <job_id>

# Remove temporary artifacts for a job
autoclip jobs clean <job_id>
```

### 5. Secrets and Configuration
```bash
# Store provider API keys securely in OS keyring
autoclip config set-secret anthropic
autoclip config set-secret openai
autoclip config set-secret gemini

# Display current configuration (secrets masked)
autoclip config show

# List available caption styles and font status
autoclip styles
```
