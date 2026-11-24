import matplotlib.pyplot as plt
import numpy as np

# Data from Kaggle Training
categories = ['All (Overall)', 'Crop (Sesame)', 'Weeds']
precision = [0.837, 0.794, 0.881]
recall = [0.807, 0.775, 0.839]
map50 = [0.864, 0.864, 0.863]

x = np.arange(len(categories))  # the label locations
width = 0.25  # the width of the bars

fig, ax = plt.subplots(figsize=(10, 6))

# Plotting the bars
rects1 = ax.bar(x - width, precision, width, label='Precision (Accuracy of Detections)', color='#3498db')
rects2 = ax.bar(x, recall, width, label='Recall (Ability to find all plants)', color='#2ecc71')
rects3 = ax.bar(x + width, map50, width, label='mAP50 (Overall Efficiency)', color='#9b59b6')

# Add some text for labels, title and custom x-axis tick labels, etc.
ax.set_ylabel('Score (0.0 to 1.0)', fontsize=12)
ax.set_title('AI Weed Detection Model Efficiency (YOLOv8)', fontsize=16, fontweight='bold', pad=20)
ax.set_xticks(x)
ax.set_xticklabels(categories, fontsize=12)
ax.legend(loc='lower right')
ax.set_ylim(0, 1.1)

# Function to attach a text label above each bar
def autolabel(rects):
    for rect in rects:
        height = rect.get_height()
        ax.annotate(f'{height*100:.1f}%',
                    xy=(rect.get_x() + rect.get_width() / 2, height),
                    xytext=(0, 3),  # 3 points vertical offset
                    textcoords="offset points",
                    ha='center', va='bottom', fontweight='bold')

autolabel(rects1)
autolabel(rects2)
autolabel(rects3)

# Add a subtle grid
ax.grid(axis='y', linestyle='--', alpha=0.7)

fig.tight_layout()

# Save the graph
plt.savefig('efficiency_graph.png', dpi=300)
print("Graph saved successfully as 'efficiency_graph.png'.")

# Show the graph on screen
plt.show()
