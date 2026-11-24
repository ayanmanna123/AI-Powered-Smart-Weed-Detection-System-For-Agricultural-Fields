"""
YOLOv8 Virtual Environment Inference API Server

Provides a lightweight HTTP JSON API on port 5050 for the React Virtual Field
Simulator. Receives virtual camera frame snapshots from the frontend, runs the
trained YOLOv8 weed/crop model (runs/detect/yolov8_weed_crop/weights/best.pt),
and returns bounding boxes, center coordinates, and an annotated JPEG frame.

Usage:
    python src/virtual_demo_server.py
"""

import argparse
import base64
import os
import sys
import time
import cv2
import numpy as np
from flask import Flask, jsonify, request
from ultralytics import YOLO

from detection_output import format_detection

DEFAULT_PORT = 5050
DEFAULT_CONFIDENCE = 0.30

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MODEL_CANDIDATES = [
    os.path.join(PROJECT_ROOT, 'runs', 'detect', 'yolov8_weed_crop', 'weights', 'best.pt'),
    os.path.join(PROJECT_ROOT, 'yolov8n.pt'),
    os.path.join(os.path.dirname(__file__), 'yolov8n.pt'),
]

app = Flask(__name__)
model = None
model_path_used = None
is_custom_model = False
default_conf = DEFAULT_CONFIDENCE


def find_model(custom_path=None):
    """Locate the trained YOLOv8 weed/crop weights or fallback model."""
    if custom_path and os.path.isfile(custom_path):
        return custom_path
    for candidate in MODEL_CANDIDATES:
        if os.path.isfile(candidate):
            return candidate
    return None


@app.after_request
def add_cors_headers(response):
    """Allow requests from the Vite React frontend on any local port."""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response


@app.route('/health', methods=['GET', 'OPTIONS'])
def health():
    if request.method == 'OPTIONS':
        return ('', 204)
    return jsonify({
        'status': 'ok',
        'model_name': os.path.basename(model_path_used) if model_path_used else 'unknown',
        'model_path': model_path_used,
        'is_custom_model': is_custom_model,
        'classes': model.names if model else {},
        'conf_default': default_conf,
    })


@app.route('/detect', methods=['POST', 'OPTIONS'])
def detect():
    if request.method == 'OPTIONS':
        return ('', 204)

    data = request.get_json(silent=True) or {}
    raw_image = data.get('image')
    if not raw_image:
        return jsonify({'error': 'Missing "image" base64 payload'}), 400

    conf_thresh = float(data.get('conf', default_conf))

    # Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    if ',' in raw_image:
        raw_image = raw_image.split(',', 1)[1]

    try:
        img_bytes = base64.b64decode(raw_image)
        np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as exc:
        return jsonify({'error': f'Failed to decode image: {exc}'}), 400

    if frame is None:
        return jsonify({'error': 'Decoded frame is empty'}), 400

    img_h, img_w = frame.shape[:2]
    t0 = time.time()
    results = model(frame, conf=conf_thresh, imgsz=512, verbose=False)
    t1 = time.time()
    latency_ms = (t1 - t0) * 1000.0

    detections = []
    annotated = frame.copy()

    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0]]
            width = max(1, x2 - x1)
            height = max(1, y2 - y1)
            conf = float(box.conf[0])
            cls_idx = int(box.cls[0])
            cls_name = str(model.names.get(cls_idx, cls_idx))
            center_x = (x1 + x2) // 2
            center_y = (y1 + y2) // 2

            is_weed = cls_name.lower() == 'weed'
            color = (68, 68, 239) if is_weed else (129, 185, 16)  # BGR: Rose-500 / Emerald-500

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            label = f"{cls_name.upper()} {conf:.2f}"
            cv2.putText(
                annotated,
                label,
                (x1, max(18, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                color,
                2,
            )
            cv2.drawMarker(
                annotated,
                (center_x, center_y),
                color,
                markerType=cv2.MARKER_CROSS,
                markerSize=14,
                thickness=2,
            )

            detections.append({
                'class': cls_name.lower(),
                'confidence': round(conf, 4),
                'x1': x1,
                'y1': y1,
                'x2': x2,
                'y2': y2,
                'center_x': center_x,
                'center_y': center_y,
                'norm_x': round(center_x / img_w, 4),
                'norm_y': round(center_y / img_h, 4),
                'width': width,
                'height': height,
            })

            print(format_detection(cls_name, conf, center_x, center_y, width, height))

    cv2.putText(
        annotated,
        f"YOLOv8 | {latency_ms:.0f}ms | Det:{len(detections)}",
        (10, 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (255, 255, 255),
        2,
    )

    _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buffer).decode('utf-8')

    return jsonify({
        'detections': detections,
        'annotated_image': f'data:image/jpeg;base64,{annotated_b64}',
        'latency_ms': round(latency_ms, 2),
        'image_width': img_w,
        'image_height': img_h,
        'model_name': os.path.basename(model_path_used) if model_path_used else 'unknown',
        'is_custom_model': is_custom_model,
    })


def main():
    global model, model_path_used, is_custom_model, default_conf

    parser = argparse.ArgumentParser(description="YOLOv8 Virtual Field Demo Inference Server")
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help=f"HTTP port (default: {DEFAULT_PORT})")
    parser.add_argument('--conf', type=float, default=DEFAULT_CONFIDENCE, help=f"Confidence threshold (default: {DEFAULT_CONFIDENCE})")
    parser.add_argument('--model', type=str, default=None, help="Path to custom YOLO .pt model")
    args = parser.parse_args()

    default_conf = args.conf
    model_path_used = find_model(args.model)
    if not model_path_used:
        print("ERROR: Could not find any YOLO model (.pt). Run training first.")
        sys.exit(1)

    is_custom_model = 'best.pt' in os.path.basename(model_path_used)
    print(f"[*] Loading YOLOv8 model: {model_path_used}")
    model = YOLO(model_path_used)

    print("\n" + "=" * 64)
    print("  AgriRover Pro — Virtual Demo YOLOv8 Inference Server")
    print("=" * 64)
    print(f"  Endpoint : http://127.0.0.1:{args.port}")
    print(f"  Health   : http://127.0.0.1:{args.port}/health")
    print(f"  Model    : {model_path_used}")
    print(f"  Classes  : {model.names}")
    print("=" * 64 + "\n")

    app.run(host='0.0.0.0', port=args.port, threaded=True)


if __name__ == '__main__':
    main()
