// app.js
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";

const API_KEY = "AIzaSyCfoLRIJrWZ7oEQZyug0Cu3amFMnD6ArqI"; // Replace with valid API key
const PORT = 3000;

const ai = new GoogleGenAI({ apiKey: API_KEY });

const app = express();
const upload = multer({ dest: "uploads/" });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve single-page HTML
// Serve single-page HTML
app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Orion — Voice Assistant</title>
  <style>
    body {
      font-family: sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background-image: url('https://images.unsplash.com/photo-1557682250-66b70b5f0f64?auto=format&fit=crop&w=1350&q=80');
      background-size: cover;
      background-position: center;
      color: #fff;
      text-align: center;
    }
    h1 { margin-bottom: 24px; text-shadow: 1px 1px 5px #000; }
    #toggleBtn {
      font-size: 20px;
      padding: 12px 24px;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      background: rgba(0,0,0,0.6);
      color: #fff;
      transition: background 0.3s;
    }
    #toggleBtn:hover { background: rgba(0,0,0,0.8); }
    #reply {
      margin-top: 20px;
      font-size: 18px;
      padding: 12px;
      background: rgba(0,0,0,0.5);
      border-radius: 12px;
      min-height: 60px;
      width: 90%;
    }
  </style>
</head>
<body>
  <h1>🎙 Avi Voice Assistant</h1>
  <button id="toggleBtn">Start Recording</button>
  <div id="reply"></div>

<script>
let mediaRecorder;
let chunks = [];
let recording = false;
const toggleBtn = document.getElementById("toggleBtn");
const replyElem = document.getElementById("reply");

toggleBtn.onclick = async () => {
  if (!recording) {
    // Start recording
    chunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "clip.webm");

      replyElem.textContent = "Processing…";

      try {
        const resp = await fetch("/upload", { method: "POST", body: form });
        const data = await resp.json();

        if (data.error) {
          replyElem.textContent = "Error: " + data.error;
          return;
        }

        replyElem.textContent = data.text || "(no reply)";

        // Speak reply
        if (window.speechSynthesis && data.text) {
          const utter = new SpeechSynthesisUtterance(data.text);
          utter.rate = 1.0;
          speechSynthesis.cancel();
          speechSynthesis.speak(utter);
        }
      } catch (err) {
        replyElem.textContent = "Upload or processing failed";
        console.error(err);
      }
    };

    mediaRecorder.start();
    toggleBtn.textContent = "Stop Recording";
    recording = true;
  } else {
    // Stop recording
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    toggleBtn.textContent = "Start Recording";
    recording = false;
  }
};
</script>
</body>
</html>`);
});

// Handle audio upload
app.post("/upload", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio uploaded" });

  try {
    // Upload audio to Gemini
    const uploaded = await ai.files.upload({
      file: req.file.path,
      config: { mimeType: req.file.mimetype || "audio/webm" },
    });

    // Generate response text from Gemini
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: createUserContent([
        createPartFromUri(uploaded.uri, uploaded.mimeType),
        "Transcribe my speech briefly and reply helpfully as a voice assistant."
      ]),
    });

    const text =
      response?.text ??
      response?.candidates?.[0]?.content?.parts?.map(p => p.text).join(" ") ??
      "";

    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gemini processing failed", details: err?.message });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch {}
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
