import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { router } from './routes';
import { globalErrorHandler } from './middleware/errorHandler';

dotenv.config();

export const app = express();

app.use(cors());
app.use(express.json());

// Main router
app.use('/api', router);

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Call Page (served over HTTPS so getUserMedia works in mobile WebView)
app.get('/call', (req, res) => {
  const { token, appId, channel, video } = req.query as Record<string, string>;
  const withVideo = video === 'true';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<title>Ping Call</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0f172a; width:100vw; height:100vh; overflow:hidden; font-family:-apple-system,sans-serif; }
  #remote-video { position:fixed; top:0; left:0; width:100%; height:100%; background:#1e293b; display:flex; align-items:center; justify-content:center; }
  #remote-video video { width:100%; height:100%; object-fit:cover; }
  #local-video  { position:fixed; top:60px; right:16px; width:110px; height:165px; border-radius:14px; overflow:hidden; border:2px solid rgba(255,255,255,0.2); background:#000; z-index:10; display:${withVideo ? 'block' : 'none'}; }
  #local-video video { width:100%; height:100%; object-fit:cover; }
  #status { color:white; font-size:18px; font-weight:600; text-align:center; }
</style>
</head>
<body>
<div id="remote-video"><div id="status">Conectando...</div></div>
<div id="local-video"></div>
<script src="https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js"></script>
<script>
const APP_ID  = "${appId || ''}";
const TOKEN   = "${token || ''}";
const CHANNEL = "${channel || ''}";
const WITH_VIDEO = ${withVideo};

const client = AgoraRTC.createClient({ mode:"rtc", codec:"vp8" });
let localAudioTrack=null, localVideoTrack=null;

async function joinCall() {
  try {
    await client.join(APP_ID, CHANNEL, TOKEN, null);
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    const tracks = [localAudioTrack];
    if(WITH_VIDEO){
      localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      tracks.push(localVideoTrack);
      localVideoTrack.play("local-video");
    }
    await client.publish(tracks);
    document.getElementById("status").textContent = "Llamando...";
  } catch(e) {
    document.getElementById("status").textContent = "Error: " + e.message;
    console.error(e);
  }
}

client.on("user-published", async (user, mediaType) => {
  await client.subscribe(user, mediaType);
  document.getElementById("status").style.display="none";
  if(mediaType==="video") user.videoTrack.play("remote-video");
  if(mediaType==="audio") user.audioTrack.play();
});

client.on("user-unpublished", () => {
  const s = document.getElementById("status");
  s.style.display="block";
  s.textContent="La otra persona apagó su cámara/micro";
});

client.on("user-left", (user) => {
  console.log("Remote user left channel:", user.uid);
  const s = document.getElementById("status");
  s.style.display="block";
  s.textContent="Llamada finalizada";
  if(window.ReactNativeWebView) {
    console.log("Sending hangup message to native WebView");
    window.ReactNativeWebView.postMessage('hangup');
  } else {
    console.warn("ReactNativeWebView NOT detected in window");
  }
});

window.toggleMute  = (m) => localAudioTrack  && localAudioTrack.setMuted(m);
window.toggleVideo = (o) => localVideoTrack && localVideoTrack.setMuted(o);
window.leaveCall   = async () => {
  localAudioTrack && localAudioTrack.close();
  localVideoTrack && localVideoTrack.close();
  await client.leave();
};

joinCall();
</script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Global Error Handler
app.use(globalErrorHandler as any);
