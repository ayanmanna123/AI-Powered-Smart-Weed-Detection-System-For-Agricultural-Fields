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
DEFAULT_CONFIDENCE = 0.25

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


def decode_base64_image(raw_image):
    """Decode a data URL or raw base64 image string into a BGR OpenCV frame."""
    if not raw_image or not isinstance(raw_image, str):
        return None, 0
    payload = raw_image.split(',', 1)[1] if ',' in raw_image else raw_image
    img_bytes = base64.b64decode(payload)
    np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    return frame, len(img_bytes)


def extract_yolo_boxes(results, img_w, img_h, rotated_180=False):
    """Extract normalized box dictionaries from Ultralytics inference results."""
    boxes = []
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            if rotated_180:
                x1, x2 = img_w - x2, img_w - x1
                y1, y2 = img_h - y2, img_h - y1
            x1_i = max(0, min(img_w - 1, int(round(min(x1, x2)))))
            y1_i = max(0, min(img_h - 1, int(round(min(y1, y2)))))
            x2_i = max(x1_i + 1, min(img_w, int(round(max(x1, x2)))))
            y2_i = max(y1_i + 1, min(img_h, int(round(max(y1, y2)))))
            conf = float(box.conf[0])
            cls_idx = int(box.cls[0])
            cls_name = str(model.names.get(cls_idx, cls_idx)).lower()
            boxes.append({
                'class': cls_name,
                'confidence': conf,
                'x1': x1_i,
                'y1': y1_i,
                'x2': x2_i,
                'y2': y2_i,
            })
    return boxes


def detect_with_high_recall(img, conf_thresh, imgsz_primary=512, skip_primary=False):
    """
    Run genuine YOLOv8 (best.pt) inference with progressive recall recovery:
    primary pass -> multi-scale TTA (augment=True) -> low-conf floor -> 180-deg flip.
    """
    img_h, img_w = img.shape[:2]
    if not skip_primary:
        res = model(img, conf=conf_thresh, imgsz=imgsz_primary, verbose=False)
        boxes = extract_yolo_boxes(res, img_w, img_h)
        if boxes:
            return boxes

    tta_conf = min(conf_thresh, 0.14)
    res = model(img, conf=tta_conf, imgsz=640, augment=True, iou=0.55, verbose=False)
    boxes = extract_yolo_boxes(res, img_w, img_h)
    if boxes:
        return boxes

    res = model(img, conf=0.06, imgsz=640, augment=True, iou=0.50, verbose=False)
    boxes = extract_yolo_boxes(res, img_w, img_h)
    if boxes:
        return boxes

    rotated = cv2.rotate(img, cv2.ROTATE_180)
    res = model(rotated, conf=0.08, imgsz=640, augment=True, iou=0.50, verbose=False)
    return extract_yolo_boxes(res, img_w, img_h, rotated_180=True)


def compute_iou(a, b):
    """Compute intersection-over-union between two box dicts."""
    ix1 = max(a['x1'], b['x1'])
    iy1 = max(a['y1'], b['y1'])
    ix2 = min(a['x2'], b['x2'])
    iy2 = min(a['y2'], b['y2'])
    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(1, (a['x2'] - a['x1']) * (a['y2'] - a['y1']))
    area_b = max(1, (b['x2'] - b['x1']) * (b['y2'] - b['y1']))
    return inter / float(area_a + area_b - inter)


