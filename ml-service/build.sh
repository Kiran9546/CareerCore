#!/usr/bin/env bash
set -e

pip install -r requirements.txt

echo "Generating dataset..."
python notebooks/generate_dataset.py

echo "Training model..."
python notebooks/train_model.py

echo "Build complete."