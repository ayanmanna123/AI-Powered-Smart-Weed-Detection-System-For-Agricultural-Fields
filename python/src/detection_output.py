def format_detection(class_name, confidence, center_x, center_y, width, height):
    """Format one real-time detection for terminal output."""
    return (
        f"Detected: {class_name} ({confidence:.2f}) | "
        f"Center: X={center_x}, Y={center_y} | "
        f"Size: W={width} px, H={height} px"
    )
