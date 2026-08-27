import glob
import os
from ultralytics import YOLO

# Load your trained model
model = YOLO('runs/detect/yolov8_weed_crop/weights/best.pt')

# Get all images in the dataset
image_folder = 'archive/agri_data/data'
image_paths = glob.glob(os.path.join(image_folder, '*.jpeg'))

print(f"Found {len(image_paths)} images to test.")
print("Processing and saving images at maximum speed...")
print("The annotated images will be saved to test/output_images/")

for img_path in image_paths:
    # Run YOLO on the image and save it without displaying a window
    # save=True will automatically save the annotated images to test/output_images/
    results = model(img_path, save=True, project='test', name='output_images', exist_ok=True, verbose=False)
    
print("All done! You can check the test/output_images/ folder.")
