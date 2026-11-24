import cv2
import time
from ultralytics import YOLO
import os

from detection_output import format_detection

def main():
    model_path = 'runs/detect/yolov8_weed_crop/weights/best.pt'
    
    # If the user hasn't trained the model yet, we can fallback to the pretrained base model
    # just so the script runs, but warn them.
    if not os.path.exists(model_path):
        print(f"WARNING: Trained model not found at {model_path}.")
        print("Falling back to raw yolov8n.pt (It won't know crop vs weed accurately).")
        model_path = 'yolov8n.pt'
        
    print(f"Loading YOLOv8 model from {model_path}...")
    model = YOLO(model_path)
    
    print("Opening webcam...")
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return
        
    print("Press 'q' to quit.")
    
    prev_time = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame.")
            break
            
        infer_start = time.time()
        
        # Run YOLO inference
        results = model(frame, verbose=False)
        
        infer_end = time.time()
        infer_latency_ms = (infer_end - infer_start) * 1000
        
        # FPS calculation
        curr_time = time.time()
        fps = 1 / (curr_time - prev_time) if curr_time - prev_time > 0 else 0
        prev_time = curr_time
        
        # Draw bounding boxes and centers
        for r in results:
            boxes = r.boxes
            for box in boxes:
                # Bounding box coordinates
                x1, y1, x2, y2 = box.xyxy[0]
                x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                width = x2 - x1
                height = y2 - y1
                
                # Confidence and Class
                conf = box.conf[0]
                cls_idx = int(box.cls[0])
                cls_name = model.names[cls_idx]
                
                # Center coordinates for targeting
                center_x = (x1 + x2) // 2
                center_y = (y1 + y2) // 2
                
                # Colors: Red for weed, Green for crop
                color = (0, 0, 255) if cls_name.lower() == 'weed' else (0, 255, 0)
                
                # Draw Box
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                
                # Draw Label
                label = f"{cls_name} {conf:.2f}"
                cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                
                # Draw Center Crosshair
                cv2.drawMarker(frame, (center_x, center_y), color, markerType=cv2.MARKER_CROSS, markerSize=10, thickness=1)
                
                # Print coordinates and bounding-box size to console for the robot
                print(format_detection(cls_name, float(conf), center_x, center_y, width, height))

        # Display FPS and Latency on the frame
        cv2.putText(frame, f"FPS: {fps:.1f}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        cv2.putText(frame, f"Latency: {infer_latency_ms:.1f} ms", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        cv2.imshow('YOLOv8 Weed Detection', frame)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == '__main__':
    main()
