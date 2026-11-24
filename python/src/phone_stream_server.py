"""
Phone Camera → WiFi → YOLOv8 Weed Detection Server

How it works:
  1. Run this script on your PC.
  2. Open the URL shown in terminal on your phone's browser.
  3. The server automatically handles HTTP -> HTTPS redirection so modern mobile
     browsers (Chrome/Safari) permit camera access via getUserMedia.
  4. Phone camera streams frames over WebSocket to YOLOv8 on PC.
  5. Annotated frames are streamed back in real-time.

Both devices must be on the same WiFi network.
"""

import argparse
import base64
import os
import socket
import ssl
import sys
import threading
import time
import cv2
import numpy as np
from flask import Flask, redirect, render_template_string, request
from flask_socketio import SocketIO, emit
from ultralytics import YOLO

from detection_output import format_detection

# ---------------------------------------------------------------------------
# Configuration & Paths
# ---------------------------------------------------------------------------
DEFAULT_HTTP_PORT = 5000
DEFAULT_HTTPS_PORT = 5001
DEFAULT_CONFIDENCE = 0.35

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CERTS_DIR = os.path.join(PROJECT_ROOT, 'certs')
DEFAULT_CERT_FILE = os.path.join(CERTS_DIR, 'server.crt')
DEFAULT_KEY_FILE = os.path.join(CERTS_DIR, 'server.key')

MODEL_CANDIDATES = [
    os.path.join(PROJECT_ROOT, 'runs', 'detect', 'yolov8_weed_crop', 'weights', 'best.pt'),
    os.path.join(PROJECT_ROOT, 'yolov8n.pt'),
    os.path.join(os.path.dirname(__file__), 'yolov8n.pt'),
]


def find_model(custom_path=None):
    """Find the best available YOLO model."""
    if custom_path and os.path.isfile(custom_path):
        return custom_path
    for p in MODEL_CANDIDATES:
        if os.path.isfile(p):
            return p
    return None


