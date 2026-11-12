# AI-Powered Weed Detection System (YOLOv8)

This project contains the complete machine-learning pipeline for an efficient **Object Detection** model designed for an agricultural robot. It uses Ultralytics YOLOv8 to draw exact bounding boxes around `crops` and `weeds`.

## Prerequisites

1. Install Python 3.8+
2. Install dependencies:
   ```bash
   pip install ultralytics opencv-python numpy
   ```

## Workflow

### 1. Data Preparation
The `src/yolo_data_prep.py` script reads the bounding box dataset from the `archive/agri_data/data` directory, shuffles it, and automatically splits it into `yolo_dataset/images/train` (80%) and `yolo_dataset/images/val` (20%) along with their corresponding `.txt` label files. It also generates the `dataset.yaml` file required by YOLO.

Run it:
```bash
python src/yolo_data_prep.py
```

### 2. Training
Run the training script to fine-tune the lightweight `YOLOv8n` (Nano) model on our dataset. YOLOv8 Nano provides real-time FPS on limited hardware while maintaining high mAP.

```bash
python src/yolo_train.py
```
*Note: The script defaults to 5 epochs for quick verification. You can increase `epochs=50` inside `src/yolo_train.py` for full accuracy. The trained weights will be saved to `runs/detect/yolov8_weed_crop/weights/best.pt`.*

### 3. Evaluation
After training, evaluate the model's Mean Average Precision (mAP) on the validation set.

```bash
python src/yolo_evaluate.py
```

### 4. Real-Time Camera Inference & Targeting
To test the model in real-world scenarios, run the real-time inference script. It opens your webcam, captures frames, and runs YOLOv8. 

```bash
python src/yolo_realtime.py
```
* **Bounding Boxes:** Draws boxes around detected weeds (Red) and crops (Green).
* **Targeting System:** Calculates the `(X, Y)` center coordinate of each bounding box. This center coordinate is printed to the terminal and drawn as a crosshair, which the robot can use to aim the pesticide sprayer precisely at the weed, avoiding the crop.
* Press `q` to quit the camera window.

### 5. Phone Camera Detection (WiFi Streaming)
Use your phone's camera to detect weeds in the field — no USB webcam needed. The server runs YOLOv8 on your PC and streams annotated results back to your phone in real-time.

**Requirements:** Both your PC and phone must be on the **same WiFi network**.

```bash
pip install flask-socketio cryptography
python src/phone_stream_server.py
```

1. The terminal will display a secure URL like `https://192.168.x.x:5000`
2. Open that URL on your phone's browser (Chrome / Safari)
3. Since the server uses an automatic self-signed SSL certificate, tap **Advanced** / **Details** &rarr; **Proceed to ... (unsafe)** to open the page (required by mobile browsers to access the camera)
4. Grant camera permission when prompted
5. Tap **▶ Start Detection** — your phone camera feed is sent to the PC for YOLO inference
6. Annotated frames with bounding boxes, crosshairs, and detection stats are displayed on your phone

> **Alternative (Plain HTTP):** Run `python src/phone_stream_server.py --http`. To allow camera over plain HTTP in Chrome on Android, visit `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enable the flag, add `http://<your-ip>:5000`, and tap Relaunch.


**Features:**
* Switch between rear and front camera
* Real-time FPS, latency, and detection count stats
* Detection log showing class, confidence, center coordinates, and bounding box size
* Same targeting output printed to the server terminal (compatible with robot controller)