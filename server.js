const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { google } = require("googleapis");
const Groq = require("groq-sdk");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static("."));

/* =========================================================
   LUNA AI
========================================================= */

let groq = null;

try {
  const key = process.env.GROQ_API_KEY || "";
  if (key) {
    groq = new Groq({ apiKey: key });
    console.log("LUNA AI ONLINE - GROQ");
  } else {
    console.log("GROQ_API_KEY not found - fallback mode");
  }
} catch (error) {
  console.log("Groq unavailable:", error.message);
}

/* =========================================================
   PLAYERS
========================================================= */

const defaultPlayers = [
  { name: "Alex", color: "#ff1744" },
  { name: "Liam", color: "#00e5ff" },
  { name: "Emma", color: "#ffd166" },
  { name: "Noah", color: "#2ecc71" },
  { name: "Mia", color: "#b86bff" }
];

const COLORS = [
  "#ff1744", "#00e5ff", "#ffd166", "#2ecc71",
  "#b86bff", "#ff7a00", "#ff4fd8", "#7c4dff"
];

const MAX_PLAYERS = 5;

let players = [...defaultPlayers];
let waitingPlayers = [];
let round = 0;
let raceRunning = false;
let chatStarted = false;

let lastLunaCall = 0;
const LUNA_COOLDOWN = 8000;

/* =========================================================
   HELPERS
========================================================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanName(name) {
  if (!name) return "";
  return String(name)
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 16);
}

function wantsToJoin(text) {
  if (!text) return false;
  const t = text.toLowerCase()
    .normalize("NFKC")
    .replace(/[!?.,;:()[\]{}"'`🔥🎮🏁❤️👍😂🤣]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const exact = [
    "join", "!join", "ikut", "gabung", "join me", "pick me",
    "i'm in", "im in", "count me in", "let me play",
    "i want to play", "can i play", "i want to join",
    "aku ikut", "saya ikut", "mau ikut", "mau gabung",
    "ikut dong", "aku mau ikut", "saya mau ikut"
  ];

  if (exact.includes(t)) return true;

  const patterns = [
    /\bi\s*(want|wanna)\s*(to\s*)?(join|play|race)\b/,
    /\b(let|allow)\s+me\s+(to\s+)?(join|play|race)\b/,
    /\bcount\s+me\s+in\b/,
    /\bpick\s+me\b/,
    /\baku\s+(mau\s+)?(ikut|gabung|main)\b/,
    /\bsaya\s+(mau\s+)?(ikut|gabung|main)\b/
  ];

  return patterns.some(re => re.test(t));
}

function alreadyExists(name) {
  const lower = name.toLowerCase();
  return (
    players.some(p => p.name.toLowerCase() === lower) ||
    waitingPlayers.some(p => p.name.toLowerCase() === lower)
  );
}

function addViewerToQueue(name) {
  name = cleanName(name);
  if (!name) return false;
  if (alreadyExists(name)) return false;
  if (waitingPlayers.length >= 20) return false;

  const color = COLORS[(players.length + waitingPlayers.length) % COLORS.length];
  waitingPlayers.push({ name, color });

  console.log(`JOIN: ${name}`);

  io.emit("queueUpdate", {
    waiting: waitingPlayers.map(p => p.name)
  });

  io.emit("aiResponse", {
    speechText: `${name} joined the next race! Good luck!`
  });

  return true;
}

/* =========================================================
   LUNA
========================================================= */

const fallbackComments = [
  "The race is heating up!",
  "Look at that speed!",
  "Anything can happen now!",
  "The finish line is getting closer!",
  "What an incredible battle!",
  "Someone is making a huge comeback!"
];

function fallbackComment() {
  return fallbackComments[Math.floor(Math.random() * fallbackComments.length)];
}

async function lunaComment(event, force = false) {
  const now = Date.now();
  if (!force && now - lastLunaCall < LUNA_COOLDOWN) {
    return fallbackComment();
  }
  lastLunaCall = now;

  if (!groq) return fallbackComment();

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are Luna, an energetic and friendly live Racing host. Always respond in natural English. One short sentence only. Maximum 14 words. Family friendly. Exciting. Never mention AI."
        },
        { role: "user", content: event }
      ],
      temperature: 0.8,
      max_tokens: 30
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    if (text) {
      console.log("LUNA:", text);
      return text;
    }
  } catch (error) {
    console.log("Luna/Groq error:", error?.message || error);
  }
  return fallbackComment();
}


const { spawn, execFile } = require("child_process");

let lunaSpeechQueue = Promise.resolve();

