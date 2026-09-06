# The RAG Pipeline — Explained Like You're 10

## What this project does

Imagine you have a **huge storybook** (a PDF document), and you want a robot helper that can instantly answer questions about it — like "what happened in chapter 3?" — without reading the whole book every time. That's what this project builds: a robot librarian.

## The steps (like a recipe)

1. **📖 Read the book** (`ingest.py`) — The robot opens the PDF and reads all the text out of it.

2. **✂️ Cut it into pieces** (`chunkers.py`) — A whole book is too much to think about at once, so the robot cuts it into smaller chunks (like paragraphs). It tries **3 different ways of cutting**:
   - **Fixed-size**: chop it into same-size pieces, like cutting a candy bar into equal bites
   - **Structural**: cut along natural breaks, like cutting where chapters/sections start
   - **Semantic**: cut based on *meaning* — keep sentences about the same topic together, like sorting LEGO by color instead of by size

3. **🧠 Turn words into "meaning numbers"** (`embeddings.py`) — Computers don't understand words like we do, so each chunk gets turned into a list of numbers that captures what it *means*. It's like giving every LEGO piece a secret code based on its shape and color, so similar pieces get similar codes.

4. **🗄️ Store it in a filing cabinet** (`db_setup.py`) — All the chunks and their number-codes get saved in a database (Supabase — a smart filing cabinet) so they can be searched fast later.

5. **❓ Ask questions** (`query.py`) — The robot is given test questions about the book. Each question also gets turned into a "meaning number," then the robot finds which chunks have the *closest* matching numbers — like a matching game.

6. **🏆 Grade the results** (`query.py`) — It checks: did each cutting method actually find the *right* answer in its top 3 guesses? Then it builds a scoreboard comparing all 3 cutting strategies.

## The big question it's answering

**"If I cut up a book differently, does my robot get better or worse at finding the right answer?"**

This is a real technique used in AI called **RAG** (Retrieval-Augmented Generation) — it's how chatbots can "look things up" in your documents before answering you.