def suppress_duplicate_boxes(boxes, iou_thresh=0.55):
    """Deduplicate overlapping detections while preserving distinct targets."""
    if len(boxes) <= 1:
        return boxes
    # Sort slightly favoring weed when confidence on the same object is nearly tied
    ranked = sorted(
        boxes,
        key=lambda b: b['confidence'] + (0.08 if b['class'] == 'weed' else 0.0),
        reverse=True,
    )
    kept = []
    for candidate in ranked:
        if any(compute_iou(candidate, existing) >= iou_thresh for existing in kept):
            continue
        kept.append(candidate)
    return kept


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
    rois = data.get('rois') or []

    try:
        frame, img_byte_len = decode_base64_image(raw_image)
    except Exception as exc:
        return jsonify({'error': f'Failed to decode image: {exc}'}), 400

    if frame is None:
        return jsonify({'error': 'Decoded frame is empty'}), 400

    frame_counter += 1
    current_frame_id = frame_counter
    img_h, img_w = frame.shape[:2]
    t0 = time.time()

    # Pass 1: Primary full-frame YOLOv8 inference
    primary_results = model(frame, conf=conf_thresh, imgsz=512, verbose=False)
    raw_boxes = extract_yolo_boxes(primary_results, img_w, img_h)

    if isinstance(rois, list) and len(rois) > 0:
        # For any zone tile missed in the composite collage, run high-recall YOLO on its clean ROI
        for roi in rois:
            try:
                rx1 = max(0, min(img_w - 1, int(round(float(roi.get('x1', 0))))))
                ry1 = max(0, min(img_h - 1, int(round(float(roi.get('y1', 0))))))
                rx2 = max(rx1 + 4, min(img_w, int(round(float(roi.get('x2', img_w))))))
                ry2 = max(ry1 + 4, min(img_h, int(round(float(roi.get('y2', img_h))))))
            except (TypeError, ValueError):
                continue

            pad = 12
            has_hit = any(
                (rx1 - pad) <= ((b['x1'] + b['x2']) / 2.0) <= (rx2 + pad)
                and (ry1 - pad) <= ((b['y1'] + b['y2']) / 2.0) <= (ry2 + pad)
                for b in raw_boxes
            )
            if has_hit:
                continue

            roi_img = None
            crop_b64 = roi.get('crop_image')
            if crop_b64:
                try:
                    roi_img, _ = decode_base64_image(crop_b64)
                except Exception:
                    roi_img = None
            if roi_img is None:
                roi_img = frame[ry1:ry2, rx1:rx2]
            if roi_img is None or roi_img.size == 0:
                continue

            rh, rw = roi_img.shape[:2]
            roi_boxes = detect_with_high_recall(roi_img, conf_thresh, imgsz_primary=512, skip_primary=False)
            roi_w = max(1, rx2 - rx1)
            roi_h = max(1, ry2 - ry1)
            for rb in roi_boxes:
                mx1 = max(0, min(img_w - 1, int(round(rx1 + (rb['x1'] / float(rw)) * roi_w))))
                my1 = max(0, min(img_h - 1, int(round(ry1 + (rb['y1'] / float(rh)) * roi_h))))
                mx2 = max(mx1 + 1, min(img_w, int(round(rx1 + (rb['x2'] / float(rw)) * roi_w))))
                my2 = max(my1 + 1, min(img_h, int(round(ry1 + (rb['y2'] / float(rh)) * roi_h))))
                raw_boxes.append({
                    'class': rb['class'],
                    'confidence': rb['confidence'],
                    'x1': mx1,
                    'y1': my1,
                    'x2': mx2,
                    'y2': my2,
                })
    elif not raw_boxes:
        # Standalone image (e.g. "Test Real Photo"): run progressive TTA + rotation recovery
        raw_boxes = detect_with_high_recall(frame, conf_thresh, imgsz_primary=640, skip_primary=True)

    raw_boxes = suppress_duplicate_boxes(raw_boxes)
    t1 = time.time()
    latency_ms = (t1 - t0) * 1000.0

    print(
        f"\n[YOLO FRAME #{current_frame_id}] {img_w}x{img_h} ({img_byte_len/1024:.1f} KB) "
        f"| conf>={conf_thresh:.2f} | model={os.path.basename(model_path_used)}"
    )

    detections = []
    annotated = frame.copy()

    for b in raw_boxes:
        x1, y1, x2, y2 = b['x1'], b['y1'], b['x2'], b['y2']
        width = max(1, x2 - x1)
        height = max(1, y2 - y1)
        conf = float(b['confidence'])
        cls_name = b['class']
        center_x = (x1 + x2) // 2
        center_y = (y1 + y2) // 2

        is_weed = cls_name == 'weed'
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
            'class': cls_name,
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
        'image_bytes': img_byte_len,
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