function speakLuna(text) {
  lunaSpeechQueue = lunaSpeechQueue.then(() => {
    return new Promise((resolve) => {
      const safeText = String(text || "").trim();

      if (!safeText) {
        resolve();
        return;
      }

      const wavFile = `/tmp/luna-${Date.now()}.wav`;

      console.log("LUNA TTS:", safeText);

      // ======================================================
      // PRIMARY TTS: Piper neural voice
      // ======================================================

      const piper = spawn(
        "piper",
        [
          "--model", "en_US-amy-medium",
          "--output_file", wavFile
        ],
        {
          env: {
            ...process.env,
            PULSE_SINK: "stream_sink"
          }
        }
      );

      let piperError = "";

      piper.stderr.on("data", (data) => {
        piperError += data.toString();
      });

      piper.stdin.write(safeText);
      piper.stdin.end();

      piper.on("error", (error) => {
        console.log("PIPER unavailable:", error.message);
        fallbackEspeak();
      });

      piper.on("close", (code) => {
        if (code !== 0) {
          console.log("PIPER failed:", piperError.trim());
          fallbackEspeak();
          return;
        }

        playAudio(wavFile);
      });

      // ======================================================
      // FALLBACK: eSpeak
      // ======================================================

      function fallbackEspeak() {
        execFile(
          "espeak-ng",
          [
            "-v", "en-us+f3",
            "-s", "155",
            "-p", "65",
            "-a", "170",
            "-w", wavFile,
            safeText
          ],
          (error) => {
            if (error) {
              console.log("LUNA FALLBACK TTS error:", error.message);
              resolve();
              return;
            }

            playAudio(wavFile);
          }
        );
      }

      // ======================================================
      // PLAY AUDIO INTO PULSEAUDIO STREAM
      // ======================================================

      function playAudio(file) {
        execFile(
          "paplay",
          [
            "--device=stream_sink",
            file
          ],
          (playError) => {
            if (playError) {
              console.log("LUNA AUDIO error:", playError.message);
            }

            try {
              require("fs").unlinkSync(file);
            } catch (_) {}

            resolve();
          }
        );
      }
    });
  });

  return lunaSpeechQueue;
}

/* =========================================================
   YOUTUBE CHAT
========================================================= */

async function startYouTubeChat() {
  if (chatStarted) return;

  const {
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    YOUTUBE_REFRESH_TOKEN
  } = process.env;

  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    console.log("YouTube Chat: OAuth secrets missing");
    return;
  }

  try {
    const auth = new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN });

    const youtube = google.youtube({ version: "v3", auth });

    const r = await youtube.liveBroadcasts.list({
      part: "id,snippet,status",
      broadcastStatus: "active",
      broadcastType: "all",
      maxResults: 10
    });

    const live = (r.data.items || []).find(b => b.snippet?.liveChatId);
    if (!live) {
      console.log("YouTube Chat: active broadcast/chat belum ditemukan");
      setTimeout(startYouTubeChat, 10000);
      return;
    }

    const liveChatId = live.snippet.liveChatId;
    console.log("YOUTUBE LIVE CHAT CONNECTED");
    chatStarted = true;
    pollYouTubeChat(youtube, liveChatId, "");
  } catch (error) {
    console.log("YouTube Chat error:", error.response?.data || error.message);
    chatStarted = false;
    setTimeout(startYouTubeChat, 10000);
  }
}

async function sendYouTubeChat(youtube, liveChatId, text) {
  try {
    const message = String(text || "").trim();
    if (!message) return;

    await youtube.liveChatMessages.insert({
      part: "snippet",
      requestBody: {
        snippet: {
          liveChatId,
          type: "textMessageEvent",
          textMessageDetails: {
            messageText: message
          }
        }
      }
    });

    console.log(`[LUNA CHAT] ${message}`);
  } catch (error) {
    console.log(
      "LUNA YouTube Chat send error:",
      error.response?.data || error.message
    );
  }
}

