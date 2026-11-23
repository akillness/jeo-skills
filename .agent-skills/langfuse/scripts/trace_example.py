#!/usr/bin/env python3
"""Demonstration of Langfuse Python SDK tracing and scoring."""
import os
import sys

def main():
    try:
        from langfuse import Langfuse
    except ImportError:
        print("Error: langfuse python package not installed.")
        print("Install via: pip install langfuse")
        sys.exit(1)
        
    pk = os.getenv("LANGFUSE_PUBLIC_KEY")
    sk = os.getenv("LANGFUSE_SECRET_KEY")
    host = os.getenv("LANGFUSE_HOST", "http://localhost:3000")
    
    if not pk or not sk:
        print("Warning: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY not set in environment.")
        print("Export keys to enable trace submission.")
        return

    langfuse = Langfuse(public_key=pk, secret_key=sk, host=host)
    
    print("Creating sample trace...")
    trace = langfuse.trace(
        name="qa-agent-sample",
        user_id="user-42",
        tags=["demo", "cli"]
    )
    
    span = trace.span(
        name="retrieval-step",
        input={"query": "What is Langfuse?"},
        output={"chunks": ["Langfuse is an open source LLM engineering platform."]}
    )
    span.end()
    
    gen = trace.generation(
        name="llm-generation",
        model="gpt-4o",
        model_parameters={"temperature": 0.2},
        input=[{"role": "user", "content": "What is Langfuse?"}],
        output="Langfuse is an open source LLM observability platform.",
        usage={"input": 25, "output": 15, "total": 40}
    )
    gen.end()
    
    trace.score(
        name="accuracy",
        value=1.0,
        comment="Exact factual match"
    )
    
    langfuse.flush()
    print("Sample trace flushed successfully to Langfuse!")

if __name__ == '__main__':
    main()