def get_local_ip():
    """Get the machine's local IP address on the WiFi network."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def generate_self_signed_cert(cert_path, key_path, ip_address="127.0.0.1"):
    """
    Generate a self-signed SSL certificate so mobile browsers permit camera access.
    Browsers strictly block getUserMedia on plain HTTP over local IP addresses.
    """
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        import datetime
        import ipaddress

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, ip_address),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "AI Weed Detector"),
        ])

        san_list = [x509.DNSName("localhost")]
        for host in [ip_address, "127.0.0.1"]:
            try:
                san_list.append(x509.IPAddress(ipaddress.ip_address(host)))
            except ValueError:
                san_list.append(x509.DNSName(host))

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1))
            .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
            .add_extension(x509.SubjectAlternativeName(san_list), critical=False)
            .sign(key, hashes.SHA256())
        )

        os.makedirs(os.path.dirname(os.path.abspath(cert_path)), exist_ok=True)
        with open(key_path, 'wb') as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))
        with open(cert_path, 'wb') as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        return True
    except Exception as e:
        print(f"Warning: Could not auto-generate SSL certificate ({e}).")
        return False


def ensure_ssl_certificates(ip_address, cert_file=None, key_file=None):
    """Ensure SSL certificates exist. Generates a self-signed cert if missing."""
    cert_path = cert_file or DEFAULT_CERT_FILE
    key_path = key_file or DEFAULT_KEY_FILE

    if os.path.isfile(cert_path) and os.path.isfile(key_path):
        return cert_path, key_path

    print(f"[*] Generating self-signed SSL certificate for IP {ip_address}...")
    success = generate_self_signed_cert(cert_path, key_path, ip_address)
    if success:
        print(f"[*] Certificate generated: {cert_path}")
        return cert_path, key_path
    return None, None


# ---------------------------------------------------------------------------
# Flask + SocketIO app (Main detection server)
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config['SECRET_KEY'] = 'weed-detection-secret'
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=10 * 1024 * 1024)

# Global model and config (initialized in main)
model = None
confidence_threshold = DEFAULT_CONFIDENCE
frame_count = 0
start_time = time.time()


# ---------------------------------------------------------------------------
# HTML page served to the phone
# ---------------------------------------------------------------------------
PHONE_PAGE = r"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>🌿 Weed Detector - Phone Camera</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #0a0a0a; color: #e0e0e0;
    display: flex; flex-direction: column; align-items: center;
    min-height: 100vh; overflow-x: hidden;
  }
  header {
    width: 100%; padding: 12px 16px;
    background: linear-gradient(135deg, #1a472a 0%, #2d5016 100%);
    text-align: center; position: sticky; top: 0; z-index: 10;
  }
  header h1 { font-size: 1.2rem; color: #90ee90; }
  header p { font-size: 0.75rem; color: #aaa; margin-top: 2px; }

  .container { width: 100%; max-width: 640px; padding: 8px; flex: 1; display: flex; flex-direction: column; gap: 8px; }

  .video-box {
    position: relative; width: 100%; border-radius: 12px; overflow: hidden;
    background: #111; border: 2px solid #333;
  }
  video, canvas, #result-img {
    width: 100%; display: block; border-radius: 10px;
  }
  #result-img { display: none; }
  canvas { display: none; }

  .stats {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
    font-size: 0.75rem; text-align: center;
  }
  .stat-box {
    background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 8px 4px;
  }
  .stat-val { font-size: 1.1rem; font-weight: 700; color: #90ee90; }
  .stat-label { color: #888; margin-top: 2px; }

  .btn-row { display: flex; gap: 8px; }
  .btn {
    flex: 1; padding: 14px; border: none; border-radius: 10px;
    font-size: 1rem; font-weight: 600; cursor: pointer;
    transition: all 0.2s;
  }
  .btn-start { background: #2d7a2d; color: white; }
  .btn-start:hover { background: #3a9a3a; }
  .btn-stop { background: #7a2d2d; color: white; }
  .btn-stop:hover { background: #9a3a3a; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .detection-log {
    background: #111; border: 1px solid #333; border-radius: 8px;
    padding: 8px; max-height: 160px; overflow-y: auto;
    font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 0.7rem;
    line-height: 1.4;
  }
  .det-weed { color: #ff6b6b; }
  .det-crop { color: #69db7c; }

  .status {
    text-align: center; font-size: 0.8rem; padding: 6px;
    border-radius: 6px; font-weight: 600;
  }
  .status-connected { background: #1a3a1a; color: #69db7c; }
  .status-disconnected { background: #3a1a1a; color: #ff6b6b; }
  .status-streaming { background: #1a2a3a; color: #69b4db; }

  .mode-toggle { display: flex; gap: 6px; }
  .mode-btn {
    flex: 1; padding: 8px; border: 1px solid #444; border-radius: 8px;
    background: #1a1a1a; color: #aaa; cursor: pointer; text-align: center;
    font-size: 0.8rem;
  }
  .mode-btn.active { border-color: #2d7a2d; color: #90ee90; background: #1a2a1a; }

  /* Insecure Warning Banner */
  .insecure-alert {
    display: none;
    background: #332200;
    border: 1px solid #faad14;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.78rem;
    color: #ffe58f;
    line-height: 1.45;
  }
  .insecure-alert a {
    color: #5cdbd3;
    font-weight: 700;
    text-decoration: underline;
  }
</style>
</head>
<body>
<header>
  <h1>🌿 AI Weed Detector</h1>
  <p>Point your camera at crops to detect weeds</p>
</header>

<div class="container">
  <div id="status" class="status status-disconnected">Connecting to server...</div>

  <!-- Insecure Origin Banner -->
  <div id="insecure-alert" class="insecure-alert">
    <strong>⚠️ Camera Access Blocked (Insecure HTTP Origin)</strong><br>
    Mobile browsers strictly require <strong>HTTPS</strong> to use the camera.<br>
    <div style="margin-top: 6px;">
      👉 <a id="https-link" href="#">Open Secure HTTPS Version</a><br>
      <span style="color:#d9d9d9; font-size:0.72rem;">(Tap "Advanced" &rarr; "Proceed" on the certificate warning)</span>
    </div>
  </div>

  <div class="mode-toggle">
    <div class="mode-btn active" id="mode-rear" onclick="switchCamera('environment')">📷 Rear Camera</div>
    <div class="mode-btn" id="mode-front" onclick="switchCamera('user')">🤳 Front Camera</div>
  </div>

  <div class="video-box">
    <video id="video" autoplay playsinline muted></video>
    <img id="result-img" alt="Detection Result">
    <canvas id="canvas"></canvas>
  </div>

  <div class="stats">
    <div class="stat-box"><div class="stat-val" id="fps">0</div><div class="stat-label">FPS</div></div>
    <div class="stat-box"><div class="stat-val" id="latency">0</div><div class="stat-label">Latency (ms)</div></div>
    <div class="stat-box"><div class="stat-val" id="detections">0</div><div class="stat-label">Detections</div></div>
  </div>

  <div class="btn-row">
    <button class="btn btn-start" id="btn-start" onclick="startStream()">▶ Start Detection</button>
    <button class="btn btn-stop" id="btn-stop" onclick="stopStream()" disabled>⏹ Stop</button>
  </div>

  <div class="detection-log" id="log">Waiting for detections...</div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js"></script>
<script>
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const resultImg = document.getElementById('result-img');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

let streaming = false;
let socket = null;
let currentFacing = 'environment';
let sendInterval = null;
let framesSent = 0;

// Check if page is served in a secure context
function checkSecureContext() {
  const isSecure = window.isSecureContext || window.location.protocol === 'https:' ||
                   window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isSecure) {
    const alertBox = document.getElementById('insecure-alert');
    if (alertBox) alertBox.style.display = 'block';
    const httpsLink = document.getElementById('https-link');
    if (httpsLink) {
      httpsLink.href = 'https://' + window.location.hostname + ':5001' + window.location.pathname;
    }
  }
}

// Connect to server
function connect() {
  socket = io({
    reconnection: true,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    statusEl.textContent = '✅ Connected to server';
    statusEl.className = 'status status-connected';
  });

  socket.on('disconnect', () => {
    statusEl.textContent = '❌ Disconnected from server';
    statusEl.className = 'status status-disconnected';
    stopStream();
  });

  socket.on('result', (data) => {
    resultImg.src = 'data:image/jpeg;base64,' + data.image;
    resultImg.style.display = 'block';

    document.getElementById('fps').textContent = data.fps.toFixed(1);
    document.getElementById('latency').textContent = data.latency_ms.toFixed(0);
    document.getElementById('detections').textContent = data.detections.length;

    if (data.detections.length > 0) {
      const lines = data.detections.map(d => {
        const cls = d.class.toLowerCase() === 'weed' ? 'det-weed' : 'det-crop';
        return `<span class="${cls}">[${d.class}] conf:${d.confidence.toFixed(2)} center:(${d.center_x},${d.center_y}) size:${d.width}x${d.height}</span>`;
      });
      logEl.innerHTML = lines.join('<br>') + '<br>' + logEl.innerHTML;
      if (logEl.children.length > 200) {
        logEl.innerHTML = logEl.innerHTML.substring(0, logEl.innerHTML.length / 2);
      }
    }
  });
}

async function startCamera(facing) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const isHttps = window.location.protocol === 'https:';
    if (!isHttps) {
      const httpsUrl = 'https://' + window.location.hostname + ':5001';
      alert(
        "📷 Camera Access Blocked by Browser (Insecure HTTP Origin)\n\n" +
        "Mobile browsers require HTTPS for camera access.\n\n" +
        "HOW TO FIX:\n" +
        "Open this secure URL on your phone:\n" + httpsUrl + "\n\n" +
        "(When you see 'Your connection is not private', tap 'Advanced' -> 'Proceed')."
      );
    } else {
      alert("Camera API not available. Please verify site camera permissions in browser settings.");
    }
    return false;
  }

  const constraints = {
    video: {
      facingMode: facing,
      width: { ideal: 640 },
      height: { ideal: 480 }
    },
    audio: false
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.style.transform = facing === 'user' ? 'scaleX(-1)' : 'none';
    await video.play();
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    return true;
  } catch (err) {
    alert('Camera access denied or not available: ' + err.message);
    return false;
  }
}

function stopCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
}

async function switchCamera(facing) {
  currentFacing = facing;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(facing === 'environment' ? 'mode-rear' : 'mode-front').classList.add('active');
  if (video.srcObject) {
    video.style.transform = facing === 'user' ? 'scaleX(-1)' : 'none';
  }
  if (streaming) {
    stopCamera();
    await startCamera(facing);
  }
}

async function startStream() {
  if (!socket || !socket.connected) { alert('Not connected to server'); return; }

  const ok = await startCamera(currentFacing);
  if (!ok) return;

  streaming = true;
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').disabled = false;
  statusEl.textContent = '📡 Streaming to server...';
  statusEl.className = 'status status-streaming';
  logEl.innerHTML = '';

  sendInterval = setInterval(() => {
    if (!streaming || !socket.connected) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    const base64 = dataUrl.split(',')[1];
    socket.emit('frame', { image: base64, timestamp: Date.now() });
  }, 100);
}

function stopStream() {
  streaming = false;
  if (sendInterval) { clearInterval(sendInterval); sendInterval = null; }
  stopCamera();
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled = true;
  resultImg.style.display = 'none';
  if (socket && socket.connected) {
    statusEl.textContent = '✅ Connected (stopped)';
    statusEl.className = 'status status-connected';
  }
}

checkSecureContext();
connect();
</script>
</body>
</html>
"""