async function pollYouTubeChat(youtube, liveChatId, pageToken) {
  try {
    const r = await youtube.liveChatMessages.list({
      liveChatId,
      part: "id,snippet,authorDetails",
      pageToken: pageToken || undefined,
      maxResults: 200
    });

    for (const m of r.data.items || []) {
      const author = cleanName(m.authorDetails?.displayName || "Viewer");
      const text = (m.snippet?.displayMessage || "").trim();
      if (!text) continue;

      // Jangan biarkan LUNA membalas pesannya sendiri
      if (m.authorDetails?.isChatOwner) {
        console.log(`[CHAT] Ignored own message: ${author}: ${text}`);
        continue;
      }

      console.log(`[CHAT] ${author}: ${text}`);

      if (wantsToJoin(text)) {
        addViewerToQueue(author);
        continue;
      }

      const command = text.toLowerCase();
      if (
        command.includes("luna") ||
        command.includes("hello") ||
        command.includes("hi")
      ) {
        lunaComment(
          `${author} says: "${text}". Respond warmly.`,
          true
        ).then(response => {
          io.emit("aiResponse", {
            speechText: response
          });

          speakLuna(response);

          sendYouTubeChat(
            youtube,
            liveChatId,
            response
          );
        });
      }
    }

    const nextToken = r.data.nextPageToken || "";

    // Ikuti interval polling yang direkomendasikan YouTube
    // agar quota API tidak cepat habis.
    const pollingInterval = Math.max(
      Number(r.data.pollingIntervalMillis) || 5000,
      1000
    );

    console.log(
      `YouTube Chat: next poll in ${pollingInterval}ms`
    );

    setTimeout(
      () => pollYouTubeChat(youtube, liveChatId, nextToken),
      pollingInterval
    );
  } catch (error) {
    console.log("YouTube Chat polling error:", error.response?.data || error.message);
    chatStarted = false;
    setTimeout(startYouTubeChat, 10000);
  }
}

/* =========================================================
   PREPARE NEXT RACE
========================================================= */

function prepareNextPlayers(lastFinishedIndex) {
  if (!waitingPlayers.length) return;

  const newcomer = waitingPlayers.shift();
  if (!newcomer) return;

  const replaced = players[lastFinishedIndex];
  if (typeof lastFinishedIndex === "number" && replaced) {
    players.splice(lastFinishedIndex, 1, newcomer);
  } else {
    players[players.length - 1] = newcomer;
  }

  io.emit("playerUpdate", { players });
  io.emit("queueUpdate", { waiting: waitingPlayers.map(p => p.name) });

  console.log(`PLAYER ROTATION: ${replaced?.name || "none"} -> ${newcomer.name}`);
}

/* =========================================================
   RACE LOGIC (NEW - using progress 0→1)
========================================================= */

async function runRace() {
  if (raceRunning) return;
  raceRunning = true;

  while (true) {
    round++;
    console.log(`Starting race ${round}`);

    const startText = await lunaComment(
      `Round ${round} is starting. ${players.length} players are ready.`,
      true
    );

    io.emit("raceStart", {
      round,
      message: startText
    });

    await sleep(2000);

    // progress from 0 to 1 for each car
    const progress = players.map(() => 0);
    const finished = [];
    const speeds = players.map(() => 0.004 + Math.random() * 0.003);

    while (finished.length < players.length) {
      for (let i = 0; i < players.length; i++) {
        if (finished.includes(i)) continue;

        progress[i] += speeds[i] + (Math.random() * 0.002);

        if (progress[i] >= 1) {
          progress[i] = 1;
          finished.push(i);

          const player = players[i];
          io.emit("raceWinner", {
            playerName: player.name,
            position: finished.length
          });

          if (finished.length === 1) {
            const text = await lunaComment(
              `${player.name} just won round ${round}! Celebrate the winner.`,
              true
            );
            io.emit("aiResponse", {
              speechText: text,
              playerName: player.name,
              playerIndex: i
            });

            speakLuna(text);
          }
        }
      }

      io.emit("raceUpdate", { progress });
      await sleep(80);
    }

    const winner = players[finished[0]];
    const finalText = await lunaComment(
      `${winner.name} won round ${round}. Invite viewers to join the next race.`,
      true
    );

    io.emit("aiResponse", {
      speechText: finalText,
      playerName: winner.name
    });

    speakLuna(finalText);

    console.log(`Winner: ${winner.name}`);
    await sleep(4500);

    if (waitingPlayers.length > 0) {
      prepareNextPlayers(finished[finished.length - 1]);
    }

    await sleep(2000);
  }
}

/* =========================================================
   SOCKET.IO
========================================================= */

io.on("connection", socket => {
  console.log("Display connected:", socket.id);

  socket.emit("playerUpdate", { players });
  socket.emit("queueUpdate", {
    waiting: waitingPlayers.map(p => p.name)
  });
  socket.emit("aiResponse", {
    speechText: "Welcome to Racing Live! Type JOIN in chat to race!"
  });
});

/* =========================================================
   SERVER
========================================================= */

server.listen(3000, () => {
  console.log("==============================");
  console.log("RACING LIVE SERVER");
  console.log("PORT: 3000");
  console.log("LUNA:", groq ? "GROQ ONLINE" : "FALLBACK");
  console.log("==============================");

  startYouTubeChat();
  runRace();
});
