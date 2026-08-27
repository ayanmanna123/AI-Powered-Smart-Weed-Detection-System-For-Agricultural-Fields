import os
import shutil
import glob
import random

def prep_yolo_dataset(source_dir, dest_dir, split_ratio=0.8):
    print("Preparing YOLOv8 dataset structure...")
    
    # Create required directory structure
    for split in ['train', 'val']:
        os.makedirs(os.path.join(dest_dir, 'images', split), exist_ok=True)
        os.makedirs(os.path.join(dest_dir, 'labels', split), exist_ok=True)
        
    # Get all jpeg files
    images = glob.glob(os.path.join(source_dir, '*.jpeg'))
    random.shuffle(images)
    
    split_index = int(len(images) * split_ratio)
    train_images = images[:split_index]
    val_images = images[split_index:]
    
    def copy_files(image_list, split):
        for img_path in image_list:
            base_name = os.path.basename(img_path)
            txt_name = base_name.replace('.jpeg', '.txt')
            txt_path = os.path.join(source_dir, txt_name)
            
            # Copy image
            shutil.copy(img_path, os.path.join(dest_dir, 'images', split, base_name))
            
            # Copy label if it exists
            if os.path.exists(txt_path):
                shutil.copy(txt_path, os.path.join(dest_dir, 'labels', split, txt_name))
                
    copy_files(train_images, 'train')
    copy_files(val_images, 'val')
    
    print(f"Copied {len(train_images)} images to train and {len(val_images)} images to val.")
    
    # Generate dataset.yaml
    yaml_content = f"""path: {os.path.abspath(dest_dir)}
train: images/train
val: images/val

# Classes
names:
  0: crop
  1: weed
"""
    yaml_path = os.path.join(dest_dir, 'dataset.yaml')
    with open(yaml_path, 'w') as f:
        f.write(yaml_content)
        
    print(f"Generated {yaml_path}")
    print("Data preparation complete.")

if __name__ == '__main__':
    # Using the archive folder you provided
    source_dir = os.path.abspath('archive/agri_data/data')
    dest_dir = os.path.abspath('yolo_dataset')
    
    prep_yolo_dataset(source_dir, dest_dir)
