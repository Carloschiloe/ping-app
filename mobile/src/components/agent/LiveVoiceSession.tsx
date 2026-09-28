import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Localization from 'expo-localization';
import { getAuthHeaders, API_URL } from '../../api/client';
import { getDeviceTimeZone } from '../../utils/timeZone';
import { createEphemeralUuid } from '../../utils/voiceSession';

interface LiveVoiceSessionProps {
    visible: boolean;
    conversationId?: string;
    onClose: () => void;
}

type LiveConfig = {
    apiUrl: string;
    authorization: string;
    conversationId?: string;
    voiceSessionId: string;
    deviceSessionId: string;
    locale: string;
    timezone: string;
};

function deviceLocale(): string {
    try {
        const locale = Localization.getLocales?.()[0];
        if (locale?.languageTag) return locale.languageTag;
        if (locale?.languageCode) return locale.regionCode ? `${locale.languageCode}-${locale.regionCode}` : locale.languageCode;
    } catch { /* fallback below */ }
    return 'es-CL';
}

const LIVE_VOICE_HTML = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
body{margin:0;background:#091426;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{text-align:center;padding:28px}.orb{width:112px;height:112px;border-radius:56px;background:#1677e8;box-shadow:0 0 0 14px rgba(22,119,232,.15);margin:0 auto 24px;display:flex;align-items:center;justify-content:center;font-size:44px}.orb.active{animation:pulse 1.5s infinite}.status{font-size:17px;font-weight:600;margin:8px 0}.hint{font-size:13px;color:#a9b7c9;line-height:1.5;max-width:290px;margin:0 auto}.stop{margin-top:28px;background:#ef4444;border:0;border-radius:22px;padding:12px 24px;color:white;font-size:16px;font-weight:700}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
</style></head><body><main><div id="orb" class="orb">◉</div><div id="status" class="status">Conectando con Ping…</div><p id="hint" class="hint">Habla normalmente. Ping responderá por voz y conservará el mismo contexto.</p><button id="stop" class="stop" type="button">Terminar</button><audio id="remote" autoplay playsinline></audio></main>
<script>
(function(){
  const cfg=window.__PING_CONFIG||{}; const statusEl=document.getElementById('status'); const hintEl=document.getElementById('hint'); const orb=document.getElementById('orb'); const remote=document.getElementById('remote');
  let pc=null, dc=null, mic=null, startedAt=0, firstAudioSent=false, assistantSpeaking=false, closed=false, providerSessionId=null;
  const id=()=>{try{return crypto.randomUUID()}catch{return 'm8-'+Date.now()+'-'+Math.random().toString(16).slice(2)}};
  const post=(message)=>{try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(message))}catch{}};
  const telemetry=(event,extra={})=>{const payload={voiceSessionId:cfg.voiceSessionId,deviceSessionId:cfg.deviceSessionId,event,atMs:Math.max(0,Date.now()-startedAt),sessionId:providerSessionId||undefined,...extra};post({type:'telemetry',payload});fetch(cfg.apiUrl+'/agent/voice/live/telemetry',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{})};
  const setStatus=(text, hint, active=false)=>{statusEl.textContent=text;hintEl.textContent=hint||'';orb.className=active?'orb active':'orb'};
  const sendEvent=(value)=>{if(!dc||dc.readyState!=='open')throw new Error('voice_data_channel_unavailable');dc.send(JSON.stringify(value))};
  async function callCore(input,callId){
    const body={input,channel:'mobile',locale:cfg.locale,timezone:cfg.timezone,conversationId:cfg.conversationId};
    const response=await fetch(cfg.apiUrl+'/agent/turn',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json','Idempotency-Key':id()},body:JSON.stringify(body)});
    const text=await response.text(); let result=null; try{result=JSON.parse(text)}catch{}
    if(!response.ok)throw new Error('core_'+response.status);
    const core=result||{kind:'error',status:'unavailable'}; const kind=core.kind==='plan'?'plan':core.kind==='clarification'?'clarification':core.kind==='response'?'response':'error';
    telemetry('core_disposition',{coreKind:kind,confirmationRequired:core.confirmationRequested===true,sideEffects:0});
    if(core.confirmationRequested===true)telemetry('confirmation_requested',{coreKind:'plan',confirmationRequired:true,sideEffects:0});
    sendEvent({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify({core})}});
    sendEvent({type:'response.create'});
  }
  function onEvent(raw){
    let event;try{event=JSON.parse(raw.data||raw)}catch{return}
    if(event.type==='session.created'){providerSessionId=event.session?.id||providerSessionId;telemetry('session_connected',{sessionId:providerSessionId});setStatus('Ping está escuchando','Habla cuando quieras.',true);return}
    if(event.type==='input_audio_buffer.speech_started'){if(assistantSpeaking){try{sendEvent({type:'response.cancel'})}catch{}telemetry('barge_in',{sideEffects:0});assistantSpeaking=false}telemetry('speech_started',{sideEffects:0});return}
    if(event.type==='input_audio_buffer.speech_stopped'){telemetry('speech_stopped',{sideEffects:0});return}
    if(event.type==='response.output_audio_transcript.delta'){if(!assistantSpeaking){assistantSpeaking=true;telemetry('assistant_audio_started',{sideEffects:0})}return}
    if(event.type==='response.output_audio_transcript.done'){return}
    if(event.type==='response.output_audio.done'){assistantSpeaking=false;telemetry('assistant_audio_stopped',{sideEffects:0});return}
    if(event.type==='response.function_call_arguments.done'){
      let args;try{args=JSON.parse(event.arguments||'{}')}catch{telemetry('error',{detailCode:'invalid_tool_arguments',sideEffects:0});return}
      if(typeof args.input!=='string'||!args.input.trim()){telemetry('error',{detailCode:'missing_core_input',sideEffects:0});return}
      setStatus('Ping está pensando','Consultando el mismo Ping Core…',true);callCore(args.input,event.call_id).catch(()=>{telemetry('fallback',{detailCode:'core_unavailable',sideEffects:0});setStatus('Ping no está disponible','Puedes cerrar y volver a intentarlo.')});return
    }
    if(event.type==='session.closed'){closed=true;telemetry('session_closed',{sideEffects:0});setStatus('Conversación terminada','');return}
    if(event.type==='error'){telemetry('error',{detailCode:'provider_event',sideEffects:0});setStatus('No se pudo iniciar la voz','Cierra esta ventana y usa el modo de texto.');}
  }
  async function start(){
    startedAt=Date.now();telemetry('session_setup_started',{sideEffects:0});
    try{
      mic=await navigator.mediaDevices.getUserMedia({audio:true});
      pc=new RTCPeerConnection();pc.ontrack=(event)=>{remote.srcObject=event.streams[0];remote.play().catch(()=>{})};remote.onplaying=()=>{if(!firstAudioSent){firstAudioSent=true;telemetry('first_useful_audio',{sideEffects:0})}};
      mic.getTracks().forEach(track=>pc.addTrack(track,mic));dc=pc.createDataChannel('oai-events');dc.onmessage=onEvent;
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);const response=await fetch(cfg.apiUrl+'/agent/voice/live/session',{method:'POST',headers:{Authorization:cfg.authorization,'Content-Type':'application/json'},body:JSON.stringify({sdp:offer.sdp,voiceSessionId:cfg.voiceSessionId,deviceSessionId:cfg.deviceSessionId,conversationId:cfg.conversationId,locale:cfg.locale,timezone:cfg.timezone})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'live_session_failed');providerSessionId=result.sessionId;await pc.setRemoteDescription({type:'answer',sdp:result.sdp});
    }catch(error){telemetry('error',{detailCode:error&&error.message?String(error.message).slice(0,80):'session_failed',sideEffects:0});setStatus('No se pudo iniciar la voz','El modo de texto sigue disponible.');post({type:'error'});}
  }
  function stop(){if(closed)return;try{if(dc&&dc.readyState==='open')dc.send(JSON.stringify({type:'session.close'}))}catch{};if(mic)mic.getTracks().forEach(t=>t.stop());if(pc)pc.close();closed=true;telemetry('session_closed',{sideEffects:0});post({type:'closed'})}
  document.getElementById('stop').addEventListener('click',stop);window.addEventListener('beforeunload',stop);setTimeout(start,200);
})();
</script></body></html>`;

export function LiveVoiceSession({ visible, conversationId, onClose }: LiveVoiceSessionProps) {
    const [authorization, setAuthorization] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sessionKey, setSessionKey] = useState(0);
    const config = useMemo<LiveConfig | null>(() => authorization ? {
        apiUrl: API_URL.replace(/\/$/, ''),
        authorization,
        conversationId,
        voiceSessionId: createEphemeralUuid(),
        deviceSessionId: createEphemeralUuid(),
        locale: deviceLocale(),
        timezone: getDeviceTimeZone(),
    } : null, [authorization, conversationId, sessionKey]);

    useEffect(() => {
        if (!visible) return;
        setError(null);
        let active = true;
        void getAuthHeaders().then((headers) => {
            if (active) setAuthorization(headers.Authorization || null);
        }).catch(() => { if (active) setError('No se pudo autenticar la sesión de voz.'); });
        return () => { active = false; setAuthorization(null); };
    }, [visible]);

    const injected = config ? `window.__PING_CONFIG=${JSON.stringify(config).replace(/</g, '\\u003c')};true;` : '';
    const handleMessage = (event: WebViewMessageEvent) => {
        try {
            const message = JSON.parse(event.nativeEvent.data) as { type?: string };
            if (message.type === 'closed') onClose();
            if (message.type === 'error') setError('No se pudo iniciar la conversación de voz.');
        } catch { /* WebView telemetry is already sent to staging. */ }
    };

    return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.container}>
            <View style={styles.topbar}><Text style={styles.title}>Ping Voz</Text><TouchableOpacity onPress={onClose}><Text style={styles.close}>Cerrar</Text></TouchableOpacity></View>
            {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => { setError(null); setSessionKey((value) => value + 1); }}><Text style={styles.retry}>Reintentar</Text></TouchableOpacity></View>
                    : config ? <WebView key={sessionKey} source={{ uri: `${API_URL.replace(/\/$/, '')}/agent/voice/live/client` }} injectedJavaScriptBeforeContentLoaded={injected} onMessage={handleMessage} javaScriptEnabled mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback originWhitelist={['https://*']} />
                    : <ActivityIndicator style={styles.loading} />}
        </View>
    </Modal>;
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#091426' },
    topbar: { paddingTop: 54, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: '#122c52', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { color: '#fff', fontSize: 18, fontWeight: '700' },
    close: { color: '#b8d3ff', fontSize: 15, fontWeight: '600' },
    loading: { flex: 1 },
    error: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    errorText: { color: '#fff', textAlign: 'center', fontSize: 16 },
    retry: { color: '#8bb8ff', marginTop: 20, fontWeight: '700' },
});
