from ultralytics import YOLO
import os

def train_yolo(epochs=560):
    print("Initializing YOLOv8n model...")
    # Load a pretrained YOLOv8n model
    model = YOLO('yolov8n.pt') 
    
    dataset_yaml = os.path.abspath('yolo_dataset/dataset.yaml')
    
    print(f"Starting training on {dataset_yaml} for {epochs} epochs...")
    
    # Train the model
    # Note: For production, increase epochs to 50 or 100
    results = model.train(
        data=dataset_yaml,
        epochs=epochs,
        imgsz=512,       # Image size in the dataset
        batch=16,
        name='yolov8_weed_crop',
        device='0' if __import__('torch').cuda.is_available() else 'cpu'
    )
    
    print("\nTraining complete.")
    print("The best weights are saved in: runs/detect/yolov8_weed_crop/weights/best.pt")
    
if __name__ == '__main__':
    train_yolo(epochs=560) # Reduced for quick verification, user can change this
