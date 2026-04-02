import os
from anthropic import Client

api_key = os.environ.get("ANTHROPIC_API_KEY")
client = Client(api_key)

response = client.completions.create(
    model="claude-2",
    prompt="Hello Claude! Give a 1-line greeting.",
    max_tokens_to_sample=50
)

print(response.completion)