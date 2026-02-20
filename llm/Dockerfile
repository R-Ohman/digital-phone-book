FROM ollama/ollama:latest

COPY llm-entrypoint.sh /llm-entrypoint.sh
RUN chmod +x /llm-entrypoint.sh

ENTRYPOINT ["/llm-entrypoint.sh"]