#!/bin/sh
set -e

echo "Starting Ollama server..."
ollama serve &

echo "Waiting for Ollama to be ready..."
until ollama list > /dev/null 2>&1; do
  sleep 2
done

echo "Pulling model..."
ollama pull qwen2.5:3b

echo "Model is ready."
wait