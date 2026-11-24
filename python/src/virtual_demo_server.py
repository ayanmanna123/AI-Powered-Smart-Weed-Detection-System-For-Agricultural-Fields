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
import glob
import os
import sys
import time
import cv2
import numpy as np
from flask import Flask, jsonify, request, send_from_directory
from ultralytics import YOLO

from detection_output import format_detection

DEFAULT_PORT = 5050
DEFAULT_CONFIDENCE = 0.30

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATASET_DIR = os.path.join(PROJECT_ROOT, 'archive', 'agri_data', 'data')
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
frame_counter = 0
dataset_catalog = []
dataset_files_set = set()


def build_dataset_catalog():
    """Index all weed & crop samples in archive/agri_data/data with box stats."""
    global dataset_catalog, dataset_files_set
    catalog = []
    allowed = set()
    if not os.path.isdir(DATASET_DIR):
        dataset_catalog = []
        dataset_files_set = set()
        return

    txt_paths = sorted(glob.glob(os.path.join(DATASET_DIR, '*.txt')))
    for txt_path in txt_paths:
        base = os.path.splitext(os.path.basename(txt_path))[0]
        img_name = f"{base}.jpeg"
        img_path = os.path.join(DATASET_DIR, img_name)
        if not os.path.isfile(img_path):
            continue

        classes = set()
        box_count = 0
        total_area = 0.0
        try:
            with open(txt_path, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) < 5:
                        continue
                    cls_id = int(float(parts[0]))
                    w = float(parts[3])
                    h = float(parts[4])
                    classes.add(cls_id)
                    box_count += 1
                    total_area += w * h
        except Exception:
            continue

        if box_count == 0:
            continue

        # Class 1 = weed, Class 0 = crop (override known mislabeled archive entries)
        if base in ('agri_0_106',):
            plant_type = 'weed'
        elif classes == {1}:
            plant_type = 'weed'
        elif classes == {0}:
            plant_type = 'crop'
        elif 1 in classes:
            plant_type = 'weed'
        else:
            plant_type = 'crop'

        avg_area = total_area / box_count
        if plant_type == 'weed':
            if box_count > 1:
                category = 'Cluster Weed'
            elif avg_area < 0.14:
                category = 'Small Sprout'
            elif avg_area > 0.40:
                category = 'Broadleaf / Large'
            else:
                category = 'Medium Weed'
        else:
            if box_count > 1:
                category = 'Crop Cluster'
            elif avg_area < 0.14:
                category = 'Seedling Crop'
            else:
                category = 'Mature Crop'

        allowed.add(img_name)
        catalog.append({
            'key': f'ds_{base}',
            'type': plant_type,
            'label': f"{'Weed' if plant_type == 'weed' else 'Crop'} #{base.replace('agri_0_', '')}",
            'filename': img_name,
            'category': category,
            'box_count': box_count,
            'area_pct': round(min(100.0, total_area * 100.0), 1),
        })

    dataset_catalog = catalog
    dataset_files_set = allowed


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


@app.route('/dataset/plants', methods=['GET', 'OPTIONS'])
def list_dataset_plants():
    if request.method == 'OPTIONS':
        return ('', 204)

    plant_type = (request.args.get('type') or 'all').lower()
    category = (request.args.get('category') or 'all').lower()
    search = (request.args.get('search') or '').strip().lower()
    page = max(1, int(request.args.get('page', 1)))
    limit = min(100, max(1, int(request.args.get('limit', 36))))

    filtered = dataset_catalog
    if plant_type in ('weed', 'crop'):
        filtered = [item for item in filtered if item['type'] == plant_type]
    if category != 'all':
        filtered = [item for item in filtered if item['category'].lower() == category]
    if search:
        filtered = [
            item
            for item in filtered
            if search in item['label'].lower()
            or search in item['filename'].lower()
            or search in item['category'].lower()
        ]

    total_matching = len(filtered)
    start = (page - 1) * limit
    end = start + limit
    page_items = filtered[start:end]

    total_weeds = sum(1 for item in dataset_catalog if item['type'] == 'weed')
    total_crops = sum(1 for item in dataset_catalog if item['type'] == 'crop')
    weed_categories = sorted(
        {item['category'] for item in dataset_catalog if item['type'] == 'weed'}
    )
    crop_categories = sorted(
        {item['category'] for item in dataset_catalog if item['type'] == 'crop'}
    )

    return jsonify({
        'total_weeds': total_weeds,
        'total_crops': total_crops,
        'total_matching': total_matching,
        'page': page,
        'limit': limit,
        'weed_categories': weed_categories,
        'crop_categories': crop_categories,
        'items': page_items,
    })


@app.route('/dataset/image/<filename>', methods=['GET'])
def serve_dataset_image(filename):
    if filename not in dataset_files_set:
        return jsonify({'error': 'Image not found in dataset catalog'}), 404
    return send_from_directory(DATASET_DIR, filename)


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
    global frame_counter
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

    frame_counter += 1
    current_frame_id = frame_counter
    img_h, img_w = frame.shape[:2]
    t0 = time.time()
    results = model(frame, conf=conf_thresh, imgsz=512, verbose=False)
    t1 = time.time()
    latency_ms = (t1 - t0) * 1000.0

    print(
        f"\n[YOLO FRAME #{current_frame_id}] {img_w}x{img_h} ({len(img_bytes)/1024:.1f} KB) "
        f"| conf>={conf_thresh:.2f} | model={os.path.basename(model_path_used)}"
    )

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
        f"YOLOv8 #{current_frame_id} | {latency_ms:.0f}ms | Det:{len(detections)}",
        (10, 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (255, 255, 255),
        2,
    )

    _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buffer).decode('utf-8')
    print(f"  -> {len(detections)} detection(s) in {latency_ms:.1f} ms")

    return jsonify({
        'frame_id': current_frame_id,
        'timestamp': time.strftime('%H:%M:%S'),
        'image_bytes': len(img_bytes),
        'detections': detections,
        'annotated_image': f'data:image/jpeg;base64,{annotated_b64}',
        'latency_ms': round(latency_ms, 2),
        'image_width': img_w,
        'image_height': img_h,
        'model_name': os.path.basename(model_path_used) if model_path_used else 'unknown',
        'model_path': model_path_used,
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
    print(f"[*] Indexing dataset plants from: {DATASET_DIR}")
    build_dataset_catalog()
    print(f"[*] Indexed {len(dataset_catalog)} plant samples from dataset.")
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
