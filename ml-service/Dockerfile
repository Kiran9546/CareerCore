# CareerCore ML service
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Train the model at build time if no trained artifact was copied in.
RUN test -f artifacts/career_rf_v1.joblib || (python notebooks/generate_dataset.py && python notebooks/train_model.py)
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "60", "app:app"]
