FROM python:3.11-slim
RUN pip install --no-cache-dir scikit-learn numpy pandas pyyaml
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu || pip install --no-cache-dir torch
RUN useradd -m -u 1000 runner
USER runner
WORKDIR /code
# Build: docker build -t crisisgrid-runner runner_image/