@app.route('/')
def index():
    return render_template_string(PHONE_PAGE)


@socketio.on('connect')
def handle_connect():
    global frame_count, start_time
    frame_count = 0
    start_time = time.time()
    print(f"[+] Client connected: {__import__('flask').request.sid}")


@socketio.on('disconnect')
def handle_disconnect():
    print("[-] Client disconnected")


@socketio.on('frame')
def handle_frame(data):
    global frame_count, start_time

    t0 = time.time()

    img_bytes = base64.b64decode(data['image'])
    np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if frame is None:
        return

    results = model(frame, verbose=False, conf=confidence_threshold)

    detections = []

    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = box.xyxy[0]
            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
            width = x2 - x1
            height = y2 - y1
            conf = float(box.conf[0])
            cls_idx = int(box.cls[0])
            cls_name = model.names[cls_idx]
            center_x = (x1 + x2) // 2
            center_y = (y1 + y2) // 2

            color = (0, 0, 255) if cls_name.lower() == 'weed' else (0, 255, 0)

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            label = f"{cls_name} {conf:.2f}"
            cv2.putText(frame, label, (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            cv2.drawMarker(frame, (center_x, center_y), color,
                           markerType=cv2.MARKER_CROSS, markerSize=15, thickness=2)

            detections.append({
                'class': cls_name,
                'confidence': conf,
                'center_x': center_x,
                'center_y': center_y,
                'width': width,
                'height': height,
            })

            print(format_detection(cls_name, conf, center_x, center_y, width, height))

    t1 = time.time()
    latency_ms = (t1 - t0) * 1000
    frame_count += 1
    elapsed = t1 - start_time
    fps = frame_count / elapsed if elapsed > 0 else 0

    cv2.putText(frame, f"FPS: {fps:.1f}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cv2.putText(frame, f"Latency: {latency_ms:.0f}ms", (10, 65),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cv2.putText(frame, f"Detections: {len(detections)}", (10, 100),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    result_b64 = base64.b64encode(buffer).decode('utf-8')

    emit('result', {
        'image': result_b64,
        'fps': fps,
        'latency_ms': latency_ms,
        'detections': detections,
    })


# ---------------------------------------------------------------------------
# HTTP Redirect Server (Port 5000 -> HTTPS Port 5001)
# ---------------------------------------------------------------------------
def run_http_redirect_server(host_ip, http_port, https_port):
    """
    Runs a lightweight HTTP server on port 5000 that automatically forwards
    browsers to the secure HTTPS port 5001 for camera access.
    """
    from werkzeug.serving import run_simple
    http_app = Flask('redirect_server')

    REDIRECT_HTML = r"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="refresh" content="1; url={{ target_url }}">
      <title>Connecting to Secure Camera...</title>
      <style>
        body {
          background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 100vh; padding: 20px; text-align: center; margin: 0;
        }
        .card {
          background: #161b22; border: 1px solid #30363d; border-radius: 12px;
          padding: 24px 20px; max-width: 440px; width: 100%; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        h2 { color: #58a6ff; font-size: 1.3rem; margin-bottom: 12px; }
        p { font-size: 0.9rem; line-height: 1.5; color: #8b949e; margin-bottom: 18px; }
        .btn {
          display: inline-block; background: #238636; color: #ffffff; padding: 14px 24px;
          border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 1rem;
          transition: background 0.2s; width: 100%; box-sizing: border-box;
        }
        .btn:hover { background: #2ea043; }
        .notice {
          margin-top: 18px; font-size: 0.78rem; color: #d29922; background: #272115;
          border: 1px solid #6e4b1f; padding: 10px; border-radius: 6px; text-align: left;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>🌿 AI Weed Detection</h2>
        <p>Switching to <b>Secure Connection (HTTPS)</b> so your browser allows camera access...</p>
        <a class="btn" href="{{ target_url }}">Tap to Open Camera ➔</a>
        <div class="notice">
          <b>⚠️ SSL Certificate Notice:</b><br>
          Because this is a local server, Chrome will say <i>"Your connection is not private"</i>.<br>
          Simply tap <b>Advanced</b> &rarr; <b>Proceed (unsafe)</b> to allow camera access.
        </div>
      </div>
      <script>
        setTimeout(() => { window.location.href = "{{ target_url }}"; }, 800);
      </script>
    </body>
    </html>
    """

    @http_app.route('/', defaults={'path': ''})
    @http_app.route('/<path:path>')
    def catch_all(path):
        target_url = f"https://{host_ip}:{https_port}/{path}"
        return render_template_string(REDIRECT_HTML, target_url=target_url)

    run_simple('0.0.0.0', http_port, http_app, threaded=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    global model, confidence_threshold

    parser = argparse.ArgumentParser(description="Phone Camera → YOLOv8 Weed Detection Server")
    parser.add_argument('--port', type=int, default=DEFAULT_HTTP_PORT, help=f"HTTP entry port (default: {DEFAULT_HTTP_PORT})")
    parser.add_argument('--https-port', type=int, default=DEFAULT_HTTPS_PORT, help=f"HTTPS camera port (default: {DEFAULT_HTTPS_PORT})")
    parser.add_argument('--conf', type=float, default=DEFAULT_CONFIDENCE, help=f"Confidence threshold (default: {DEFAULT_CONFIDENCE})")
    parser.add_argument('--model', type=str, default=None, help="Path to custom YOLO model (.pt)")
    parser.add_argument('--http', action='store_true', help="Run exclusively on plain HTTP (no HTTPS redirect)")
    parser.add_argument('--ssl-cert', type=str, default=None, help="Custom SSL certificate path (.crt/.pem)")
    parser.add_argument('--ssl-key', type=str, default=None, help="Custom SSL private key path (.key/.pem)")
    args = parser.parse_args()

    confidence_threshold = args.conf

    # Load YOLO model
    model_path = find_model(args.model)
    if model_path is None:
        print("ERROR: No YOLO model found. Train first with: python src/yolo_train.py")
        sys.exit(1)

    print(f"Loading model: {model_path}")
    model = YOLO(model_path)

    local_ip = get_local_ip()
    http_port = args.port
    https_port = args.https_port

    if args.http:
        # Plain HTTP mode requested
        print("\n" + "=" * 68)
        print("   🌿 AI Weed Detection - Phone Camera Server (Plain HTTP Mode)")
        print("=" * 68)
        print(f"\n   👉 Open this URL on your phone's browser:\n")
        print(f"      http://{local_ip}:{http_port}")
        print("\n   ⚠️  Camera Notice for HTTP:")
        print("      Mobile Chrome blocks camera on plain HTTP IP addresses.")
        print("      To enable camera on your phone:")
        print("      1. Open Chrome on your phone: chrome://flags/#unsafely-treat-insecure-origin-as-secure")
        print(f"      2. Enable the flag and add: http://{local_ip}:{http_port}")
        print("      3. Tap 'Relaunch' at the bottom.")
        print("=" * 68 + "\n")
        socketio.run(app, host='0.0.0.0', port=http_port, allow_unsafe_werkzeug=True)
        return

    # Dual-port mode: HTTP Port 5000 redirects to HTTPS Port 5001
    cert_path, key_path = ensure_ssl_certificates(local_ip, args.ssl_cert, args.ssl_key)
    if not (cert_path and key_path):
        print("ERROR: Could not generate SSL certificates. Falling back to HTTP mode.")
        socketio.run(app, host='0.0.0.0', port=http_port, allow_unsafe_werkzeug=True)
        return

    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_ctx.load_cert_chain(cert_path, key_path)

    print("\n" + "=" * 68)
    print("   🌿 AI Weed Detection - Phone Camera Server")
    print("=" * 68)
    print(f"\n   👉 Open EITHER URL on your phone's browser:\n")
    print(f"      Option 1: http://{local_ip}:{http_port}   (Auto-redirects to secure camera)")
    print(f"      Option 2: https://{local_ip}:{https_port} (Direct secure camera link)")
    print(f"\n   (Both devices must be on the same WiFi network)")
    print(f"   Model: {os.path.basename(model_path)}")
    print(f"   Confidence threshold: {confidence_threshold}")
    print("\n   🔒 SSL Notice:")
    print("      When Chrome shows 'Your connection is not private':")
    print("      1. Tap 'Advanced' (or 'Details')")
    print(f"      2. Tap 'Proceed to {local_ip} (unsafe)'")
    print("      3. Tap 'Allow' when asked for camera permission!")
    print("=" * 68 + "\n")

    # Start HTTP redirect server on port 5000 in background daemon thread
    redirect_thread = threading.Thread(
        target=run_http_redirect_server,
        args=(local_ip, http_port, https_port),
        daemon=True
    )
    redirect_thread.start()

    # Start main SocketIO detection server on HTTPS port 5001
    socketio.run(app, host='0.0.0.0', port=https_port, ssl_context=ssl_ctx, allow_unsafe_werkzeug=True)


if __name__ == '__main__':
    main()
