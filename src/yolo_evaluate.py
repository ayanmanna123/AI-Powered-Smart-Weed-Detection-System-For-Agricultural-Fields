from ultralytics import YOLO
import os

def evaluate_yolo():
    model_path = 'runs/detect/yolov8_weed_crop/weights/best.pt'
    if not os.path.exists(model_path):
        print(f"Model {model_path} not found. Please run training first.")
        return
        
    print(f"Loading best model from {model_path}...")
    model = YOLO(model_path)
    
    print("Evaluating model on validation set...")
    metrics = model.val(data='yolo_dataset/dataset.yaml')
    
    print("\n--- Evaluation Metrics ---")
    print(f"mAP50:     {metrics.box.map50:.4f}")
    print(f"mAP50-95:  {metrics.box.map:.4f}")
    
if __name__ == '__main__':
    evaluate_yolo()
